// 火山熔炉区的地理骨架：火山锥、南坡上被切出来的四级工厂台地、岩浆河、熔岩湖、西侧冰岛式苔原熔岩场与裂隙、东侧达纳基尔式硫磺泉。
//
// 局部坐标：+z 北，+x 西（和城市一致）。火山口在 (0, 260)，工厂沿南坡一路往下（-z 方向）。
// u = 火山口中心往南的距离，v = x：两者合起来描述工厂所在的「豁口」。
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, noise } from '../../util.js';

export const VC = { x: 0, z: 260 };
export const CRATER = { r: 228, floor: 512, lake: 528 };
/** 四级台地：u0..u1 是平台（沿 u），y 是平台海拔，hw 是半宽。每级之间是 16 米宽的挡土墙带 */
export const TER = [
  { id: 'crown', name: '熔心台', u0: 232, u1: 380, y: 470, hw: 190 },
  { id: 'hall', name: '锻造大厅', u0: 396, u1: 600, y: 360, hw: 235 },
  { id: 'cast', name: '浇铸场', u0: 616, u1: 815, y: 235, hw: 225 },
  { id: 'gate', name: '守门台', u0: 831, u1: 1010, y: 135, hw: 175 }
];
export const WALL = 16;
export const zOf = u => VC.z - u;
export const SPILL = 524;   // 火山口南侧豁口的槽底

/* ---------- 熔岩河：守门台出口 → 南面熔岩湖 ---------- */
export const LAKE = { x: 420, z: -1010, r: 135, y: 30 };
const RIVER_KEYS = [[0, -760], [12, -815], [-20, -870], [-6, -918], [52, -955], [140, -976], [220, -984], [292, -1000]];
/** 西侧裂隙：从北往南的一道裂缝，缝里是熔岩，沿线有喷泉 */
export const FISSURE = [[570, 470], [650, 300], [730, 160], [800, 20], [860, -120], [930, -280]];
/** 北坡两座老的火渣锥 */
export const CONES = [{ x: -640, z: 1000, r: 170, h: 120 }, { x: 560, z: 1080, r: 140, h: 90 }, { x: 780, z: 60, r: 55, h: 26 }, { x: 873, z: -150, r: 45, h: 20 }];
/** 达纳基尔：硫磺泉丘（x 负方向是东） */
export const DANAKIL = { x: -860, z: -640, r: 380 };
export const MOUNDS = (() => {
  const out = [], pts = [[-760, -260, 70, 16], [-880, -200, 55, 12], [-960, -330, 64, 15], [-820, -420, 48, 10], [-700, -380, 40, 9], [-1010, -460, 52, 11],
    [-900, -520, 36, 8], [-1080, -250, 44, 9], [-760, -120, 38, 8], [-640, -250, 30, 7], [-1120, -380, 34, 7], [-980, -140, 30, 6], [-850, -620, 30, 6], [-700, -520, 26, 6]];
  for (const [x, z, r, h] of pts) out.push({ x, z: z - 310, r, h });
  return out;
})();

/** Catmull-Rom 采样一条平面折线，返回 [{x,z,s}]（s 为累计弧长） */
export function samplePath(keys, step = 6) {
  const curve = new THREE.CatmullRomCurve3(keys.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step)), out = [];
  let s = 0, prev = null;
  for (let i = 0; i <= n; i++) { const p = curve.getPointAt(i / n); if (prev) s += Math.hypot(p.x - prev.x, p.z - prev.z); out.push({ x: p.x, z: p.z, s }); prev = p; }
  return out;
}

/* ---------- 天然地形（还没切台地、没刻河道） ---------- */
function volcanoNat(x, z) {
  const dx = x - VC.x, dz = z - VC.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const n = fbm(x * 0.0011 + 7, z * 0.0011 - 3, 4), n2 = fbm(x * 0.004 - 2, z * 0.004 + 5, 3);
  let h = 34 + 46 * n + 10 * n2;
  // 火山锥：下凹的锥面
  const k = Math.max(0, 1 - r / 1380);
  h += 790 * Math.pow(k, 1.7);
  // 放射状的冲沟与老熔岩脊
  const g = Math.abs(Math.sin(a * 13 + n * 7 + r * 0.0016));
  h += (g * 34 - 18) * smooth(250, 480, r) * smooth(1350, 650, r) * (0.6 + n2);
  // 火山口
  const rim = smooth(CRATER.r + 60, CRATER.r - 6, r);
  h = lerp(h, lerp(CRATER.floor, h + 22, smooth(110, CRATER.r, r)), rim);
  h += 22 * Math.exp(-(((r - CRATER.r - 8) / 34) ** 2));
  // 北坡火渣锥
  for (const c of CONES) {
    const d = Math.hypot(x - c.x, z - c.z); if (d > c.r * 1.6) continue;
    const cone = c.h * smooth(c.r * 1.5, c.r * 0.25, d) - c.h * 0.45 * smooth(c.r * 0.32, c.r * 0.05, d);
    h += cone;
  }
  return h;
}

/** 西侧熔岩场的粗糙起伏：冰岛那种被苔藓盖住的坑坑洼洼的熔岩 */
function lavaFieldBump(x, z) {
  const w = smooth(330, 620, x) * smooth(1600, 1300, Math.abs(z));
  if (w <= 0) return 0;
  const r = 1 - Math.abs(fbm(x * 0.018, z * 0.018, 3) * 2 - 1);
  return w * (r * r * 11 + fbm(x * 0.07, z * 0.07, 2) * 3 - 4);
}

/* ---------- 台地剖面 ---------- */
function halfWidth(u) {
  if (u < 250) return lerp(46, TER[0].hw, smooth(226, 250, u));
  for (let i = 0; i < TER.length; i++) {
    const t = TER[i], nx = TER[i + 1];
    if (u <= t.u1 || !nx) return t.hw;
    if (u < nx.u0) return lerp(t.hw, nx.hw, smooth(t.u1, nx.u0, u));
  }
  return TER[TER.length - 1].hw;
}
/** 沿 u 的台阶剖面：平台 + 每级之间 16 米的陡墙 */
export function terraceY(u) {
  if (u < TER[0].u0 - 4) return SPILL;
  if (u < TER[0].u0) return lerp(SPILL, TER[0].y, smooth(TER[0].u0 - 6, TER[0].u0, u));
  for (let i = 0; i < TER.length; i++) {
    const t = TER[i], nx = TER[i + 1];
    if (u <= t.u1 || !nx) return t.y;
    if (u < nx.u0) return lerp(t.y, nx.y, smooth(t.u1 + 1, nx.u0 - 1, u));
  }
  return TER[TER.length - 1].y;
}
/** 豁口遮罩：1 = 完全是台地 */
export function breachMask(x, z) {
  const u = VC.z - z, v = Math.abs(x - VC.x);
  if (u < 120 || u > 1090) return 0;
  const hw = halfWidth(u);
  return smooth(130, 165, u) * smooth(1085, 1020, u) * smooth(hw + 75, hw + 4, v);
}

/* ---------- 熔岩河 ---------- */
export const RIVER = (() => {
  const pts = samplePath(RIVER_KEYS, 6), L = pts[pts.length - 1].s;
  // 河面海拔：从守门台出口 131 米一路降到熔岩湖；保证不高出两岸太多
  let lv = TER[3].y - 4;
  for (const p of pts) {
    const t = p.s / L, want = lerp(TER[3].y - 4, LAKE.y + 1.5, Math.pow(t, 0.8));
    lv = Math.min(lv, want); p.y = lv; p.w = lerp(11, 15, t);
  }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return { pts, len: L, box: [x0 - 80, x1 + 80, z0 - 80, z1 + 80] };
})();
export const FISS = (() => {
  const pts = samplePath(FISSURE, 6);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); p.y = volcanoNat(p.x, p.z) + lavaFieldBump(p.x, p.z) - 6.5; }
  return { pts, box: [x0 - 40, x1 + 40, z0 - 40, z1 + 40] };
})();

/** 到折线的最近点：返回 { d, i, t }（写进 out） */
const _near = { d: 0, i: 0, t: 0 };
export function nearest(path, x, z, out = _near) {
  const b = path.box; out.d = 1e9;
  if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) return out;
  const P = path.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], c = P[i + 1], ex = c.x - a.x, ez = c.z - a.z, l2 = ex * ex + ez * ez;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + ex * t - x, pz = a.z + ez * t - z, d = px * px + pz * pz;
    if (d < out.d) { out.d = d; out.i = i; out.t = t; }
  }
  out.d = Math.sqrt(out.d);
  return out;
}
const atPath = (path, n, key) => lerp(path.pts[n.i][key], path.pts[n.i + 1][key], n.t);

/* ---------- 最终地形 ---------- */
export function ground(x, z) {
  let h = volcanoNat(x, z) + lavaFieldBump(x, z);
  // 工厂豁口：平台处又切又填；火山口豁口只切不填
  const m = breachMask(x, z);
  if (m > 0) {
    const u = VC.z - z, ty = terraceY(u);
    h = u < TER[0].u0 ? lerp(h, Math.min(h, ty), m) : lerp(h, ty, m);
  }
  // 达纳基尔：整体压低成一片洼地，上面长着一圈圈台阶状的泉丘
  const dd = Math.hypot(x - DANAKIL.x, z - DANAKIL.z);
  if (dd < DANAKIL.r + 260) {
    const w = smooth(DANAKIL.r + 250, DANAKIL.r - 40, dd);
    h = lerp(h, 22 + 6 * fbm(x * 0.01, z * 0.01, 2), w);
    for (const md of MOUNDS) {
      const d = Math.hypot(x - md.x, z - md.z); if (d > md.r * 1.25) continue;
      const k = smooth(md.r * 1.2, md.r * 0.15, d) * md.h, step = 1.6;
      const f = k / step, fl = Math.floor(f);
      h += step * (fl + smooth(0.75, 1, f - fl)) - 0.8 * smooth(md.r * 0.42, md.r * 0.3, d); // 台阶 + 顶上的小池
    }
  }
  // 西侧裂隙：一道裂缝，两侧堆着喷溅出来的熔岩堤
  {
    const n = nearest(FISS, x, z, { d: 0, i: 0, t: 0 });
    if (n.d < 40) {
      const y = atPath(FISS, n, 'y');
      h = lerp(h, y - 3, smooth(9, 3.5, n.d)) + 6 * Math.exp(-(((n.d - 11) / 6) ** 2));
    }
  }
  // 熔岩河：河床 + 天然堤岸
  {
    const n = nearest(RIVER, x, z, { d: 0, i: 0, t: 0 });
    if (n.d < 90) {
      const y = atPath(RIVER, n, 'y'), w = atPath(RIVER, n, 'w');
      const bed = y - 3 + Math.max(0, n.d - w) * 0.55;
      h = lerp(h, Math.min(h, bed), smooth(w + 70, w + 10, n.d));
      h = lerp(h, bed, smooth(w + 6, w, n.d));
      h += 4.5 * Math.exp(-(((n.d - w - 4) / 5) ** 2)) * smooth(0, 60, RIVER.pts[n.i].s);
    }
  }
  // 南面熔岩湖：一口盆
  {
    const d = Math.hypot(x - LAKE.x, z - LAKE.z) + (fbm(x * 0.012 + 9, z * 0.012, 3) - 0.24) * 110 + Math.sin(Math.atan2(z - LAKE.z, x - LAKE.x) * 5) * 10;
    if (d < LAKE.r + 160) {
      const bed = LAKE.y - 3 + Math.max(0, d - LAKE.r) * 0.32;
      h = lerp(h, Math.min(h, bed), smooth(LAKE.r + 150, LAKE.r + 20, d));
    }
  }
  return h;
}

/* ---------- 熔岩亮度（远景星球网格用；近处模块有自己的熔岩网格） ---------- */
export function lavaGlow(x, z) {
  let g = 0;
  const dc = Math.hypot(x - VC.x, z - VC.z); g = Math.max(g, smooth(170, 120, dc));
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z); g = Math.max(g, smooth(LAKE.r, LAKE.r - 40, dl));
  const nr = nearest(RIVER, x, z, { d: 0, i: 0, t: 0 }); if (nr.d < 40) g = Math.max(g, smooth(24, 6, nr.d));
  const nf = nearest(FISS, x, z, { d: 0, i: 0, t: 0 }); if (nf.d < 20) g = Math.max(g, smooth(10, 2, nf.d) * 0.8);
  // 台地之间的熔岩瀑布与槽
  const u = VC.z - z;
  if (u > 200 && u < 1020) g = Math.max(g, smooth(30, 8, Math.abs(x - laneX(u))) * 0.55);
  return clamp(g, 0, 1);
}
/** 熔岩在豁口里走的路线（x 随 u 变化），只给远景发光用 */
function laneX(u) { return u < 380 ? 0 : u < 815 ? 180 - smooth(620, 800, u) * 180 : 0; }

/* ---------- 地表颜色 ---------- */
const K = c => new THREE.Color(c);
const PC = {
  ash: K(0x2e2926), ash2: K(0x453d37), cinder: K(0x5c3326), rust: K(0x7a3f26), sulfur: K(0xc9b043), black: K(0x17161a), basalt: K(0x26252a),
  moss: K(0x587236), moss2: K(0x7f8c52), pave: K(0x3d3835), soot: K(0x1e1b1a),
  dY: K(0xd6be48), dL: K(0x9cc24e), dO: K(0xb5652d), dB: K(0x7a4a2a), salt: K(0xe9e3d2), salt2: K(0xc9b996), crust: K(0xa88a5e), hot: K(0x5a1d10)
};
const _c = new THREE.Color();
export function terrainColor(x, z, y, sl, out) {
  const n = fbm(x * 0.006, z * 0.006, 3), n2 = fbm(x * 0.03 + 4, z * 0.03, 2), n3 = fbm(x * 0.12, z * 0.12 - 3, 2);
  const dx = x - VC.x, dz = z - VC.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  out.copy(PC.ash).lerp(PC.ash2, n * 0.8);
  // 火山锥上：老熔岩流的黑色条带、靠上的赭红氧化层、火山口边的硫磺壳
  const flow = smooth(0.62, 0.8, Math.abs(Math.sin(a * 7 + n * 9 + r * 0.002)));
  out.lerp(PC.black, flow * smooth(1400, 600, r) * 0.8);
  out.lerp(PC.cinder, smooth(330, 520, y + n2 * 80) * 0.7);
  out.lerp(PC.rust, smooth(0.55, 0.75, n2) * smooth(420, 560, y) * 0.6);
  out.lerp(PC.sulfur, smooth(0.5, 0.7, n3) * smooth(CRATER.r + 90, CRATER.r + 10, r) * smooth(CRATER.r - 70, CRATER.r - 10, r) * 0.85);
  // 陡坡：裸露的玄武岩
  out.lerp(PC.basalt, smooth(0.8, 1.6, sl) * 0.75);
  // 西侧熔岩场：黑岩上铺着厚厚的苔藓
  const west = smooth(330, 600, x) * smooth(1650, 1250, Math.abs(z));
  if (west > 0) {
    _c.copy(PC.black).lerp(PC.basalt, n3);
    const moss = smooth(0.36, 0.6, n2 * 0.7 + n3 * 0.45) * (1 - smooth(0.9, 1.5, sl));
    _c.lerp(n > 0.45 ? PC.moss : PC.moss2, moss * 0.92);
    out.lerp(_c, west);
  }
  // 北坡：青苔从山脚爬上来一点
  out.lerp(PC.moss, smooth(500, 900, z) * smooth(0.55, 0.75, n2) * smooth(380, 160, y) * 0.5);
  // 工厂台地：煤灰压实的地面
  const m = breachMask(x, z);
  if (m > 0) out.lerp(_c.copy(PC.pave).lerp(PC.soot, n3 * 0.7), m * (sl < 0.6 ? 0.9 : 0.4));
  // 达纳基尔：硫磺黄、酸绿、铁锈橙一圈圈晕开
  const dd = Math.hypot(x - DANAKIL.x, z - DANAKIL.z);
  if (dd < DANAKIL.r + 250) {
    const w = smooth(DANAKIL.r + 240, DANAKIL.r - 60, dd) * smooth(110, 60, y);
    let best = 1e9; for (const q of MOUNDS) best = Math.min(best, Math.hypot(x - q.x, z - q.z) / q.r);
    // 矿物斑：噪声 + 离泉丘的远近，阈值切成一块块不规则的颜色
    const f = fbm(x * 0.011 + 3, z * 0.011 - 7, 4) * 1.15 + Math.max(0, 1.2 - best) * 0.26 + n3 * 0.16 - 0.04;
    _c.copy(PC.crust).lerp(PC.salt2, smooth(0.4, 0.7, n2)).lerp(PC.salt, smooth(0.6, 0.8, n3) * 0.7);
    if (Math.abs(noise(x * 0.07, z * 0.07) - 0.5) < 0.025) _c.multiplyScalar(0.75);
    _c.lerp(PC.dB, smooth(0.33, 0.36, f) * 0.8);
    _c.lerp(PC.dO, smooth(0.4, 0.43, f));
    _c.lerp(PC.dY, smooth(0.47, 0.5, f));
    _c.lerp(PC.dL, smooth(0.6, 0.64, f) * 0.85);
    _c.lerp(PC.salt, smooth(0.7, 0.73, f) * 0.6);
    out.lerp(_c, w);
  }
  // 熔岩旁边烤红的岩石
  out.lerp(PC.hot, lavaGlow(x, z) * 0.6);
  return out.multiplyScalar(0.86 + n3 * 0.28);
}

/* ---------- 核心地形网格 ---------- */
export const CORE = { x0: -1240, x1: 1240, z0: -1240, z1: 1240 };
export function makeTerrainGeometry(N = 420) {
  const W = CORE.x1 - CORE.x0, D = CORE.z1 - CORE.z0;
  const geo = new THREE.PlaneGeometry(W, D, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.translate((CORE.x0 + CORE.x1) / 2, 0, (CORE.z0 + CORE.z1) / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const hs = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { const y = ground(p.getX(i), p.getZ(i)); hs[i] = y; p.setY(i, y); }
  const step = W / N, row = N + 1;
  for (let i = 0; i < p.count; i++) {
    const ix = i % row, iz = (i / row) | 0;
    const hx = hs[iz * row + Math.min(ix + 1, N)] - hs[iz * row + Math.max(ix - 1, 0)], hz = hs[Math.min(iz + 1, N) * row + ix] - hs[Math.max(iz - 1, 0) * row + ix];
    const sl = Math.hypot(hx, hz) / (2 * step);
    terrainColor(p.getX(i), p.getZ(i), hs[i], sl, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
