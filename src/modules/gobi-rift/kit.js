// 机械零件工具箱：带层级变换的几何合并器。
// 每个零件在加入时就按世界（模块平面）坐标做风化着色：铁锈斑、顺着重力往下流的锈迹、朝上的面积沙。
// 发光零件（眼睛、核心、接缝）进单独的一组，合成另一个网格，夜里由材质统一调亮。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fb, vn, smooth, clamp } from './terrain.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
export const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
};
/** 让 +y 轴从 a 指向 b 的矩阵（圆柱、管子用），长度方向缩放到 |ab| */
export function span(a, b, out = new THREE.Matrix4()) {
  const d = _n.subVectors(b, a), L = d.length();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return out.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(1, L, 1));
}

const C = c => new THREE.Color(c);
export const PAL = {
  bone: C(0xa59c8a), bone2: C(0x8d8473), iron: C(0x3c3732), iron2: C(0x4f4841), bronze: C(0x6a5038), rust: C(0x7a3f22), rust2: C(0x9a5a30),
  sand: C(0xd49a62), paint: C(0x8e8f80), teal: C(0x5f7d74), dark: C(0x24211f),
  glow: C(0xff6a2a), glowW: C(0xffb070), glowR: C(0xff3b1e)
};

export class Kit {
  constructor() { this.solid = []; this.glow = []; this.stack = [new THREE.Matrix4()]; }
  get top() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.top.clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  /**
   * o.rust 锈量 0..1；o.sand 积沙 0..1；o.glow 发光件；o.dirt 底部的脏污
   */
  add(geo, m, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m ? this.top.clone().multiply(m) : this.top);
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
    const rust = o.rust ?? 0.45, sand = o.sand ?? 0.6;
    for (let i = 0; i < n; i++) {
      c.copy(color);
      if (!o.glow) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
        const n1 = fb(x * 0.045 + y * 0.03, z * 0.045 - y * 0.02, 3), n2 = vn(x * 0.21 + z * 0.17, y * 0.012);
        // 锈：成片的斑 + 竖向流痕
        const r = rust * (smooth(0.5, 0.72, n1) * 0.8 + smooth(0.62, 0.85, n2) * 0.6 * (1 - Math.abs(ny)));
        c.lerp(n1 > 0.6 ? PAL.rust : PAL.rust2, clamp(r, 0, 0.85));
        // 积沙：朝上的面
        if (ny > 0.35) c.lerp(PAL.sand, sand * smooth(0.35, 0.85, ny) * smooth(0.3, 0.6, fb(x * 0.03, z * 0.03, 3) + ny * 0.15));
        c.multiplyScalar(0.86 + 0.28 * vn(x * 0.5 + y * 0.3, z * 0.5));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (o.glow ? this.glow : this.solid).push(g);
    return this;
  }
  box(w, h, d, m, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), m, color, o); }
  /** 沿 y 轴的圆柱，中心在原点 */
  cyl(r1, r2, h, seg, m, color, o) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg, 1, false), m, color, o); }
  /** 从 a 到 b 的圆柱 */
  rod(a, b, r1, r2, seg, color, o) { return this.add(new THREE.CylinderGeometry(r2, r1, 1, seg, 1, false), span(a, b), color, o); }
  sph(r, m, color, o, w = 16, h = 12, phi0 = 0, phiL = Math.PI * 2, th0 = 0, thL = Math.PI) { return this.add(new THREE.SphereGeometry(r, w, h, phi0, phiL, th0, thL), m, color, o); }
  tube(pts, r, color, o, seg = 6) {
    const curve = new THREE.CatmullRomCurve3(pts);
    return this.add(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, seg, false), null, color, o);
  }
  torus(R, r, arc, m, color, o, seg = 32) { return this.add(new THREE.TorusGeometry(R, r, 6, seg, arc), m, color, o); }
  /** 参数曲面 fn(u, v) → [x, y, z]，u、v ∈ [0, 1]（装甲壳用，材质是双面的） */
  surf(fn, nu, nv, m, color, o) {
    const g = new THREE.BufferGeometry(), pos = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...fn(i / nu, j / nv));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return this.add(g, m, color, o);
  }
  /** 一块弧形装甲：沿 x 方向 [x0, x1]，截面是椭圆弧（半轴 ry、rz，角度 a0..a1，0 在 +z、π/2 在 +y） */
  shell(x0, x1, ry, rz, a0, a1, color, o, m, bulge = 0.06) {
    return this.surf((u, v) => {
      const a = a0 + (a1 - a0) * v, k = 1 + bulge * Math.sin(u * Math.PI);
      return [x0 + (x1 - x0) * u, Math.sin(a) * ry * k, Math.cos(a) * rz * k];
    }, 6, 14, m, color, o);
  }
  build(solidMat, glowMat) {
    const out = {};
    if (this.solid.length) { const g = mergeGeometries(this.solid, false); g.computeBoundingSphere(); out.solid = new THREE.Mesh(g, solidMat); out.solid.castShadow = true; out.solid.receiveShadow = true; }
    if (this.glow.length) { const g = mergeGeometries(this.glow, false); g.computeBoundingSphere(); out.glow = new THREE.Mesh(g, glowMat); }
    this.solid.forEach(g => g.dispose()); this.glow.forEach(g => g.dispose()); this.solid = []; this.glow = [];
    return out;
  }
}
