// 浮空群岛的地面：一圈被撕裂的台地（特普伊式的平顶高崖），中间是地壳被掀走后留下的深渊，
// 深渊和台地外侧都沉在云海下面。台地被几道放射状的裂口切成一块块，有的整块微微翘起。
import * as THREE from 'three';
import { fbm, smooth, clamp, lerp } from '../../util.js';
import { PAL } from '../../planet/biomes.js';

/** fbm 的中位数约 0.25、5%–95% 约 0.14–0.36（见 util.js），这里拉成大约 -1..1 */
export const nz = (x, z, o = 3) => clamp((fbm(x, z, o) - 0.25) / 0.11, -1.4, 1.4);

export const CLOUD_Y = 168;    // 云海顶面
export const PLATEAU = 300;    // 台地平均高度
const FLOOR = -90;             // 深渊底（被海水灌满，藏在云下）

// 台地被撕开的裂口：[方位角, 宽度（米）]
const CRACKS = [[0.35, 150], [1.55, 95], [2.6, 210], [3.75, 120], [4.75, 260], [5.6, 110]];
// 每块台地的翘起：方位角区间之间按块编号取
const TILT = [24, -10, 42, 8, -18, 30];

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/** 深渊边缘半径（随方位起伏，带撕裂的锯齿） */
export function abyssR(a, x = 0, z = 0) {
  return 700 + 110 * Math.sin(a * 3 + 0.6) + 70 * Math.sin(a * 7 + 2.1) + 90 * nz(x * 0.004 + 7, z * 0.004, 3) + 40 * nz(x * 0.02, z * 0.02 + 3, 2);
}
/** 台地外缘半径 */
export function outerR(a, x = 0, z = 0) {
  return 1580 + 140 * Math.sin(a * 2 + 1.3) + 90 * Math.sin(a * 5 + 0.2) + 120 * nz(x * 0.003 + 2, z * 0.003 - 5, 3) + 45 * nz(x * 0.018 - 4, z * 0.018, 2);
}
/** 0 = 在裂口里，1 = 在台地上 */
function crackMask(x, z, r, a) {
  let m = 1;
  for (const [ca, w] of CRACKS) {
    const d = Math.abs(angDiff(a, ca)) * r + 30 * nz(x * 0.02 + ca, z * 0.02, 2);
    const ww = w * (0.55 + 0.6 * smooth(600, 1700, r)); // 越往外裂得越宽
    m = Math.min(m, smooth(ww * 0.5, ww * 0.5 + 28, d));
  }
  return m;
}
/** 所在台地块的编号（按裂口切分） */
export function slabOf(a) {
  const s = ((a % TAU) + TAU) % TAU;
  let k = 0; for (let i = 0; i < CRACKS.length; i++) if (s > CRACKS[i][0]) k = i + 1;
  return k % CRACKS.length;
}

/** 0..1：这里是不是台地顶面（不含崖壁） */
export function plateauMask(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  return smooth(abyssR(a, x, z) - 8, abyssR(a, x, z) + 26, r) * smooth(outerR(a, x, z) + 8, outerR(a, x, z) - 26, r) * crackMask(x, z, r, a);
}

export function height(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const A = abyssR(a, x, z), O = outerR(a, x, z);
  // 台地顶：缓缓起伏，有几级台阶；每块按自己的倾角翘起
  const slab = slabOf(a), tilt = TILT[slab] * (r - 1100) / 500;
  let top = PLATEAU + 34 * nz(x * 0.0016 + 3, z * 0.0016 + 1, 4) + tilt;
  const step = 16, k = Math.floor(top / step), f = top / step - k;
  top = lerp(top, step * (k + smooth(0.55, 0.9, f)), 0.6);
  top += 6 * nz(x * 0.012, z * 0.012, 2);
  // 崖壁：内侧（深渊）和外侧（云海）几乎垂直，裂口处同样
  const m = smooth(A - 10, A + 34, r) * smooth(O + 10, O - 34, r) * crackMask(x, z, r, a);
  // 崖下：深渊底与外海；外海往地块边缘慢慢接回海洋地块的海底
  const outside = smooth(O, O + 400, r);
  const below = lerp(FLOOR + 30 * nz(x * 0.003, z * 0.003, 3), -55 + 20 * nz(x * 0.002 + 9, z * 0.002, 3), outside);
  // 崖脚的碎石坡：靠近崖壁的地方垫高一些，免得崖壁从海底直插
  const talus = 70 * smooth(0.0, 0.6, m) * (1 - m);
  return lerp(below, top, m) + talus;
}

const C = c => new THREE.Color(c);
const SAND = [C(0xc9a27a), C(0xa9805c), C(0xd7bf9c), C(0x8f7a66), C(0xb88a64)];
const _c = new THREE.Color(), MEADOW = C(0x7d8f4c), MEADOW2 = C(0xa3a266), FOREST = C(0x3f5a32), ROCKY = C(0x9a8f78);
/** 砂岩的横向岩层颜色（崖壁、浮岛侧面、石柱共用） */
export function strata(y, x, z, out) {
  const w = y * 0.11 + 1.6 * nz(x * 0.006, z * 0.006, 2);
  const i = Math.floor(w), t = w - i, a = SAND[((i % 5) + 5) % 5], b = SAND[(((i + 1) % 5) + 5) % 5];
  out.copy(a).lerp(b, smooth(0.75, 1, t));
  out.multiplyScalar(0.86 + 0.14 * Math.sin(y * 1.7 + x * 0.05));
  return out;
}

export function color(x, z, y, sl, out) {
  if (y < -1) return out.copy(PAL.bed).lerp(PAL.sand, clamp((y + 12) / 12, 0, 1));
  strata(y, x, z, out);
  // 越往下越暗、越湿，长着苔藓
  out.lerp(_c.set(0x4c5a44), smooth(CLOUD_Y + 40, 0, y) * 0.55);
  // 顶面：草甸、灌丛和林下（林子的分布和 index.js 里种树用的是同一个噪声）
  const flat = smooth(0.9, 0.45, sl);
  if (flat > 0 && y > PLATEAU - 140) {
    const n = nz(x * 0.008 + 4, z * 0.008, 3), f = nz(x * 0.0045 + 9, z * 0.0045 - 2, 3);
    _c.copy(MEADOW).lerp(MEADOW2, smooth(-0.4, 0.8, n)).lerp(FOREST, smooth(-0.2, 0.5, f) * 0.85).lerp(ROCKY, smooth(0.5, 1.2, nz(x * 0.02, z * 0.02 + 6, 2)) * 0.4);
    out.lerp(_c, flat);
  }
  return out;
}
