// 浮空群岛用的小工具：带逐顶点颜色的几何合并、树、铁链环
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 把一堆几何体（各自带 color 属性，或给一个统一颜色）合并成一个网格 */
export class Pack {
  constructor() { this.list = []; }
  /** color：THREE.Color，或 (x, y, z, out) => out 的函数（按变换后的位置取色） */
  add(g, m, color) {
    g = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (m) g.applyMatrix4(m);
    if (color) {
      const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        if (typeof color === 'function') color(p.getX(i), p.getY(i), p.getZ(i), c); else c.copy(color);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    this.list.push(g);
    return g;
  }
  get empty() { return !this.list.length; }
  build(material, { cast = true, receive = true } = {}) {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false); this.list = [];
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = cast; mesh.receiveShadow = receive;
    return mesh;
  }
}

const M4 = new THREE.Matrix4();
export const at = (x, y, z, ry = 0, rx = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));

/** 松树：三层锥 + 树干，原点在树根，高约 10 米 */
export function pineGeo() {
  const P = new Pack(), trunk = new THREE.Color(0x5a4636), leaf = new THREE.Color(0x3f5d36), leaf2 = new THREE.Color(0x52703f);
  P.add(new THREE.CylinderGeometry(0.22, 0.38, 3, 5).translate(0, 1.5, 0), null, trunk);
  for (const [y, r, h, c] of [[2, 2.6, 4.2, leaf], [4.3, 2.0, 3.6, leaf2], [6.4, 1.3, 3.4, leaf2]]) P.add(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0), null, c);
  const m = P.build(null); return m.geometry;
}
/** 阔叶树：歪一点的树冠团，原点在树根，高约 8 米 */
export function oakGeo() {
  const P = new Pack(), trunk = new THREE.Color(0x5d4a38), leaf = new THREE.Color(0x5f7d3c), leaf2 = new THREE.Color(0x7a8f46);
  P.add(new THREE.CylinderGeometry(0.25, 0.45, 4, 5).translate(0, 2, 0), null, trunk);
  for (const [x, y, z, r, c] of [[0, 5.2, 0, 2.6, leaf], [1.3, 6.2, 0.6, 1.8, leaf2], [-1.2, 5.8, -0.7, 1.9, leaf], [0.2, 7, -0.3, 1.6, leaf2]]) P.add(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), null, c);
  const m = P.build(null); return m.geometry;
}

/** 一节铁链环（长轴沿 y），长约 2.9、宽约 1.8（再按实例缩放） */
export function linkGeo() {
  const g = new THREE.TorusGeometry(0.7, 0.22, 5, 12); g.scale(1, 1.55, 1);
  return g;
}
export { M4 };
