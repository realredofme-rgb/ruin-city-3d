// 浮空的地壳碎块：平顶（草甸、树、废墟），侧面是和台地一样的砂岩岩层，底下是倒锥形的嶙峋岩根，
// 垂着树根和藤，嵌着发光的晶簇。和城市里那几座浮空岛是同一种东西，只是这里大得多、多得多。
import * as THREE from 'three';
import { smooth, clamp, lerp, rng } from '../../util.js';
import { nz, strata } from './terrain.js';
import { Pack, at, pineGeo, oakGeo } from './geo.js';
import { floraLod, LOW_Q } from '../../models.js';

/** 浮岛和台地上的树：近处换成城市那批 GLB 树（松树两种、阔叶树三种），远处保留程序化低模 */
export const TREE_GLB = { pine: ['ruin-city/tree-pine-1', 'ruin-city/tree-pine-2'], oak: [1, 2, 3].map(k => `ruin-city/tree-oak-${k}`) };
export const FLORA_Q = LOW_Q ? { near: 0, mid: 140 } : { near: 70, mid: 280 };
/** GLB 自带贴图颜色，只按占位颜色的明暗轻轻染一下 */
export const glbTint = (c, lo, hi) => { const h = {}; c.getHSL(h); return new THREE.Color().setScalar(0.82 + clamp((h.l - lo) / (hi - lo), 0, 1) * 0.3); };

const C = c => new THREE.Color(c);
const GRASS = C(0x6f8f45), GRASS2 = C(0x9aa35e), SOIL = C(0x5b4636), ROCK = C(0x6d6358), ROCK2 = C(0x4a443e), MOSS = C(0x55703c);
const WHITE = C(0xe4ded0), WHITE2 = C(0xcfc6b3);
const _c = new THREE.Color();

// 剖面：[径向比例, 高度（× r）]，从顶面中心一路到底部尖端
const TOP = [[0, 0], [0.12, 0], [0.24, 0], [0.36, 0], [0.48, 0], [0.6, 0], [0.72, 0], [0.83, 0], [0.92, 0], [0.985, -0.004]];
const SIDE = [[1, -0.03], [0.995, -0.09], [0.985, -0.16], [0.97, -0.23], [0.95, -0.3]];
const UNDER = [[0.86, -0.42], [0.74, -0.56], [0.6, -0.72], [0.46, -0.9], [0.33, -1.06], [0.21, -1.22], [0.11, -1.36], [0.04, -1.47], [0, -1.53]];
const PROFILE = [...TOP, ...SIDE, ...UNDER];

/**
 * 一块浮岛的几何。返回 { geo, rho(a), topY(x, z) }，坐标原点在顶面中心。
 * opt.depth 底部岩根的深度系数，opt.hill 顶面隆起（× r）
 */
export function islandShape(r, seed, opt = {}) {
  const N = r > 150 ? 72 : r > 60 ? 48 : 28, depth = opt.depth ?? 1, hill = (opt.hill ?? 0.05) * r;
  const sx = seed * 7.13, sz = seed * 3.71;
  const rho = a => r * (1 + 0.2 * nz(Math.cos(a) * 1.4 + sx, Math.sin(a) * 1.4 + sz, 3) + 0.06 * Math.sin(a * 5 + seed) + 0.035 * Math.sin(a * 11 + seed * 2));
  const topY = (x, z) => {
    const a = Math.atan2(z, x), u = Math.hypot(x, z) / rho(a);
    return hill * (1 - u * u) * (0.7 + 0.3 * nz(x * 0.02 + sx, z * 0.02, 2)) + 1.2 * nz(x * 0.05 - sz, z * 0.05 + sx, 2);
  };
  const M = PROFILE.length, pos = [], col = [];
  const nT = TOP.length, nS = SIDE.length;
  for (let j = 0; j < M; j++) {
    const [u, v] = PROFILE[j];
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), R0 = rho(a);
      let x = ca * R0 * u, z = sa * R0 * u, y;
      if (j < nT) { y = topY(x, z); }
      else {
        y = v * r * depth;
        // 岩根：径向和垂直方向都加上嶙峋的起伏，越往下越乱
        const deep = smooth(-0.2, -1.2, v), k = 1 + (0.12 + 0.3 * deep) * nz(ca * 2.2 + sx + v * 3, sa * 2.2 + sz - v * 2.5, 3) + 0.1 * deep * Math.sin(a * 7 + v * 9 + seed);
        x *= k; z *= k; y += r * 0.07 * deep * nz(ca * 3 + sz, sa * 3 + v * 4, 2);
        if (j >= nT + nS) { const tw = (v + 0.4) * 0.35; const c2 = Math.cos(tw), s2 = Math.sin(tw); const xx = x * c2 - z * s2; z = x * s2 + z * c2; x = xx; } // 岩根微微拧着
      }
      pos.push(x, y, z);
      // 颜色
      if (j < nT - 1) { _c.copy(GRASS).lerp(GRASS2, smooth(-0.5, 0.9, nz(x * 0.03 + sx, z * 0.03, 2))).lerp(MOSS, smooth(0.3, 1, nz(x * 0.08, z * 0.08 + sz, 2)) * 0.6); }
      else if (j < nT + 1) _c.copy(SOIL).lerp(GRASS, 0.25);
      else if (j < nT + nS) { strata(y * (220 / Math.max(r, 40)), x + sx * 50, z, _c); _c.lerp(MOSS, smooth(0.5, 1.2, nz(x * 0.06, y * 0.06 + z * 0.03, 2)) * 0.5); }
      else { const t = smooth(-0.35, -1.5, v); _c.copy(ROCK).lerp(ROCK2, t); strata(y * 3, x, z, _c2).multiplyScalar(0.7); _c.lerp(_c2, 0.35 * (1 - t)); _c.lerp(MOSS, smooth(0.6, 1.2, nz(x * 0.05 + sz, y * 0.07, 2)) * 0.35 * (1 - t)); }
      col.push(_c.r, _c.g, _c.b);
    }
  }
  // 顶面中心补一个点
  const center = pos.length / 3; pos.push(0, topY(0, 0), 0); _c.copy(GRASS); col.push(_c.r, _c.g, _c.b);
  const tip = pos.length / 3; { const [, v] = PROFILE[M - 1]; pos.push(r * 0.04 * nz(sx, sz, 2), v * r * depth * 1.04, 0); _c.copy(ROCK2); col.push(_c.r, _c.g, _c.b); }
  const idx = [];
  for (let i = 0; i < N; i++) idx.push(center, (i + 1) % N, i);
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, b = j * N + (i + 1) % N, c = (j + 1) * N + i, d = (j + 1) * N + (i + 1) % N;
    idx.push(a, b, c, b, d, c);
  }
  for (let i = 0; i < N; i++) idx.push((M - 1) * N + i, (M - 1) * N + (i + 1) % N, tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // 顶面用平滑法线（草地不要一块块的折面），侧面和岩根用折面法线（嶙峋）
  const flag = new Float32Array(pos.length / 3); for (let j = 0; j < nT; j++) for (let i = 0; i < N; i++) flag[j * N + i] = 1; flag[center] = 1;
  g.setAttribute('top', new THREE.BufferAttribute(flag, 1)); g.computeVertexNormals();
  const ng = g.toNonIndexed(), smoothN = ng.attributes.normal.clone(); ng.computeVertexNormals();
  const tf = ng.attributes.top, nn = ng.attributes.normal;
  for (let t = 0; t < tf.count; t += 3) if (tf.getX(t) && tf.getX(t + 1) && tf.getX(t + 2)) for (let k = t; k < t + 3; k++) nn.setXYZ(k, smoothN.getX(k), smoothN.getY(k), smoothN.getZ(k));
  ng.deleteAttribute('top');
  return { geo: ng, rho, topY, N };
}
const _c2 = new THREE.Color();

/** 白石废墟：残柱、拱门、圆殿、断塔。都画进 pack（白石） */
function columnAt(P, R, x, y, z, h, rad = 1.1, broken = false) {
  P.add(new THREE.BoxGeometry(rad * 2.8, 0.8, rad * 2.8).translate(0, 0.4, 0), at(x, y, z), WHITE2);
  const hh = broken ? h * (0.25 + 0.5 * R()) : h;
  P.add(new THREE.CylinderGeometry(rad * 0.9, rad, hh, 10).translate(0, 0.8 + hh / 2, 0), at(x, y, z, 0, broken ? R.range(-0.06, 0.06) : 0, broken ? R.range(-0.06, 0.06) : 0), mossy(WHITE, y));
  if (!broken) P.add(new THREE.BoxGeometry(rad * 2.6, 0.9, rad * 2.6).translate(0, 0.8 + hh + 0.45, 0), at(x, y, z), WHITE2);
}
const mossy = (base, y0) => (x, y, z, out) => out.copy(base).lerp(MOSS, clamp(smooth(0.35, 1.1, nz(x * 0.25 + z * 0.1, y * 0.3, 2)) * 0.8 * (0.4 + 0.6 * smooth(y0 + 8, y0, y)), 0, 0.75));

export function ruinsTemple(P, R, x0, y0, z0, rad) {
  // 圆形基座 + 一圈柱子（一半断了） + 残缺的檐口 + 中间的祭坛
  P.add(new THREE.CylinderGeometry(rad + 3, rad + 5, 4, 32).translate(0, -1.5, 0), at(x0, y0, z0), mossy(WHITE2, y0));
  P.add(new THREE.CylinderGeometry(rad + 1, rad + 1, 1, 32).translate(0, 1, 0), at(x0, y0, z0), WHITE2);
  const n = Math.round(rad * 0.55);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, broken = R() < 0.4;
    columnAt(P, R, x0 + Math.cos(a) * rad, y0 + 1.5, z0 + Math.sin(a) * rad, rad * 0.65, 1.2, broken);
    if (!broken && R() < 0.6) { const a2 = (i + 1) / n * Math.PI * 2, mx = (Math.cos(a) + Math.cos(a2)) / 2 * rad, mz = (Math.sin(a) + Math.sin(a2)) / 2 * rad; P.add(new THREE.BoxGeometry(2.4, 1.6, rad * 2 * Math.sin(Math.PI / n) + 2.6), at(x0 + mx, y0 + 1.5 + 0.8 + rad * 0.65 + 0.9 + 0.8, z0 + mz, -(a + a2) / 2), WHITE); }
  }
  // 塌了一半的穹顶肋
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3; if (R() < 0.35) continue;
    const arc = new THREE.TorusGeometry(rad * 0.95, 0.7, 5, 18, Math.PI * (0.35 + R() * 0.4)); arc.rotateY(0);
    P.add(arc, at(x0, y0 + rad * 0.65 + 4, z0, a, 0, 0), WHITE);
  }
  P.add(new THREE.BoxGeometry(6, 2.4, 4).translate(0, 2.7, 0), at(x0, y0, z0, 0.3), mossy(WHITE, y0));
  // 倒在地上的柱段
  for (let i = 0; i < 5; i++) { const a = R() * 6.28, d = rad + R.range(4, 12); P.add(new THREE.CylinderGeometry(1, 1, R.range(3, 7), 10), at(x0 + Math.cos(a) * d, y0 + 0.8, z0 + Math.sin(a) * d, R() * 3, 0, Math.PI / 2), mossy(WHITE, y0)); }
}
export function ruinsArch(P, R, x, y, z, ry, s = 1) {
  P.add(new THREE.BoxGeometry(2 * s, 13 * s, 2 * s).translate(0, 6.5 * s, 0), at(x, y, z, ry).multiply(at(-5 * s, 0, 0)), mossy(WHITE, y));
  P.add(new THREE.BoxGeometry(2 * s, 13 * s, 2 * s).translate(0, 6.5 * s, 0), at(x, y, z, ry).multiply(at(5 * s, 0, 0)), mossy(WHITE, y));
  P.add(new THREE.TorusGeometry(5 * s, 1 * s, 5, 12, Math.PI).translate(0, 13 * s, 0), at(x, y, z, ry), mossy(WHITE, y));
}
export function ruinsTower(P, R, x, y, z, h, rad) {
  const g = new THREE.CylinderGeometry(rad, rad * 1.15, h, 16, 8, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const py = p.getY(i); if (py > h * 0.3) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, Math.min(py, h * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(a * 3 + 1)) * (0.6 + 0.4 * Math.sin(a * 7))))); } }
  g.translate(0, h / 2, 0); g.computeVertexNormals();
  P.add(g, at(x, y, z), mossy(WHITE, y));
  const inner = g.clone(); inner.scale(0.9, 1, 0.9); // 内壁：翻转三角形朝里
  const ii = inner.index.array; for (let k = 0; k < ii.length; k += 3) { const t = ii[k]; ii[k] = ii[k + 2]; ii[k + 2] = t; }
  inner.computeVertexNormals(); P.add(inner, at(x, y, z), WHITE2);
  for (let k = 0; k < 4; k++) P.add(new THREE.BoxGeometry(rad * 0.5, 1.2, 2.2), at(x, y + h * 0.18 * (k + 1), z, k * 1.7).multiply(at(rad * 1.05, 0, 0)), WHITE2); // 窗台
}

/** 晶簇：几根发光的八面体，朝 dir 方向长 */
export function crystalCluster(list, x, y, z, s, R) {
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const l = s * R.range(0.6, 1.6);
    list.push({ x: x + R.range(-1, 1) * s * 0.5, y: y + R.range(-0.3, 0.3) * s, z: z + R.range(-1, 1) * s * 0.5, sx: l * 0.3, sy: l, rx: R.range(2.2, 4.1), rz: R.range(-0.9, 0.9), ry: R() * 6.28 });
  }
}

/**
 * 造一座浮岛（组），返回 { g, rho, topY, r, base, crystals[], fallSpots[] }
 * spec：{ x, y, z, r, seed, falls, ruins, trees, depth, hill }
 */
export function makeIsland(spec, mats, shared) {
  const R = rng(spec.seed * 97 + 13), r = spec.r;
  const { geo, rho, topY } = islandShape(r, spec.seed, spec);
  const g = new THREE.Group(); g.position.set(spec.x, spec.y, spec.z);
  const body = new THREE.Mesh(geo, mats.rock); body.castShadow = body.receiveShadow = true; g.add(body);
  const stone = new Pack(), roots = new Pack();
  // 垂根和藤：从边缘和底部挂下来
  const nr = Math.round(r * 0.9);
  for (let i = 0; i < nr; i++) {
    const a = R() * 6.28, edge = R() < 0.55, u = edge ? 0.97 : R.range(0.35, 0.85);
    const v = edge ? -0.02 : -(0.42 + (0.86 - u) * 1.1);
    const l = edge ? R.range(4, r * 0.35) : R.range(6, r * 0.5), w = edge ? R.range(0.25, 0.6) : R.range(0.3, 0.9);
    const x = Math.cos(a) * rho(a) * u, z = Math.sin(a) * rho(a) * u, y = v * r * (spec.depth ?? 1);
    const geoR = new THREE.CylinderGeometry(w * 0.3, w, l, 4).translate(0, -l / 2, 0);
    roots.add(geoR, at(x, y + 0.5, z, R() * 6, R.range(-0.08, 0.08), R.range(-0.08, 0.08)), edge ? _c.set(0x4f6b34).lerp(MOSS, R()) : _c.set(0x5a4a3a).lerp(C(0x6b6a4a), R()));
  }
  // 树
  const trees = { pine: [], oak: [] };
  const nt = Math.round((spec.trees ?? 1) * r * r * 0.0075) + 3;
  const keep = spec.clear || [];
  for (let i = 0; i < nt; i++) {
    const a = R() * 6.28, u = Math.sqrt(R()) * 0.88, x = Math.cos(a) * rho(a) * u, z = Math.sin(a) * rho(a) * u;
    if (keep.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    if (nz(x * 0.02 + spec.seed, z * 0.02, 2) < -0.5 && R() < 0.7) continue; // 林间空地
    trees[R() < 0.6 ? 'pine' : 'oak'].push([x, topY(x, z) - 0.3, z, R.range(0.7, 1.5) * (r > 150 ? 1.2 : 1)]);
  }
  const flora = [];
  for (const k of ['pine', 'oak']) {
    const list = trees[k]; if (!list.length) continue;
    const d = new THREE.Object3D();
    const items = list.map(([x, y, z, s]) => { d.position.set(x, y, z); d.rotation.set(R.range(-0.08, 0.08), R() * 6.28, R.range(-0.08, 0.08)); d.scale.set(s, s * R.range(0.85, 1.25), s); d.updateMatrix(); const c = _c.setHSL(0.24 + R.range(-0.04, 0.05), 0.3, R.range(0.42, 0.6)); return { m: d.matrix.clone(), c: c.clone().multiplyScalar(1.8), g: glbTint(c, 0.42, 0.6) }; });
    flora.push(floraLod(g, items, { geometry: shared[k], material: mats.tree }, TREE_GLB[k], FLORA_Q));
  }
  // 晶簇：嵌在岩根上
  const crystals = [];
  const nc = spec.crystals ?? Math.round(r / 25) + 1;
  for (let i = 0; i < nc; i++) {
    const a = R() * 6.28, j = R.range(0.35, 0.9), u = lerp(0.86, 0.2, j), v = lerp(-0.42, -1.25, j);
    crystalCluster(crystals, Math.cos(a) * rho(a) * u * 0.95, v * r * (spec.depth ?? 1), Math.sin(a) * rho(a) * u * 0.95, R.range(2.5, 5) * Math.sqrt(r / 60), R);
  }
  // 废墟
  if (spec.ruins) spec.ruins(stone, R, topY, rho);
  for (const [P, m] of [[stone, mats.stone], [roots, mats.root]]) { const mesh = P.build(m); if (mesh) g.add(mesh); }
  // 瀑布出口：岛边上的几个点（朝外的方位角）
  const fallSpots = (spec.falls || []).map(a => ({ a, x: Math.cos(a) * rho(a) * 0.985, z: Math.sin(a) * rho(a) * 0.985, w: Math.max(4, r * 0.09) }));
  g.userData = { base: spec.y, ph: R() * 6.28, amp: spec.amp ?? 2.5, sway: spec.sway ?? 0.004 };
  return { g, rho, topY, r, spec, crystals, fallSpots, flora };
}

export const SHARED = () => ({ pine: pineGeo(), oak: oakGeo() });
