// 戈壁大裂谷的地理骨架：高度函数、地表颜色、核心地形网格。
//
// 局部坐标（米）：+x 西，+z 北（城市在北边 4.4 公里外，中间隔着一道山脊）。
//   中央：一条南北向的断层裂谷（东非大裂谷式的阶梯状断崖），谷底有干河床、两处绿洲，南端是一汪碱湖。
//         北端是一面断头崖，铁轨从崖下的隧道口钻出来（隧道那头通向城市）。
//   西岸台地：纪念碑谷式的红色孤峰、平顶方山和石柱（造型在 rocks.js，这里只给它们脚下的碎石坡）。
//   东岸台地：沙丘海，沙里半埋着巨型机械。
import * as THREE from 'three';

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- 噪声：util.js 的值噪声偏低（中位数 0.25），这里自带一套均匀的 ---------- */
function hh(i, j) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vn(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return lerp(lerp(hh(i, j), hh(i + 1, j), su), lerp(hh(i, j + 1), hh(i + 1, j + 1), su), sv);
}
/** 分形噪声，0..1，中位数约 0.5 */
export function fb(x, y, o = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let k = 0; k < o; k++) { s += a * vn(x * f + k * 31.7, y * f - k * 17.3); n += a; a *= 0.5; f *= 2.02; }
  return s / n;
}
/** 山脊噪声：0..1，1 在脊线上 */
export const ridge = (x, y, o = 3) => 1 - Math.abs(fb(x, y, o) * 2 - 1);
/** 周期噪声（给孤峰的一圈轮廓用），t 是 0..1 的角度 */
export function loopNoise(t, freq, seed) {
  const a = t * Math.PI * 2; return fb(Math.cos(a) * freq + seed, Math.sin(a) * freq - seed, 3);
}

/* ---------- 裂谷 ---------- */
export const PINCH = -60;            // 巨人横跨裂谷的位置（这里谷最窄）
export const HEAD_Z = 1470;          // 北端断头崖
export const LAKE = { x: 0, z: -1330, rx: 150, rz: 330, y: 9 };
export const xc = z => 55 * Math.sin(z / 520 + 0.6) + 28 * Math.sin(z / 230 + 2.1);
LAKE.x = xc(LAKE.z);
export function halfW(z) {
  let w = 250 + 50 * Math.sin(z / 400);
  w = lerp(w, 150, Math.exp(-(((z - PINCH) / 230) ** 2)));
  w += smooth(-650, -1300, z) * 240;
  return w;
}
/** 谷底占整个谷宽的比例 */
export const floorFrac = z => lerp(0.34, 0.28, Math.exp(-(((z - PINCH) / 200) ** 2)));
/** 谷底海拔：北高南低 */
export const floorY = z => lerp(13, 34, smooth(-1300, 1400, z));
/** 台地基准面 */
export function plateau(x, z) {
  return 148 + 34 * (fb(x * 0.0006 + 2.3, z * 0.0006 - 1.7, 4) - 0.5) + 9 * (fb(x * 0.004, z * 0.004, 3) - 0.5);
}
/** 断头崖：北端谷深渐渐归零 */
const depthK = z => smooth(HEAD_Z + 120, HEAD_Z - 40, z);
/** 干河床的中线：在谷底偏东的一侧蜿蜒 */
export const xRiver = z => xc(z) - floorFrac(z) * halfW(z) * (0.22 + 0.3 * Math.sin(z / 115 + 1.3));
/** 铁轨中线：贴着谷底西侧 */
export const xRail = z => xc(z) + floorFrac(z) * halfW(z) * 0.45;
export const RAIL = { z0: HEAD_Z - 18, z1: LAKE.z + 250 };
export const railY = z => floorY(z) + 1.1;

/** 两处绿洲 */
export const OASES = [
  { x: 0, z: 430, r: 34, side: -0.15 },
  { x: 0, z: -560, r: 44, side: -0.55 }
].map(o => ({ ...o, x: xc(o.z) - floorFrac(o.z) * halfW(o.z) * (0.25 - o.side), y: floorY(o.z) - 0.7 }));

/* ---------- 东岸沙丘与机械周围堆起的沙 ---------- */
export const DRIFTS = [];  // {x, z, r, h}，machines.js 在构建前登记（这里先放固定的几处）
export function addDrift(x, z, r, h) { DRIFTS.push({ x, z, r, h }); }
function dunes(x, z, u) {
  if (x > xc(z)) return 0;
  const dr = (u - 1) * halfW(z);                     // 离东岸崖线的距离（米）
  const m = smooth(140, 420, dr) * smooth(-2300, -1500, x) * smooth(-1900, -1400, z) * smooth(1900, 1400, z)
    * (0.25 + 0.75 * smooth(150, 420, Math.hypot(x - xc(PINCH) + 200, z - PINCH)));   // 巨人头边上沙薄一些
  if (m <= 0) return 0;
  // 风从西往东吹：迎风坡缓、背风坡陡，沙脊大体南北走向、被噪声扭弯
  const warp = 70 * (fb(z * 0.004 + 7, x * 0.002, 3) - 0.5) * 2 + 25 * Math.sin(z / 160);
  const s = (-x + warp) / 92, f = s - Math.floor(s);
  const p = f < 0.62 ? smooth(0, 0.62, f) : 1 - smooth(0.62, 1, f) * 0.85;
  const a = 5 + 14 * fb(x * 0.0022 + 3, z * 0.0022 + 1, 3);
  // 第二组小沙纹
  const s2 = (-x * 0.8 + z * 0.6 + warp * 0.5) / 31, f2 = s2 - Math.floor(s2);
  const p2 = f2 < 0.7 ? smooth(0, 0.7, f2) : 1 - smooth(0.7, 1, f2);
  return m * (a * p + 2.2 * p2 + 10 * smooth(500, 900, dr));
}

/* ---------- 孤峰脚下的碎石坡（孤峰的崖壁和平顶由 rocks.js 生成网格） ---------- */
export const BUTTES = []; // rocks.js 填入；每项 {x, z, rot, rx, rz, tal, tw, H, base, prof: Float32Array(256)}
const _bb = { talus: 0, cliff: -1e9 };
function butteAt(x, z) {
  _bb.talus = 0; _bb.cliff = -1e9;
  for (const b of BUTTES) {
    const dx = x - b.x, dz = z - b.z, R0 = Math.max(b.rx, b.rz) * (1 + b.tw) * 1.7;
    if (dx * dx + dz * dz > R0 * R0) continue;
    const c = Math.cos(b.rot), s = Math.sin(b.rot), lx = dx * c - dz * s, lz = dx * s + dz * c;
    const a = Math.atan2(lz / b.rz, lx / b.rx), t = (a / (Math.PI * 2) + 1) % 1;
    const k = b.prof[Math.floor(t * 256) & 255], e = Math.hypot(lx / b.rx, lz / b.rz) / k;
    if (e < 1 + b.tw) {
      const q = clamp((e - 1) / b.tw, 0, 1);
      const g = 1 - 0.25 * (1 - Math.abs(loopNoise(t, 7, b.seed + e * 2.5) * 2 - 1)); // 碎石坡上的冲沟（沿一圈周期，免得接缝处断开）
      _bb.talus = Math.max(_bb.talus, b.tal * Math.pow(1 - q, 1.6) * g);
      if (e < 1) _bb.cliff = Math.max(_bb.cliff, b.base + b.H);
    }
  }
  return _bb;
}

/** 离地块边缘的远近：0 在中心，1 在五边形的东西两侧和南边的边上（地块内切半径约 1975 米） */
const EDGES = [18, 162, -54, -126].map(a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]);
export function edgeDist(x, z) { let m = 0; for (const [nx, nz] of EDGES) m = Math.max(m, (x * nx + z * nz) / 1975); return m; }

/**
 * 地面海拔。full=false 时孤峰内部只抬到碎石坡顶（核心地形网格用，崖壁另有网格盖住）。
 */
export function ground(x, z, full = true) {
  const P = plateau(x, z), X = xc(z), W = halfW(z), ff = floorFrac(z), F = floorY(z);
  let u = Math.abs(x - X) / W;
  // 崖线不规则：小冲沟切进台地
  const gully = ridge(z * 0.011 + (x > X ? 5 : -5), 0.5, 3);
  u += (fb(x * 0.01, z * 0.01, 3) - 0.5) * 0.16 - 0.06 * smooth(0.55, 0.95, gully) * smooth(1.3, 0.9, u);
  // 阶梯状断层：两级台阶，每级有陡坎
  const t = smooth(ff, 1, u), k = Math.floor(t * 3), fr = t * 3 - k;
  const stepT = lerp(t, (k + smooth(0.5, 0.92, fr)) / 3, 0.78);
  const D = depthK(z);
  let h = P - (P - F) * D * (1 - stepT);
  // 裂谷肩部微微隆起
  h += 14 * D * Math.exp(-(((u - 1.15) / 0.3) ** 2));
  // 谷底起伏、干河床、冲积扇
  if (u < ff + 0.1) {
    const fl = 1 - smooth(ff - 0.02, ff + 0.08, u);
    h += fl * (1.4 * (fb(x * 0.02, z * 0.02, 3) - 0.5) + 3.5 * smooth(ff * 0.6, ff, u));
    const dr = Math.abs(x - xRiver(z));
    h -= fl * 2.2 * smooth(16, 4, dr);
    // 碱湖
    const le = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    h -= fl * 7 * smooth(1.15, 0.55, le) + fl * 2 * smooth(0.5, 0, le);
    // 绿洲水塘
    for (const o of OASES) { const d = Math.hypot(x - o.x, z - o.z) / o.r; if (d < 1.4) h -= 3.4 * smooth(1.25, 0.55, d); }
    // 铁轨路基
    if (z < RAIL.z0 + 30 && z > RAIL.z1 - 30) {
      const dr2 = Math.abs(x - xRail(z));
      if (dr2 < 12) h = lerp(h, railY(z) - 0.25, smooth(11, 4.5, dr2) * smooth(RAIL.z1 - 30, RAIL.z1, z) * smooth(RAIL.z0 + 30, RAIL.z0, z));
    }
  }
  // 东岸沙丘
  h += dunes(x, z, u) * D;
  for (const d of DRIFTS) { const q = ((x - d.x) ** 2 + (z - d.z) ** 2) / (d.r * d.r); if (q < 4) h += d.h * Math.exp(-q * 1.6); }
  // 孤峰
  if (BUTTES.length && u > 1) {
    const b = butteAt(x, z);
    h += b.talus;
    if (full && b.cliff > h) h = b.cliff;
  }
  // 地块边缘：东西两侧和南边接海与冰原，台地在这里断成海崖、落到海平面以下，
  // 这样和星球网格在交界处的混合高度对得上（北边接城市的山脊，不用降）
  const pd = edgeDist(x, z);
  if (pd > 0.68) h = lerp(h, -26 + 8 * (fb(x * 0.006, z * 0.006, 2) - 0.5), smooth(0.68, 0.84, pd + 0.04 * (fb(x * 0.003 + 4, z * 0.003, 2) - 0.5)));
  return h;
}

/* ---------- 地表颜色 ---------- */
const C = c => new THREE.Color(c);
export const TC = {
  red: C(0xb9643a), red2: C(0xcf8652), redDark: C(0x8c4026), dune: C(0xdc9f62), dune2: C(0xe9b97f), duneShade: C(0xc4834c),
  silt: C(0xc29a72), bed: C(0xd6bb92), mud: C(0x9c7a5a), salt: C(0xf2eee4), pink: C(0xd69a8e), soda: C(0x9fb7a0),
  green: C(0x6d8434), green2: C(0x8e9a48), scrub: C(0x8f8452), varnish: C(0x5a3424),
  basalt: C(0x4b3b33), tuff: C(0xc9a582), ochre: C(0xc68a4c), sand: C(0xa9552f)
};
const _k = new THREE.Color();
/** 断崖的岩层：红砂岩、赭色泥岩、浅色凝灰岩，夹几层黑色玄武岩 */
export function strata(y, x, z, out) {
  const w = y + 6 * (fb(x * 0.004, z * 0.004, 2) - 0.5) + 2 * Math.sin(x * 0.01 + z * 0.006);
  const b = w / 9, k = Math.floor(b), f = b - k, r = hh(k, 7);
  const base = r < 0.4 ? TC.sand : r < 0.64 ? TC.ochre : r < 0.86 ? TC.red : r < 0.93 ? TC.tuff : TC.basalt;
  out.copy(base).lerp(r < 0.5 ? TC.red2 : TC.redDark, 0.25 * Math.sin(f * Math.PI));
  return out;
}
export function color(x, z, y, sl, out) {
  const n = fb(x * 0.012, z * 0.012, 3), n2 = fb(x * 0.07 + 9, z * 0.07, 2);
  if (edgeDist(x, z) > 0.7 && y < 40) {
    // 海岸：海崖的岩层、海滩的浅沙、水下的湿沙
    if (sl > 0.5) return strata(y, x, z, out);
    return out.copy(TC.bed).lerp(TC.mud, smooth(2, -6, y)).multiplyScalar(0.9 + n2 * 0.2);
  }
  const X = xc(z), W = halfW(z), ff = floorFrac(z), u = Math.abs(x - X) / W, D = depthK(z);
  if (u < ff + 0.05 && D > 0.5) {
    // 谷底：粉砂、河床、湖岸的盐壳
    out.copy(TC.silt).lerp(TC.mud, smooth(0.45, 0.7, n) * 0.5);
    const dr = Math.abs(x - xRiver(z));
    out.lerp(TC.bed, smooth(14, 5, dr) * 0.7);
    const le = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    if (le < 1.5) { out.lerp(TC.pink, smooth(1.45, 1.1, le) * 0.7); out.lerp(TC.salt, smooth(1.2, 0.95, le) * 0.9); out.lerp(TC.soda, smooth(0.95, 0.7, le)); }
    for (const o of OASES) { const d = Math.hypot(x - o.x, z - o.z) / o.r; if (d < 3) out.lerp(n2 > 0.5 ? TC.green : TC.green2, smooth(3, 1.1, d) * (0.6 + 0.4 * n)); }
    if (sl > 0.5) strata(y, x, z, out);
  } else if (sl > 0.62 && u > 1.25) {
    // 孤峰脚下的碎石坡：暗红的页岩碎屑，冲沟里颜色更深
    out.copy(TC.redDark).lerp(TC.red, smooth(0.3, 0.7, n)).lerp(TC.ochre, smooth(0.6, 0.85, n2) * 0.3);
  } else if (sl > 0.62) {
    strata(y, x, z, out);
    out.lerp(TC.varnish, smooth(0.62, 0.8, fb(x * 0.05, y * 0.01, 2)) * 0.45);
  } else if (x < X - W * 1.05) {
    // 东岸沙丘：迎风坡浅、背风坡深
    out.copy(TC.dune).lerp(TC.dune2, smooth(0.4, 0.75, n)).lerp(TC.duneShade, smooth(0.25, 0.55, sl) * 0.6);
    out.lerp(TC.red, smooth(1.6, 1.1, u) * 0.45);
  } else {
    // 台地：红沙、碎石、稀疏的灌丛
    out.copy(TC.red).lerp(TC.red2, smooth(0.35, 0.7, n)).lerp(TC.redDark, smooth(0.2, 0.5, sl) * 0.6);
    out.lerp(TC.scrub, smooth(0.62, 0.8, n2) * 0.35);
  }
  return out.multiplyScalar(0.9 + n2 * 0.2);
}

/* ---------- 程序化细节贴图：沙粒与碎石的斑点，按世界坐标平铺 ---------- */
let _grain = null;
export function grainTexture() {
  if (_grain) return _grain;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const t = i / S, s = j / S;
    // 可平铺：在环面上取噪声
    const a = t * Math.PI * 2, b = s * Math.PI * 2;
    const n = fb(Math.cos(a) * 3 + Math.cos(b) * 1.7, Math.sin(a) * 3 + Math.sin(b) * 1.7, 4);
    const sp = hh(i * 7 + 3, j * 13 + 1);
    let v = 0.9 + (n - 0.5) * 0.12 + (sp > 0.95 ? -0.09 : sp < 0.04 ? 0.05 : 0);
    v = clamp(v, 0, 1) * 255;
    const k = (j * S + i) * 4; d[k] = v; d[k + 1] = v * 0.985; d[k + 2] = v * 0.97; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _grain = new THREE.CanvasTexture(c); _grain.wrapS = _grain.wrapT = THREE.RepeatWrapping; _grain.anisotropy = 8; _grain.colorSpace = THREE.SRGBColorSpace;
  return _grain;
}

/* ---------- 核心地形网格 ---------- */
export const CORE = { x0: -1560, x1: 1560, z0: -1700, z1: 1700 };
export function makeTerrain(quality = 1) {
  const SX = CORE.x1 - CORE.x0, SZ = CORE.z1 - CORE.z0, step = quality > 1 ? 6 : 7.5;
  const NX = Math.round(SX / step), NZ = Math.round(SZ / step);
  const geo = new THREE.PlaneGeometry(SX, SZ, NX, NZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate((CORE.x0 + CORE.x1) / 2, 0, (CORE.z0 + CORE.z1) / 2);
  const p = geo.attributes.position, n = p.count, hs = new Float32Array(n);
  for (let i = 0; i < n; i++) { hs[i] = ground(p.getX(i), p.getZ(i), false); p.setY(i, hs[i]); }
  const col = new Float32Array(n * 3), uv = geo.attributes.uv, c = new THREE.Color(), row = NX + 1;
  for (let i = 0; i < n; i++) {
    const ix = i % row, iz = (i - ix) / row;
    const hx = hs[iz * row + Math.min(ix + 1, NX)] - hs[iz * row + Math.max(ix - 1, 0)];
    const hz = hs[Math.min(iz + 1, NZ) * row + ix] - hs[Math.max(iz - 1, 0) * row + ix];
    const sl = Math.hypot(hx, hz) / (2 * step);
    const x = p.getX(i), z = p.getZ(i);
    color(x, z, hs[i], sl, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    uv.setXY(i, x / 23, z / 23);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, map: grainTexture() }));
  mesh.receiveShadow = true;
  return mesh;
}

/** 水面：碱湖与绿洲水塘（自己的小水面，不用星球的海） */
export function makeWater() {
  const group = [];
  const mk = (cx, cz, rx, rz, y, colr, op) => {
    const g = new THREE.RingGeometry(0.0001, 1, 72, 12); g.rotateX(-Math.PI / 2);
    // 细分一下，挂到球面上时能跟着弯
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, cx + p.getX(i) * rx, y, cz + p.getZ(i) * rz);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colr, roughness: 0.18, metalness: 0.05, transparent: true, opacity: op, depthWrite: false, envMapIntensity: 0.5 }));
    m.receiveShadow = true; m.renderOrder = 2; group.push(m); return m;
  };
  mk(LAKE.x, LAKE.z, LAKE.rx * 1.25, LAKE.rz * 1.2, LAKE.y, 0x2f7f7a, 0.93);
  for (const o of OASES) mk(o.x, o.z, o.r * 1.15, o.r * 1.15, o.y, 0x2f6668, 0.9);
  return group;
}
