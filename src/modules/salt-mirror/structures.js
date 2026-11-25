// 盐湖上的东西：沉默列柱、半没湖中的巨环、悬石、回声阵列（天线）、仙人掌岛、盐堆、列车墓地
import * as THREE from 'three';
import { fbm, smooth, lerp, clamp, rng } from '../../util.js';
import { Kit, rod, jitter, segments, mat4 } from './kit.js';

const C = c => new THREE.Color(c);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WHITE = C(0xece9e1);

/* ---------- 布局 ---------- */
export const AX = 0.2;                                   // 列柱大道的走向（从 +x 往 +z 偏 0.2 弧度）
export const DIR = V(Math.cos(AX), 0, Math.sin(AX));     // 沿大道
export const SIDE = V(-Math.sin(AX), 0, Math.cos(AX));   // 横穿大道
export const RING_T = 210;                               // 巨环在大道上的位置
export const ISLE = { x: 380, z: -430, r: 150 };
export const ARRAY = { x: -640, z: 560 };
export const PILES = { x: 760, z: 700 };
export const YARD = { x: -830, z: -760 };
export const along = (t, s = 0) => V(DIR.x * t + SIDE.x * s, 0, DIR.z * t + SIDE.z * s);

/** 石头的颜色：岩层、风化斑驳，底部结一圈白色盐霜 */
export function tintStone(g, L, amt = 1) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm(x * 0.06 + y * 0.09, z * 0.06 - y * 0.04, 3), n2 = fbm(x * 0.4 + y * 0.3, z * 0.4, 2);
    let k = 0.82 + (n - 0.25) * 1.5 * amt + (n2 - 0.25) * 0.5 * amt;
    k *= 0.95 + 0.05 * Math.sin(y * 0.38 + n * 9);
    const s = smooth(L + 4.5, L + 0.6, y + (n - 0.25) * 14);
    c.setXYZ(i, lerp(c.getX(i) * k, WHITE.r, s * 0.85), lerp(c.getY(i) * k, WHITE.g, s * 0.85), lerp(c.getZ(i) * k, WHITE.b, s * 0.85));
  }
}

/* ---------- 沉默列柱 ---------- */
const STONE = [C(0xa49a8a), C(0x968c7c), C(0xb0a898), C(0x8f877b)];
const GLOW = new THREE.Color(0.75, 1.55, 2.3);

function pillar(K, x, z, o) {
  const { L, w, h, ry, R, kind } = o, stone = STONE[Math.floor(R() * STONE.length)];
  const tilt = kind === 'tilt' ? [R.range(-0.12, 0.12), R.range(-0.12, 0.12)] : [R.range(-0.012, 0.012), R.range(-0.012, 0.012)];
  const sink = kind === 'tilt' ? 6 : 2.5;
  const M = mat4(x, L - sink, z, ry, tilt[0], tilt[1]), part = (g, m, col = stone, opt) => K.stone.add(g, new THREE.Matrix4().multiplyMatrices(M, m), col, opt);
  const top = { x, z, y: L - sink + h };
  part(jitter(new THREE.BoxGeometry(w * 1.75, 5, w * 1.75), 0.35, R), mat4(0, 2.5, 0));
  part(jitter(new THREE.BoxGeometry(w * 1.42, 4, w * 1.42), 0.25, R), mat4(0, 7, 0));
  const r0 = w / 2 / Math.cos(Math.PI / 8), hs = h - 9 - (kind === 'broken' ? 0 : 12);
  const ob = o.obelisk, sides = ob ? 4 : 8, rot = Math.PI / sides, taper = ob ? 0.62 : 0.9;
  const shaft = new THREE.CylinderGeometry(r0 * taper * (ob ? 0.85 : 1), r0 * (ob ? 0.85 : 1), hs, sides, 8); shaft.rotateY(rot);
  part(jitter(shaft, 0.22, R), mat4(0, 9 + hs / 2, 0));
  // 刻出来的环带
  for (const f of [0.18, 0.46, 0.74]) {
    if (kind === 'broken' && f > 0.6) continue;
    if (ob && f > 0.3) continue;
    const rr = lerp(r0, r0 * taper, f) * (ob ? 0.95 : 1.1), b = new THREE.CylinderGeometry(rr, rr, 2.4, sides, 1); b.rotateY(rot);
    part(b, mat4(0, 9 + hs * f, 0));
  }
  const ap = ob ? r0 * 0.85 * taper * 1.1 * Math.cos(Math.PI / 4) : r0 * 0.9 * Math.cos(Math.PI / 8);
  if (kind === 'broken') {
    // 断口：几块歪斜的碎石
    for (let i = 0; i < 4; i++) part(jitter(new THREE.BoxGeometry(R.range(3, 6), R.range(3, 7), R.range(3, 6)), 0.6, R), mat4(R.range(-ap, ap) * 0.6, 9 + hs + R.range(-1, 2), R.range(-ap, ap) * 0.6, R() * 3, R.range(-0.5, 0.5), R.range(-0.5, 0.5)));
    top.y = L - sink + 9 + hs;
  } else if (ob) {
    const cap = new THREE.ConeGeometry(r0 * taper * 0.85, 16, 4); cap.rotateY(Math.PI / 4);
    part(cap, mat4(0, 9 + hs + 8, 0));
    top.y = L - sink + 9 + hs + 16;
  } else {
    part(jitter(new THREE.BoxGeometry(w * 1.5, 4.5, w * 1.5), 0.2, R), mat4(0, 9 + hs + 2.25, 0));
    part(new THREE.BoxGeometry(w * 1.22, 3.5, w * 1.22), mat4(0, 9 + hs + 6.2, 0));
    const cap = new THREE.ConeGeometry(w * 0.62, 4, 4); cap.rotateY(Math.PI / 4);
    part(cap, mat4(0, 9 + hs + 9.9, 0));
  }
  // 朝向大道一侧的光纹：一条竖线 + 一列方块铭文
  if (o.face) {
    const zf = o.face * (ap + 0.12), y0 = 13, y1 = 9 + hs * (kind === 'broken' ? 0.8 : 0.86), ph = o.ph;
    const gap = R.range(0.3, 0.7), ym = lerp(y0, y1, gap);
    for (const [a, b] of [[y0, ym - 2], [ym + 2, y1]]) if (b - a > 3) K.glow.add(new THREE.BoxGeometry(1.4, b - a, 0.35), new THREE.Matrix4().multiplyMatrices(M, mat4(0, (a + b) / 2, zf)), GLOW, { ph });
    for (let i = 0; i < 6; i++) { const y = y0 + 4 + i * 5.5; if (y > y1 - 2) break; if (R() < 0.3) continue; K.glow.add(new THREE.BoxGeometry(1.7, 1.7, 0.3), new THREE.Matrix4().multiplyMatrices(M, mat4(R.chance(0.5) ? -2.4 : 2.4, y, zf)), GLOW, { ph: ph + i * 0.004 }); }
  }
  return top;
}

/** 倒下的柱子：一串石鼓躺在盐面上 */
function fallen(K, x, z, o) {
  const { L, w, R, ry } = o, stone = STONE[Math.floor(R() * STONE.length)], r = w / 2 / Math.cos(Math.PI / 8), dir = ry + R.range(-1.2, 1.2);
  K.stone.add(jitter(new THREE.BoxGeometry(w * 1.75, 5, w * 1.75), 0.35, R), mat4(x, L - 2.5 + 2.5, z, ry), stone);
  let d = w * 1.2;
  for (let i = 0; i < 5; i++) {
    const len = R.range(9, 16), g = new THREE.CylinderGeometry(r * 0.95, r * 0.95, len, 8, 2); g.rotateY(Math.PI / 8);
    const m = mat4(x + Math.cos(dir) * (d + len / 2), L + r * 0.7, z - Math.sin(dir) * (d + len / 2), dir + R.range(-0.15, 0.15), 0, Math.PI / 2 + R.range(-0.08, 0.08));
    K.stone.add(jitter(g, 0.3, R), m, stone); d += len + R.range(0.5, 4);
  }
}

export function buildColonnade(K, L, height) {
  const R = rng(707), tops = [], pairs = [];
  const ry = -AX;
  for (let i = 0, t = -1210; t <= 1210; t += 62, i++) {
    if (Math.abs(t - RING_T) < 45) continue;
    const pair = [];
    for (const side of [-1, 1]) {
      const s = side * 24 + R.range(-1.2, 1.2), p = along(t + R.range(-2, 2), s);
      if (Math.hypot(p.x - ISLE.x, p.z - ISLE.z) < ISLE.r + 40) continue;
      if (height(p.x, p.z) > L + 6) continue;
      const end = smooth(700, 1150, Math.abs(t));
      const u = R(), kind = u < 0.06 + end * 0.25 ? 'fallen' : u < 0.26 + end * 0.3 ? 'broken' : u < 0.36 + end * 0.1 ? 'tilt' : 'whole';
      const o = { L, R, ry, kind, obelisk: kind !== 'fallen' && R() < 0.22, w: R.range(11, 14), h: R.range(80, 118) * (1 - end * 0.25), face: -side, ph: (t + 1300) / 2600 };
      pair.push({ p, o, side });
    }
    pairs.push(pair);
  }
  // 每隔几对，用一根横梁把两根柱子连成门
  pairs.forEach((pair, i) => {
    const gate = i % 5 === 2 && pair.length === 2 && pair.every(q => q.o.kind === 'whole');
    if (gate) { const h = Math.max(pair[0].o.h, pair[1].o.h); pair.forEach(q => { q.o.h = h; q.o.kind = 'whole'; q.o.obelisk = false; }); }
    else if (pair.length === 2 && pair[0].o.obelisk !== pair[1].o.obelisk && pair.every(q => q.o.kind !== 'fallen')) pair[1].o.obelisk = pair[0].o.obelisk; // 一对柱子同款
    let topY = 0;
    for (const q of pair) {
      if (q.o.kind === 'fallen') { fallen(K, q.p.x, q.p.z, q.o); continue; }
      const top = pillar(K, q.p.x, q.p.z, q.o); tops.push(top); topY = top.y;
    }
    if (gate) {
      const m = pair[0].p.clone().add(pair[1].p).multiplyScalar(0.5), w = pair[0].o.w;
      const lint = jitter(new THREE.BoxGeometry(w * 1.3, 8, 52 + w * 1.4, 1, 1, 4), 0.3, R);
      K.stone.add(lint, mat4(m.x, topY + 1, m.z, ry), STONE[2]);
      for (let k = -3; k <= 3; k++) for (const f of [-1, 1]) K.glow.add(new THREE.BoxGeometry(0.3, 2, 2), mat4(m.x + DIR.x * f * (w * 0.65 + 0.1) + SIDE.x * k * 5, topY + 1, m.z + DIR.z * f * (w * 0.65 + 0.1) + SIDE.z * k * 5, ry), GLOW, { ph: pair[0].o.ph });
    }
  });
  return tops;
}

/* ---------- 半没湖中的巨环 + 悬石 ---------- */
export function buildRing(K, L) {
  const R = rng(808), c = along(RING_T), Rr = 128, N = 44, stone = C(0x7f7a72), dark = C(0x5f5b55);
  const up = V(0, 1, 0), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const missing = new Set([29, 30]);
  for (let i = 0; i < N; i++) {
    const a = (i + 0.5) / N * Math.PI * 2;
    if (a > Math.PI + 0.32 && a < Math.PI * 2 - 0.32) continue; // 水面以下的不用搭，倒影会补上
    if (missing.has(i)) continue;
    const e1 = SIDE.clone().multiplyScalar(-Math.sin(a)).addScaledVector(up, Math.cos(a));
    const e2 = SIDE.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    basis.makeBasis(e1, e2, DIR); q.setFromRotationMatrix(basis);
    const at = (rad, ax = 0) => new THREE.Matrix4().compose(V(c.x + e2.x * rad + DIR.x * ax, L + e2.y * rad, c.z + e2.z * rad + DIR.z * ax), q, V(1, 1, 1));
    const arc = Rr * Math.PI * 2 / N;
    K.stone.add(jitter(new THREE.BoxGeometry(arc * 0.95, 17, 20, 2, 2, 2), 0.35, R), at(Rr), i % 2 ? stone : dark);
    K.stone.add(new THREE.BoxGeometry(arc * 0.97, 3, 23), at(Rr + 9.5), dark);
    if (i % 4 === 0) K.stone.add(jitter(new THREE.BoxGeometry(arc * 0.45, 12, 26), 0.3, R), at(Rr + 15), stone);
    // 内侧的光环与铭文
    K.glow.add(new THREE.BoxGeometry(arc * 0.98, 0.5, 1.4), at(Rr - 8.6), GLOW, { ph: (RING_T + 1300) / 2600 });
    if (i % 2 === 0) for (const ax of [-6, 6]) K.glow.add(new THREE.BoxGeometry(arc * 0.32, 0.4, 2.2), at(Rr - 8.6, ax), GLOW, { ph: (RING_T + 1300) / 2600 + 0.01 });
  }
  // 缺口掉下来的两块，斜插在水里
  for (const [s, d, r] of [[-38, 30, 0.7], [-55, -22, -0.5]]) {
    const p = along(RING_T + d, s - 90);
    K.stone.add(jitter(new THREE.BoxGeometry(17, 17, 20, 2, 2, 2), 0.5, R), mat4(p.x, L + 4, p.z, R() * 3, r, 0.4), dark);
  }
  // 环顶上空的悬石：静静地停在半空，倒影里也有一份
  const shards = [];
  for (let i = 0; i < 9; i++) {
    const s = R.range(-90, 90), d = R.range(-50, 50), y = L + Rr + R.range(40, 140) + (i === 0 ? 30 : 0);
    const p = along(RING_T + d, s), sz = i === 0 ? 17 : R.range(4, 11);
    const g = new THREE.OctahedronGeometry(sz, 1); g.scale(1, R.range(1.4, 2.2), 1);
    K.stone.add(jitter(g, sz * 0.18, R), mat4(p.x, y, p.z, R() * 6, R.range(-0.4, 0.4), R.range(-0.4, 0.4)), i === 0 ? dark : stone);
    if (i === 0) K.glow.add(new THREE.BoxGeometry(0.5, sz * 2.4, 0.5), mat4(p.x, y, p.z, 0.4), GLOW, { ph: 0.6 });
    shards.push([p.x, y, p.z]);
  }
  return { center: c, shards };
}

/* ---------- 回声阵列：Y 字形排开的射电天线 ---------- */
const PAINT = C(0xdedbd3), CONC = C(0xb4afa5), RUST = [C(0x7a4a2e), C(0x5e3b29), C(0x8d5a36), C(0x6b5040)], RED = new THREE.Color(2.6, 0.25, 0.15);

function dishParts(Rd = 12.5, f = 11) {
  const pts = []; for (let i = 0; i <= 12; i++) { const r = 0.9 + (Rd - 0.9) * i / 12; pts.push(new THREE.Vector2(r, r * r / (4 * f))); }
  return { lathe: new THREE.LatheGeometry(pts, 40), depth: Rd * Rd / (4 * f), f };
}
const DISH = dishParts();

function dish(K, x, z, L, o) {
  const { az, el, R, state } = o;
  const H = state === 'stump' ? L + 6 : L + 19;
  // 基座：混凝土墩 + 白色立柱 + 方位转台
  K.stone.add(new THREE.BoxGeometry(9, 1.6, 9), mat4(x, L + 0.3, z, az), CONC, {});
  const ped = state === 'stump' ? 6 : 13;
  K.metal.add(new THREE.CylinderGeometry(1.9, 2.7, ped, 12), mat4(x, L + ped / 2, z), PAINT, { flat: false });
  if (state === 'stump') {
    // 立柱断了，碟面翻倒在盐面上
    K.metal.add(DISH.lathe, mat4(x + Math.sin(az) * 14, L + 3, z + Math.cos(az) * 14, az + 1.2, 1.15, 0.3), PAINT, { flat: false });
    K.metal.add(rod(V(x + Math.sin(az) * 6, L + 0.5, z + Math.cos(az) * 6), V(x + Math.sin(az) * 15, L + 9, z + Math.cos(az) * 15), 0.25), null, RUST[0]);
    return null;
  }
  const yaw = mat4(x, 0, z, az);
  const Y = (g, m, col = PAINT, opt) => K.metal.add(g, m ? new THREE.Matrix4().multiplyMatrices(yaw, m) : yaw, col, opt);
  Y(new THREE.BoxGeometry(6.5, 2.2, 4.2), mat4(0, L + 14.1, 0));
  for (const s of [-1, 1]) Y(new THREE.BoxGeometry(0.9, 6.5, 2.6), mat4(s * 2.9, L + 17.4, 0));
  // 俯仰：碟面原本朝 +y，绕 x 轴倒下 (π/2 - el)
  const tip = new THREE.Matrix4().multiplyMatrices(yaw, mat4(0, H, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - el));
  const D = (g, m, col = PAINT, opt) => K.metal.add(g, m ? new THREE.Matrix4().multiplyMatrices(tip, m) : tip, col, opt);
  const lift = 1.6;
  D(DISH.lathe, mat4(0, lift, 0), PAINT, { flat: false });
  const rim = new THREE.TorusGeometry(12.5, 0.22, 4, 56); rim.rotateX(Math.PI / 2);
  D(rim, mat4(0, lift + DISH.depth, 0), PAINT, { flat: false });
  const truss = new THREE.TorusGeometry(7.5, 0.35, 4, 40); truss.rotateX(Math.PI / 2);
  D(truss, mat4(0, lift + 7.5 * 7.5 / 44 - 0.6, 0), C(0xb9b6ae), { flat: false });
  D(new THREE.CylinderGeometry(1.7, 2.3, 2.6, 12), mat4(0, lift - 0.9, 0), C(0xc9c6be), { flat: false });
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, r1 = 2.2, r2 = 11.5; D(rod(V(Math.cos(a) * r1, lift - 0.6, Math.sin(a) * r1), V(Math.cos(a) * r2, lift + r2 * r2 / 44 - 0.35, Math.sin(a) * r2), 0.18, 4), null, C(0xb9b6ae)); }
  // 馈源：四根支腿撑起接收舱
  const apex = V(0, lift + DISH.f * 0.82, 0);
  for (let k = 0; k < 4; k++) { const a = (k + 0.5) / 4 * Math.PI * 2; D(rod(V(Math.cos(a) * 11.8, lift + DISH.depth - 0.1, Math.sin(a) * 11.8), apex, 0.16, 5), null, C(0xc9c6be)); }
  D(new THREE.CylinderGeometry(0.75, 0.95, 2.6, 10), mat4(apex.x, apex.y + 0.6, apex.z), C(0xcfccc4), { flat: false });
  if (state !== 'dead') {
    const b = new THREE.Vector3().copy(apex).setY(apex.y + 2.2).applyMatrix4(tip);
    K.beacon.add(new THREE.SphereGeometry(0.8, 8, 6), mat4(b.x, b.y, b.z), RED, { ph: R() });
    return b;
  }
  return null;
}

function rail(K, a, b, L, R, sleepers = 3) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length(), ry = Math.atan2(-d.z, d.x);
  const at = s => a.clone().addScaledVector(d, (s + len / 2) / len);
  for (const [s, l] of segments(len, 16)) {
    const p = at(s);
    K.stone.add(new THREE.BoxGeometry(l, 0.5, 3.6), mat4(p.x, L + 0.05, p.z, ry), C(0x9b9284));
    for (const off of [-0.76, 0.76]) K.rust.add(new THREE.BoxGeometry(l, 0.22, 0.16), mat4(p.x + Math.sin(ry) * off, L + 0.42, p.z + Math.cos(ry) * off, ry), RUST[1]);
  }
  for (let s = -len / 2 + 1; s < len / 2; s += sleepers) { const p = at(s); K.rust.add(new THREE.BoxGeometry(0.28, 0.16, 2.6), mat4(p.x, L + 0.32, p.z, ry + R.range(-0.04, 0.04)), RUST[3]); }
}

export function buildArray(K, L, height) {
  const R = rng(909), beacons = [], c = V(ARRAY.x, 0, ARRAY.z);
  const point = { az: -0.55, el: 0.92 };     // 整个阵列一起望着同一片天
  dish(K, c.x, c.z, L, { ...point, R, state: 'ok' }) && beacons.push(c.clone().setY(L + 30));
  for (let k = 0; k < 3; k++) {
    const b = 0.35 + k * Math.PI * 2 / 3, u = V(Math.cos(b), 0, Math.sin(b)), n = V(-u.z, 0, u.x);
    rail(K, c.clone().addScaledVector(u, 8), c.clone().addScaledVector(u, 335), L, R);
    for (let i = 0; i < 9; i++) {
      const d = 28 * Math.pow(1.33, i), p = c.clone().addScaledVector(u, d).addScaledVector(n, 7.5);
      if (height(p.x, p.z) > L + 3) continue;
      const roll = R(), state = roll < 0.1 ? 'stump' : roll < 0.24 ? 'dead' : 'ok';
      const o = state === 'dead' ? { az: R.range(-3, 3), el: R.chance(0.5) ? R.range(-0.25, 0.1) : R.range(0.2, 1.4) } : point;
      const bp = dish(K, p.x, p.z, L, { ...o, R, state });
      if (bp) beacons.push(bp);
    }
  }
  return beacons;
}

/* ---------- 仙人掌岛 ---------- */
export function buildCacti(K, L, height) {
  const R = rng(1201), green = [C(0x6c7548), C(0x5f6a40), C(0x7c8152)];
  let n = 0;
  for (let tries = 0; tries < 2000 && n < 170; tries++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * ISLE.r, x = ISLE.x + Math.cos(a) * r, z = ISLE.z + Math.sin(a) * r, y = height(x, z);
    if (y < L + 3) continue;
    const sl = Math.hypot(height(x + 2, z) - height(x - 2, z), height(x, z + 2) - height(x, z - 2)) / 4;
    if (sl > 0.9) continue;
    const h = R.range(3.5, 11), rr = R.range(0.32, 0.55) * (0.7 + h / 14), col = R.pick(green);
    K.stone.add(new THREE.CylinderGeometry(rr * 0.85, rr, h, 9, 3), mat4(x, y - 0.5 + h / 2, z, R() * 3), col);
    K.stone.add(new THREE.SphereGeometry(rr * 0.86, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat4(x, y - 0.5 + h, z), col.clone().lerp(C(0xa8a070), 0.4));
    const arms = h > 6 ? Math.floor(R() * 4) : 0;
    for (let k = 0; k < arms; k++) {
      const b = R() * Math.PI * 2, hy = y + h * R.range(0.3, 0.6), out = R.range(1.2, 2), up = h * R.range(0.25, 0.42), ar = rr * 0.72;
      const ex = x + Math.cos(b) * out, ez = z + Math.sin(b) * out;
      K.stone.add(rod(V(x, hy, z), V(ex, hy + 0.6, ez), ar, 8), null, col);
      K.stone.add(new THREE.CylinderGeometry(ar * 0.9, ar, up, 8), mat4(ex, hy + 0.6 + up / 2, ez), col);
      K.stone.add(new THREE.SphereGeometry(ar * 0.9, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), mat4(ex, hy + 0.6 + up, ez), col.clone().lerp(C(0xa8a070), 0.4));
    }
    n++;
  }
}

/* ---------- 盐堆：一排排晒着的小盐丘 ---------- */
export function buildPiles(K, L) {
  const R = rng(1301), a = 0.75, u = V(Math.cos(a), 0, Math.sin(a)), v = V(-u.z, 0, u.x);
  for (let i = 0; i < 7; i++) for (let j = 0; j < 22; j++) {
    if (R() < 0.08) continue;
    const p = V(PILES.x, 0, PILES.z).addScaledVector(u, (j - 11) * 6.5 + R.range(-0.6, 0.6)).addScaledVector(v, (i - 3) * 9 + R.range(-0.6, 0.6));
    const s = R.range(0.8, 1.15), g = new THREE.ConeGeometry(2.3 * s, 1.9 * s, 10, 2);
    K.stone.add(jitter(g, 0.18, R), mat4(p.x, L + 0.8 * s, p.z, R() * 3), C(0xf1efe9).multiplyScalar(R.range(0.93, 1)));
  }
}

/* ---------- 列车墓地 ---------- */
function loco(K, m, R) {
  const P = (g, mm, col = R.pick(RUST)) => K.rust.add(g, new THREE.Matrix4().multiplyMatrices(m, mm), col);
  P(new THREE.BoxGeometry(11, 0.8, 2.6), mat4(0, 1.6, 0));
  for (const x of [-3.2, -1.1, 1.1, 3.2]) for (const z of [-1.25, 1.25]) { const w = new THREE.CylinderGeometry(0.78, 0.78, 0.25, 12); w.rotateX(Math.PI / 2); P(w, mat4(x, 0.78, z), RUST[1]); }
  const boiler = new THREE.CylinderGeometry(1.15, 1.15, 6.6, 14); boiler.rotateZ(Math.PI / 2); P(boiler, mat4(-1.4, 3.1, 0));
  const smoke = new THREE.CylinderGeometry(1.25, 1.25, 1.1, 14); smoke.rotateZ(Math.PI / 2); P(smoke, mat4(-5, 3.1, 0), RUST[1]);
  P(new THREE.CylinderGeometry(0.38, 0.55, 1.8, 10), mat4(-4.5, 4.9, 0), RUST[1]);
  P(new THREE.SphereGeometry(0.6, 10, 6), mat4(-1.2, 4.25, 0));
  P(new THREE.BoxGeometry(3, 3.2, 2.8), mat4(3.6, 3.6, 0));
  P(new THREE.BoxGeometry(3.7, 0.25, 3.2), mat4(3.6, 5.3, 0), RUST[1]);
  P(new THREE.CylinderGeometry(0.1, 1.6, 1.6, 4, 1), mat4(-6.1, 0.9, 0, Math.PI / 4, 0, Math.PI / 2));
}
function wagon(K, m, R, open) {
  const P = (g, mm, col = R.pick(RUST)) => K.rust.add(g, new THREE.Matrix4().multiplyMatrices(m, mm), col);
  P(new THREE.BoxGeometry(8, 0.6, 2.6), mat4(0, 1.5, 0));
  for (const x of [-2.6, 2.6]) for (const z of [-1.25, 1.25]) { const w = new THREE.CylinderGeometry(0.62, 0.62, 0.25, 10); w.rotateX(Math.PI / 2); P(w, mat4(x, 0.62, z), RUST[1]); }
  if (open) { for (const z of [-1.25, 1.25]) P(new THREE.BoxGeometry(7.8, 1.6, 0.15), mat4(0, 2.6, z)); for (const x of [-3.85, 3.85]) P(new THREE.BoxGeometry(0.15, 1.6, 2.6), mat4(x, 2.6, 0)); }
  else P(new THREE.BoxGeometry(7.6, 2.6, 2.7), mat4(0, 3.1, 0));
}
export function buildYard(K, L) {
  const R = rng(1401), base = 2.35;
  for (let k = 0; k < 3; k++) {
    const ry = base + k * 0.05, u = V(Math.cos(ry), 0, -Math.sin(ry)), n = V(-u.z, 0, u.x), o = V(YARD.x, 0, YARD.z).addScaledVector(n, k * 9);
    rail(K, o.clone().addScaledVector(u, -110), o.clone().addScaledVector(u, 110 + k * 30), L, R, 2.2);
    let s = -70 + k * 12;
    for (let i = 0; i < 4 + k; i++) {
      const isLoco = i === 0 || (k === 1 && i === 3), len = isLoco ? 13 : 9, tip = R() < 0.25;
      const p = o.clone().addScaledVector(u, s + len / 2);
      const m = mat4(p.x, L + 0.5 + (tip ? 1 : 0), p.z, ry + R.range(-0.04, 0.04) + (tip ? R.range(-0.4, 0.4) : 0), tip ? R.range(0.6, 1.3) * (R.chance(0.5) ? 1 : -1) : 0, R.range(-0.02, 0.02));
      isLoco ? loco(K, m, R) : wagon(K, m, R, R.chance(0.5));
      s += len + R.range(0.5, 16);
    }
  }
}

export function makeKits() { return { stone: new Kit(), metal: new Kit(), rust: new Kit(), glow: new Kit(), beacon: new Kit() }; }
export { clamp };
