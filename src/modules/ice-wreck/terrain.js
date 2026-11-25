// 冰原坠舰带的地形：冰盖、坠舰犁沟、撞击压力脊、冰裂缝、冒出冰面的岩峰（冰原岛峰）和北侧无冰的干谷。
//
// 模块局部坐标：x 指西、z 指北（见 src/modules/README.md）。巨舰从东边（-x）斜着坠下，在冰盖上向西犁出一道
// 近两公里长的沟，船身在途中断成三截，舰首最后撞进自己推起的冰脊里停住。
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, noise } from '../../util.js';

/* ---------- 地理骨架 ---------- */
export const furrowZ = x => 70 * Math.sin(x / 640 + 0.4) - 40;           // 犁沟中线
const FURROW = [-1900, 330];                                              // 犁沟起止（东 → 西）
export const BOW = { x: 330, z: furrowZ(330) };                           // 舰首撞击点
export const valleyZ = x => 980 + 110 * Math.sin(x / 420 + 1.2) + 50 * Math.sin(x / 170);   // 干谷中线
export const LAKE = { x: -260, z: 0, r: 230 };
LAKE.z = valleyZ(LAKE.x) + 10;
export const lakeD = (x, z) => Math.hypot((x - LAKE.x) / 1.7, z - LAKE.z) / LAKE.r + (fbm(x * 0.006 + 8, z * 0.006, 3) - 0.5) * 0.7;
const PEAKS = [[-1050, -820, 260, 210], [-1380, -380, 170, 150], [760, -1060, 230, 190], [1150, 520, 150, 140], [-640, -1180, 120, 110]];

// 大冰裂缝：几道折线，宽十几米、深几十米
export const RIFTS = [
  { pts: [[-80, -420], [40, -300], [130, -250], [260, -150]], w: 11 },
  { pts: [[480, -120], [560, 40], [600, 200], [700, 330]], w: 9 },
  { pts: [[-760, 260], [-640, 330], [-520, 360], [-380, 470]], w: 10 },
  { pts: [[-1250, -120], [-1180, 40], [-1060, 120]], w: 8 },
  { pts: [[820, -520], [900, -380], [1020, -330]], w: 9 }
];
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
export function riftDist(x, z) {
  let best = 1e9, w = 10;
  const wx = x + (noise(x * 0.03, z * 0.03) - 0.5) * 10, wz = z + (noise(x * 0.03 + 7, z * 0.03) - 0.5) * 10;
  for (const r of RIFTS) for (let i = 0; i < r.pts.length - 1; i++) {
    const [a, b] = [r.pts[i], r.pts[i + 1]], d = segDist(wx, wz, a[0], a[1], b[0], b[1]);
    if (d < best) { best = d; w = r.w; }
  }
  return best / w;   // < 1 在裂缝里
}

/** 犁沟：返回 [沟内深度系数 0..1, 两侧推起的冰堤系数 0..1, 沿沟进度 0..1] */
export function furrow(x, z) {
  const d = Math.abs(z - furrowZ(x)), along = smooth(FURROW[0], FURROW[0] + 450, x) * smooth(FURROW[1] + 40, FURROW[1] - 120, x);
  const prog = clamp((x - FURROW[0]) / (FURROW[1] - FURROW[0]), 0, 1);
  const half = 55 + 45 * prog;                           // 越往西沟越宽：船越陷越深、推开的冰越多
  return [smooth(half + 30, half - 20, d) * along, smooth(half + 120, half + 60, d) * smooth(half - 10, half + 40, d) * along, prog];
}
export function valley(x, z) { const d = Math.abs(z - valleyZ(x)) + (fbm(x * 0.004, z * 0.004, 3) - 0.5) * 120; return smooth(300, 150, d) * smooth(-1700, -1250, x) * smooth(1250, 850, x); }
export function peakAt(x, z) {
  let h = 0;
  for (const [px, pz, a, r] of PEAKS) {
    const d = Math.hypot(x - px, z - pz) / r;
    if (d > 3) continue;
    const rid = 1 - Math.abs(fbm(x * 0.007 + px, z * 0.007 + pz, 4) * 2 - 1), crag = 1 - Math.abs(fbm(x * 0.03 + pz, z * 0.03 - px, 3) * 2 - 1);
    const m = Math.exp(-Math.pow(d, 1.3));
    h = Math.max(h, a * m * (0.45 + 0.75 * rid * rid) + 28 * crag * smooth(0.15, 0.5, m));
  }
  return h;
}
/* ---------- 高度 ---------- */
export function ground(x, z) {
  const n = fbm(x * 0.0007 + 1, z * 0.0007 + 2, 5), n2 = fbm(x * 0.004 + 3, z * 0.004, 3);
  let h = 68 + 34 * n + 6 * n2 - smooth(-500, 1500, z) * 18;      // 冰盖：向北（干谷那边）缓缓降低
  // 冰流的长波起伏
  h += 3.5 * Math.sin(x * 0.012 + n * 8) * smooth(0.2, 0.5, n);
  // 冰原岛峰：岩峰从冰里戳出来，冰在背风面堆起
  h += peakAt(x, z);
  // 北侧干谷：一层层的岩坎，谷底有冰湖
  const v = valley(x, z);
  if (v > 0) {
    const floor = 14 + 6 * fbm(x * 0.01, z * 0.01, 2), step = 9, k = (h - floor) * (1 - v);
    const hv = floor + step * Math.floor(k / step) + step * smooth(0.55, 0.9, k / step - Math.floor(k / step));
    h = lerp(h, hv, smooth(0, 0.25, v));
    const ld = lakeD(x, z);
    h = lerp(h, 11.5, smooth(1.05, 0.85, ld));
  }
  // 坠舰犁沟与冰堤
  const [fd, fl, prog] = furrow(x, z);
  h -= fd * (14 + 22 * prog) * (0.85 + 0.3 * n2);
  h += fl * (8 + 18 * prog) * (0.7 + 0.6 * fbm(x * 0.02, z * 0.02, 2));
  // 舰首前方的压力脊：碎冰被推成一道弧形的冰墙
  const bx = x - BOW.x, bz = z - BOW.z, br = Math.hypot(bx * 0.8, bz), ba = Math.atan2(bz, bx);
  h += 46 * smooth(230, 120, br) * smooth(40, 120, br) * smooth(-1.9, -1.1, -Math.abs(ba)) * (0.6 + 0.6 * fbm(x * 0.03, z * 0.03, 3));
  // 大冰裂缝
  const rd = riftDist(x, z);
  if (rd < 1.6) h -= 38 * smooth(1.4, 0.7, rd);
  return h;
}

/* ---------- 地表颜色（核心地形网格与星球远景共用） ---------- */
const TC = {
  snow: new THREE.Color(0xe4eaef), snow2: new THREE.Color(0xcfdae4), blue: new THREE.Color(0x9cc8e0), firn: new THREE.Color(0xc4d6e2),
  rock: new THREE.Color(0x3d3a38), rock2: new THREE.Color(0x5b5048), sand: new THREE.Color(0x8c7860), band: new THREE.Color(0x2a2726),
  lake: new THREE.Color(0xa9d3e6), lakeDeep: new THREE.Color(0x5f9dbd), scar: new THREE.Color(0x8a9298), soot: new THREE.Color(0x4b4f54), rift: new THREE.Color(0x2c6f9a)
};
export function terrainColor(x, z, y, sl, c) {
  const n = fbm(x * 0.012, z * 0.012, 3), n2 = fbm(x * 0.05 + 9, z * 0.05, 2);
  const v = valley(x, z), pk = peakAt(x, z);
  // 冰与雪
  c.copy(TC.snow).lerp(TC.snow2, n);
  c.lerp(TC.blue, smooth(0.58, 0.72, fbm(x * 0.0025 + 5, z * 0.0025, 3)) * 0.55);       // 被风磨亮的蓝冰带
  c.lerp(TC.blue, smooth(0.3, 0.8, sl) * 0.75);                                            // 陡的冰坡露出蓝冰
  // 岩石：岩峰陡处、干谷谷壁
  const rock = Math.max(smooth(0.55, 0.95, sl) * smooth(20, 60, pk + v * 80), smooth(70, 110, pk + n * 30));
  if (rock > 0) {
    const strata = 0.5 + 0.5 * Math.sin(y * 0.55 + n * 3);                                  // 干谷谷壁上的辉绿岩层
    const r = _r.copy(TC.rock).lerp(TC.rock2, n2).lerp(TC.band, smooth(0.75, 0.95, strata) * 0.8 * smooth(0.2, 0.6, v + 0.2));
    c.lerp(r, rock);
  }
  if (v > 0.05) {
    const mo = fbm(x * 0.02 + 3, z * 0.006, 3);                                               // 冰碛：沿谷的深浅条带
    const g = _r.copy(TC.sand).lerp(TC.rock2, n2 * 0.6).lerp(TC.band, smooth(0.55, 0.75, mo) * 0.5).lerp(TC.snow2, smooth(0.7, 0.85, fbm(x * 0.03, z * 0.03 + 4, 2)) * 0.6).lerp(TC.rock, smooth(0.6, 1.1, sl) * 0.7);
    c.lerp(g, v * smooth(0.25, 0.7, v) * (1 - smooth(0.6, 0.9, n) * 0.3));
    const ld = lakeD(x, z);
    c.lerp(_r.copy(TC.lake).lerp(TC.lakeDeep, smooth(0.9, 0.2, ld) * 0.6 * n), smooth(1.08, 0.95, ld));
  }
  // 犁沟：刮出来的旧冰发灰，舰体烧蚀的黑灰拖成长条
  const [fd, fl, prog] = furrow(x, z);
  c.lerp(TC.firn, Math.max(fd, fl) * 0.6);
  c.lerp(TC.scar, fd * (0.25 + 0.3 * n2)).lerp(TC.blue, fd * smooth(0.45, 0.7, fbm(x * 0.006, z * 0.04, 3)) * 0.6);
  c.lerp(TC.soot, fd * smooth(0.6, 0.85, fbm(x * 0.008 + 2, z * 0.03, 3)) * 0.65 * (1 - prog * 0.4));
  // 冰裂缝内壁：越深越蓝
  const rd = riftDist(x, z); if (rd < 1.3) c.lerp(TC.rift, smooth(1.3, 0.5, rd));
  return c.multiplyScalar(0.94 + n2 * 0.1);
}
const _r = new THREE.Color();

/** 各处冰裂缝的密度（0..1）：犁沟两侧、舰首撞击点周围、冰流转弯处 */
export function crackField(x, z) {
  const [fd, fl] = furrow(x, z), bd = Math.hypot(x - BOW.x, z - BOW.z);
  const flow = smooth(0.55, 0.68, fbm(x * 0.0018 + 11, z * 0.0018 - 4, 3)) * 0.75;
  return clamp(Math.max(fl * 0.9 + fd * 0.35, smooth(520, 160, bd), flow) * (1 - valley(x, z)) * (1 - smooth(40, 90, peakAt(x, z))), 0, 1);
}

/* ---------- 核心地形网格（2.9 公里见方，精度约 6 米） ----------
   顶点额外带着平面坐标 aXZ 和裂缝密度 aCrack：烘焙到球面后它们不变，片元着色器用它们逐像素画出发蓝光的冰裂缝。 */
export const CORE = { x0: -1500, x1: 1400, z0: -1450, z1: 1450 };
export function makeTerrain(U) {
  const W = CORE.x1 - CORE.x0, D = CORE.z1 - CORE.z0, N = 470;
  const geo = new THREE.PlaneGeometry(W, D, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.translate((CORE.x0 + CORE.x1) / 2, 0, (CORE.z0 + CORE.z1) / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), xz = new Float32Array(p.count * 2), ck = new Float32Array(p.count * 2), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = ground(x, z); p.setY(i, y);
    const e = 3, sl = Math.hypot(ground(x + e, z) - ground(x - e, z), ground(x, z + e) - ground(x, z - e)) / (2 * e);
    terrainColor(x, z, y, sl, c);
    col.set([c.r, c.g, c.b], i * 3); xz.set([x, z], i * 2);
    const rd = riftDist(x, z);
    const edge = smooth(0, 220, Math.min(x - CORE.x0, CORE.x1 - x, z - CORE.z0, CORE.z1 - z));   // 网格边缘淡出，和星球远景网格接上
    ck.set([Math.max(crackField(x, z) * smooth(0.9, 0.4, sl), smooth(1.0, 0.8, lakeD(x, z)) * 0.45) * edge, smooth(1.5, 0.6, rd) * edge], i * 2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aXZ', new THREE.BufferAttribute(xz, 2));
  geo.setAttribute('aCrack', new THREE.BufferAttribute(ck, 2));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: U.uTime, uGlow: U.uGlow, uFill: U.uFill, uNightFill: U.uNightFill, uAur: U.uAur });
    sh.vertexShader = 'attribute vec2 aXZ, aCrack;\nvarying vec2 vXZ, vCk;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = aXZ; vCk = aCrack;');
    sh.fragmentShader = `uniform float uTime, uGlow, uFill, uNightFill, uAur; varying vec2 vXZ, vCk;
float ch(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
// 冰裂缝：成组的平行张裂缝（垂直于冰流，一段段断续），撞击点附近再叠上 Voronoi 龟裂。
// 返回 (到张裂缝的距离, 到龟裂的距离, 这一段裂缝的强弱)，单位米
vec3 cracks(vec2 p, float dens){
  vec2 w = p + 12. * vec2(cn(p * .017), cn(p * .017 + 5.3)) + 2.5 * vec2(cn(p * .11), cn(p * .11 + 2.));
  float a = 0.6 + 0.9 * cn(p * .0014);
  vec2 dir = vec2(cos(a), sin(a)), per = vec2(-dir.y, dir.x);
  float s = 31., u = dot(w, dir) / s, k = floor(u);
  float seg = cn(vec2(k * 7.13, dot(w, per) / 55.));
  float d1 = mix(99., abs(fract(u) - .5) * s, step(.4, ch(vec2(k, 3.1))));
  vec2 g = w / 62., gi = floor(g), gf = fract(g); float m1 = 9., m2 = 9.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(i, j), r = o + vec2(ch(gi + o), ch(gi + o + 3.7)) - gf; float d = dot(r, r);
    if (d < m1) { m2 = m1; m1 = d; } else if (d < m2) m2 = d; }
  float d2 = mix(99., (sqrt(m2) - sqrt(m1)) * 31., smoothstep(.5, .8, dens));
  return vec3(d1, d2, seg);
}
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float dens = vCk.x; vec3 cr = cracks(vXZ, dens);
  float w1 = (.3 + 1.5 * dens) * smoothstep(.28, .62, cr.z), w2 = .25 + .8 * dens;
  float line = max(1. - smoothstep(w1 * .6, w1 + .01, cr.x), (1. - smoothstep(w2 * .6, w2, cr.y)) * .85) * step(.03, dens);
  float halo = exp(-min(cr.x, cr.y) / (1.5 + 5. * dens)) * dens * .7;
  vGlowK = line * (.45 + 1.5 * cr.z) + halo * .25 + vCk.y * .65;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .82, .93), halo * .4);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.05, .24, .42), line);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float pulse = .8 + .2 * sin(uTime * .7 + vXZ.x * .01 + vXZ.y * .013);
  totalEmissiveRadiance += vec3(.2, .75, 1.6) * vGlowK * uGlow * pulse;
  // 雪地在阴影里也有天光（蓝）；夜里有星光，极光亮时泛一点绿
  totalEmissiveRadiance += diffuseColor.rgb * (vec3(.10, .13, .18) * uFill + vec3(.02, .028, .05) * uNightFill + vec3(.01, .05, .03) * uAur);`)
      .replace('void main() {', 'float vGlowK;\nvoid main() {');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
