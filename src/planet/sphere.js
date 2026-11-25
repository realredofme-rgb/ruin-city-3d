// 星球的几何基础：半径、地块坐标系（平面 ↔ 球面）、三维噪声
//
// 每个模块都在自己的「平面局部坐标」里搭建：x、z 是地面上的米，y 是海拔（海平面 = 0）。
// 装到星球上时，用方位等距投影把平面卷到球面：离地块中心的水平距离 r 变成球面上的弧长 r，
// 方向保持不变，海拔 y 变成离球心 R + y。所以模块里写的距离和高度，到了星球上依然是真实的米。
import * as THREE from 'three';

/** 星球半径（米）。地平线：人眼高 1.7 米时约 165 米，楼顶 50 米时约 900 米。 */
export const R = 8000;
/** 球面弯曲带来的下沉：离地块中心 r 米处，地面比切平面低约 r² / 2R 米。 */
export const sag = r => r * r / (2 * R);

const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion();

export class TileFrame {
  /**
   * @param center 地块中心的单位方向
   * @param xAxis  局部 +x 在中心处对应的切线方向（会被正交化）
   * 局部 +y 是中心处的「上」，+z = x × y，保证右手系。
   */
  constructor(center, xAxis) {
    this.c = center.clone().normalize();
    this.x = xAxis.clone().addScaledVector(this.c, -xAxis.dot(this.c)).normalize();
    this.z = new THREE.Vector3().crossVectors(this.x, this.c);
    this.q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.x, this.c, this.z));
  }
  /** 平面局部 (x, y, z) → 世界坐标 */
  toWorld(x, y, z, out = new THREE.Vector3()) {
    const r = Math.hypot(x, z), rad = R + y;
    if (r < 1e-6) return out.copy(this.c).multiplyScalar(rad);
    const th = r / R, s = Math.sin(th) / r, c = Math.cos(th);
    return out.set(
      (this.c.x * c + (this.x.x * x + this.z.x * z) * s) * rad,
      (this.c.y * c + (this.x.y * x + this.z.y * z) * s) * rad,
      (this.c.z * c + (this.x.z * x + this.z.z * z) * s) * rad);
  }
  /** 世界坐标 → 平面局部 (x, y, z) */
  toLocal(p, out = new THREE.Vector3()) {
    const len = p.length(), dx = p.x / len, dy = p.y / len, dz = p.z / len;
    const cth = dx * this.c.x + dy * this.c.y + dz * this.c.z;
    const px = dx * this.x.x + dy * this.x.y + dz * this.x.z, pz = dx * this.z.x + dy * this.z.y + dz * this.z.z;
    const sth = Math.hypot(px, pz), th = Math.atan2(sth, cth), k = sth > 1e-12 ? th * R / sth : R;
    return out.set(px * k, len - R, pz * k);
  }
  /** 单位方向 → 平面 (x, z)，写进 out.x / out.z */
  dirToLocal(d, out) { return this.toLocal(_a.copy(d).multiplyScalar(R), out); }
  /** 平面点 (x, z) 处的局部朝向：把局部坐标轴转到该点的切平面上 */
  quatAt(x, z, out = new THREE.Quaternion()) {
    const r = Math.hypot(x, z);
    if (r < 1e-6) return out.copy(this.q0);
    _t.set(0, 0, 0).addScaledVector(this.x, x / r).addScaledVector(this.z, z / r);
    _a.crossVectors(this.c, _t).normalize();
    return out.setFromAxisAngle(_a, r / R).multiply(this.q0);
  }
  /** 平面点处的完整 4×4 变换（旋转 + 平移），刚体物件直接左乘它 */
  matrixAt(x, y, z, out = new THREE.Matrix4()) {
    this.quatAt(x, z, _q);
    out.makeRotationFromQuaternion(_q);
    const p = this.toWorld(x, y, z, _t);
    out.elements[12] = p.x; out.elements[13] = p.y; out.elements[14] = p.z;
    return out;
  }
  /** 平面点处的「上」 */
  upAt(x, z, out = new THREE.Vector3()) { return this.toWorld(x, 0, z, out).normalize(); }
  /** 给 GPU 弯曲用的 uniform */
  uniforms() { return { uBC: { value: this.c }, uBX: { value: this.x }, uBZ: { value: this.z }, uBR: { value: R } }; }
}

/** 着色器里的同一套弯曲（与 toWorld 完全一致） */
export const BEND_GLSL = `
uniform vec3 uBC, uBX, uBZ; uniform float uBR;
vec3 planetBend(vec3 p){
  float r = length(p.xz);
  if (r < 1e-4) return uBC * (uBR + p.y);
  vec3 t = (uBX * p.x + uBZ * p.z) / r; float th = r / uBR;
  return (uBC * cos(th) + t * sin(th)) * (uBR + p.y);
}`;

/* ---------- 方位工具 ---------- */
export const latLon = (lat, lon, out = new THREE.Vector3()) => {
  const a = THREE.MathUtils.degToRad(lat), b = THREE.MathUtils.degToRad(lon);
  return out.set(Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b));
};
export const latOf = d => THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y / d.length(), -1, 1)));
export const lonOf = d => THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z));
/** 某点的东、北方向（单位） */
export function enu(u, e = new THREE.Vector3(), n = new THREE.Vector3()) {
  e.set(u.z, 0, -u.x); // Y × u
  if (e.lengthSq() < 1e-8) e.set(1, 0, 0);
  e.normalize(); n.crossVectors(u, e);
  return [e, n];
}
/** 以「西」为局部 +x 建立地块坐标系：这样局部 +z 是北，和城市 v1 的光照一致（城市在南半球，正午太阳在 +z 一侧） */
export function frameFor(center) {
  const [e] = enu(center); return new TileFrame(center, e.clone().negate());
}

/* ---------- 三维值噪声（星球尺度的扰动） ---------- */
function h3(i, j, k) { let h = (i * 374761393 + j * 668265263 + k * 1440662683) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
export function noise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = x - i, v = y - j, w = z - k;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), sw = w * w * (3 - 2 * w);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(i, j, k), h3(i + 1, j, k), su), L(h3(i, j + 1, k), h3(i + 1, j + 1, k), su), sv),
    L(L(h3(i, j, k + 1), h3(i + 1, j, k + 1), su), L(h3(i, j + 1, k + 1), h3(i + 1, j + 1, k + 1), su), sv), sw);
}
export function fbm3(x, y, z, o = 3) { let a = 0.5, f = 1, s = 0, n = 0; for (let q = 0; q < o; q++) { s += a * noise3(x * f + q * 7.1, y * f - q * 3.3, z * f + q * 5.7); n += a; a *= 0.5; f *= 2.03; } return s / n; }
