// 把树种进湿地：七棵古树（神庙门楼上一棵、高架桥面上一棵、货车厢里一棵……），
// 八十来棵单独生成的大树，近千棵用实例化的小树、棕榈和枯立木，再加上倒木、芦苇丛和王莲。
import * as THREE from 'three';
import { rng, smooth, clamp, mat, lerp } from '../../util.js';
import { Acc } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tree, palm, clump, LEAF, treeMaterials, FLOOD, sway } from './trees.js';
import { floraLod, loadModel, cloneMat, sameSlots, LOW_Q } from '../../models.js';
import { ground, nf, WATER, TEMPLE, channelZ } from './terrain.js';
import { viaDist, templeSurf, DECK } from './ruins.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * 四棵 GLB 古树（45 米的模型按原来的高度放大）。网格在构建时就挂上（几何先空着），星球挂载才认得它们；
 * 两个模型都读到以后换上，同时藏起程序化的那四棵。离镜头 600 米以外用 LOD1。
 */
function ancientTrees(root, list, proc, M) {
  const empty = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  const meshes = list.map((t, i) => {
    const m = new THREE.Mesh(empty, M.wood); m.position.set(t.x, t.y0 - 0.5, t.z); m.rotation.y = i * 2.1 + 0.7; m.scale.setScalar(t.H / 45);
    m.castShadow = m.receiveShadow = true; m.visible = false; root.add(m); return m;
  });
  const paths = ['sunken-wetland/ancient-tree-1', 'sunken-wetland/ancient-tree-2'];
  let lods = null; // [{ g0, g1, mat0, mat1 }]，近处 LOD0（22,000 面），600 米外 LOD1（3,000 面）
  Promise.all(paths.map(p => Promise.all([loadModel(p), loadModel(p + '_lod1').catch(() => null)]))).then(models => {
    lods = models.map(([a, b]) => ({ g0: a.geometry, m0: a.material, g1: b ? b.geometry : a.geometry, m1: b ? sameSlots(b.material, a.material, a.material) : a.material }));
    meshes.forEach((m, i) => { const L = lods[i % 2]; m.geometry = L.g1; m.material = L.m1; m.visible = true; });
    for (const p of proc) p.visible = false;
  }).catch(e => console.warn('古树模型没加载上，继续用程序化的：', e.message || e));
  return {
    update(cam) {
      if (!lods) return;
      meshes.forEach((m, i) => { const L = lods[i % 2], near = m.position.distanceToSquared(cam) < 600 * 600; m.geometry = near ? L.g0 : L.g1; m.material = near ? L.m0 : L.m1; });
    }
  };
}

/** 泊松盘采样：在 rMax 以内撒点，间距至少 d，accept(x,z) 决定能不能种 */
function scatter(R, n, d, rMax, accept, taken = []) {
  const out = [], cell = d / Math.SQRT2, grid = new Map(), key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  const ok = (x, z) => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const q = grid.get((gx + i) + ',' + (gz + j)); if (q && (q[0] - x) ** 2 + (q[1] - z) ** 2 < d * d) return false; }
    for (const t of taken) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + d * 0.5) ** 2) return false;
    return true;
  };
  for (let k = 0; k < n * 30 && out.length < n; k++) {
    const a = R() * 6.28, r = Math.sqrt(R()) * rMax, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!accept(x, z) || !ok(x, z)) continue;
    grid.set(key(x, z), [x, z]); out.push({ x, z });
  }
  return out;
}

const pickLeaf = R => { const r = R(); return r < 0.04 ? LEAF.pink : r < 0.07 ? LEAF.yellow : r < 0.09 ? LEAF.rust : [LEAF.deep, LEAF.yg, LEAF.blue, LEAF.olive, LEAF.dark][Math.floor(R() * 5)]; };

export function plantForest(root, spots) {
  const R = rng(3303), M = treeMaterials(), A = { wood: new Acc(), leaf: new Acc(), hang: new Acc() };
  const fungi = [], tops = [], titans = [];
  const surf = (x, z) => templeSurf(x, z);
  const chan = (x, z) => Math.abs(z - channelZ(x));
  const tDist = (x, z) => Math.hypot(x - TEMPLE.x, z - TEMPLE.z);

  /* ---- 古树 ---- */
  const gate = spots.gates.find(g => g.x > TEMPLE.x + 5);
  const T = [
    { x: gate.x, z: gate.z, y0: gate.top - 0.5, H: 150, roots: 16, rootLen: 46, name: '门楼上的古榕' },
    { x: spots.viaTree.x, z: spots.viaTree.z, y0: ground(spots.viaTree.x, spots.viaTree.z), H: 205, roots: 12, name: '穿桥的古树' },
    { x: spots.freight.x, z: spots.freight.z, y0: ground(spots.freight.x, spots.freight.z), H: 170, name: '货车厢里的古树' },
    { x: -260, z: 690, H: 160 }, { x: 990, z: -560, H: 185 }, { x: -1120, z: 760, H: 150 }, { x: 330, z: -930, H: 165 }
  ];
  // 有名字的三棵和神庙、桥、货车厢长在一起，仍是程序化的；另外四棵换成 GLB 古树（加载前和加载失败时用程序化的顶上）
  const AT = { wood: new Acc(), leaf: new Acc(), hang: new Acc() }, glbTitans = [];
  for (const t of T) {
    t.y0 ??= ground(t.x, t.z);
    const RR = rng(t.x * 7 + t.z * 13 + 99), glb = !t.name;
    tree(glb ? AT : A, RR, { ...t, kind: 'titan', surf, leaf: [LEAF.deep, LEAF.blue, LEAF.dark][titans.length % 3] }, { fungi: glb ? [] : fungi, tops });
    titans.push({ x: t.x, z: t.z, y0: t.y0, H: t.H, r: 40, name: t.name });
    if (glb) glbTitans.push(t);
  }
  const titanProc = [AT.wood.build(M.wood), AT.leaf.build(M.leaf), AT.hang.build(M.hang, { cast: false })].filter(Boolean);
  for (const m of titanProc) root.add(m);
  const ancient = ancientTrees(root, glbTitans, titanProc, M);
  // 神庙南墙上再趴一棵小一点的绞杀榕
  { const g = spots.gates.find(g => g.z < TEMPLE.z - 5); tree(A, rng(71), { x: g.x + 14, z: g.z, y0: templeSurf(g.x + 14, g.z) - 0.4, H: 60, kind: 'fig', surf, roots: 9, rootLen: 22, leaf: LEAF.yg }, { fungi, tops }); }

  /* ---- 大树 ---- */
  const bigOk = (x, z) => {
    const r = Math.hypot(x, z), n = nf(x * 0.004 + 1, z * 0.004 - 5, 3);
    return r < 1550 && chan(x, z) > 55 && tDist(x, z) > TEMPLE.r + 30 && viaDist(x, z) > 18 && n > 0.36;
  };
  const big = scatter(R, 170, 44, 1550, bigOk, titans);
  // 大树换成 GLB（木棉型 big-tree-1、绞杀榕型 big-tree-2，原高 60 米按 H 缩放）；程序化的单独成块，GLB 读好后隐藏。
  // 树冠中心（tops）照旧记下给鸟和光柱用；树干上的菌菇贴的是程序化树干，换成 GLB 后会悬空，所以不要了
  const AB = { wood: new Acc(), leaf: new Acc(), hang: new Acc() }, bigItems = [[], []];
  for (const p of big) {
    const kind = R() < 0.42 ? 'ceiba' : R() < 0.6 ? 'fig' : 'round';
    const H = kind === 'ceiba' ? R.range(55, 90) : R.range(38, 66);
    tree(AB, rng(p.x * 3 + p.z * 5 + 7), { x: p.x, z: p.z, y0: ground(p.x, p.z), H, kind, surf, leaf: pickLeaf(R) }, { fungi: [], tops });
    p.r = H * 0.25;
    const s = H / 60, ry = ((p.x * 12.9898 + p.z * 78.233) % 6.28 + 6.28) % 6.28;
    bigItems[kind === 'ceiba' ? 0 : 1].push({ m: mat(p.x, ground(p.x, p.z) - 0.6, p.z, ry, 0, 0, s, s, s), c: new THREE.Color(1, 1, 1), g: new THREE.Color().setScalar(0.78 + 0.18 * ((p.x * 0.37 + p.z * 0.61) % 1 + 1) % 1) });
  }
  const bigProc = [AB.wood.build(M.wood), AB.leaf.build(M.leaf), AB.hang.build(M.hang, { cast: false })].filter(Boolean);
  for (const m of bigProc) root.add(m);
  const meshes = [A.wood.build(M.wood), A.leaf.build(M.leaf), A.hang.build(M.hang, { cast: false })];
  for (const m of meshes) root.add(m);

  /* ---- 实例化：小树、棕榈、枯立木 ---- */
  const variants = [];
  const mk = (fn, seed) => { const a = { wood: new Acc(), leaf: new Acc(), hang: new Acc() }; fn(a, rng(seed)); return [a.wood.geometry(), a.leaf.geometry(), a.hang.geometry()]; };
  for (let k = 0; k < 4; k++) variants.push({ kind: 'tree', g: mk((a, r) => tree(a, r, { x: 0, z: 0, y0: 0, H: 26, kind: ['fig', 'round', 'ceiba', 'round'][k], lod: 1, leaf: [LEAF.deep, LEAF.yg, LEAF.olive, LEAF.blue][k] }), 500 + k) });
  for (let k = 0; k < 2; k++) variants.push({ kind: 'palm', g: mk((a, r) => palm(a, r, 0, 0, 0, 20 + k * 5), 600 + k) });
  variants.push({ kind: 'snag', g: mk((a, r) => tree(a, r, { x: 0, z: 0, y0: 0, H: 22, kind: 'snag', lod: 1 }), 700) });
  const smallOk = (x, z) => {
    const r = Math.hypot(x, z);
    // 林子不是均匀的：一片片密林中间夹着开阔的水湾（王莲长在那里）
    return r < 1900 && chan(x, z) > 34 && tDist(x, z) > TEMPLE.r + 16 && viaDist(x, z) > 9 && nf(x * 0.0045 + 1, z * 0.0045 - 5, 3) > 0.33;
  };
  const small = scatter(R, 4200, 12.5, 1900, smallOk, [...titans, ...big]);
  const buckets = variants.map(() => []);
  for (const p of small) {
    const y = ground(p.x, p.z), wet = y < WATER;
    // 棕榈喜欢浅滩和泥丘边，枯立木多在深水里
    let v = Math.floor(R() * 4);
    if (y > -1.2 && R() < 0.35) v = 4 + Math.floor(R() * 2);
    else if (wet && y < -2.6 && R() < 0.35) v = 6;
    const s = R.range(0.75, 1.45) * (v >= 4 ? 1 : lerp(0.85, 1.35, smooth(0.3, 0.8, nf(p.x * 0.003, p.z * 0.003, 2))));
    buckets[v].push(mat(p.x, y, p.z, R() * 6.28, R.range(-0.04, 0.04), R.range(-0.04, 0.04), s, s * R.range(0.9, 1.15), s));
  }
  // 实例化的小树换成 GLB：近处 LOD0，其余全用 LOD1（比原来的程序化小树省得多）；加载前用程序化的占位
  const GLB = [['sunken-wetland/rainforest-tree-1'], ['sunken-wetland/rainforest-tree-3'], ['sunken-wetland/rainforest-tree-2'], ['sunken-wetland/rainforest-tree-3'],
    ['gobi-rift/palm-1'], ['gobi-rift/palm-2'], ['sunken-wetland/dead-tree-1', 'sunken-wetland/dead-tree-2']];
  // GLB 原尺寸：雨林乔木 26 米、棕榈 12 米、枯树约 20 米；程序化的分别是 26、20/25、22 米
  const fit = [1, 1, 1, 1, 20 / 12, 25 / 12, 22 / 19.5].map(k => new THREE.Matrix4().makeScale(k, k, k));
  const prep = m => {
    const c = cloneMat(m); if (c.name !== 'Leaf') return c;
    const prev = c.onBeforeCompile, key = c.customProgramCacheKey(); sway(c, 0.5);
    const sw = c.onBeforeCompile; c.onBeforeCompile = (sh, r) => { prev.call(c, sh, r); sw(sh, r); }; c.customProgramCacheKey = () => key + '|wetSway';
    return c;
  };
  const flora = [], white = new THREE.Color(1, 1, 1);
  variants.forEach((v, k) => {
    const list = buckets[k]; if (!list.length) return;
    const parts = [[v.g[0], M.wood], [v.g[1], M.leaf], [v.g[2], M.hang]].filter(([g]) => g);
    const geometry = mergeGeometries(parts.map(([g]) => g), true);
    const items = list.map((mm, i) => ({ m: mm, mg: mm.clone().multiply(fit[k]), c: white, g: new THREE.Color().setScalar(0.74 + 0.2 * ((i * 0.618) % 1)) })); // GLB 叶子比湿地原来的配色亮，压暗一点
    flora.push(floraLod(root, items, { geometry, material: parts.map(([, m]) => m) }, GLB[k], { near: LOW_Q ? 0 : 140, mid: 1e9, prep }));
  });
  {
    const empty = { geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)), material: M.wood };
    let left = 2, ok = true;
    const done = good => { ok = ok && good; if (--left === 0 && ok) for (const m of bigProc) m.visible = false; };
    ['sunken-wetland/big-tree-1', 'sunken-wetland/big-tree-2'].forEach((path, k) =>
      flora.push(floraLod(root, bigItems[k], empty, [path], { near: LOW_Q ? 0 : 260, mid: 1e9, prep, onReady: done })));
  }
  flora.push(ancient);

  /* ---- 倒木、芦苇、王莲 ---- */
  const logs = new Acc();
  for (let k = 0; k < 46; k++) {
    const a = R() * 6.28, r = Math.sqrt(R()) * 1350, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (chan(x, z) < 30 || tDist(x, z) < TEMPLE.r + 10) continue;
    const yaw = R() * 6.28, L = R.range(14, 34), d = V(Math.cos(yaw), 0, Math.sin(yaw)), y = Math.max(ground(x, z), -2.2) + R.range(-0.2, 0.6);
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V(x + d.x * L * t, y + Math.sin(t * 3) * 0.6 + t * R.range(-1, 2), z + d.z * L * t)); }
    const r0 = R.range(0.6, 1.4), col = new THREE.Color(0x6f6656);
    logs.tube(pts, (i, t) => r0 * (1 - 0.4 * t), { seg: 8, col: (p, t, th, c) => c.copy(col).lerp(new THREE.Color(0x55702f), smooth(0.5, 0.75, nf(p.x * 0.3, p.z * 0.3, 2)) * 0.8 * (p.y > y ? 1 : 0.3)) });
  }
  root.add(logs.build(M.wood));

  // 芦苇丛：浅滩上一簇簇的细锥
  const reedG = new THREE.ConeGeometry(0.06, 1, 3).translate(0, 0.5, 0), dummy = [];
  { const g = []; for (let k = 0; k < 9; k++) g.push(reedG.clone().scale(1, 1.4 + (k % 3) * 0.5, 1).rotateX((k % 3 - 1) * 0.15).rotateZ(((k * 7) % 5 - 2) * 0.08).translate(Math.cos(k * 2.4) * 0.5, 0, Math.sin(k * 2.4) * 0.5)); dummy.push(...g); }
  const tuft = dummy.reduce((acc, g) => { acc.geom(g, null, new THREE.Color(0x8a9a4a)); return acc; }, new Acc()).geometry();
  const reeds = [];
  for (let k = 0; k < 9000 && reeds.length < 2600; k++) {
    const a = R() * 6.28, r = Math.sqrt(R()) * 1600, x = Math.cos(a) * r, z = Math.sin(a) * r, y = ground(x, z);
    if (y < WATER - 0.9 || y > WATER + 1.6 || tDist(x, z) < TEMPLE.r + 4) continue;
    const s = R.range(0.8, 1.8); reeds.push(mat(x, Math.max(y, WATER - 0.3), z, R() * 6, 0, 0, s, s * R.range(0.8, 1.4), s));
  }
  const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const reedIM = new THREE.InstancedMesh(tuft, reedMat, reeds.length); reeds.forEach((m, i) => reedIM.setMatrixAt(i, m));
  { const c = new THREE.Color(); reeds.forEach((m, i) => reedIM.setColorAt(i, c.setHSL(0.17 + R() * 0.08, 0.35, R.range(0.45, 0.75)))); }
  reedIM.receiveShadow = true; root.add(reedIM);

  // 王莲：边缘翻起的大圆叶，一片片挤在静水湾里；夜里开白花
  const pad = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0), new THREE.Vector2(0.98, 0.06), new THREE.Vector2(1.0, 0.16), new THREE.Vector2(0.97, 0.18)], 18);
  const padG = new Acc(); padG.geom(pad, null, (p, c) => c.set(p.y > 0.04 ? 0x8a3a3a : 0x4e7a2a).multiplyScalar(0.85 + 0.3 * Math.abs(Math.sin(Math.atan2(p.z, p.x) * 9)) * (p.y < 0.04 ? 1 : 0.3)));
  const pads = [], flowers = [];
  for (let k = 0; k < 9000 && pads.length < 1800; k++) {
    const a = R() * 6.28, r = Math.sqrt(R()) * 1500, x = Math.cos(a) * r, z = Math.sin(a) * r, y = ground(x, z);
    if (y > WATER - 0.6 || chan(x, z) < 50 || viaDist(x, z) < 6) continue;
    if (nf(x * 0.0045 + 1, z * 0.0045 - 5, 3) > 0.4 || nf(x * 0.02 + 5, z * 0.02 - 1, 3) < 0.5) continue; // 只长在开阔水湾里，一片一片的
    const s = R.range(0.7, 1.5); pads.push(mat(x, WATER + 0.02, z, R() * 6, 0, 0, s, 1, s));
    if (R() < 0.07) flowers.push(mat(x + R.range(-0.3, 0.3), WATER + 0.1, z + R.range(-0.3, 0.3), R() * 6, 0, 0, 1, 1, 1));
  }
  const padMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const padIM = new THREE.InstancedMesh(padG.geometry(), padMat, pads.length); pads.forEach((m, i) => padIM.setMatrixAt(i, m)); padIM.receiveShadow = true; root.add(padIM);
  const flG = new THREE.Group();
  const petal = new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.8, 1);
  const flMat = new THREE.MeshStandardMaterial({ color: 0xf4eee0, roughness: 0.5, emissive: 0xfff2d8, emissiveIntensity: 0 });
  const flIM = new THREE.InstancedMesh(petal, flMat, flowers.length); flowers.forEach((m, i) => flIM.setMatrixAt(i, m)); root.add(flIM);

  return { fungi, tops, titans, big, M, flMat, flora, flowerPos: flowers.map(m => new THREE.Vector3().setFromMatrixPosition(m)) };
}
