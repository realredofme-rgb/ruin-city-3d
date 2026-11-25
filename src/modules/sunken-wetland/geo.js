// 有机形体的几何累加器：管子（树干、枝、根、藤）、团块（树冠）、飘带（垂苔、棕榈叶）。
// 和 util.js 的 Builder 不同，这里保留索引、按顶点平滑法线，适合树皮这种圆润的表面；
// 方方正正的废墟（高架、列车、神庙）仍然用 Builder。
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _n = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _t0 = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
const _q = new THREE.Quaternion();

export class Acc {
  constructor() { this.p = []; this.c = []; this.i = []; }
  get n() { return this.p.length / 3; }
  v(x, y, z, col) { this.p.push(x, y, z); this.c.push(col.r, col.g, col.b); return this.n - 1; }

  /**
   * 沿折线生成一根管子。
   * pts: Vector3[]；rad(i, t) → 半径；opt.seg 圆周分段；opt.prof(θ, t, i) → 半径倍数（板根、扭绞的绞杀榕）；
   * opt.col(p, t, θ, out) → 颜色；opt.cap 末端收口。返回每一圈的 { p, N, B, r } 方便在表面上挂东西。
   */
  tube(pts, rad, opt = {}) {
    const seg = opt.seg || 8, n = pts.length, base = this.n, rings = [];
    let N = null;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      if (i < n - 1) _t.subVectors(pts[i + 1], pts[i]); else _t.subVectors(pts[i], pts[i - 1]);
      if (i > 0 && i < n - 1) _t.add(_t0.subVectors(pts[i], pts[i - 1]));
      _t.normalize();
      if (!N) { N = Math.abs(_t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); N.addScaledVector(_t, -N.dot(_t)).normalize(); }
      else { N.addScaledVector(_t, -N.dot(_t)).normalize(); } // 平行移动的近似：每圈把上一圈的法向投影到新切平面
      _b.crossVectors(_t, N).normalize();
      const r = rad(i, t), p = pts[i];
      rings.push({ p: p.clone(), N: N.clone(), B: _b.clone(), T: _t.clone(), r });
      for (let k = 0; k < seg; k++) {
        const th = k / seg * Math.PI * 2, m = opt.prof ? opt.prof(th, t, i) : 1, rr = r * m;
        _v.copy(p).addScaledVector(N, Math.cos(th) * rr).addScaledVector(_b, Math.sin(th) * rr);
        this.v(_v.x, _v.y, _v.z, opt.col ? opt.col(_v, t, th, _c) : (opt.color || _c.set(0x777777)));
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
      const a = base + i * seg + k, b = base + i * seg + (k + 1) % seg, c = a + seg, d = b + seg;
      this.i.push(a, c, b, b, c, d);
    }
    if (opt.cap !== false) {
      const L = rings[n - 1], tip = this.v(L.p.x + L.T.x * L.r * 0.6, L.p.y + L.T.y * L.r * 0.6, L.p.z + L.T.z * L.r * 0.6, opt.col ? opt.col(L.p, 1, 0, _c) : (opt.color || _c));
      const o = base + (n - 1) * seg; for (let k = 0; k < seg; k++) this.i.push(o + k, tip, o + (k + 1) % seg);
    }
    return rings;
  }

  /** 把一个 three 几何体（任意，会合并重复顶点）按矩阵加进来；col(p, nrm, out) 或单色 */
  geom(g, m, col) {
    g = g.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g = mergeVertices(g, 1e-4);
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position, base = this.n;
    for (let k = 0; k < p.count; k++) { _v.fromBufferAttribute(p, k); this.v(_v.x, _v.y, _v.z, typeof col === 'function' ? col(_v, _c) : col); }
    const idx = g.index.array; for (let k = 0; k < idx.length; k++) this.i.push(base + idx[k]);
    g.dispose();
  }

  /** 一条从 a 垂下的飘带（垂苔、气根上的苔），长 len、宽 w，带一点摆动 */
  ribbon(a, len, w, col, R, segs = 6, dir = null) {
    const base = this.n, side = new THREE.Vector3(Math.cos(R() * 6.28), 0, Math.sin(R() * 6.28));
    const down = dir || new THREE.Vector3(0, -1, 0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, ww = w * (1 - t * 0.85), sway = Math.sin(t * 3 + R() * 0.4) * len * 0.06;
      const cx = a.x + down.x * len * t + side.z * sway, cy = a.y + down.y * len * t, cz = a.z + down.z * len * t - side.x * sway;
      _c.copy(col).multiplyScalar(0.85 + 0.3 * (1 - t));
      this.v(cx - side.x * ww, cy, cz - side.z * ww, _c); this.v(cx + side.x * ww, cy, cz + side.z * ww, _c);
    }
    for (let i = 0; i < segs; i++) { const k = base + i * 2; this.i.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }

  build(material, { cast = true, receive = true } = {}) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    this.p = []; this.c = []; this.i = [];
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = cast; mesh.receiveShadow = receive;
    return mesh;
  }
  geometry() { const m = this.build(null); return m ? m.geometry : null; }
}

/** 从 start 沿 dir 长出一条折线：每步加一点向上（趋光）或向下（重力）的弯曲，再叠上低频摆动 */
export function grow(start, dir, len, steps, R, { up = 0, wob = 0.25, droop = 0 } = {}) {
  const pts = [start.clone()], d = dir.clone().normalize(), p = start.clone(), ph = R() * 10, ph2 = R() * 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    d.y += up / steps - droop * t / steps;
    d.x += Math.sin(ph + t * 4) * wob / steps; d.z += Math.cos(ph2 + t * 3.3) * wob / steps;
    d.normalize();
    p.addScaledVector(d, len / steps); pts.push(p.clone());
  }
  return pts;
}

/** 折线上按弧长参数 u (0..1) 取点和切线 */
export function along(pts, u, outP = new THREE.Vector3(), outT = new THREE.Vector3()) {
  const f = u * (pts.length - 1), i = Math.min(Math.floor(f), pts.length - 2), k = f - i;
  outP.lerpVectors(pts[i], pts[i + 1], k); outT.subVectors(pts[i + 1], pts[i]).normalize();
  return outP;
}

export const quatUp = (dir, out = _q) => out.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
