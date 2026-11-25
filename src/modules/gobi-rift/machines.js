// 半埋在戈壁里的巨型机械：
//   「横谷巨人」：一具约 450 米长的人形机械，脸朝下卡在裂谷最窄处，身体成了一座桥。
//                 背甲剥落处露出肋骨和发光的核心，一只手臂顺着断崖垂到谷底，指尖摊在河床上；
//                 头埋在东岸的沙里，腿搭在西岸台地上。
//   「沙中巨手」：东岸沙丘里伸出的一只手，五指半握，细沙从指缝里往下淌。
//   「沉睡巨首」：另一台机械的头颅，侧着埋了一半，三只镜头眼在夜里会亮。
//   「沙中脊骨」：一条蛇形机械的脊椎，一节节拱出沙面。
//   「齿轮拱门」：竖着埋进谷底的大齿轮，铁轨从它中间穿过。
//   以及散落各处的装甲碎片、断管和小型机械的残骸。
import * as THREE from 'three';
import { Kit, M, PAL, span } from './kit.js';
import { ground, xc, xRail, xRiver, floorY, halfW, floorFrac, PINCH, addDrift, edgeDist, smooth, lerp, clamp } from './terrain.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- 布局（模块加载时就要确定：沙堆进高度场） ---------- */
const X0 = xc(PINCH), YAW = 0.12;
const bw = (x, z) => ({ x: X0 + x * Math.cos(YAW) + z * Math.sin(YAW), z: PINCH - x * Math.sin(YAW) + z * Math.cos(YAW) });
export const COLOSSUS = { x: X0, z: PINCH, yaw: YAW, head: bw(-228, 0), hand: bw(-40, 78) };
{ const h = bw(-228, 0); addDrift(h.x, h.z, 34, 9); }
{ const s = bw(-176, 0); addDrift(s.x, s.z, 40, 5); }
{ const a = bw(215, -42); addDrift(a.x, a.z, 52, 9); const b = bw(232, 86); addDrift(b.x, b.z, 38, 11); }
export const HAND = { x: -560, z: 330, yaw: 0.6 };
addDrift(HAND.x, HAND.z, 48, 15);
export const HEAD = { x: -810, z: -380 };
addDrift(HEAD.x, HEAD.z, 64, 17);
export const SPINE = Array.from({ length: 15 }, (_, i) => { const t = i / 14; return { x: -960 + t * 520, z: -820 + 70 * Math.sin(t * 5.2) - t * 60, s: lerp(1.25, 0.45, t) }; });
for (const p of SPINE) addDrift(p.x, p.z, 16 * p.s + 8, 3.5 * p.s);
export const GEAR_Z = 900;

/* ---------- 零件 ---------- */
/** 一只机械手：手腕在原点，掌心朝 +z，手指沿 +y 伸出并朝 +z 弯 */
function hand(k, curl, tips, o = {}) {
  const bone = o.bone || PAL.bone, iron = o.iron || PAL.iron;
  k.box(30, 30, 9, M(0, 15, 0), iron, o);
  k.box(28, 26, 3, M(0, 16, -5.5), bone, o);                       // 手背装甲
  k.add(new THREE.CylinderGeometry(4, 4, 30, 10), M(0, 31, 0, 0, 0, Math.PI / 2), iron, o); // 指根关节轴
  k.cyl(9, 11, 10, 12, M(0, -3, 0), iron, o);                      // 腕部
  k.torus(10, 1.1, Math.PI * 2, M(0, -1, 0, Math.PI / 2), PAL.glow, { glow: true });
  const lens = [12, 14, 13, 10];
  for (let f = 0; f < 4; f++) {
    k.push(M(-11.2 + f * 7.5, 31, 0, 0, 0, (f - 1.5) * 0.06));
    for (let s = 0; s < 3; s++) {
      const L = lens[f] * [1, 0.78, 0.6][s], r = 3.1 - s * 0.45;
      k.push(M(0, 0, 0, curl[f] * [0.7, 1, 1.1][s]));
      k.cyl(r * 0.9, r, L, 8, M(0, L / 2, 0), iron, o);
      k.box(r * 1.8, L * 0.86, 1.6, M(0, L / 2, -r * 0.9), bone, o);
      k.sph(r * 1.05, M(0, 0, 0), PAL.bronze, o, 10, 8);
      k.push(M(0, L, 0));
    }
    if (tips) tips.push(V(0, 0, 0).applyMatrix4(k.top));
    for (let s = 0; s < 6; s++) k.pop();
    k.pop();
  }
  // 拇指
  k.push(M(15, 6, 3, 0.5, 0, -0.95));
  for (let s = 0; s < 3; s++) {
    const L = [11, 9, 7][s];
    k.push(M(0, 0, 0, curl[4] * 0.8));
    k.cyl(3, 3.5, L, 8, M(0, L / 2, 0), iron, o); k.box(5.5, L * 0.85, 1.6, M(0, L / 2, -3), bone, o); k.sph(3.6, null, PAL.bronze, o, 10, 8);
    k.push(M(0, L, 0));
  }
  if (tips) tips.push(V(0, 0, 0).applyMatrix4(k.top));
  for (let s = 0; s < 6; s++) k.pop();
  k.pop();
}

/** 一段带装甲的肢体：从 a 到 b，半径 r */
function limb(k, a, b, r, o = {}) {
  k.rod(a, b, r * 0.82, r, 12, PAL.iron, o);
  const d = b.clone().sub(a), L = d.length();
  // 外面套两三片弧形甲
  k.push(span(a, b).multiply(M(0, 0, 0, 0, 0, 0, 1, 1 / L, 1)));
  for (let i = 0; i < 3; i++) {
    const y0 = L * (0.08 + i * 0.31), y1 = y0 + L * 0.27;
    k.surf((u, v) => { const ang = -0.9 + v * 2.6 + i * 0.4, rr = r * 1.18 * (1 + 0.05 * Math.sin(u * Math.PI)); return [Math.cos(ang) * rr, lerp(y0, y1, u) - L / 2, Math.sin(ang) * rr]; }, 4, 10, null, PAL.bone, o);
  }
  k.pop();
}

/** 管线：从 a 垂到 b，中间下垂 sag */
function cable(k, a, b, sag, r, o) {
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(a.clone().lerp(b, t).add(V(0, -sag * Math.sin(t * Math.PI), 0))); }
  k.tube(pts, r, PAL.dark, { rust: 0.2, sand: 0.2, ...o }, 6);
}

/* ---------- 横谷巨人 ---------- */
function colossus(k, falls, glowPts) {
  const yE = ground(bw(-150, 0).x, bw(-150, 0).z), yW = ground(bw(150, 0).x, bw(150, 0).z);
  const Y0 = Math.min(yE, yW) - 12;               // 卡在两岸之间，比崖顶略低
  k.push(M(X0, Y0, PINCH, 0, YAW, 0));
  const o = { rust: 0.5, sand: 0.75 };
  // —— 脊柱与肋骨 ——
  for (let i = 0; i < 14; i++) {
    const x = -168 + i * 19.5;
    k.add(new THREE.CylinderGeometry(8.5, 9.5, 15, 8), M(x, 6, 0, 0, 0, Math.PI / 2), PAL.iron, o);
    k.box(5, 16, 4, M(x, 20, 0, 0, 0, 0.15), PAL.iron2, o);
    k.box(4, 5, 30, M(x, 6, 0), PAL.iron2, o);
  }
  k.rod(V(-180, 6, 0), V(110, 6, 0), 5, 5, 10, PAL.bronze, o);
  for (let i = 0; i < 9; i++) {
    const x = -152 + i * 19, broken = i === 3 || i === 6;
    for (const side of [1, -1]) {
      const pts = [], a1 = broken && side > 0 ? 0.55 : 1.0;
      for (let j = 0; j <= 12; j++) { const t = j / 12 * a1, a = -0.15 + t * (Math.PI / 2 + 1.2); pts.push(V(x + t * 4, 6 - Math.sin(a) * 34, side * Math.cos(a) * 46)); }
      k.tube(pts, 3.2, PAL.bone2, o, 6);
    }
  }
  // —— 核心：肋骨里的发光反应炉 ——
  k.add(new THREE.CylinderGeometry(15, 15, 70, 16), M(-80, -6, 0, 0, 0, Math.PI / 2), PAL.iron, o);
  for (let i = 0; i < 6; i++) k.torus(15.8, 1.2, Math.PI * 2, M(-110 + i * 12, -6, 0, 0, Math.PI / 2), PAL.glow, { glow: true });
  k.sph(9, M(-80, -20, 0), PAL.glowW, { glow: true }, 16, 10);
  glowPts.push(V(-80, -20, 0).applyMatrix4(k.top));
  for (let i = 0; i < 7; i++) k.tube([V(-150, -4, -20 + i * 6), V(-100, -18, -24 + i * 7), V(-30, -16, -18 + i * 6), V(40, -6, -14 + i * 5)], 1.6, i % 2 ? PAL.dark : PAL.bronze, o, 6);
  // —— 背甲：一片片弧形装甲，几处剥落 ——
  const plates = [[-182, -150], [-146, -112], [-108, -86], [-48, -14], [24, 58], [62, 100]];
  for (const [x0, x1] of plates) {
    // 每片背甲再分成四条，条与条之间留缝，边上一圈深色的框
    for (let j = 0; j < 4; j++) {
      const w = (Math.PI - 0.24) / 4, a0 = 0.12 + j * w + 0.025, jit = Math.sin(x0 * 0.7 + j * 2.1);
      k.shell(x0 + 0.6, x1 - 0.6, 40 + jit * 0.8, 50 + jit, a0, a0 + w - 0.05, [PAL.bone, PAL.bone2, PAL.paint, PAL.bone][(j + Math.round(x0)) & 3], o);
    }
    for (const xe of [x0, x1 - 1.6]) k.shell(xe, xe + 1.6, 41.2, 51.2, 0.1, Math.PI - 0.1, PAL.iron2, { rust: 0.6, sand: 0.3 }, null, 0);
    k.shell(x0 + 1, x1 - 1, 37.5, 47.5, 0.2, Math.PI - 0.2, PAL.iron, { rust: 0.6, sand: 0.3 });
    k.box(x1 - x0 - 4, 1, 0.8, M((x0 + x1) / 2, 40.6, 0), PAL.glow, { glow: true });   // 接缝
  }
  // 左右两侧的腹甲，只剩几片
  for (const [x0, x1, s] of [[-150, -118, 1], [-112, -90, -1], [-20, 20, 1], [30, 70, -1]]) k.shell(x0, x1, 40, 50, s > 0 ? -0.75 : Math.PI + 0.1, s > 0 ? -0.1 : Math.PI + 0.75, PAL.bone2, o);
  // 背上的小部件
  for (let i = 0; i < 40; i++) {
    const pl = plates[i % plates.length], x = pl[0] + 3 + Math.random() * (pl[1] - pl[0] - 6), a = 0.4 + Math.random() * 2.3;
    k.box(3 + Math.random() * 7, 1.5 + Math.random() * 2.5, 3 + Math.random() * 6, M(x, Math.sin(a) * 41, Math.cos(a) * 51, 0, 0, Math.cos(a) * 0.9), Math.random() < 0.3 ? PAL.iron2 : PAL.paint, o);
  }
  // —— 肩与颈、头 ——
  for (const s of [1, -1]) {
    k.sph(27, M(-168, 8, s * 52, 0, 0, 0, 1, 0.82, 1), PAL.bone, o, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    k.sph(28, M(-168, 8, s * 52, 0, 0.4, 0, 1, 0.82, 1), PAL.iron2, o, 10, 3, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.06);
    k.sph(18, M(-168, 0, s * 54), PAL.iron, o, 14, 10);
    k.torus(19, 1.3, Math.PI * 2, M(-168, 0, s * 54, 0, 0, Math.PI / 2), PAL.glow, { glow: true });
  }
  for (let i = 0; i < 4; i++) k.add(new THREE.CylinderGeometry(10 - i, 11 - i, 7, 10), M(-188 - i * 7, 0, 0, 0, 0, Math.PI / 2), PAL.iron2, o);
  k.push(M(-226, 2, 6, 0.55, 0.25, -0.12));        // 头侧着搁在东岸，面朝南
  {
    k.sph(27, M(0, 0, 0, 0, 0, 0, 1.15, 0.9, 0.95), PAL.bone, o, 24, 16);
    k.box(18, 26, 40, M(-24, -6, 0), PAL.iron, o);                       // 面罩
    k.box(2.5, 3.2, 30, M(-33.6, -1, 0), PAL.glowR, { glow: true });     // 目镜
    glowPts.push(V(-34, -1, 0).applyMatrix4(k.top));
    k.box(50, 16, 2.5, M(4, 24, 0, 0, 0, -0.15), PAL.bone2, o);           // 冠
    for (const s of [1, -1]) { k.cyl(1, 4, 26, 8, M(10, 12, s * 22, s * 0.6, 0, -0.9), PAL.iron2, o); k.box(14, 18, 4, M(-6, -4, s * 25), PAL.bone2, o); }
  }
  k.pop();
  // —— 垂进裂谷的右臂（北侧） ——
  const sh = V(-150, -6, 62), el = V(-108, -66, 92), wr = V(-62, floorY(PINCH) + 9 - Y0, 80);
  limb(k, sh, el, 15, o); k.sph(17, M(el.x, el.y, el.z), PAL.iron, o, 14, 10);
  k.torus(17.5, 1.2, Math.PI * 2, M(el.x, el.y, el.z, 0, 0.6, Math.PI / 2), PAL.glow, { glow: true });
  limb(k, el, wr, 12, o);
  k.push(M(wr.x, wr.y, wr.z, Math.PI / 2 + 0.05, 0, -Math.PI / 2 + 0.25));  // 手掌朝下摊在河床上
  const tipsA = []; hand(k, [0.25, 0.18, 0.3, 0.45, 0.2], tipsA, o); k.pop();
  // —— 压在身下的左臂 ——
  limb(k, V(-150, -10, -58), V(-178, -26, -110), 14, o);
  limb(k, V(-178, -26, -110), V(-128, -30, -150), 11, o);
  // —— 骨盆与双腿（搭在西岸） ——
  k.box(44, 30, 84, M(112, -2, 0), PAL.iron, o);
  k.shell(92, 132, 18, 44, 0.1, Math.PI - 0.1, PAL.bone, o);
  const hipL = V(118, -10, -32), knL = V(196, -22, -46), anL = V(278, -30, -38);
  const hipR = V(118, -10, 32), knR = V(178, 22, 66), anR = V(236, -34, 88);
  for (const [h, kn, an] of [[hipL, knL, anL], [hipR, knR, anR]]) {
    k.sph(17, M(h.x, h.y, h.z), PAL.iron, o, 14, 10);
    limb(k, h, kn, 19, o); k.sph(18, M(kn.x, kn.y, kn.z), PAL.bronze, o, 14, 10);
    k.torus(18.6, 1.3, Math.PI * 2, M(kn.x, kn.y, kn.z, 0, 0.4, Math.PI / 2), PAL.glow, { glow: true });
    limb(k, kn, an, 15, o);
  }
  // —— 垂下的管线 ——
  for (let i = 0; i < 10; i++) {
    const x = -125 + i * 21 + Math.sin(i * 2.3) * 6, z = (i % 2 ? 1 : -1) * (8 + (i * 7) % 24);
    const len = 25 + ((i * 37) % 60), a = V(x, -24, z), b = V(x + Math.sin(i) * 22, -24 - len, z + Math.cos(i) * 18);
    if (i % 3 === 0) b.y = floorY(PINCH) - Y0 + 1;
    // 一头挂在身上、另一头垂下或者拖在河床上：中间往外弓
    const m1 = a.clone().lerp(b, 0.5).add(V(Math.cos(i * 1.7) * 10, 0, Math.sin(i * 1.3) * 10));
    k.tube([a, a.clone().lerp(m1, 0.5).add(V(0, 2, 0)), m1, b], 0.7 + (i % 3) * 0.45, PAL.dark, { rust: 0.2, sand: 0.2 }, 6);
  }
  // 细沙：从背甲剥落的地方和身体的缝隙往谷底淌
  const W = new THREE.Matrix4().copy(k.top);
  for (const [x, z] of [[-94, 6], [-60, -12], [-36, 18], [0, -4], [14, 10], [-120, -30]]) {
    const p = V(x, -12, z).applyMatrix4(W);
    falls.push([p.x, p.y, p.z, Math.max(10, p.y - ground(p.x, p.z)), 1.2]);
  }
  k.pop();
  return { tips: tipsA };
}

/* ---------- 沙中巨手 ---------- */
function sandHand(k, falls) {
  const y = ground(HAND.x, HAND.z) + 22;
  k.push(M(HAND.x, y, HAND.z, -0.3, HAND.yaw, 0.2, 1.6));
  const o = { rust: 0.55, sand: 0.9, bone: PAL.bone2 };
  limb(k, V(0, -40, 0), V(0, 0, 0), 11, o);
  const tips = []; hand(k, [0.55, 0.42, 0.5, 0.65, 0.4], tips, o);
  k.pop();
  for (const t of tips) falls.push([t.x, t.y, t.z, Math.max(8, t.y - ground(t.x, t.z)), 0.8]);
  return tips;
}

/* ---------- 沉睡巨首 ---------- */
function bigHead(k, glowPts) {
  const y = ground(HEAD.x, HEAD.z) - 10;
  k.push(M(HEAD.x, y, HEAD.z, 0.45, -1.05, 0.18));       // 侧躺，脸朝东北、微微仰起
  const o = { rust: 0.7, sand: 0.85 };
  // 头壳：多面体的大圆颅，外面一圈加强筋
  k.sph(40, M(0, 0, 0, 0, 0, 0, 1, 0.82, 1.1), PAL.paint, o, 14, 10);
  for (const a of [-0.5, 0, 0.5]) k.torus(39.5, 1.6, Math.PI * 1.1, M(-4, 0, 0, 0, Math.PI / 2 + a * 0.2, -0.05 + a * 0.6), PAL.iron2, o, 18);
  // 脸：斜切的面板 + 眉骨 + 三只镜头眼
  k.box(14, 46, 62, M(31, -6, 0, 0, 0, -0.18), PAL.iron, o);
  k.box(10, 8, 66, M(36, 18, 0, 0, 0, -0.3), PAL.bone, o);
  for (const [ey, ez, r] of [[2, 0, 9], [-10, 19, 6], [-10, -19, 6]]) {
    k.cyl(r + 3, r + 4, 8, 12, M(38, ey, ez, 0, 0, Math.PI / 2 - 0.18), PAL.iron2, o);
    k.cyl(r, r, 2, 16, M(42, ey + 0.7, ez, 0, 0, Math.PI / 2 - 0.18), PAL.glowR, { glow: true });
    glowPts.push(V(43, ey, ez).applyMatrix4(k.top));
  }
  // 下颌、耳侧的圆筒、天线、断掉的管线
  k.box(30, 14, 54, M(16, -32, 0, 0, 0, 0.25), PAL.iron, o);
  for (let i = 0; i < 6; i++) k.box(4, 10, 3, M(30, -38, -20 + i * 8, 0, 0, 0.25), PAL.bone2, o);
  for (const s of [1, -1]) {
    k.add(new THREE.CylinderGeometry(14, 14, 18, 12), M(-2, -2, s * 44, Math.PI / 2), PAL.bronze, o);
    k.torus(14.6, 1.1, Math.PI * 2, M(-2, -2, s * 53.2), PAL.glow, { glow: true });
    k.cyl(4, 4, 10, 8, M(-2, -2, s * 58, Math.PI / 2), PAL.iron, o);
  }
  k.cyl(1.2, 2.6, 52, 6, M(-12, 50, 8, 0.3, 0, -0.4), PAL.iron2, o);
  k.cyl(0.8, 1.6, 34, 6, M(-4, 44, -14, -0.2, 0, -0.2), PAL.iron2, o);
  k.tube([V(-30, -10, 20), V(-50, -30, 34), V(-62, -40, 20), V(-80, -42, 30)], 2.4, PAL.dark, o, 6);
  k.tube([V(-30, -16, -14), V(-48, -38, -24), V(-70, -44, -40)], 1.8, PAL.dark, o, 6);
  k.pop();
}

/* ---------- 沙中脊骨 ---------- */
function spine(k) {
  const o = { rust: 0.6, sand: 0.8 };
  for (let i = 0; i < SPINE.length; i++) {
    const p = SPINE[i], q = SPINE[Math.min(i + 1, SPINE.length - 1)], r = SPINE[Math.max(i - 1, 0)];
    const yaw = Math.atan2(q.x - r.x, q.z - r.z), s = p.s, y = ground(p.x, p.z) - 7 * s;
    if (i === 0) { // 蛇头：半埋的楔形
      k.push(M(p.x, y + 4, p.z, -0.3, yaw + Math.PI, 0.2, s));
      k.box(22, 14, 40, M(0, 0, 0), PAL.iron, o); k.box(20, 4, 30, M(0, 8, 4, -0.1), PAL.paint, o);
      for (const sx of [1, -1]) k.box(3, 3, 1, M(sx * 7, 3, 20.5), PAL.glowR, { glow: true });
      k.pop(); continue;
    }
    k.push(M(p.x, y, p.z, 0, yaw, (i % 2 ? 1 : -1) * 0.08, s));
    k.torus(17, 3.4, Math.PI, M(0, 0, 0, 0, Math.PI / 2), PAL.iron2, o, 20);
    k.torus(17, 1.4, Math.PI, M(0, 0, 3.2, 0, Math.PI / 2), PAL.bone, o, 20);
    k.box(3, 12, 9, M(0, 22, 0), PAL.bone, o);                       // 背鳍
    k.box(2, 3, 14, M(0, 16.5, 0), PAL.iron, o);
    k.pop();
  }
}

/* ---------- 齿轮拱门 ---------- */
function gear(k) {
  const x = xRail(GEAR_Z), y = floorY(GEAR_Z) - 7;
  k.push(M(x, y, GEAR_Z, 0.04, 0.12, 0.08));
  const o = { rust: 0.85, sand: 0.5 };
  k.torus(31, 4.6, Math.PI * 2, null, PAL.iron2, o, 64);
  k.torus(24, 2.2, Math.PI * 2, null, PAL.bronze, o, 48);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; k.box(6.5, 7, 7, M(Math.cos(a) * 37, Math.sin(a) * 37, 0, 0, 0, a), PAL.iron, o); }
  for (const a of [0.7, 2.4]) k.box(2.6, 22, 3, M(Math.cos(a) * 11, Math.sin(a) * 11, 0, 0, 0, a - Math.PI / 2), PAL.iron, o); // 断掉的辐条
  k.pop();
}

/* ---------- 碎片：装甲片、断管、小型机械的残骸 ---------- */
function debris(k, rnd) {
  const o = { rust: 0.6, sand: 0.8 };
  const put = (x, z, f) => { const y = ground(x, z); k.push(M(x, y, z, 0, rnd() * 6.28, 0)); f(); k.pop(); };
  // 巨人身下的谷底：掉下来的背甲
  for (let i = 0; i < 7; i++) {
    const z = PINCH + (rnd() - 0.5) * 160, x = xc(z) + (rnd() - 0.5) * floorFrac(z) * halfW(z) * 1.4;
    if (Math.abs(x - xRail(z)) < 9) continue;
    put(x, z, () => k.shell(-14, 14, 20 + rnd() * 10, 26, 0.3, 2.2, PAL.bone, o, M(0, -10, 0, 0, 0, (rnd() - 0.5) * 0.8)));
  }
  // 沙海里露头的巨型管道和支柱
  for (let i = 0; i < 9; i++) {
    const x = -300 - rnd() * 1000, z = (rnd() - 0.5) * 2200;
    if (Math.abs(x - HAND.x) < 80 && Math.abs(z - HAND.z) < 80 || edgeDist(x, z) > 0.64) continue;
    put(x, z, () => {
      const r = 3 + rnd() * 5, L = 30 + rnd() * 50, tilt = 0.4 + rnd() * 0.7;
      k.cyl(r, r, L, 12, M(0, 0, 0, tilt, 0, 0), PAL.iron2, o);
      k.torus(r * 1.05, 0.6, Math.PI * 2, M(0, Math.cos(tilt) * L * 0.3, Math.sin(tilt) * L * 0.3, tilt + Math.PI / 2), PAL.bronze, o, 16);
    });
  }
  // 小型机械（圆滚滚的身子、筒形的头）
  const small = [];
  for (let i = 0; i < 16; i++) {
    let x, z;
    if (i < 8) { z = 1300 - rnd() * 2400; x = xc(z) + (rnd() - 0.5) * floorFrac(z) * halfW(z) * 1.6; if (Math.abs(x - xRail(z)) < 6) x += 10; }
    else { x = -250 - rnd() * 800; z = (rnd() - 0.5) * 1700; }
    small.push([x, z]);
    put(x, z, () => {
      const lay = rnd() * 1.4;
      k.push(M(0, 1.2, 0, 0, 0, lay));
      k.sph(1.7, M(0, 0.6, 0), PAL.paint, o, 12, 10); k.cyl(0.9, 1.0, 1.4, 10, M(0, 2.6, 0), PAL.paint, o);
      k.sph(0.95, M(0, 3.3, 0, 0, 0, 0, 1, 0.7, 1), PAL.iron2, o, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      k.box(0.8, 0.2, 0.25, M(0, 2.8, 0.95), PAL.glowR, { glow: true });
      for (const s of [1, -1]) k.cyl(0.22, 0.25, 1.8, 6, M(s * 1.9, 0.8, 0, 0, 0, s * 0.9), PAL.iron, o);
      k.pop();
    });
  }
  return small;
}

/** 全部机械：返回 { meshes, glowMats, falls, lights, ... } */
export function buildMachines(root, dust) {
  let seed = 77; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const solid = dust(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.3, side: THREE.DoubleSide, flatShading: true, envMapIntensity: 0.55 }));
  const mkGlow = () => dust(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x000000 }));
  const falls = [], groups = [];
  const take = (name, k, glowPts = []) => {
    const g = mkGlow(), out = k.build(solid, g);
    if (out.solid) root.add(out.solid); if (out.glow) root.add(out.glow);
    groups.push({ name, mat: g, phase: rnd() * 10, wake: 0, glowPts });
    return out;
  };
  // 巨人
  { const k = new Kit(), gp = []; colossus(k, falls, gp); take('colossus', k, gp); }
  // 巨手
  { const k = new Kit(); const tips = sandHand(k, falls); take('hand', k, tips.slice(0, 1)); }
  // 巨首
  { const k = new Kit(), gp = []; bigHead(k, gp); take('head', k, gp); }
  // 脊骨、齿轮、碎片
  let small;
  { const k = new Kit(); spine(k); gear(k); small = debris(k, rnd); take('debris', k, []); }
  return { groups, falls, small, solid };
}
