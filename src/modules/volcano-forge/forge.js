// 远古熔炉：嵌在火山南坡四级台地上的工厂。
//   熔心台：火山口豁口的闸门、熔岩接收池、心炉与热风炉、横跨火山口的吊桥与舀岩浆的大勺
//   锻造大厅：拱窗长厅、锯齿屋顶、五根烟囱、墙上转动的齿轮、汽锤
//   浇铸场：一格格发光的铸模、龙门吊、两座冷却塔、倒下的烟囱
//   守门台：门楼与两尊跪着的远古守卫，熔岩从门下流出去变成河
// 熔岩一路从火山口流下来：豁口 → 接收池 → 心炉 → 高架槽 → 瀑布 → 大厅边的槽 → 瀑布 → 浇铸场 → 瀑布 → 门楼 → 河。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, mat, rng } from '../../util.js';
import { VC, TER, zOf, ground, RIVER, LAKE, FISS, MOUNDS, CRATER } from './terrain.js';
import { lavaMaterial, ribbon, lavaDisc, fallPath, forgeMaterial, ensureAttrs } from './lava.js';

const C = c => new THREE.Color(c);
const COL = {
  stone: C(0x55504a), stone2: C(0x3f3b37), dark: C(0x2a2726), brick: C(0x6a3626), brick2: C(0x7c4630), iron: C(0x3b3836), iron2: C(0x55504b),
  rust: C(0x7a4528), copper: C(0x4f7d6c), bronze: C(0x8a6a3a), concrete: C(0x8d8780), glass: C(0x2a2422), moss: C(0x5d7038), bone: C(0xb8ae98)
};
const [T1, T2, T3, T4] = TER;
const Y1 = T1.y, Y2 = T2.y, Y3 = T3.y, Y4 = T4.y;
const Z = { crownN: zOf(T1.u0), crownS: zOf(T1.u1), hallN: zOf(T2.u0), hallS: zOf(T2.u1), castN: zOf(T3.u0), castS: zOf(T3.u1), gateN: zOf(T4.u0), gateS: zOf(T4.u1) };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- 几何小工具 ---------------- */
class Kit {
  constructor() { this.b = { stone: new Builder(true), iron: new Builder(true), brick: new Builder(true), concrete: new Builder(true) }; }
  box(k, w, h, d, x, y, z, o = {}) { this.b[k].add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), mat(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.col || COL[k] || COL.stone, 0, 0, o.lit ?? 2); }
  cyl(k, rt, rb, h, x, y, z, o = {}) { this.b[k].add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 18, 1, !!o.open).translate(0, h / 2, 0), mat(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o.col || COL[k] || COL.stone, 0, 0, o.lit ?? 2); }
  ring(k, R, r, x, y, z, o = {}) { this.b[k].add(new THREE.TorusGeometry(R, r, 6, o.seg || 28), mat(x, y, z, o.ry || 0, o.rx ?? Math.PI / 2, o.rz || 0), o.col || COL.iron, 0, 0, o.lit ?? 2); }
  sphere(k, r, x, y, z, o = {}) { this.b[k].add(new THREE.SphereGeometry(r, o.seg || 16, 10, 0, Math.PI * 2, 0, o.half ? Math.PI / 2 : Math.PI), mat(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1), o.col || COL[k], 0, 0, o.lit ?? 2); }
  lathe(k, prof, x, y, z, o = {}) { this.b[k].add(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), o.seg || 28), mat(x, y, z, 0, o.rx || 0), o.col || COL[k], 0, 0, o.lit ?? 2); }
  tube(k, pts, r, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
    this.b[k].add(new THREE.TubeGeometry(curve, Math.ceil(curve.getLength() / (o.step || 4)), r, o.seg || 10, false), null, o.col || COL.iron, 0, 0, o.lit ?? 2);
    return curve;
  }
  /** 两点间的一根圆头柱（胶囊） */
  cap(k, a, b, r, o = {}) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = new THREE.CapsuleGeometry(r, Math.max(L - r * 0.5, 0.1), 4, o.seg || 12);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.b[k].add(g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), o.col || COL.iron, 0, 0, o.lit ?? 2);
  }
  /** 两点间的一根梁（方截面） */
  beam(k, a, b, s, o = {}) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = new THREE.BoxGeometry(s, s, L); const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, Math.abs(d.y) > L * 0.99 ? 0.01 : 0));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    this.b[k].add(g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)), m, o.col || COL.iron, 0, 0, o.lit ?? 2);
  }
  /** 一面带拱门的墙。墙面朝 -z（南），x 方向长 L，底在 y=0，墙厚 T。opts.arches: [{ x, w, h, y0 }] */
  archWall(k, L, H, T, x, y, z, ry, arches, col) {
    const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.lineTo(L / 2, 0); s.lineTo(L / 2, H); s.lineTo(-L / 2, H); s.closePath();
    for (const a of arches) {
      const h = new THREE.Path(), r = a.w / 2, y0 = a.y0 || 0;
      h.moveTo(a.x - r, y0); h.lineTo(a.x + r, y0); h.lineTo(a.x + r, y0 + a.h - r); h.absarc(a.x, y0 + a.h - r, r, 0, Math.PI, false); h.lineTo(a.x - r, y0); s.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -T / 2);
    this.b[k].add(g, mat(x, y, z, ry), col || COL[k]);
  }
  build(mats) {
    const out = [];
    for (const k of Object.keys(this.b)) { const m = this.b[k].build(mats[k]); if (m) out.push(m); }
    return out;
  }
}

/* 拱门里的内容：发光的炉膛，或者一扇生锈的铁门 */
function archFill(K, x, y, z, w, h, depth, lit, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const px = x + s * depth, pz = z + c * depth;   // 往墙里退 depth（墙面朝 -z → 往 +z 退）
  if (lit > 0) {
    K.box('iron', w, h - w / 2, 1.2, px, y, pz, { ry, lit, col: COL.dark });
    K.b.iron.add(new THREE.CircleGeometry(w / 2, 14, 0, Math.PI).rotateY(Math.PI), mat(px, y + h - w / 2, pz + c * 0.2 - 0.6, ry), COL.dark, 0, 0, lit);
  } else {
    K.box('iron', w, h, 1.6, px, y, pz, { ry, col: COL.rust });
    for (let i = 1; i < 4; i++) K.box('iron', w, 0.8, 0.6, px - s * 0.9, y + h * i / 4.6, pz - c * 0.9, { ry, col: COL.iron });
  }
}

/* ---------------- 守卫 ---------------- */
function guardian(mats, R) {
  const K = new Kit(), g = new THREE.Group();
  const P = COL.iron2, D = COL.dark, B = COL.bronze, k = 'iron';
  // 跪姿：右膝着地、左脚踏前，双手按在插进地里的巨剑上；面朝 -z。四肢用圆头柱，像被时间磨圆了的机械
  K.cap(k, V(-11, 6, -3), V(-11, 5, 27), 6.5, { col: P });            // 着地的小腿
  K.box(k, 13, 7, 12, -11, 0, 30, { col: D });                        // 脚跟
  K.cap(k, V(-11, 8, -3), V(-9, 30, 6), 7.5, { col: P });             // 大腿
  K.sphere(k, 7.5, -11, 8, -4, { col: B, sz: 1.1 });                  // 膝甲
  K.cap(k, V(12, 4, -21), V(12, 27, -20), 6.5, { col: P });           // 踏前的小腿
  K.box(k, 15, 6, 21, 12, 0, -26, { col: D });                        // 脚
  K.cap(k, V(12, 27, -20), V(9, 31, 4), 7.5, { col: P });
  K.sphere(k, 7.5, 12, 27, -21, { col: B, sz: 1.1 });
  K.sphere(k, 12, 0, 29, 4, { col: D, sx: 1.6, sy: 0.8, sz: 1.15 });  // 骨盆
  K.lathe(k, [[0, 0], [11, 0], [14, 5], [18, 15], [19, 23], [16, 29], [8, 32], [0, 32]], 0, 31, 3, { col: P, seg: 18, rx: 0.16 }); // 桶形胸腔
  K.sphere(k, 10, 0, 47, -10, { col: B, sx: 1.5, sy: 1.15, sz: 0.5 }); // 胸甲
  K.cyl(k, 4.6, 4.6, 1.2, 0, 49, -14.2, { rx: Math.PI / 2 + 0.16, col: D, lit: 0.95, seg: 18 }); // 胸口的核
  K.ring(k, 6, 0.9, 0, 49, -14.4, { rx: 0.16, col: P, seg: 20 });
  for (const sx of [-1, 1]) {
    K.sphere(k, 9, sx * 22, 60, 2, { col: D });                       // 肩关节
    K.sphere(k, 11, sx * 25, 63, 2, { col: P, sx: 1.05, sy: 0.7, sz: 1.2 }); // 肩甲
    K.sphere(k, 11.4, sx * 25, 62, 2, { col: B, sx: 1.06, sy: 0.25, sz: 1.22 }); // 肩甲的铜边
    K.cap(k, V(sx * 23, 58, 2), V(sx * 17, 41, -14), 5.5, { col: P });  // 上臂
    K.sphere(k, 6.5, sx * 17, 41, -14, { col: D });
    K.cap(k, V(sx * 17, 41, -14), V(sx * 6, 51, -28), 5, { col: P });   // 前臂
    K.sphere(k, 6, sx * 5, 50, -31, { col: D, sx: 1, sy: 1.1, sz: 1.2 }); // 手
  }
  // 头：低垂，盔下一道细缝发光
  K.cyl(k, 4.5, 5.5, 8, 0, 59, -1, { col: D, rx: 0.4, seg: 10 });
  K.sphere(k, 8.5, 0, 67, -6, { col: P, sx: 1, sy: 1.1, sz: 1.2 });
  K.box(k, 10, 2.4, 1.4, 0, 65.5, -15.6, { rx: 0.45, col: D, lit: 1 });  // 单眼缝
  K.box(k, 2.2, 9, 18, 0, 73, -3, { col: B, rx: 0.45 });             // 冠脊
  // 巨剑：剑身大半没入地里
  K.box(k, 9, 78, 2.6, 0, -24, -31, { col: COL.iron2 });
  K.box(k, 1.8, 70, 0.6, 0, -18, -32.5, { col: C(0x6a3a20), lit: 0.45 }); // 剑身上一道烧红的刻线
  K.box(k, 34, 4.5, 7, 0, 54, -31, { col: B });
  K.cyl(k, 2.2, 2.2, 13, 0, 58, -31, { col: D, seg: 10 });
  K.sphere(k, 3.6, 0, 72, -31, { col: B });
  // 背上的排热鳍片与断掉的管
  for (let i = 0; i < 5; i++) K.box(k, 2.4, 18 - i * 2, 14, -8 + i * 4, 46, 18, { col: D, rz: (i - 2) * 0.12 });
  K.cap(k, V(-12, 52, 16), V(-30, 36, 32), 2.4, { col: COL.rust });
  K.cap(k, V(10, 56, 16), V(22, 28, 34), 2, { col: COL.rust });
  // 青苔：在肩、膝和背上
  for (let i = 0; i < 18; i++) { const sx = R() < 0.5 ? -1 : 1; K.sphere(k, R.range(2.5, 5), R.pick([sx * 25, R.range(-10, 10), -11, 12]), R.pick([66, 52, 10, 30]), R.range(-2, 12), { col: COL.moss, sy: 0.3 }); }
  for (const m of K.build(mats)) { ensureAttrs(m.geometry); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  g.scale.setScalar(1.3);
  return g;
}

/* ---------------- 齿轮 ---------------- */
function gear(mats, r, teeth, w) {
  const K = new Kit(), k = 'iron';
  K.b[k].add(new THREE.TorusGeometry(r, w * 0.32, 8, Math.max(24, teeth * 2)), null, COL.iron2);
  for (let i = 0; i < teeth; i++) { const a = i / teeth * Math.PI * 2; K.b[k].add(new THREE.BoxGeometry(w * 0.6, r * 0.16, w * 0.55), mat(Math.cos(a) * (r + w * 0.3), Math.sin(a) * (r + w * 0.3), 0, 0, 0, a - Math.PI / 2), COL.iron); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; K.b[k].add(new THREE.BoxGeometry(r * 2 * 0.95, w * 0.3, w * 0.3), mat(0, 0, 0, 0, 0, a), COL.iron); }
  K.b[k].add(new THREE.CylinderGeometry(r * 0.18, r * 0.18, w * 0.9, 14).rotateX(Math.PI / 2), null, COL.bronze);
  const g = new THREE.Group();
  for (const m of K.build(mats)) { ensureAttrs(m.geometry); m.castShadow = true; g.add(m); }
  return g;
}

/* ================= 主体 ================= */
export function buildForge(root, heat) {
  const R = rng(505);
  const mats = {
    stone: forgeMaterial({ roughness: 0.92, metalness: 0.02 }, { key: 'stone' }),
    iron: forgeMaterial({ roughness: 0.6, metalness: 0.55 }, { key: 'iron' }),
    brick: forgeMaterial({ roughness: 0.88, metalness: 0.02 }, { key: 'brick' }),
    concrete: forgeMaterial({ roughness: 0.95, metalness: 0 }, { key: 'conc', grime: 0.7 })
  };
  const lava = lavaMaterial(), lavaFall = lavaMaterial({ side: THREE.DoubleSide, crust: 0.35 });
  const K = new Kit();
  const lavaGeos = [], fallGeos = [];
  const smoke = [], embers = [], halos = [], lights = [];
  const anim = { cranes: [], gears: [], hammer: null, ladle: null, eyes: [] };

  /* ---------- 熔岩路线 ---------- */
  const addLava = (pts, w, speed, o) => { lavaGeos.push(ribbon(pts, w, speed, o)); heat.splatPath(pts, 46, 1); };
  const addFall = (a, b, w) => {
    const pts = fallPath(a, b, 22); fallGeos.push(ribbon(pts, w, 16, { cross: 4 })); heat.splatPath(pts, 40, 0.9);
    embers.push({ x: b.x, y: b.y + 1, z: b.z, n: 70, vy: 9, vh: 6, g: 0.9, period: 2.2, size: 2.2, jx: w, jz: 4 });
    smoke.push({ x: b.x, y: b.y + 2, z: b.z, n: 22, rise: 90, spread: 10, size: 22, period: 14, kind: 0, hot: 1, jx: w });
    halos.push({ x: b.x, y: b.y + 12, z: b.z, size: 160, k: 0.55 });
  };
  const pool = (x, y, z, r, k = 'stone') => {
    K.cyl(k, r + 3, r + 4, 6, x, y - 1, z, { seg: 28, col: COL.stone2, open: true });
    K.cyl(k, r + 0.2, r + 0.2, 6, x, y - 1, z, { seg: 28, col: COL.dark, open: true });
    K.ring(k, r + 3.5, 1.2, x, y + 5, z, { col: COL.iron });
    lavaGeos.push(lavaDisc(x, y + 3.5, z, r + 0.5, 0.4, 28, 5)); heat.splat(x, y + 3.5, z, 50, 1);
  };
  /** 石槽：沿路径的底板和两侧墙，熔岩在槽里流 */
  const trough = (pts, w, wallH, piers = 0) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), ry = Math.atan2(b.x - a.x, b.z - a.z);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = Math.min(a.y, b.y), nx = Math.cos(ry), nz = -Math.sin(ry);
      K.box('stone', w + 4, 1.5, L + 0.6, mx, my - 1.5, mz, { ry, col: COL.stone2 });
      for (const s of [-1, 1]) K.box('stone', 2, wallH + 1.5, L + 0.6, mx + nx * s * (w / 2 + 1), my - 1.5, mz + nz * s * (w / 2 + 1), { ry, col: COL.stone });
      if (piers && i % piers === 0) K.box('stone', w + 2, my - 1.5 - ground(mx, mz) + 2, 4, mx, ground(mx, mz) - 2, mz, { ry, col: COL.stone2 });
    }
    addLava(pts.map(p => ({ x: p.x, y: p.y + wallH * 0.55, z: p.z })), w, 3.2, { cross: 4 });
  };
  const line = (keys, y, step = 6) => {
    const out = [];
    for (let i = 0; i < keys.length - 1; i++) {
      const [ax, az] = keys[i], [bx, bz] = keys[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let k = 0; k < n; k++) { const t = k / n; out.push({ x: ax + (bx - ax) * t, y, z: az + (bz - az) * t }); }
    }
    const [lx, lz] = keys[keys.length - 1]; out.push({ x: lx, y, z: lz });
    return out;
  };

  /* ---------- 火山口熔岩湖 ---------- */
  lavaGeos.push(lavaDisc(VC.x, CRATER.lake, VC.z, 215, 0.35, 72, 14));
  for (let r = 0; r < 200; r += 28) for (let a = 0; a < 6.28; a += 0.5) heat.splat(VC.x + Math.cos(a) * r, CRATER.lake, VC.z + Math.sin(a) * r, 70, 1);
  smoke.push({ x: VC.x, y: CRATER.lake + 8, z: VC.z, n: 420, rise: 760, spread: 70, size: 110, period: 46, kind: 0, hot: 1, jx: 220, jz: 220 });
  smoke.push({ x: VC.x, y: CRATER.lake + 2, z: VC.z, n: 120, rise: 120, spread: 30, size: 40, period: 12, kind: 1, hot: 0.8, jx: 240, jz: 240 });
  embers.push({ x: VC.x, y: CRATER.lake + 1, z: VC.z, n: 500, vy: 14, vh: 7, g: 0.8, period: 3.2, size: 3, jx: 220, jz: 220 });
  embers.push({ x: VC.x + 40, y: CRATER.lake, z: VC.z - 30, n: 220, vy: 55, vh: 12, g: 1, period: 6, size: 4.5, jx: 18, jz: 18 }); // 湖心喷泉
  halos.push({ x: VC.x, y: CRATER.lake + 60, z: VC.z, size: 1100, k: 0.9 }, { x: VC.x, y: CRATER.lake + 260, z: VC.z, size: 1300, k: 0.4 });
  lights.push([VC.x, CRATER.lake, VC.z, 1.6], [VC.x + 80, CRATER.lake, VC.z + 40, 1.2], [VC.x - 70, CRATER.lake, VC.z - 30, 1.2]);

  /* ---------- 熔心台（Y1 = 470） ---------- */
  // 豁口：熔岩顺着槽从湖里溢出来，在闸门下跌进接收池
  const zGate = zOf(224);
  addLava(line([[0, VC.z - 120], [0, zGate - 4]], 528.3), 34, 4, { cross: 6 });
  addFall(V(0, 528.3, zGate - 4), V(0, Y1 + 5.2, 10), 26);
  for (const s of [-1, 1]) {
    K.box('stone', 26, 150, 32, s * 60, Y1 - 6, zGate, { col: COL.stone });
    K.box('stone', 32, 10, 38, s * 60, Y1 + 136, zGate, { col: COL.stone2 });
    for (let i = 0; i < 5; i++) K.box('stone', 28, 2, 34, s * 60, Y1 + 20 + i * 24, zGate, { col: COL.stone2 });
    K.box('iron', 4, 60, 4, s * 46, Y1 + 76, zGate - 10, { col: COL.rust }); // 闸门导轨
  }
  K.box('stone', 150, 24, 34, 0, Y1 + 114, zGate, { col: COL.stone });
  K.box('iron', 92, 34, 3, 0, Y1 + 80, zGate - 12, { col: COL.rust });      // 升起来的闸板
  for (let i = 0; i < 6; i++) K.box('iron', 92, 1.5, 4, 0, Y1 + 82 + i * 5.5, zGate - 13, { col: COL.iron });
  K.ring('iron', 15, 2.2, 0, Y1 + 126, zGate - 18, { rx: 0, col: COL.bronze, lit: 0.6, seg: 36 }); // 闸门上的眼睛纹章
  K.cyl('iron', 8, 8, 1.5, 0, Y1 + 126, zGate - 17.5, { rx: Math.PI / 2, col: COL.dark, lit: 0.9, seg: 24 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box('iron', 2, 9, 1.2, Math.cos(a) * 21, Y1 + 126 + Math.sin(a) * 21 - 4.5, zGate - 17.5, { rz: a - Math.PI / 2, col: COL.bronze, lit: 0.4 }); }

  // 接收池 → 心炉
  pool(0, Y1, 10, 30);
  trough(line([[0, -21], [0, -40]], Y1 + 2), 10, 3.5);
  const HF = { x: 0, z: -78, r: 34 };
  K.box('stone', 96, 8, 96, HF.x, Y1, HF.z, { col: COL.stone2 });
  K.cyl('brick', HF.r - 3, HF.r, 66, HF.x, Y1 + 8, HF.z, { seg: 36, col: COL.brick });
  for (let i = 0; i < 5; i++) K.ring('iron', HF.r - 0.5 - i * 0.6, 1.4, HF.x, Y1 + 14 + i * 13, HF.z, { seg: 40 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box('iron', 3, 34, 1.2, HF.x + Math.cos(a) * (HF.r - 1.3), Y1 + 26, HF.z + Math.sin(a) * (HF.r - 1.3), { ry: -a + Math.PI / 2, lit: 0.9, col: COL.dark }); }
  for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; K.box('iron', 4, 60, 4, HF.x + Math.cos(a) * (HF.r + 1), Y1 + 8, HF.z + Math.sin(a) * (HF.r + 1), { ry: -a, col: COL.iron2 }); }
  K.cyl('iron', 13, HF.r - 2, 26, HF.x, Y1 + 74, HF.z, { seg: 36, col: COL.iron });
  K.cyl('brick', 8.5, 10.5, 52, HF.x, Y1 + 100, HF.z, { seg: 24, col: COL.brick2 });
  K.ring('iron', 9.2, 1.6, HF.x, Y1 + 152, HF.z, { lit: 1, seg: 24 });
  K.ring('iron', 12, 1, HF.x, Y1 + 120, HF.z, { seg: 24 });
  K.box('iron', 20, 22, 3, HF.x, Y1 + 8, HF.z - HF.r - 1, { lit: 1, col: COL.dark }); // 炉口
  K.box('stone', 26, 4, 8, HF.x, Y1 + 30, HF.z - HF.r - 2, { col: COL.stone2 });
  smoke.push({ x: HF.x, y: Y1 + 152, z: HF.z, n: 110, rise: 380, spread: 18, size: 46, period: 30, kind: 0, hot: 0.7 });
  embers.push({ x: HF.x, y: Y1 + 152, z: HF.z, n: 80, vy: 12, vh: 3, g: -0.05, period: 7, size: 2.4, jx: 10, jz: 10 });
  embers.push({ x: HF.x, y: Y1 + 10, z: HF.z - HF.r - 4, n: 60, vy: 6, vh: 5, g: 0.7, period: 1.8, size: 2, jx: 14 });
  halos.push({ x: HF.x, y: Y1 + 20, z: HF.z - HF.r - 10, size: 140, k: 0.6 });
  lights.push([HF.x, Y1 + 150, HF.z, 1]);
  // 热风炉：四座圆顶的高罐，热风管绕心炉一圈
  K.ring('iron', HF.r + 10, 2.6, HF.x, Y1 + 54, HF.z, { seg: 48, col: COL.rust });
  for (const sx of [-1, 1]) for (const d of [104, 146]) {
    const x = sx * d, z = HF.z + 18;
    K.cyl('iron', 12, 13, 60, x, Y1, z, { seg: 22, col: COL.rust });
    K.sphere('iron', 12, x, Y1 + 60, z, { half: true, col: COL.iron2 });
    for (let i = 0; i < 4; i++) K.ring('iron', 13.2, 0.8, x, Y1 + 8 + i * 15, z, { seg: 24 });
    K.cyl('iron', 1.8, 1.8, 14, x, Y1 + 72, z, { seg: 8 });
    K.tube('iron', [V(x, Y1 + 50, z), V(x * 0.8, Y1 + 56, z - 4), V(sx * (HF.r + 10), Y1 + 54, HF.z + 6)], 2.4, { col: COL.rust });
    K.box('stone', 30, 4, 30, x, Y1 - 2, z, { col: COL.stone2 });
  }
  // 心炉 → 西边的高架槽 → 台地边缘，伸出墙外形成瀑布
  K.box('iron', 12, 3, 18, HF.r + 6, Y1 + 4, HF.z, { col: COL.iron, lit: 0.5 });
  const flume1 = line([[HF.r + 10, HF.z], [180, HF.z], [180, -142]], Y1 + 6);
  trough(flume1, 9, 3.2, 3);
  for (let i = 0; i < 3; i++) K.box('stone', 4, 6, 14, 180, Y1 - 2, -128 - i * 5, { col: COL.stone2 }); // 托着出水口的牛腿
  addFall(V(180, Y1 + 7.8, -144), V(180, Y2 + 5.2, -165), 9);

  // 横跨火山口的吊桥：舀岩浆的大勺在上面来回
  const zCN = VC.z + CRATER.r + 18, yBridge = 700;
  for (const sx of [-1, 1]) {
    // 南腿：从熔心台立起来的 A 字钢塔
    for (const dz of [-14, 14]) K.beam('iron', V(sx * 52, Y1, -6 + dz), V(sx * 14, yBridge, -6), 6, { col: COL.iron2 });
    for (let h = 40; h < yBridge - Y1; h += 38) { const f = h / (yBridge - Y1), x0 = sx * (52 - 38 * f); K.beam('iron', V(x0, Y1 + h, -20 + 14 * f), V(x0, Y1 + h, 8 - 14 * f), 2.5); K.beam('iron', V(x0, Y1 + h, -6), V(x0 - sx * 10, Y1 + h + 38, -6), 2); }
    const gN = ground(sx * 20, zCN);
    K.beam('iron', V(sx * 30, gN - 4, zCN), V(sx * 14, yBridge, zCN - 6), 6, { col: COL.iron2 });
    K.box('stone', 22, 10, 22, sx * 30, gN - 6, zCN, { col: COL.stone2 });
    // 桥梁：两根箱梁 + 斜撑
    K.box('iron', 4, 9, zCN + 6, sx * 10, yBridge, (zCN - 6) / 2 - 3, { col: COL.iron });
    K.box('iron', 1.2, 1.2, zCN + 6, sx * 10, yBridge + 22, (zCN - 6) / 2 - 3, { col: COL.iron2 });
    for (let z = -6; z < zCN - 6; z += 20) { K.beam('iron', V(sx * 10, yBridge + 9, z), V(sx * 10, yBridge + 22, z + 10), 1.1); K.beam('iron', V(sx * 10, yBridge + 22, z + 10), V(sx * 10, yBridge + 9, z + 20), 1.1); }
  }
  for (let z = -6; z < zCN - 6; z += 40) K.box('iron', 22, 2, 2, 0, yBridge + 21, z, { col: COL.iron2 });
  // 大勺（会动）
  {
    const trolley = new THREE.Group(); trolley.position.set(0, yBridge, 200);
    const KT = new Kit();
    KT.box('iron', 26, 8, 16, 0, -2, 0, { col: COL.rust });
    for (const sx of [-1, 1]) KT.cyl('iron', 3, 3, 4, sx * 10, 5, 0, { rz: Math.PI / 2, seg: 12, col: COL.iron2 });
    for (const m of KT.build(mats)) { ensureAttrs(m.geometry); m.castShadow = true; trolley.add(m); }
    const cables = [];
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, -0.5, 0), mats.iron); ensureAttrs(c.geometry); c.position.set(sx * 7, -2, 0); trolley.add(c); cables.push(c); }
    const ladle = new THREE.Group();
    const KL = new Kit();
    KL.lathe('iron', [[0, -14], [9, -13], [12, -6], [13, 4], [13.6, 5], [12.4, 5.2], [11.6, -5], [0, -12]], 0, 0, 0, { col: COL.iron });
    KL.ring('iron', 13.4, 1.1, 0, 0, 0, { col: COL.rust, seg: 30 });
    for (const sx of [-1, 1]) { KL.cyl('iron', 1.6, 1.6, 3, sx * 14, 0, 0, { rz: Math.PI / 2, col: COL.bronze, seg: 10 }); KL.beam('iron', V(sx * 14.5, 0, 0), V(sx * 7, 22, 0), 1.6, { col: COL.iron2 }); }
    KL.box('iron', 16, 2, 2, 0, 22, 0);
    KL.box('iron', 5, 3, 6, 0, 3, -13.5, { col: COL.iron2 }); // 倾倒嘴
    for (const m of KL.build(mats)) { ensureAttrs(m.geometry); m.castShadow = true; ladle.add(m); }
    const fill = new THREE.Mesh(lavaDisc(0, 3, 0, 11.6, 0.3, 24, 3), lava); ladle.add(fill);
    const stream = new THREE.Mesh(ribbon([{ x: 0, y: 3, z: -15 }, { x: 0, y: -10, z: -18 }, { x: 0, y: -40, z: -19 }], 3.2, 14, { cross: 2 }), lavaFall);
    stream.visible = false; ladle.add(stream);
    trolley.add(ladle);
    root.add(trolley);
    anim.ladle = { trolley, ladle, cables, stream, fill, zLake: 200, zPour: 12, yUp: 620, yLake: CRATER.lake + 10, yPour: Y1 + 50 };
  }

  /* ---------- 熔心台 → 大厅的挡土墙（带一排炉膛拱门） ---------- */
  const retaining = (zc, yTop, yBot, L, seed) => {
    const H = yTop - yBot + 3, Rr = rng(seed), arches = [], fills = [];
    const n = Math.floor(L / 30);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      if (Math.abs(x - 180) < 16 || Math.abs(x) < 16 && zc < -500) continue;  // 瀑布处不开门
      const big = i % 3 === 1; arches.push({ x, w: big ? 18 : 13, h: big ? 44 : 30, y0: 0 });
      fills.push([x, big ? 18 : 13, big ? 44 : 30, Rr() < 0.55 ? Rr.range(0.45, 1) : 0]);
      if (H > 80) { arches.push({ x, w: 7, h: 16, y0: H - 34 }); fills.push([x, 7, 16, Rr() < 0.4 ? 0.7 : 0, H - 34]); }
    }
    K.archWall('stone', L, H, 14, 0, yBot, zc, 0, arches, COL.stone);
    for (const [x, w, h, lit, y0] of fills) {
      archFill(K, x, yBot + (y0 || 0), zc - 7, w, h, 6, lit);
      if (lit > 0.7 && !y0) { smoke.push({ x, y: yBot + h, z: zc - 9, n: 10, rise: 60, spread: 6, size: 14, period: 10, kind: 0, hot: 0.8 }); halos.push({ x, y: yBot + h * 0.5, z: zc - 16, size: 90, k: 0.35 }); }
    }
    // 扶壁与墙顶的护墙
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + i * (L / n); if (Math.abs(x - 180) < 12) continue;
      K.box('stone', 7, H - 6, 9, x, yBot, zc - 11, { col: COL.stone2 });
      K.box('stone', 7, 6, 6, x, yBot + H - 6, zc - 9, { rx: -0.5, col: COL.stone2 });
    }
    K.box('stone', L, 2.2, 16, 0, yBot + H - 0.5, zc, { col: COL.stone2 });
    for (let x = -L / 2 + 3; x < L / 2; x += 7) K.box('stone', 3.5, 2.4, 2, x, yBot + H + 1.5, zc - 6.5, { col: COL.stone });
    heat.splat(0, yBot + 20, zc - 10, 1, 0);
  };
  retaining(zOf(T1.u1 + 8), Y1, Y2, 410, 11);
  retaining(zOf(T2.u1 + 8), Y2, Y3, 460, 12);
  retaining(zOf(T3.u1 + 8), Y3, Y4, 420, 13);

  /* ---------- 锻造大厅（Y2 = 360） ---------- */
  const HL = { x0: -150, x1: 150, zN: -205, zS: -305, h: 46 };
  const hx = (HL.x0 + HL.x1) / 2, hz = (HL.zN + HL.zS) / 2, hw = HL.x1 - HL.x0, hd = HL.zN - HL.zS;
  K.box('stone', hw + 12, 4, hd + 12, hx, Y2 - 2, hz, { col: COL.stone2 });
  {
    const bays = 12, arches = [];
    for (let i = 0; i < bays; i++) arches.push({ x: -hw / 2 + (i + 0.5) * hw / bays, w: 13, h: 32, y0: 6 });
    K.archWall('brick', hw, HL.h, 4, hx, Y2, HL.zS, 0, arches, COL.brick);
    for (let i = 0; i < bays; i++) {
      const x = hx - hw / 2 + (i + 0.5) * hw / bays, lit = R() < 0.82 ? R.range(0.35, 0.75) : 0;
      archFill(K, x, Y2 + 6, HL.zS, 13, 32, 1.6, lit);
      K.box('stone', 15, 1.5, 3, x, Y2 + 5, HL.zS - 2, { col: COL.stone });
    }
    for (let i = 0; i <= bays; i++) {
      const x = hx - hw / 2 + i * hw / bays;
      K.box('stone', 6, HL.h + 6, 9, x, Y2, HL.zS - 5, { col: COL.stone2 });
      K.box('stone', 6, 8, 6, x, Y2 + HL.h + 2, HL.zS - 4, { rx: -0.45, col: COL.stone2 });
      K.box('stone', 2.4, 10, 2.4, x, Y2 + HL.h + 6, HL.zS - 5, { col: COL.stone });
    }
  }
  K.box('brick', hw, HL.h, 4, hx, Y2, HL.zN, { col: COL.brick2 });
  for (const sx of [-1, 1]) K.box('brick', 4, HL.h, hd, sx > 0 ? HL.x1 : HL.x0, Y2, hz, { col: COL.brick2 });
  // 西端（+x）的大圆窗：一只发光的眼睛
  {
    const x = HL.x1 + 2.5, y = Y2 + 28, z = hz;
    K.ring('iron', 17, 2.4, x, y, z, { rx: 0, ry: Math.PI / 2, col: COL.bronze, seg: 40 });
    K.ring('iron', 7, 1.4, x + 0.4, y, z, { rx: 0, ry: Math.PI / 2, col: COL.bronze, seg: 24 });
    K.cyl('iron', 16, 16, 0.6, x - 0.8, y, z, { rz: Math.PI / 2, lit: 0.85, col: COL.dark, seg: 32 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box('iron', 1, 17, 1.2, x + 0.6, y + Math.sin(a) * 0, z, { rx: a, col: COL.bronze }); }
    K.box('stone', 3, 8, 50, x + 1, Y2 + HL.h, z, { col: COL.stone2 });
  }
  // 锯齿屋顶：五道，朝北的玻璃面透出炉光；有一段塌了
  for (let i = 0; i < 5; i++) {
    const z0 = HL.zS + i * 20, slope = Math.atan2(14, 20), L = Math.hypot(14, 20);
    for (let s = 0; s < 6; s++) {
      const x = hx - hw / 2 + (s + 0.5) * hw / 6;
      if (i === 2 && s === 4) { K.box('iron', hw / 6, 0.8, L, x + 6, Y2 + HL.h - 3, z0 + 10, { rx: -slope * 0.3, rz: 0.4, col: COL.rust }); continue; } // 塌下去的一块
      K.box('iron', hw / 6 - 0.4, 0.8, L, x, Y2 + HL.h, z0 + 10, { rx: -slope, col: i % 2 ? COL.iron : COL.rust });
      K.box('iron', hw / 6 - 0.4, 14, 0.5, x, Y2 + HL.h, z0 + 20, { lit: R() < 0.75 ? R.range(0.12, 0.3) : 0, col: COL.glass });
      K.box('iron', 0.8, 14, 0.9, x - hw / 12, Y2 + HL.h, z0 + 20, { col: COL.iron });
    }
  }
  embers.push({ x: hx + 50, y: Y2 + HL.h, z: HL.zS + 50, n: 40, vy: 8, vh: 2, g: -0.06, period: 8, size: 2, jx: 20, jz: 14 }); // 屋顶破洞冒出的火星
  smoke.push({ x: hx + 50, y: Y2 + HL.h, z: HL.zS + 50, n: 26, rise: 150, spread: 12, size: 30, period: 18, kind: 0, hot: 0.9 });
  // 五根烟囱
  const chimH = [150, 176, 194, 172, 146];
  for (let i = 0; i < 5; i++) {
    const x = -140 + i * 70, z = -172, h = chimH[i];
    K.box('stone', 28, 14, 28, x, Y2, z, { col: COL.stone2 });
    K.cyl('brick', 7.5, 11.5, h, x, Y2 + 14, z, { seg: 22, col: i % 2 ? COL.brick : COL.brick2 });
    for (let k = 1; k < h / 24; k++) K.ring('iron', 11.5 - 4 * (k * 24 / h) + 0.4, 0.7, x, Y2 + 14 + k * 24, z, { seg: 24 });
    K.ring('iron', 8.3, 1.4, x, Y2 + 14 + h, z, { lit: 1, seg: 24 });
    K.box('iron', 2, 2, 22, x + 9, Y2 + 14 + h * 0.6, z, { col: COL.iron }); // 检修平台
    K.box('brick', 9, 9, 26, x, Y2 + 2, z - 22, { col: COL.brick2 });      // 烟道
    smoke.push({ x, y: Y2 + 16 + h, z, n: 130, rise: 420 + i * 30, spread: 16, size: 44, period: 34, kind: 0, hot: 0.55 });
    embers.push({ x, y: Y2 + 14 + h, z, n: 36, vy: 14, vh: 3, g: -0.04, period: 7, size: 2.2, jx: 8, jz: 8 });
    lights.push([x, Y2 + 14 + h, z, 0.7]);
  }
  // 大厅东端（-x）墙上的齿轮组（会转）
  {
    const g1 = gear(mats, 26, 28, 6); g1.position.set(HL.x0 - 4.5, Y2 + 26, hz + 10); g1.rotation.y = Math.PI / 2; root.add(g1);
    const g2 = gear(mats, 13, 14, 5); g2.position.set(HL.x0 - 4.5, Y2 + 26 + 26, hz + 10 - 29); g2.rotation.y = Math.PI / 2; root.add(g2);
    const g3 = gear(mats, 9, 10, 4); g3.position.set(HL.x0 - 4.5, Y2 + 12, hz - 28); g3.rotation.y = Math.PI / 2; root.add(g3);
    anim.gears.push({ g: g1, w: 0.12 }, { g: g2, w: -0.12 * 26 / 13 }, { g: g3, w: -0.12 * 26 / 9 * 0.6 });
    K.box('iron', 2, 70, 70, HL.x0 - 2.5, Y2, hz - 5, { col: COL.iron });
  }
  // 汽锤
  {
    const x = -200, z = -255;
    for (const dz of [-14, 14]) K.box('iron', 6, 52, 6, x, Y2, z + dz, { col: COL.iron2 });
    K.box('iron', 10, 7, 36, x, Y2 + 50, z, { col: COL.rust });
    K.cyl('iron', 5, 5, 16, x, Y2 + 57, z, { col: COL.iron, seg: 14 });
    K.box('stone', 18, 5, 20, x, Y2, z, { col: COL.stone2 });
    K.box('iron', 9, 2, 5, x, Y2 + 5, z, { lit: 1, col: COL.dark });   // 烧红的锭
    const ram = new THREE.Group(); ram.position.set(x, Y2 + 30, z);
    const KR = new Kit(); KR.box('iron', 10, 12, 14, 0, 0, 0, { col: COL.iron }); KR.cyl('iron', 2, 2, 22, 0, 12, 0, { col: COL.bronze, seg: 10 });
    for (const m of KR.build(mats)) { ensureAttrs(m.geometry); m.castShadow = true; ram.add(m); }
    root.add(ram); anim.hammer = { ram, y0: Y2 + 7, y1: Y2 + 34 };
    embers.push({ x, y: Y2 + 7, z, n: 90, vy: 10, vh: 16, g: 1, period: 1.6, size: 2.2, jx: 4, jz: 2 });
    halos.push({ x, y: Y2 + 10, z, size: 90, k: 0.5 });
  }
  // 大厅西侧的熔岩槽
  pool(180, Y2, -165, 13);
  trough(line([[180, -180], [180, -362]], Y2 + 2), 10, 3.4);
  for (let i = 0; i < 3; i++) K.box('stone', 4, 6, 14, 180, Y2 - 2, -348 - i * 5, { col: COL.stone2 });
  addFall(V(180, Y2 + 4.2, -364), V(180, Y3 + 5.2, -384), 10);
  // 侧面的小屋、木架、管道
  for (let i = 0; i < 4; i++) {
    const x = R.range(-120, 120), z = R.range(-330, -316), w = R.range(10, 18);
    K.box('stone', w, R.range(6, 10), 8, x, Y2, z, { col: COL.stone });
  }

  /* ---------- 浇铸场（Y3 = 235） ---------- */
  pool(180, Y3, -386, 13);
  trough(line([[180, -401], [175, -430], [130, -470], [60, -516], [0, -540], [0, -577]], Y3 + 2), 9, 3.2);
  addFall(V(0, Y3 + 3.9, -579), V(0, Y4 + 5.2, -600), 10);
  // 铸模：一格格冷却中的铁锭，有的还红着
  for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) {
    const x = -185 + c * 14, z = -398 - r * 16, lit = R() < 0.6 ? Math.pow(R(), 0.7) : 0;
    K.box('iron', 10, 2, 6, x, Y3, z, { col: COL.iron });
    K.box('iron', 8, 0.4, 4, x, Y3 + 2, z, { lit: lit > 0.1 ? lit : 2, col: lit > 0.1 ? COL.dark : COL.iron2 });
    if (lit > 0.7) heat.splat(x, Y3 + 2, z, 14, 0.5);
  }
  for (const x of [-200, -10]) K.box('iron', 2, 1, 150, x, Y3, -460, { col: COL.iron2 });
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group(); g.position.set(-105, Y3, -420 - i * 70);
    const KG = new Kit();
    for (const sx of [-1, 1]) { KG.box('iron', 4, 34, 4, sx * 95, 0, -4, { col: COL.rust }); KG.box('iron', 4, 34, 4, sx * 95, 0, 4, { col: COL.rust }); KG.beam('iron', V(sx * 95, 2, -4), V(sx * 95, 30, 4), 1.4); }
    KG.box('iron', 196, 5, 5, 0, 32, -3, { col: COL.iron2 }); KG.box('iron', 196, 5, 5, 0, 32, 3, { col: COL.iron2 });
    KG.box('iron', 12, 7, 12, 0, 28, 0, { col: COL.bronze });
    for (const m of KG.build(mats)) { ensureAttrs(m.geometry); m.castShadow = true; g.add(m); }
    const hook = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), mats.iron); ensureAttrs(hook.geometry); hook.position.set(0, 14, 0); g.add(hook);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 6).translate(0, 7, 0), mats.iron); ensureAttrs(cable.geometry); cable.position.set(0, 14, 0); g.add(cable);
    root.add(g); anim.cranes.push({ g, z0: -405, z1: -480, ph: i * 2.7, hook, cable, x: 0 });
  }
  // 冷却塔
  for (const [x, z, r] of [[176, -500, 30], [-172, -522, 25]]) {
    const h = r * 3;
    K.lathe('concrete', [[r, 0], [r * 0.86, h * 0.35], [r * 0.64, h * 0.72], [r * 0.66, h * 0.86], [r * 0.72, h], [r * 0.69, h], [r * 0.62, h * 0.86], [r * 0.6, h * 0.72], [r * 0.82, h * 0.35], [r * 0.95, 0]], x, Y3 - 1, z, { seg: 40 });
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.beam('concrete', V(x + Math.cos(a) * r * 1.02, Y3 - 1, z + Math.sin(a) * r * 1.02), V(x + Math.cos(a + 0.2) * r * 0.98, Y3 + 9, z + Math.sin(a + 0.2) * r * 0.98), 1.8, { col: COL.concrete }); }
    smoke.push({ x, y: Y3 + h, z, n: 160, rise: 260, spread: r * 0.5, size: r * 1.6, period: 26, kind: 1, hot: 0.25, jx: r, jz: r });
  }
  // 倒下的烟囱：从基座处折断，砸进铸模区边上
  {
    const x0 = 95, z0 = -404;
    K.box('stone', 26, 12, 26, x0, Y3, z0, { col: COL.stone2 });
    K.cyl('brick', 10, 11, 34, x0, Y3 + 12, z0, { seg: 20, col: COL.brick2 });
    K.cyl('brick', 9, 10, 8, x0 + 2, Y3 + 44, z0 + 1, { seg: 20, col: COL.brick, rz: 0.35 });
    const dir = Math.atan2(-60, -40), segs = [[44, 0.06], [38, -0.08], [30, 0.14]];
    let d = 20;
    for (const [len, tw] of segs) {
      const cx = x0 + Math.sin(dir) * (d + len / 2), cz = z0 + Math.cos(dir) * (d + len / 2);
      K.b.brick.add(new THREE.CylinderGeometry(8.5, 9.5, len, 18).rotateX(Math.PI / 2), mat(cx, Y3 + 6, cz, dir + tw, 0.03, 0.1), COL.brick);
      for (let k = 0; k < 2; k++) K.b.iron.add(new THREE.TorusGeometry(9.6, 0.6, 6, 22), mat(cx + Math.sin(dir) * (k - 0.5) * len * 0.6, Y3 + 6, cz + Math.cos(dir) * (k - 0.5) * len * 0.6, dir + tw), COL.iron);
      d += len + 5;
    }
    for (let i = 0; i < 26; i++) K.box('brick', R.range(1.5, 4), R.range(1, 2.5), R.range(1.5, 4), x0 + R.range(-60, 20), Y3, z0 + R.range(-90, -10), { ry: R() * 3, col: COL.brick });
  }

  /* ---------- 守门台（Y4 = 135） ---------- */
  pool(0, Y4, -602, 13);
  trough(line([[0, -617], [0, -742]], Y4 + 2), 11, 3.2);
  addLava(line([[0, -742], [0, -762]], Y4 - 2.5), 20, 3, { cross: 4 });
  {
    const z = -720;
    for (const sx of [-1, 1]) {
      const x = sx * 34;
      K.box('stone', 30, 86, 34, x, Y4, z, { col: COL.stone });
      K.box('stone', 34, 6, 38, x, Y4 + 86, z, { col: COL.stone2 });
      K.cyl('stone', 0.5, 17, 22, x, Y4 + 92, z, { seg: 4, ry: Math.PI / 4, col: COL.stone2 });
      for (let k = 0; k < 4; k++) K.box('iron', 2.2, 10, 1, x, Y4 + 20 + k * 16, z - 17.2, { lit: 0.8, col: COL.dark });
      for (let k = 0; k < 5; k++) K.box('stone', 32, 1.6, 36, x, Y4 + 10 + k * 16, z, { col: COL.stone2 });
    }
    K.archWall('stone', 40, 30, 30, 0, Y4 + 56, z, 0, [], COL.stone);
    K.box('iron', 40, 3, 32, 0, Y4 + 56, z, { lit: 0.5, col: COL.dark });
    K.ring('iron', 9, 1.6, 0, Y4 + 72, z - 15.5, { rx: 0, col: COL.bronze, lit: 0.8, seg: 30 });
    K.cyl('iron', 4, 4, 1, 0, Y4 + 72, z - 15.2, { rx: Math.PI / 2, col: COL.dark, lit: 1, seg: 20 });
    halos.push({ x: 0, y: Y4 + 30, z: z - 20, size: 200, k: 0.6 });
  }
  for (const sx of [-1, 1]) {
    const gd = guardian(mats, R); gd.position.set(sx * 108, Y4, -690); gd.rotation.y = sx * 0.12; root.add(gd); anim.eyes.push(gd);
    K.box('stone', 66, 4, 70, sx * 108, Y4 - 2, -690, { col: COL.stone2 });
    lights.push([sx * 108, Y4 + 72, -702, 0.6]);
  }
  // 筒仓
  for (let i = 0; i < 3; i++) {
    const x = -150, z = -605 - i * 26;
    K.cyl('iron', 10, 10, 42, x, Y4, z, { seg: 20, col: i === 1 ? COL.rust : COL.iron2 });
    K.cyl('iron', 1, 10, 9, x, Y4 + 42, z, { seg: 20, col: COL.iron });
    for (let k = 0; k < 3; k++) K.ring('iron', 10.4, 0.6, x, Y4 + 8 + k * 12, z, { seg: 24 });
  }

  /* ---------- 东侧的管束：从热风炉一路沿着台地下到筒仓，中间一根是透着熔岩的玻璃管 ---------- */
  {
    const xs = [-176, -184, -192], tubes = [];
    for (let k = 0; k < 3; k++) {
      const x = xs[k], y = 8 + k * 1.2;
      const pts = [V(-150, Y1 + 40, HF.z + 18), V(x, Y1 + y + 2, HF.z + 18), V(x, Y1 + y, -100), V(x, Y1 + y, -137), V(x, Y1 - 10, -142), V(x, Y2 + y + 6, -142), V(x, Y2 + y, -150),
        V(x, Y2 + y, -355), V(x, Y2 - 10, -360), V(x, Y3 + y + 6, -360), V(x, Y3 + y, -368), V(x, Y3 + y, -570), V(x, Y3 - 10, -575), V(x, Y4 + y + 6, -575), V(x, Y4 + y, -583), V(x, Y4 + y, -628), V(-150, Y4 + 30, -631)];
      tubes.push(pts);
      if (k === 1) {
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), L = curve.getLength();
        const tg = new THREE.TubeGeometry(curve, Math.ceil(L / 3), 2.4, 10, false), uv = tg.attributes.uv, aL = new Float32Array(uv.count * 4);
        for (let i = 0; i < uv.count; i++) aL.set([uv.getY(i) * 15, uv.getX(i) * L, 0.62, 5], i * 4);
        tg.setAttribute('aL', new THREE.BufferAttribute(aL, 4)); lavaGeos.push(tg);
        for (let s = 0; s < L; s += 12) { const p = curve.getPointAt(s / L), t = curve.getTangentAt(s / L); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), t, new THREE.Vector3(0, 1, 0.001)); m.setPosition(p); K.b.iron.add(new THREE.TorusGeometry(2.6, 0.5, 5, 12), m, COL.iron); }
        for (let s = 0; s < L; s += 10) { const p = curve.getPointAt(s / L); heat.splat(p.x, p.y, p.z, 14, 0.45); }
      } else {
        const curve = K.tube('iron', pts, 3, { col: k ? COL.iron2 : COL.rust, step: 3 }), L = curve.getLength();
        for (let s = 0; s < L; s += 24) { const p = curve.getPointAt(s / L), t = curve.getTangentAt(s / L); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), t, new THREE.Vector3(0, 1, 0.001)); m.setPosition(p); K.b.iron.add(new THREE.TorusGeometry(3.4, 0.7, 6, 14), m, COL.iron2, 0, 0, (s / 24) % 3 === 0 ? 0.8 : 2); }
      }
    }
    // 支架
    for (const [z0, z1, y] of [[HF.z + 18, -137, Y1], [-150, -355, Y2], [-368, -570, Y3], [-583, -628, Y4]]) for (let z = z0; z > z1; z -= 16) {
      K.box('iron', 22, 6, 2, -184, y + 6, z, { col: COL.iron2 });
      for (const x of [-174, -194]) K.box('iron', 1.6, 7, 1.6, x, y, z, { col: COL.iron });
    }
  }

  /* ---------- 熔岩河与熔岩湖 ---------- */
  lavaGeos.push(ribbon(RIVER.pts.map(p => ({ x: p.x, y: p.y - 0.4, z: p.z })), t => 2 * (RIVER.pts[Math.round(t * (RIVER.pts.length - 1))].w) + 12, 2.6, { cross: 10 }));
  heat.splatPath(RIVER.pts.map(p => ({ x: p.x, y: p.y, z: p.z })), 60, 1);
  for (let i = 0; i < RIVER.pts.length; i += 12) { const p = RIVER.pts[i]; embers.push({ x: p.x, y: p.y, z: p.z, n: 26, vy: 5, vh: 2, g: -0.02, period: 7, size: 2.2, jx: 18, jz: 18 }); if (i % 24 === 0) smoke.push({ x: p.x, y: p.y + 2, z: p.z, n: 14, rise: 110, spread: 14, size: 26, period: 16, kind: 0, hot: 1, jx: 20, jz: 20 }); lights.push([p.x, p.y, p.z, 0.9]); halos.push({ x: p.x, y: p.y + 14, z: p.z, size: 220, k: 0.28 }); }
  lavaGeos.push(lavaDisc(LAKE.x, LAKE.y + 0.5, LAKE.z, LAKE.r + 110, 0.3, 80, 14, 1.1));
  for (let r = 0; r < LAKE.r; r += 22) for (let a = 0; a < 6.28; a += 0.45) heat.splat(LAKE.x + Math.cos(a) * r, LAKE.y, LAKE.z + Math.sin(a) * r, 60, 1);
  embers.push({ x: LAKE.x, y: LAKE.y + 1, z: LAKE.z, n: 240, vy: 9, vh: 4, g: 0.7, period: 3, size: 2.8, jx: 220, jz: 220 });
  smoke.push({ x: LAKE.x, y: LAKE.y + 2, z: LAKE.z, n: 120, rise: 300, spread: 40, size: 60, period: 30, kind: 0, hot: 1, jx: 240, jz: 240 });
  halos.push({ x: LAKE.x, y: LAKE.y + 40, z: LAKE.z, size: 800, k: 0.7 });
  lights.push([LAKE.x, LAKE.y, LAKE.z, 1.5], [LAKE.x + 70, LAKE.y, LAKE.z - 40, 1]);
  // 湖边的冷却闸：熔岩湖北岸一道锈蚀的半圆坝
  {
    const a0 = 1.9, a1 = 2.8;
    for (let a = a0; a < a1; a += 0.09) {
      const x = LAKE.x + Math.cos(a) * (LAKE.r + 4), z = LAKE.z + Math.sin(a) * (LAKE.r + 4), y = ground(x, z);
      K.box('stone', 14, LAKE.y + 12 - y + 6, 8, x, y - 4, z, { ry: -a + Math.PI / 2, col: COL.stone2 });
      if (Math.round(a * 100) % 3 === 0) K.box('iron', 3, 24, 3, x, LAKE.y + 6, z, { col: COL.rust });
    }
  }

  /* ---------- 西侧裂隙 ---------- */
  addLava(FISS.pts.map(p => ({ x: p.x, y: p.y - 0.6, z: p.z })), 8, 1.4, { cross: 3 });
  for (const [x, z, big] of [[780, 60, 1], [873, -150, 1], [650, 300, 0], [720, 180, 0], [910, -240, 0]]) {
    const y = ground(x, z);
    embers.push({ x, y: y - 2, z, n: big ? 420 : 120, vy: big ? 58 : 30, vh: big ? 8 : 5, g: 1, period: big ? 6 : 4, size: big ? 5 : 3.5, jx: 6, jz: 6 });
    smoke.push({ x, y: y + 4, z, n: big ? 120 : 40, rise: big ? 420 : 200, spread: 24, size: big ? 60 : 36, period: 26, kind: 0, hot: 1 });
    halos.push({ x, y: y + 30, z, size: big ? 520 : 220, k: big ? 0.85 : 0.5 });
    lights.push([x, y, z, big ? 1.2 : 0.6]);
  }
  for (let i = 0; i < FISS.pts.length; i += 10) { const p = FISS.pts[i]; lights.push([p.x, p.y, p.z, 0.45]); }

  /* ---------- 达纳基尔：彩色酸池与蒸汽 ---------- */
  const poolMats = [0x2fb8a4, 0x7fc43c, 0x3fa890, 0x9ccf3a, 0x4fbf7a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.08, metalness: 0.15, emissive: new THREE.Color(c).multiplyScalar(0.06) }));
  for (const md of MOUNDS) {
    const y = ground(md.x, md.z) + 0.45, r = md.r * 0.36;
    const g = new THREE.CircleGeometry(r, 36); g.rotateX(-Math.PI / 2);
    { const p = g.attributes.position, ph = R() * 6; for (let i = 1; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 0.78 + 0.16 * Math.sin(a * 3 + ph) + 0.08 * Math.sin(a * 7 + ph * 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
    g.translate(md.x, y, md.z);
    const m = new THREE.Mesh(g, poolMats[Math.floor(R() * poolMats.length)]); m.receiveShadow = true; root.add(m);
    if (md.r > 35) smoke.push({ x: md.x, y: y + 1, z: md.z, n: 10, rise: 50 + md.h * 3, spread: 8, size: 11, period: 12, kind: 1, hot: 0, jx: r, jz: r });
    for (let k = 0; k < 4; k++) { const a = R() * 6.28, d = md.r * R.range(0.5, 1), x = md.x + Math.cos(a) * d, z = md.z + Math.sin(a) * d; K.cyl('stone', 0.6, R.range(1.8, 3.5), R.range(3, 7), x, ground(x, z) - 0.5, z, { seg: 7, col: R() < 0.5 ? C(0xc66a2a) : C(0xd8c23a) }); }
  }
  // 北坡火渣锥与喷气孔
  for (const [x, z, n] of [[-640, 1000, 60], [560, 1080, 40], [-300, 700, 16], [300, 640, 16], [180, 900, 12]]) smoke.push({ x, y: ground(x, z) + 2, z, n, rise: 200, spread: 16, size: 30, period: 22, kind: 1, hot: 0, jx: 30, jz: 30 });

  /* ---------- 合并 ---------- */
  const meshes = K.build(mats);
  for (const o of root.children) if (o.isGroup) heat.applyGroup(o);
  for (const m of meshes) { heat.apply(m.geometry); m.castShadow = true; m.receiveShadow = true; root.add(m); }
  const norm = g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'aL'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
  const lavaMesh = new THREE.Mesh(mergeGeometries(lavaGeos.map(norm)), lava); root.add(lavaMesh);
  const fallMesh = new THREE.Mesh(mergeGeometries(fallGeos.map(norm)), lavaFall); root.add(fallMesh);

  return { smoke, embers, halos, lights, anim, mats, lava };
}
