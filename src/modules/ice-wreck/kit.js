// 冰原坠舰带的小几何工具：直接往三角形数组里写（带矩阵栈），最后合并成一张网格，并在朝上的面上落雪。
import * as THREE from 'three';
import { smooth, fbm } from '../../util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
const SNOW = new THREE.Color(0xf1f5f8), FROST = new THREE.Color(0xc9dde9);

export class Kit {
  constructor() { this.p = []; this.n = []; this.c = []; this.M = new THREE.Matrix4(); this.NM = new THREE.Matrix3(); this.stack = []; }
  set(m) { this.M.copy(m); this.NM.getNormalMatrix(this.M); return this; }
  push(m) { this.stack.push(this.M.clone()); this.set(this.M.clone().multiply(m)); return this; }
  pop() { this.set(this.stack.pop()); return this; }
  /** 一个三角形（局部坐标），法线按绕序 */
  tri(a, b, c, col) {
    _a.copy(a).applyMatrix4(this.M); _b.copy(b).applyMatrix4(this.M); _c.copy(c).applyMatrix4(this.M);
    _n.subVectors(_b, _a).cross(_t.subVectors(_c, _a)).normalize();
    for (const v of [_a, _b, _c]) { this.p.push(v.x, v.y, v.z); this.n.push(_n.x, _n.y, _n.z); this.c.push(col.r, col.g, col.b); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  /** 一个 three.js 几何体，m 是相对当前矩阵的变换；col 可以是颜色或 (x,y,z)=>颜色 */
  geo(g, m, col) {
    g = g.index ? g.toNonIndexed() : g.clone();
    const M = m ? this.M.clone().multiply(m) : this.M, NM = new THREE.Matrix3().getNormalMatrix(M);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      _a.fromBufferAttribute(p, i).applyMatrix4(M); _n.fromBufferAttribute(n, i).applyMatrix3(NM).normalize();
      const k = typeof col === 'function' ? col(_a.x, _a.y, _a.z) : col;
      this.p.push(_a.x, _a.y, _a.z); this.n.push(_n.x, _n.y, _n.z); this.c.push(k.r, k.g, k.b);
    }
    g.dispose();
  }
  /** 底面在 y=0 的方盒 */
  box(w, h, d, m, col) { this.geo(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m, col); }
  get count() { return this.p.length / 3; }
  /** snow：朝上的面落雪的程度；frost：整体蒙一层霜 */
  build(material, { snow = 0, frost = 0, cast = true, receive = true } = {}) {
    if (!this.p.length) return null;
    const col = this.c;
    if (snow > 0 || frost > 0) for (let i = 0; i < col.length; i += 3) {
      const x = this.p[i], y = this.p[i + 1], z = this.p[i + 2], ny = this.n[i + 1];
      const nn = fbm(x * 0.06 + y * 0.02, z * 0.06 - y * 0.03, 3);
      const f = Math.min(0.95, snow * smooth(0.35, 0.8, ny) * smooth(0.2, 0.45, nn) + frost * (0.3 + 0.4 * nn));
      const tgt = ny > 0.3 ? SNOW : FROST;
      col[i] += (tgt.r - col[i]) * f; col[i + 1] += (tgt.g - col[i + 1]) * f; col[i + 2] += (tgt.b - col[i + 2]) * f;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.p = []; this.n = []; this.c = [];
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = cast; mesh.receiveShadow = receive;
    return mesh;
  }
}
