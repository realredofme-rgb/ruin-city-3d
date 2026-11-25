// 盐湖镜原的几何工具：合并构建器、镜像几何、常用部件
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();

/**
 * 合并构建器：所有部件转成非索引几何，统一带 position / normal / color / aPh。
 * flat=true 时按三角面重算法线（棱角分明的石头）；镜像时法线保持原样，倒影里的明暗才和实物一致。
 */
export class Kit {
  constructor() { this.list = []; }
  add(g, m, color, { ph = 0, flat = true } = {}) {
    g = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (m) g.applyMatrix4(m);
    if (flat || !g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, col = new Float32Array(n * 3), p = new Float32Array(n).fill(ph);
    _c.copy(color); for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(p, 1));
    this.list.push(g);
    return g;
  }
  geometry() {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false); this.list.forEach(x => x.dispose()); this.list = [];
    return g;
  }
}

/**
 * 镜像几何：以湖面 y=L 为镜子，把 y 翻到 2L - y。
 * 完全在水下的三角形丢掉，部分在水下的顶点压到水面；三角形绕序反过来，正面仍然朝外；法线不翻（见上）。
 * 平面坐标里翻转，再由挂载层弯到球面上，倒影自然贴合星球的曲率。
 */
export function mirrorGeometry(src, L) {
  const g0 = src.index ? src.toNonIndexed() : src;
  const pos = g0.attributes.position, n = pos.count, keep = [];
  for (let i = 0; i < n; i += 3) if (Math.max(pos.getY(i), pos.getY(i + 1), pos.getY(i + 2)) > L + 0.05) keep.push(i);
  const out = new THREE.BufferGeometry(), order = [0, 2, 1];
  for (const [name, attr] of Object.entries(g0.attributes)) {
    const s = attr.itemSize, a = new Float32Array(keep.length * 3 * s);
    let w = 0;
    for (const i of keep) for (const o of order) { for (let k = 0; k < s; k++) a[w++] = attr.array[(i + o) * s + k]; }
    if (name === 'position') for (let j = 1; j < a.length; j += 3) a[j] = 2 * L - Math.max(a[j], L);
    out.setAttribute(name, new THREE.BufferAttribute(a, s));
  }
  return out;
}

/** 从 a 到 b 的圆柱（细杆、拉索、支架） */
export function rod(a, b, r, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** 顶点微扰：让石头、岩块不那么规整 */
export function jitter(g, amt, R) {
  const p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
    let o = seen.get(key); if (!o) { o = [R.range(-amt, amt), R.range(-amt, amt) * 0.5, R.range(-amt, amt)]; seen.set(key, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  return g;
}

/** 长条物件（铁轨、道砟）拆成短段，免得弯到球面上时中间悬空或沉下去 */
export function segments(len, maxSeg) { const n = Math.max(1, Math.ceil(len / maxSeg)); return Array.from({ length: n }, (_, i) => [(i + 0.5) / n * len - len / 2, len / n]); }

export const mat4 = (x, y, z, ry = 0, rx = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));
