// 沉在林子里的人造物：横穿湿地的旧铁路高架（断成几截，一棵古树从桥面中间长穿过去）、
// 停在断口边上的锈蚀列车（车头悬在半空，两节掉进水里）、被树根抬起来的货车厢、
// 以及湿地南边被绞杀榕吞没的石砌神庙（参考塔普伦寺）。
import * as THREE from 'three';
import { Builder, mat, rng, lerp, smooth, clamp } from '../../util.js';
import { ground, WATER, TEMPLE, nf } from './terrain.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = c => new THREE.Color(c);
export const DECK = 23;
// 高架中线（平面 xz），从西到东
export const VIA = new THREE.CatmullRomCurve3([[-1480, 170], [-1020, 300], [-560, 420], [-150, 300], [250, 220], [650, 330], [1060, 190], [1480, 60]].map(([x, z]) => V(x, DECK, z)), false, 'centripetal');
const VS = VIA.getSpacedPoints(600);
/** 到高架中线的水平距离 */
export function viaDist(x, z) { let d = 1e9; for (const p of VS) { const dd = (p.x - x) ** 2 + (p.z - z) ** 2; if (dd < d) d = dd; } return Math.sqrt(d); }

const CONC = [C(0x8c8676), C(0x7e796b), C(0x76705f), C(0x938b78)];
const STONE = [C(0x857a62), C(0x7a6e58), C(0x8e8166), C(0x6f6552)];
const RUST = [C(0x7a4a2a), C(0x6a3b22), C(0x8a5a32), C(0x5a3520)];
const PAINT = [C(0xc7bea0), C(0x6f8f8a), C(0x9aa07e)];

const segs = (w, h, d, s = 3.5) => [Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)), Math.max(1, Math.round(d / s))];
/** 和 Builder.box 一样（底面在 y=0），但按尺寸细分，好让做旧的颜色有地方落 */
function sbox(B, w, h, d, m, col) { B.add(new THREE.BoxGeometry(w, h, d, ...segs(w, h, d)).translate(0, h / 2, 0), m, col); }
function beam(B, a, b, w, h, col, { lat = 0, up = 0 } = {}) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.BoxGeometry(w, h, L, ...segs(w, h, L)).translate(lat, up - h / 2, L / 2);
  B.add(g, mat(a.x, a.y, a.z, Math.atan2(d.x, d.z), -Math.asin(clamp(d.y / L, -1, 1)), 0), col);
}

/* ================= 铁路高架 ================= */
function deckSpan(B, a, b, R, lines) {
  const c = CONC[Math.floor(R() * 4)];
  beam(B, a, b, 9, 1.7, c, { moss: 0.3, mossTop: 0.8 });                            // 桥面板
  beam(B, a, b, 6.4, 1.2, c.clone().multiplyScalar(0.85), { up: -1.7, moss: 0.4 });  // 板下的箱梁
  for (const s of [-1, 1]) beam(B, a, b, 0.35, 1.1, c, { lat: s * 4.3, up: 1.1, moss: 0.4, mossTop: 0.9 }); // 护栏
  beam(B, a, b, 3.4, 0.32, C(0x5f5a50), { up: 0.32, moss: 0.2, mossTop: 0.9 });     // 道砟
  for (const s of [-1, 1]) beam(B, a, b, 0.14, 0.16, RUST[1], { lat: s * 0.75, up: 0.48, moss: 0, mossTop: 0 }); // 钢轨
  // 接触网立柱（每跨一根，左右交替）
  if (R() < 0.75 && lines) {
    const s = R() < 0.5 ? -1 : 1, d = new THREE.Vector3().subVectors(b, a).normalize(), side = V(d.z, 0, -d.x);
    const p = a.clone().lerp(b, 0.5).addScaledVector(side, s * 3.9), tilt = R() < 0.25 ? R.range(-0.25, 0.25) : R.range(-0.04, 0.04);
    sbox(B, 0.32, 7.4, 0.32, mat(p.x, p.y, p.z, Math.atan2(d.x, d.z), tilt, 0), RUST[2], { moss: 0.1 });
    const top = p.clone().add(V(0, 6.8, 0)), tip = top.clone().addScaledVector(side, -s * 3.6);
    beam(B, top, tip, 0.18, 0.22, RUST[0], { moss: 0, mossTop: 0 });
    lines.push(tip);
  }
}
function pier(B, x, z, top, yaw, R, lean = 0) {
  const g = ground(x, z) - 2, h = top - g, c = CONC[Math.floor(R() * 4)];
  sbox(B, 3.4, h - 1.8, 3.4, mat(x, g, z, yaw, lean, R.range(-0.5, 0.5) * lean), c, { moss: 0.55 });
  sbox(B, 10.5, 1.8, 3.6, mat(x + Math.sin(lean) * h * 0, top - 1.8, z, yaw, 0, 0), c, { moss: 0.35, mossTop: 0.7 });
}

export function buildViaduct(B, R, spots) {
  const L = VIA.getLength(), SPAN = 38, n = Math.floor(L / SPAN), pts = [], cables = [];
  for (let i = 0; i <= n; i++) pts.push(VIA.getPointAt(i / n));
  const near = x => pts.reduce((bi, p, i) => Math.abs(p.x - x) < Math.abs(pts[bi].x - x) ? i : bi, 0);
  const gap = near(-430), treeSpan = near(640);
  const state = pts.map((p, i) => {
    if (i >= gap && i < gap + 3) return 'gap';
    if ((i >= gap - 5 && i < gap) || i === gap + 3 || i === gap + 4 || Math.abs(i - treeSpan) === 1) return 'ok';
    if (i === treeSpan) return 'tree';
    if (ground(p.x, p.z) > DECK - 7) return 'end';
    const r = R(); return r < 0.1 ? 'fall' : r < 0.15 ? 'drop' : 'ok';
  });
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1], st = state[i], yaw = Math.atan2(b.x - a.x, b.z - a.z);
    if (st === 'end') continue;
    // 桥墩：倒掉的桥墩横躺在水里
    if (st === 'gap' && i === gap + 1) {
      const g = ground(a.x, a.z), d = V(Math.cos(yaw + 1.2), 0, -Math.sin(yaw + 1.2));
      beam(B, V(a.x, g + 1, a.z), V(a.x + d.x * 19, g + 0.6, a.z + d.z * 19), 3.4, 3.4, CONC[2], { up: 1.7, moss: 0.7 });
    } else if (state[i - 1] !== 'end' || st !== 'end') pier(B, a.x, a.z, DECK - 1.7 - 1.2, yaw, R, st === 'drop' ? R.range(0.03, 0.08) : R.range(-0.012, 0.012));
    if (st === 'ok') deckSpan(B, a, b, R, cables);
    else if (st === 'fall') { // 一端从墩上滑落，斜插进水里
      const lowA = R() < 0.5, hi = lowA ? b : a, lo = lowA ? a : b, gl = ground(lo.x, lo.z);
      const drop = DECK - Math.max(gl, -3) - 0.5, hd = Math.sqrt(Math.max(SPAN * SPAN - drop * drop, 10)), dir = V(lo.x - hi.x, 0, lo.z - hi.z).normalize();
      const end = V(hi.x + dir.x * hd, DECK - drop, hi.z + dir.z * hd);
      deckSpan(B, hi, end, R, null);
    } else if (st === 'drop') { // 整跨平着沉到水里，只露出护栏
      const gA = ground(a.x, a.z), gB = ground(b.x, b.z);
      deckSpan(B, V(a.x, Math.max(gA, -3) + 1.2, a.z), V(b.x, Math.max(gB, -3) + 0.6, b.z), R, null);
    } else if (st === 'gap') {
      // 断口：三跨没了，碎板散落在水里
      const m = a.clone().lerp(b, 0.5), g = ground(m.x, m.z);
      if (i === gap) beam(B, V(a.x, DECK - 2, a.z), V(lerp(a.x, b.x, 0.8), g + 0.5, lerp(a.z, b.z, 0.8)), 9, 1.7, CONC[1], { moss: 0.5, mossTop: 0.8 });
      if (i === gap + 2) beam(B, V(b.x, DECK - 1.5, b.z), V(lerp(b.x, a.x, 0.75), g + 1, lerp(b.z, a.z, 0.75) + 4), 9, 1.7, CONC[3], { moss: 0.5, mossTop: 0.8 });
      if (i === gap + 1) for (let k = 0; k < 6; k++) { const q = a.clone().lerp(b, R()); sbox(B, R.range(3, 7), R.range(1, 1.7), R.range(3, 8), mat(q.x + R.range(-6, 6), ground(q.x, q.z) - 0.4, q.z + R.range(-6, 6), R() * 6, R.range(-0.3, 0.3), R.range(-0.3, 0.3)), CONC[k % 4], { moss: 0.6, mossTop: 0.9 }); }
    } else if (st === 'tree') {
      // 古树从桥面中间长穿过去：两边的残板被树干顶起、翘向树
      const m = a.clone().lerp(b, 0.5), dir = V(b.x - a.x, 0, b.z - a.z).normalize();
      deckSpan(B, a, V(m.x - dir.x * 8, DECK + 2.6, m.z - dir.z * 8), R, null);
      deckSpan(B, b, V(m.x + dir.x * 8, DECK + 3.4, m.z + dir.z * 8), R, null);
      spots.viaTree = m.clone(); spots.viaTree.yaw = yaw;
    }
  }
  if (state[n] !== 'end') pier(B, pts[n].x, pts[n].z, DECK - 2.9, 0, R);
  spots.gap = { a: pts[gap], b: pts[gap + 3], b2: pts[gap + 4], yaw: Math.atan2(pts[gap].x - pts[gap - 1].x, pts[gap].z - pts[gap - 1].z), back: pts[gap - 1] };
  spots.cables = cables; spots.pts = pts;
  return pts;
}

/* ================= 列车 ================= */
function car(B, M, R, { cab = false, paint = PAINT[0] } = {}) {
  const P = (x, y, z, ry = 0, rx = 0, rz = 0) => M.clone().multiply(mat(x, y, z, ry, rx, rz));
  const rust = () => paint.clone().lerp(RUST[Math.floor(R() * 4)], R.range(0.35, 0.85));
  const o = { moss: 0.12 };
  sbox(B, 2.7, 0.5, 17, P(0, 0.45, 0), RUST[3], o);                                     // 底架
  sbox(B, 3.0, 2.9, 17.6, P(0, 0.95, 0), rust(), o);                                    // 车身
  sbox(B, 3.06, 0.95, 14.6, P(0, 2.15, 0.2), C(0x1c2220), { moss: 0 });                 // 车窗带
  sbox(B, 3.04, 0.18, 17.7, P(0, 1.6, 0), C(0x7a3426).lerp(RUST[0], 0.5), { moss: 0 });  // 腰线
  for (const s of [-1, 1]) for (const zz of [-5.6, 5.6]) sbox(B, 0.1, 2.3, 1.3, P(s * 1.52, 1.0, zz), rust().multiplyScalar(0.8), { moss: 0 });
  const roof = new THREE.CylinderGeometry(1.55, 1.55, 17.5, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0).scale(1, 0.32, 1);
  B.add(roof, P(0, 3.85, 0), rust(), 0, 0.9);
  for (const zz of [-6.4, 6.4]) {
    sbox(B, 2.4, 0.7, 3.0, P(0, 0.05, zz), RUST[3], o);
    for (const s of [-1, 1]) for (const dz of [-0.9, 0.9]) B.add(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 10).rotateZ(Math.PI / 2), P(s * 0.78, 0.45, zz + dz), RUST[1], 0, 0);
  }
  if (cab) { // 车头：斜切的风挡
    sbox(B, 3.0, 2.0, 2.2, P(0, 0.95, 9.6), rust(), o);
    sbox(B, 2.9, 1.4, 0.2, P(0, 2.7, 9.3, 0, -0.6), C(0x1a2020), { moss: 0 });
    sbox(B, 1.6, 0.4, 0.3, P(0, 1.4, 10.7), C(0xd8c890), { moss: 0 });
  } else sbox(B, 1.5, 2.6, 1.2, P(0, 0.9, 9.3), RUST[2], o);                            // 贯通道
}

export function buildTrain(B, R, spots) {
  const { a, yaw, back } = spots.gap, dir = V(a.x - back.x, 0, a.z - back.z).normalize();
  const top = DECK + 0.5;
  // 车头悬在断口外：后半截压在桥面边上，前半截朝下垂
  const pitch = 0.55, edge = a.clone();
  car(B, mat(edge.x, top + 0.2, edge.z, yaw, pitch, 0.05).multiply(mat(0, 0, 6.5)), R, { cab: true, paint: PAINT[1] });
  spots.trainCars = [];
  // 后面几节在桥面上，出轨、歪斜
  for (let k = 1; k <= 4; k++) {
    const s = 1.5 + (k - 1) * 18.8, p = a.clone().addScaledVector(dir, -s - 9);
    const M = mat(p.x, top, p.z, yaw + R.range(-0.05, 0.05) + (k === 1 ? 0.04 : 0), 0, k === 2 ? 0.05 : R.range(-0.02, 0.02));
    car(B, M, R, { paint: PAINT[k % 3] });
    spots.trainCars.push({ p, yaw, M });
  }
  // 掉下去的两节：一节侧躺着半沉在水里，一节车头朝下插在泥里、靠着桥墩
  const g0 = a.clone().addScaledVector(dir, 14).add(V(dir.z * 7, 0, -dir.x * 7)), gy = ground(g0.x, g0.z);
  car(B, mat(g0.x, Math.max(gy, -3) - 0.6, g0.z, yaw + 0.7, 0.05, 1.45), R, { paint: PAINT[2] });
  const g1 = a.clone().addScaledVector(dir, 28).add(V(-dir.z * 5, 0, dir.x * 5)), gy1 = ground(g1.x, g1.z);
  car(B, mat(g1.x, Math.max(gy1, -3) + 7.2, g1.z, yaw - 0.3, 1.1, 0.25).multiply(mat(0, 0, -2)), R, { paint: PAINT[0] });
  const e = spots.gap.b, d2 = V(spots.gap.b2.x - e.x, 0, spots.gap.b2.z - e.z).normalize();
  spots.robotsAt = { p: e.clone().addScaledVector(d2, 1.2), dir: d2.negate() }; // 对岸断口边上，面朝列车
}

/** 被树根抬起来的一串货车厢，古树从中间那节的车顶长出来 */
export function buildFreight(B, R, at) {
  const yaw = 0.6, d = V(Math.sin(yaw), 0, Math.cos(yaw)), boxes = [];
  for (let k = -2; k <= 2; k++) {
    const p = V(at.x + d.x * k * 15.5, 0, at.z + d.z * k * 15.5), g = ground(p.x, p.z);
    const lift = k === 0 ? 5.5 : Math.abs(k) === 1 ? 2.2 : 0;
    const M = mat(p.x, Math.max(g, -2.5) - 1.2 + lift, p.z, yaw + k * 0.08 + R.range(-0.05, 0.05), (k === 0 ? 0 : -Math.sign(k) * 0.14) + R.range(-0.03, 0.03), R.range(-0.2, 0.2) + (k === 2 ? 0.5 : 0));
    const P = (x, y, z) => M.clone().multiply(mat(x, y, z));
    const c = RUST[(k + 4) % 4].clone().lerp(C(0x4a5a5a), R() * 0.4);
    sbox(B, 3.0, 3.4, 14, P(0, 0.9, 0), c, { moss: 0.35, mossTop: 0.95 });
    for (let j = -3; j <= 3; j++) sbox(B, 3.08, 3.2, 0.18, P(0, 1, j * 2), c.clone().multiplyScalar(0.8), { moss: 0.2 }); // 瓦楞
    sbox(B, 2.4, 0.7, 2.6, P(0, 0.1, -5), RUST[3], {}); sbox(B, 2.4, 0.7, 2.6, P(0, 0.1, 5), RUST[3], {});
    boxes.push(M);
  }
  return boxes;
}

/* ================= 神庙 ================= */
// 石砌部分的「顶面高度」：树根沿着它爬，所以根会翻过墙头、顺着墙面垂下来
const FOOT = [];
export function templeSurf(x, z) {
  let y = ground(x, z);
  for (const f of FOOT) if (Math.abs(x - f.x) < f.hw && Math.abs(z - f.z) < f.hd) y = Math.max(y, f.top);
  return y;
}
function block(B, x, y, z, w, h, d, col, opt = { moss: 0.5, mossTop: 0.85 }, ry = 0, foot = true) {
  sbox(B, w, h, d, mat(x, y, z, ry), col, opt);
  if (foot && ry === 0) FOOT.push({ x, z, hw: w / 2, hd: d / 2, top: y + h });
}
function prang(B, R, x, y, z, base, tiers, broken = false) {
  let h = y, w = base;
  const stone = () => STONE[Math.floor(R() * 4)];
  for (let k = 0; k < tiers; k++) {
    const th = k === 0 ? 3.2 : 2.4 - k * 0.12, jx = broken ? R.range(-1, 1) * k * 0.6 : 0, jz = broken ? R.range(-1, 1) * k * 0.6 : 0;
    const ry = broken ? R.range(-0.3, 0.3) * k * 0.3 : 0;
    sbox(B, w, th, w * 0.72, mat(x + jx, h, z + jz, ry), stone(), { moss: 0.55, mossTop: 0.9 });   // 十字形平面：两块交叉的方石
    sbox(B, w * 0.72, th, w, mat(x + jx, h, z + jz, ry), stone(), { moss: 0.55, mossTop: 0.9 });
    sbox(B, w + 0.5, 0.35, w + 0.5, mat(x + jx, h + th - 0.35, z + jz, ry), stone(), { moss: 0.3, mossTop: 1 }); // 檐线
    h += th; w *= 0.8;
  }
  if (!broken) { const bud = new THREE.SphereGeometry(w * 0.55, 10, 8).scale(1, 1.9, 1); B.add(bud, mat(x, h + w * 0.7, z), stone(), 0.6, 0.6); }
  FOOT.push({ x, z, hw: base / 2, hd: base / 2, top: h });
  return h;
}

export function buildTemple(B, R, spots) {
  const { x: X, z: Z, top: T } = TEMPLE, S = 58, wh = 4.6, th = 1.5, stone = () => STONE[Math.floor(R() * 4)];
  FOOT.length = 0;
  block(B, X, T - 1.2, Z, S + 10, 1.6, S + 10, STONE[3], { moss: 0.7, mossTop: 0.7 });              // 台基
  block(B, X, T + 0.4, Z, S + 4, 0.6, S + 4, STONE[1], { moss: 0.5, mossTop: 0.8 });
  const y0 = T + 1;
  // 围墙：每边分成几段，中间留门，有的段塌了半截
  const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [sx, sz] of sides) {
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const t = k / 3.6 * S / 2, cx = X + (sx ? sx * S / 2 : t), cz = Z + (sz ? sz * S / 2 : t);
      const len = S / 7.2, broken = R() < 0.25, h = broken ? R.range(1.2, 2.8) : wh;
      block(B, cx, y0, cz, sx ? th : len, h, sx ? len : th, stone());
      if (!broken) block(B, cx, y0 + h, cz, sx ? th + 1.2 : len, 0.5, sx ? len : th + 1.2, stone(), { moss: 0.3, mossTop: 1 });
      if (broken) for (let j = 0; j < 7; j++) sbox(B, R.range(0.6, 1.4), R.range(0.4, 0.7), R.range(0.6, 1.2), mat(cx + R.range(-4, 4), y0, cz + R.range(-4, 4) + sz * 3, R() * 6, R.range(-0.3, 0.3), R.range(-0.3, 0.3)), stone(), { moss: 0.6, mossTop: 0.9 });
    }
    // 门楼（瞿布罗）：两侧门柱 + 过梁 + 三层收分的顶
    const gx = X + sx * S / 2, gz = Z + sz * S / 2, gw = 10, gd = 7;
    for (const s of [-1, 1]) block(B, gx + (sz ? s * 3.3 : 0), y0, gz + (sx ? s * 3.3 : 0), sz ? 3.4 : gd, 6.5, sx ? 3.4 : gd, stone());
    block(B, gx, y0 + 6.5, gz, sz ? gw : gd, 1.4, sx ? gw : gd, stone());
    let h = y0 + 7.9, w = 8.5;
    for (let k = 0; k < 3; k++) { block(B, gx, h, gz, sz ? w : w * 0.75, 1.5, sx ? w : w * 0.75, stone(), { moss: 0.5, mossTop: 0.95 }); h += 1.5; w *= 0.78; }
    spots.gates = spots.gates || []; spots.gates.push({ x: gx, z: gz, top: h });
  }
  // 中央主塔与四座角塔（东北那座塌了）
  block(B, X, y0, Z, 16, 2.2, 16, stone(), { moss: 0.4, mossTop: 0.8 });
  spots.prangTop = prang(B, R, X, y0 + 2.2, Z, 11, 7);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = X + cx * 15, pz = Z + cz * 15, broken = cx === -1 && cz === 1;
    prang(B, R, px, y0, pz, 6, broken ? 2 : 4, broken);
    if (broken) for (let j = 0; j < 22; j++) sbox(B, R.range(0.8, 2), R.range(0.5, 1.1), R.range(0.8, 1.8), mat(px + R.range(-9, 9), y0 + R.range(0, 1), pz + R.range(-9, 9), R() * 6, R.range(-0.5, 0.5), R.range(-0.5, 0.5)), stone(), { moss: 0.6, mossTop: 0.9 });
  }
  // 内院的回廊柱
  for (let k = -4; k <= 4; k++) for (const s of [-1, 1]) {
    if (R() < 0.2) continue;
    block(B, X + k * 5, y0, Z + s * 22, 0.9, R() < 0.15 ? R.range(1, 2.5) : 3.6, 0.9, stone(), { moss: 0.5, mossTop: 0.8 }, 0, false);
  }
  // 滑进水里的石块
  for (let j = 0; j < 90; j++) {
    const a = R() * 6.28, r = R.range(S * 0.55, S * 0.9), x = X + Math.cos(a) * r, z = Z + Math.sin(a) * r;
    sbox(B, R.range(0.8, 1.9), R.range(0.5, 1), R.range(0.7, 1.6), mat(x, ground(x, z) - 0.2, z, R() * 6, R.range(-0.4, 0.4), R.range(-0.4, 0.4)), stone(), { moss: 0.7, mossTop: 0.9 });
  }
  // 引道：一条石堤伸进水里，半截没在水下
  for (let k = 0; k < 14; k++) {
    const x = X - 4 + R.range(-0.6, 0.6), z = Z + S / 2 + 6 + k * 4.2, sink = k * 0.25;
    sbox(B, 5.6, 1.6, 4, mat(x, T - 1.2 - sink, z, R.range(-0.04, 0.04), R.range(-0.04, 0.04), R.range(-0.05, 0.05)), stone(), { moss: 0.6, mossTop: 0.85 });
  }
}

/* ================= 做旧 =================
   Builder 的苔藓噪声阈值按 0..1 的分布写的，而 fbm 实测中位数只有 0.25，几乎长不出苔藓；这里按实测分布重新上色：
   顶面长苔、侧面有竖向的雨渍、洪水线以下泡成深褐色，铁皮再加一层锈斑。 */
const DIRT = C(0x3e3628), MOSS = C(0x4f6a2a), MOSS2 = C(0x6d7d3c), RUSTY = C(0x6a3a1e);
export function weather(mesh, { moss = 0.7, rust = 0 } = {}) {
  const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, k = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i);
    const a = nf(x * 0.09 + y * 0.05, z * 0.09 - y * 0.04, 3), b = nf(x * 0.45 + z * 0.45, y * 0.06 + 3, 2), r = nf(x * 0.3 - y * 0.2, z * 0.3 + y * 0.25, 3);
    k.setRGB(c.getX(i), c.getY(i), c.getZ(i));
    k.multiplyScalar(1 - 0.32 * smooth(0.45, 0.8, b) * (1 - Math.max(ny, 0)));                         // 竖向雨渍
    k.lerp(DIRT, 0.5 * smooth(6.8, 5.2, y + (a - 0.5) * 2));                                            // 洪水线
    if (rust) k.lerp(RUSTY, rust * smooth(0.4, 0.75, r));
    const top = smooth(0.35, 0.8, ny);
    const m = moss * (top * smooth(0.28, 0.55, a) + (1 - top) * smooth(0.5, 0.75, a) * (0.4 + 0.6 * smooth(16, 3, y)));
    k.lerp(a > 0.55 ? MOSS : MOSS2, clamp(m, 0, 0.92));
    c.setXYZ(i, k.r, k.g, k.b);
  }
  c.needsUpdate = true; return mesh;
}
