// 坠毁的巨舰「远航者」：全长约 1.3 公里，断成三截躺在犁沟里，外加立在冰上的一片尾翼、倒下的天线桁架和满地碎片。
// 船身用分块的蒙皮板拼出来：板与板之间留缝，断口附近的板掉落、翘起，露出里面的肋骨、甲板和戳出来的纵梁。
import * as THREE from 'three';
import { clamp, lerp, smooth, rng, fbm, mat } from '../../util.js';
import { Kit } from './kit.js';
import { ground, furrowZ, furrow, BOW } from './terrain.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = h => new THREE.Color(h);
const PAL = {
  bone: C(0xd9d5ca), bone2: C(0xc3c0b8), grey: C(0x8d9093), dark: C(0x45484d), inner: C(0x4c4f54), rib: C(0x55534f),
  red: C(0x9c3b26), soot: C(0x2f3033), gold: C(0xb08a4a), deck: C(0x4a4a4e)
};
const _c = new THREE.Color();
const tone = (c, R, s = 0.07) => _c.copy(c).multiplyScalar(1 - s + R() * s * 2);

/* ---------- 截面：偏方的超椭圆，底部压平 ---------- */
function sec(th, e = 0.62) {
  const s = Math.sin(th), c = Math.cos(th);
  let y = Math.sign(s) * Math.pow(Math.abs(s), e) * 0.82; const z = Math.sign(c) * Math.pow(Math.abs(c), e);
  if (y < -0.56) y = -0.56 + (y + 0.56) * 0.35;
  return [y, z];
}

/** 在一截船体（沿 +x，长 L）上取点：u 0..1 沿长度，th 绕一圈，k 半径倍数 */
function hullFrame(o) {
  return (u, th, k = 1) => { const [s, cy] = o.prof(u), [y, z] = sec(th); return V(u * o.L, cy * o.r + y * o.r * s * k, z * o.r * s * k); };
}

/**
 * 一截船体。o: { L, r, NS, ring, prof(u)→[缩放, 中心高], brokenA, brokenB, open(u,th)→缺板概率, seed }
 * G: { hull: Kit, win: Kit, ... }
 */
export function hullSection(G, o) {
  const R = rng(o.seed), K = G.hull, NS = o.NS || 22, NR = Math.max(4, Math.round(o.L / (o.ring || 12))), P = hullFrame(o);
  const gapT = 0.22 / o.r, gapU = 0.22 / o.L, TAU = Math.PI * 2;
  const breakD = j => Math.min(o.brokenA ? j : 99, o.brokenB ? NR - 1 - j : 99);
  const start = [], end = [];
  for (let i = 0; i < NS; i++) { start.push(o.brokenA ? Math.floor(R() * 3.2) : 0); end.push(o.brokenB ? NR - Math.floor(R() * 3.2) : NR); }
  const holes = new Set();
  // 外蒙皮
  for (let i = 0; i < NS; i++) {
    const t0 = i / NS * TAU + gapT, t1 = (i + 1) / NS * TAU - gapT, tm = (i + 0.5) / NS * TAU, [ym] = sec(tm);
    for (let j = start[i]; j < end[i]; j++) {
      const bd = breakD(j), u0 = j / NR + gapU, u1 = (j + 1) / NR - gapU, um = (j + 0.5) / NR;
      const miss = 0.02 + 0.5 * smooth(4.5, 0, bd) + (o.open ? o.open(um, tm) : 0);
      if (R() < miss) { holes.add(i * 1000 + j); continue; }
      const lift = 1 + (bd < 4 ? R() * 0.05 * (4 - bd) / 4 : 0) + (R() < 0.04 ? 0.012 : 0);
      let col = (i + Math.floor(j / 3)) % 7 === 0 ? PAL.bone2 : PAL.bone;
      if (Math.abs(ym) < 0.1 && j % 9 < 2) col = PAL.red;                         // 腰线上的红色识别带
      else if (ym > 0.7 && (j % 6 === 0)) col = PAL.grey;
      tone(col, R).lerp(PAL.soot, clamp(smooth(-0.2, -0.75, ym) * 0.7 + smooth(3, 0, bd) * 0.35 + (o.burn ? o.burn(um) : 0), 0, 0.85));
      K.quad(P(u0, t0, lift), P(u1, t0, lift), P(u1, t1, lift), P(u0, t1, lift), _c);
    }
  }
  // 内壳（暗色），断口附近也有缺口，看得到更里面
  for (let i = 0; i < NS; i++) {
    const t0 = i / NS * TAU, t1 = (i + 1) / NS * TAU;
    for (let j = Math.max(0, start[i] - 1 + (o.brokenA ? 1 : 0)); j < Math.min(NR, end[i] + (o.brokenB ? -1 : 0) + 1); j++) {
      if (breakD(j) < 2 && R() < 0.55) continue;
      K.quad(P(j / NR, t0, 0.93), P(j / NR, t1, 0.93), P((j + 1) / NR, t1, 0.93), P((j + 1) / NR, t0, 0.93), tone(PAL.inner, R));
    }
  }
  // 肋骨：每两环一道框架
  for (let j = 0; j <= NR; j += 2) {
    const u = j / NR, du = 1.6 / o.L, nearB = breakD(Math.min(j, NR - 1)) < 4;
    for (let i = 0; i < NS; i++) {
      if (nearB && R() < 0.18) continue;
      const t0 = i / NS * TAU, t1 = (i + 1) / NS * TAU, k0 = 0.995, k1 = 0.84, col = tone(PAL.rib, R);
      K.quad(P(u, t0, k1), P(u, t1, k1), P(u, t1, k0), P(u, t0, k0), col);
      K.quad(P(u + du, t0, k0), P(u + du, t1, k0), P(u + du, t1, k1), P(u + du, t0, k1), col);
      K.quad(P(u, t0, k1), P(u + du, t0, k1), P(u + du, t1, k1), P(u, t1, k1), col);
    }
  }
  // 两层甲板
  for (const dy of [-0.22, 0.28]) {
    const [s0] = o.prof(0.5), half = 0.78 * (dy < 0 ? 0.95 : 0.9);
    for (let j = 0; j < NR; j++) {
      if (breakD(j) < 1 && R() < 0.6) continue;
      const u0 = j / NR, u1 = (j + 1) / NR, [sa, ca] = o.prof(u0), [sb, cb] = o.prof(u1);
      const y0 = ca * o.r + dy * o.r * sa, y1 = cb * o.r + dy * o.r * sb;
      K.quad(V(u0 * o.L, y0, -half * o.r * sa), V(u0 * o.L, y0, half * o.r * sa), V(u1 * o.L, y1, half * o.r * sb), V(u1 * o.L, y1, -half * o.r * sb), tone(PAL.deck, R));
    }
    void s0;
  }
  // 断口：从断面戳出来的纵梁，长短不一，有的往下耷拉
  for (const [ok, u, dir] of [[o.brokenA, 0, -1], [o.brokenB, 1, 1]]) {
    if (!ok) continue;
    for (let i = 0; i < NS; i++) {
      if (R() < 0.45) continue;
      const th = i / NS * TAU, a = P(u - dir * 0.06, th, 0.9), len = R.range(6, 30);
      const b = a.clone().add(V(dir * (o.L * 0.06 + len), -R() * len * 0.35, (R() - 0.5) * len * 0.3));
      beam(K, a, b, R.range(0.8, 1.8), tone(PAL.rib, R));
    }
  }
  // 背脊、舷窗、小设备
  const sp0 = o.spine ? o.spine[0] : 0.08, sp1 = o.spine ? o.spine[1] : 0.92;
  if (sp1 > sp0) for (let j = Math.ceil(sp0 * NR); j < sp1 * NR; j++) {
    const u0 = j / NR, u1 = (j + 0.92) / NR, a = P(u0, Math.PI / 2, 0.98), b = P(u1, Math.PI / 2, 0.98);
    beam(K, a.clone().add(V(0, 3, 0)), b.clone().add(V(0, 3, 0)), 7, tone(PAL.grey, R), 6);
    if (j % 3 === 0) { const f = P((u0 + u1) / 2, Math.PI / 2, 1); K.push(mat(f.x, f.y + 6, f.z)); K.box(3, 9 + R() * 8, 14, null, tone(PAL.dark, R)); K.pop(); }
  }
  for (let j = 0; j < NR; j++) for (const side of [0, Math.PI]) for (const tw of [0.12, 0.3]) {
    if (breakD(j) < 2 || R() < 0.3) continue;
    const th = side === 0 ? tw : Math.PI - tw, f = P((j + 0.5) / NR, th, 1.012), dark = R() < 0.45;
    const zs = Math.sign(f.z) || 1;
    for (let w = -2; w <= 2; w++) {
      const x = f.x + w * (o.L / NR) * 0.17;
      G.win.quad(V(x - 1.2, f.y - 0.7, f.z + zs * 0.05), V(x - 1.2, f.y + 0.7, f.z + zs * 0.05), V(x + 1.2, f.y + 0.7, f.z + zs * 0.05), V(x + 1.2, f.y - 0.7, f.z + zs * 0.05), dark ? WIN_DEAD : WIN);
    }
    if (!dark && R() < 0.25) G.lights.push(f.clone().applyMatrix4(G.hull.M));
  }
  for (let k = 0; k < (o.greebles ?? 40); k++) {
    const u = R.range(0.05, 0.95), th = Math.PI / 2 + R.range(-1.1, 1.1);
    if (breakD(Math.floor(u * NR)) < 3) continue;
    const p = P(u, th, 1), q = P(u, th + 0.01, 1), n = V(0, q.z - p.z, -(q.y - p.y)).normalize(); if (n.y < 0) n.negate();
    const m = new THREE.Matrix4().makeBasis(V(1, 0, 0), n, V(1, 0, 0).cross(n)).setPosition(p);
    K.push(m); K.box(R.range(4, 16), R.range(1.5, 5), R.range(3, 9), null, tone(R() < 0.3 ? PAL.dark : PAL.grey, R)); K.pop();
  }
  return { P, NR, holes };
}

const WIN = new THREE.Color(1.5, 1.75, 2.1), WIN_DEAD = new THREE.Color(0.06, 0.07, 0.08);

/** a→b 的方梁（宽 w，高 h） */
export function beam(K, a, b, w, col, h = w) {
  const d = b.clone().sub(a), L = d.length(); if (L < 1e-3) return;
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y / L) > 0.95 ? V(1, 0, 0) : V(0, 1, 0)).setPosition(a.clone().add(b).multiplyScalar(0.5));
  K.geo(new THREE.BoxGeometry(w, h, L), m, col);
}

/** 一片机翼（平面里沿 +y 伸展，根部在原点），broken 根部断开 */
function wing(K, R, { span, root, tip, sweep, t = 3.5 }) {
  const NX = 8, NY = Math.round(span / 14), g = 0.35;
  for (let jy = 0; jy < NY; jy++) for (let ix = 0; ix < NX; ix++) {
    if (jy < 2 && R() < 0.35) continue;
    const v0 = jy / NY, v1 = (jy + 1) / NY, ch0 = lerp(root, tip, v0), ch1 = lerp(root, tip, v1);
    const x = (u, v, ch) => sweep * v - ch / 2 + ch * u;
    const u0 = ix / NX, u1 = (ix + 1) / NX, y0 = v0 * span + g, y1 = v1 * span - g;
    const thick = t * (1 - 0.6 * Math.abs((u0 + u1) - 1));
    let col = tone((ix + jy) % 5 === 0 ? PAL.bone2 : PAL.bone, R);
    if (jy === NY - 2 || jy === NY - 3) col = tone(PAL.red, R);
    for (const s of [-1, 1]) {
      const a = V(x(u0, v0, ch0) + g, y0, s * thick), b = V(x(u1, v0, ch0) - g, y0, s * thick), c = V(x(u1, v1, ch1) - g, y1, s * thick), d = V(x(u0, v1, ch1) + g, y1, s * thick);
      s > 0 ? K.quad(a, b, c, d, col) : K.quad(a, d, c, b, col);
    }
  }
  // 前后缘与翼梢
  for (const [u, ch] of [[0, 0], [1, 0]]) {
    void ch; const a = V(-root / 2 + root * u, 0, 0), b = V(sweep - tip / 2 + tip * u, span, 0);
    beam(K, a, b, 1.6, tone(PAL.grey, R), 1.6);
  }
  beam(K, V(sweep - tip / 2, span, 0), V(sweep + tip / 2, span, 0), 2.4, tone(PAL.dark, R), 2.4);
}

/** 一段方形桁架（沿 +x，长 L，截面 w） */
function truss(K, R, L, w, col) {
  const h = w / 2;
  for (const [y, z] of [[-h, -h], [-h, h], [h, -h], [h, h]]) beam(K, V(0, y, z), V(L, y, z), 0.9, col);
  for (let x = 0; x < L - 1; x += w) {
    const x1 = Math.min(L, x + w);
    for (const [a, b] of [[V(x, -h, -h), V(x1, h, -h)], [V(x, -h, h), V(x1, h, h)], [V(x, h, -h), V(x1, h, h)], [V(x, -h, -h), V(x1, -h, h)], [V(x, -h, -h), V(x, h, -h)], [V(x, -h, h), V(x, h, h)]]) beam(K, a, b, 0.45, col);
  }
  void R;
}

/* ================= 装配 ================= */
export function buildWreck(root, U) {
  const R = rng(606);
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide });
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const pulseMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const engMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 0.25) });
  const G = { hull: new Kit(), win: new Kit(), pulse: new Kit(), eng: new Kit(), beacon: new Kit(), lights: [] };
  const beacons = [];
  const setAll = m => { for (const k of [G.hull, G.win, G.pulse, G.eng, G.beacon]) k.set(m); };
  const r = 50;

  // 把一截船放进犁沟：给定沿沟的起止 x，返回放置矩阵（船轴 +x 朝西）
  function placeAlong(xa, xb, { roll = 0, sink = 0.45, lift = 0, dz = 0 } = {}) {
    const za = furrowZ(xa) + dz, zb = furrowZ(xb) + dz, ga = ground(xa, za), gb = ground(xb, zb), L = Math.hypot(xb - xa, zb - za);
    const yaw = -Math.atan2(zb - za, xb - xa), pitch = Math.atan2(gb - ga, L) + lift;
    const m = new THREE.Matrix4().compose(V(xa, ga + r * (0.56 - sink) - 4, za), new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YZX')), V(1, 1, 1));
    return { m, L };
  }

  /* —— 1. 舰尾：引擎段，断口朝西 —— */
  {
    const { m, L } = placeAlong(-1180, -860, { roll: 0.12, sink: 0.5 });
    setAll(m);
    hullSection(G, { L, r, seed: 11, prof: u => [1 - 0.12 * smooth(0.1, 0, u), 0], brokenB: true, burn: u => smooth(0.3, 0, u) * 0.3 });
    // 尾端封板 + 三台主引擎
    const P = hullFrame({ L, r, prof: () => [0.88, 0] });
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = (i + 1) / 24 * Math.PI * 2; G.hull.tri(V(2, 0, 0), P(0, b, 1).setX(2), P(0, a, 1).setX(2), tone(PAL.dark, R)); }
    for (const [y, z] of [[12, 19], [12, -19], [-19, 0]]) {
      G.hull.geo(new THREE.CylinderGeometry(19, 13, 46, 28, 1, true).rotateZ(Math.PI / 2), mat(-21, y, z), tone(PAL.dark, R));
      G.hull.geo(new THREE.TorusGeometry(19, 1.6, 6, 28).rotateY(Math.PI / 2), mat(-44, y, z), tone(PAL.gold, R));
      G.eng.geo(new THREE.CircleGeometry(12.5, 24).rotateY(-Math.PI / 2), mat(-2, y, z), new THREE.Color(0.55, 0.7, 2.2));
    }
    // 尾部的断光环与支架
    G.hull.geo(new THREE.TorusGeometry(r * 1.32, 3.5, 8, 48, 4.3).rotateY(Math.PI / 2).rotateX(0.5), mat(28, 0, 0), tone(PAL.grey, R));
    for (const a of [0.6, 2.2, 3.8]) beam(G.hull, V(28, Math.sin(a) * r * 0.7, Math.cos(a) * r * 0.85), V(28, Math.sin(a) * r * 1.32, Math.cos(a) * r * 1.32), 3, tone(PAL.dark, R));
    // 反应堆：从断口能看到里面还在发光的环
    G.pulse.geo(new THREE.TorusGeometry(r * 0.5, 3, 10, 40).rotateY(Math.PI / 2), mat(L - 45, 2, 0), new THREE.Color(0.5, 1.9, 2.6));
    G.pulse.geo(new THREE.IcosahedronGeometry(11, 2), mat(L - 45, 2, 0), new THREE.Color(0.8, 2.2, 2.8));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; beam(G.hull, V(L - 45, 2 + Math.sin(a) * r * 0.53, Math.cos(a) * r * 0.53), V(L - 45, 2 + Math.sin(a) * r * 0.85, Math.cos(a) * r * 0.85), 2.2, tone(PAL.rib, R)); }
    const bp = V(150, r * 0.9 + 18, 0); G.hull.geo(new THREE.CylinderGeometry(0.8, 1.2, 22, 6), mat(bp.x, bp.y - 11, bp.z), tone(PAL.dark, R));
    G.beacon.geo(new THREE.SphereGeometry(2.2, 10, 8), mat(bp.x, bp.y + 1, bp.z), C(0xffffff)); beacons.push(bp.applyMatrix4(m));
  }

  /* —— 2. 中段：货舱，两头都断，侧翻 —— */
  {
    const { m, L } = placeAlong(-640, -300, { roll: 0.55, sink: 0.42 });
    setAll(m);
    hullSection(G, { L, r, seed: 22, prof: () => [1, 0], brokenA: true, brokenB: true, open: (u, th) => smooth(0.4, 0.75, Math.sin(th)) * smooth(0.22, 0.35, u) * smooth(0.82, 0.7, u) * 0.85, greebles: 30 });
    // 货舱里的支架
    for (let x = 60; x < L - 60; x += 24) beam(G.hull, V(x, -r * 0.3, -r * 0.7), V(x, r * 0.55, r * 0.7), 2.5, tone(PAL.rib, R));
    // 中段上翘起的散热鳍
    for (let k = 0; k < 6; k++) { G.hull.push(mat(70 + k * 30, r * 0.2, -r * 0.92, 0, -1.2 - k * 0.04, 0)); G.hull.box(18, 26, 1.5, null, tone(PAL.grey, R)); G.hull.pop(); }
  }

  /* —— 3. 舰首：撞进冰脊里，船头抬起 —— */
  {
    const { m, L } = placeAlong(-60, BOW.x - 30, { roll: -0.08, sink: 0.35, lift: 0.07 });
    setAll(m);
    const prof = u => [u < 0.5 ? 1 : 1 - Math.pow((u - 0.5) / 0.5, 1.7) * 0.9, smooth(0.55, 1, u) * 0.32];
    hullSection(G, { L, r, seed: 33, prof, brokenA: true, ring: 11, spine: [0.08, 0.3] });
    const P = hullFrame({ L, r, prof });
    // 舰桥塔
    const top = P(0.42, Math.PI / 2, 1);
    const lv = [[70, 14, 46], [54, 14, 38], [38, 12, 28], [22, 9, 18]];
    let y = top.y - 4;
    lv.forEach(([w, h, d], i) => {
      G.hull.push(mat(top.x - i * 5, y, 0)); G.hull.box(w, h, d, null, tone(i % 2 ? PAL.bone2 : PAL.bone, R)); G.hull.pop();
      for (const s of [-1, 1]) G.win.quad(V(top.x - i * 5 - w / 2 + 2, y + h * 0.45, s * (d / 2 + 0.1)), V(top.x - i * 5 + w / 2 - 2, y + h * 0.45, s * (d / 2 + 0.1)), V(top.x - i * 5 + w / 2 - 2, y + h * 0.75, s * (d / 2 + 0.1)), V(top.x - i * 5 - w / 2 + 2, y + h * 0.75, s * (d / 2 + 0.1)), i === 3 ? WIN_DEAD : WIN);
      y += h;
    });
    G.lights.push(V(top.x, y - 10, 0).applyMatrix4(m));
    // 天线：一根还立着，一根折断斜挂
    G.hull.geo(new THREE.CylinderGeometry(0.7, 1.4, 48, 6), mat(top.x - 18, y + 24, 3), tone(PAL.dark, R));
    G.beacon.geo(new THREE.SphereGeometry(2, 10, 8), mat(top.x - 18, y + 49, 3), C(0xffffff)); beacons.push(V(top.x - 18, y + 49, 3).applyMatrix4(m));
    beam(G.hull, V(top.x - 8, y, -6), V(top.x + 18, y + 14, -22), 1.2, tone(PAL.dark, R));
    // 雷达碟
    const dish = new THREE.SphereGeometry(16, 20, 8, 0, Math.PI * 2, 0, 0.75);
    G.hull.geo(dish, mat(top.x + 12, y + 2, 14, 0.4, 0.9, 0.3), tone(PAL.bone2, R));
    // 舰首的「眼」：一圈还亮着的传感器
    const tip = P(0.985, 0, 0);
    G.pulse.geo(new THREE.TorusGeometry(4.5, 0.9, 6, 20).rotateY(Math.PI / 2), mat(tip.x - 2, tip.y, 0), new THREE.Color(2.4, 0.6, 0.35));
    G.pulse.geo(new THREE.SphereGeometry(3, 12, 8), mat(tip.x - 2.5, tip.y, 0), new THREE.Color(2.8, 0.9, 0.5));
    // 侧舷的小翼
    for (const s of [-1, 1]) { G.hull.push(mat(L * 0.3, -r * 0.15, s * r * 0.92, 0, s * 1.35, 0)); wing(G.hull, R, { span: 46, root: 60, tip: 26, sweep: 22, t: 2.2 }); G.hull.pop(); }
  }

  /* —— 4. 立在冰上的尾翼 —— */
  {
    const x = -420, z = furrowZ(-420) + 185, y = ground(x, z);
    setAll(mat(x, y - 22, z, 0.5, 0.18, -0.32));
    wing(G.hull, R, { span: 170, root: 120, tip: 44, sweep: 70, t: 4 });
    G.lights.push(V(x, y + 120, z));
    const bp = V(70, 168, 0); G.beacon.geo(new THREE.SphereGeometry(2.4, 10, 8), mat(bp.x, bp.y, 0), C(0xffffff)); beacons.push(bp.applyMatrix4(G.hull.M));
  }
  /* —— 5. 断落的主翼，平躺着半埋 —— */
  {
    const x = -930, z = furrowZ(-930) - 190, y = ground(x, z);
    setAll(mat(x, y + 1, z, 2.6, -Math.PI / 2 + 0.06, 0.04));
    wing(G.hull, R, { span: 150, root: 110, tip: 40, sweep: 60, t: 4 });
  }
  /* —— 6. 倒下的天线桁架，横在撞击脊前 —— */
  {
    const x = BOW.x - 120, z = BOW.z + 150, y = ground(x, z);
    setAll(mat(x, y + 3, z, -0.5, 0, 0.05));
    truss(G.hull, R, 150, 7, tone(PAL.dark, R));
    G.hull.geo(new THREE.SphereGeometry(10, 16, 8, 0, Math.PI * 2, 0, 0.8), mat(152, 4, 0, 0, 0, -1.2), tone(PAL.bone2, R));
  }

  const id = new THREE.Matrix4(); setAll(id);
  const hull = G.hull.build(hullMat, { snow: 0.85, frost: 0.12 });
  const win = G.win.build(winMat, { cast: false, receive: false });
  const pulse = G.pulse.build(pulseMat, { cast: false, receive: false });
  const eng = G.eng.build(engMat, { cast: false, receive: false });
  const bea = G.beacon.build(beaconMat, { cast: false, receive: false });
  for (const o of [hull, win, pulse, eng, bea]) if (o) root.add(o);

  /* —— 碎片：蒙皮板、碎块、散落的货柜 —— */
  const debris = scatterDebris(root, R);

  return {
    lights: G.lights.map(p => [p.x, p.y, p.z, 0.8]).concat(beacons.map(p => [p.x, p.y, p.z, 0.6])),
    beacons, debris,
    update(t, env) {
      const k = 0.75 + 0.25 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 7.1);
      pulseMat.color.setScalar(k * (0.7 + 0.3 * env.night));
      winMat.color.setScalar(0.35 + 0.65 * env.lamp);
      engMat.color.setScalar(0.5 + 0.2 * Math.sin(t * 0.4));
      const blink = (t % 2.4) < 0.25 ? 1 : 0.04;
      beaconMat.color.setRGB(3 * blink, 0.35 * blink, 0.25 * blink);
    }
  };
}

function scatterDebris(root, R) {
  const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 });
  const N = 520, im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), plateMat, N), d = new THREE.Object3D(), c = new THREE.Color();
  let n = 0;
  while (n < N) {
    const x = R.range(-1850, 520), dz = (R() + R() + R() - 1.5) * 260, z = furrowZ(x) + dz;
    const near = Math.max(Math.exp(-(((x + 750) / 140) ** 2)), Math.exp(-(((x + 210) / 120) ** 2)), Math.exp(-(((x - 300) / 150) ** 2)) * 0.6, 0.18);
    if (R() > near) continue;
    const big = R() < 0.15, w = big ? R.range(14, 30) : R.range(3, 12);
    d.position.set(x, ground(x, z) + R.range(-1.5, 0.6), z);
    d.rotation.set(R.range(-0.5, 0.5) * (big ? 1.6 : 1), R() * 6.28, R.range(-0.5, 0.5));
    d.scale.set(w, R.range(0.4, 1.2), w * R.range(0.4, 0.9)); d.updateMatrix(); im.setMatrixAt(n, d.matrix);
    c.copy(R() < 0.7 ? PAL.bone : R() < 0.5 ? PAL.grey : PAL.red).lerp(PAL.soot, R() * 0.6).lerp(C(0xeef2f5), R() * 0.35);
    im.setColorAt(n, c); n++;
  }
  im.castShadow = true; im.receiveShadow = true; root.add(im);

  // 货柜：从中段货舱里滑出来的一串
  const cg = new THREE.BoxGeometry(14, 6, 6), cm = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 });
  const NC = 46, ci = new THREE.InstancedMesh(cg, cm, NC), cols = [0xb35a2a, 0x2f6f7a, 0x7d7f80, 0xc9a640, 0x8a3324].map(C);
  for (let i = 0; i < NC; i++) {
    const tt = i / NC, x = lerp(-470, -200, tt) + R.range(-25, 25), z = furrowZ(x) + 55 + tt * 120 + R.range(-30, 30);
    d.position.set(x, ground(x, z) + 1.5 + (R() < 0.2 ? 6 : 0), z); d.rotation.set(R.range(-0.25, 0.25), R() * 6.28, R.range(-0.3, 0.3)); d.scale.set(1, 1, 1); d.updateMatrix();
    ci.setMatrixAt(i, d.matrix); ci.setColorAt(i, c.copy(R.pick(cols)).lerp(C(0xeef2f5), R() * 0.25));
  }
  ci.castShadow = true; ci.receiveShadow = true; root.add(ci);
  return { im, ci };
}
