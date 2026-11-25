// 球面分块：二频细分的二十面体取对偶 → 42 块（12 块五边形 + 30 块六边形），像足球一样拼满整颗星球。
// 7 块分给模块，其余是海洋、荒原和极地，把模块之间连起来。
import * as THREE from 'three';
import { latLon, latOf, lonOf, frameFor, noise3 } from './sphere.js';

function geodesic() {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(p => new THREE.Vector3(...p).normalize());
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mid = new Map(), faces = [];
  const m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (!mid.has(k)) { mid.set(k, v.length); v.push(v[a].clone().add(v[b]).normalize()); } return mid.get(k); };
  for (const [a, b, c] of f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  return { verts: v, faces };
}

/**
 * @param modules 模块清单（见 src/modules/index.js），每项带 want: [纬度, 经度]
 * 返回 tiles[]：{ id, c 中心方向, frame, n 邻居, corners 角点, pent, kind, module }
 */
export function makeTiles(modules) {
  const { verts, faces } = geodesic();
  // 先转一下整体朝向：让一块六边形正好落在城市想要的位置，再绕它转，使一个邻居落在城市的山后（局部 -z）
  const city = modules[0], cityDir = latLon(...city.want);
  const hex = 12; // 0..11 是五边形，之后都是六边形
  const q = new THREE.Quaternion().setFromUnitVectors(verts[hex], cityDir);
  let V = verts.map(p => p.clone().applyQuaternion(q));
  const nb = Array.from({ length: V.length }, () => new Set());
  for (const [a, b, c] of faces) { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  {
    const fr = frameFor(cityDir), want = fr.z.clone().negate();
    let best = null, bd = -2;
    for (const j of nb[hex]) { const d = V[j].clone().addScaledVector(cityDir, -V[j].dot(cityDir)).normalize(); const k = d.dot(want); if (k > bd) { bd = k; best = d; } }
    const ang = Math.atan2(new THREE.Vector3().crossVectors(best, want).dot(cityDir), best.dot(want));
    const q2 = new THREE.Quaternion().setFromAxisAngle(cityDir, ang);
    V = V.map(p => p.applyQuaternion(q2));
  }
  const tiles = V.map((c, id) => ({ id, c, n: [...nb[id]], pent: id < 12, corners: [], kind: null, module: null, lat: latOf(c), lon: lonOf(c) }));
  for (const [a, b, c] of faces) { const p = V[a].clone().add(V[b]).add(V[c]).normalize(); tiles[a].corners.push(p); tiles[b].corners.push(p); tiles[c].corners.push(p); }
  for (const t of tiles) {
    t.frame = frameFor(t.c);
    t.corners.sort((p, q) => { const a = t.frame.dirToLocal(p, new THREE.Vector3()), b = t.frame.dirToLocal(q, new THREE.Vector3()); return Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x); });
    t.radius = t.corners.reduce((s, p) => s + Math.acos(Math.min(1, p.dot(t.c))), 0) / t.corners.length * 8000; // 平均外接半径（米）
  }

  // —— 模块落位 ——
  const used = new Set();
  const place = (m, t) => { t.kind = m.id; t.module = m; m.tile = t; used.add(t.id); };
  place(city, tiles[hex]);
  // 2 号模块（戈壁大裂谷）固定在城市山后的邻居
  const rift = modules.find(m => m.id === 'gobi-rift');
  if (rift) { const fr = tiles[hex].frame, back = fr.z.clone().negate(); place(rift, tiles[hex].n.map(i => tiles[i]).sort((a, b) => b.c.dot(back) - a.c.dot(back))[0]); }
  for (const m of modules) {
    if (m.tile) continue;
    const want = latLon(...m.want);
    const free = tiles.filter(t => !used.has(t.id) && !t.n.some(i => used.has(i) && tiles[i].module)); // 模块之间至少隔一块
    const pool = free.length ? free : tiles.filter(t => !used.has(t.id));
    place(m, pool.sort((a, b) => b.c.dot(want) - a.c.dot(want))[0]);
  }
  // —— 其余地块：极地冰原、海洋、荒原 ——
  const seaSide = tiles[hex].frame.z.clone(); // 城市的海在 +z 一侧
  for (const t of tiles) {
    if (t.kind) continue;
    if (Math.abs(t.lat) > 62) { t.kind = 'polar'; continue; }
    const nearCitySea = tiles[hex].n.includes(t.id) && t.c.clone().sub(tiles[hex].c).dot(seaSide) > 0;
    const isleNb = t.n.some(i => tiles[i].module && tiles[i].module.id === 'sky-isles');
    const r = noise3(t.c.x * 2.3 + 4, t.c.y * 2.3, t.c.z * 2.3 - 1);
    t.kind = nearCitySea || isleNb || r < 0.5 ? 'ocean' : 'wild';
  }
  return tiles;
}

/** 两块地块交界的类型：海岸 / 山脊 / 海峡 / 干裂谷 */
export function seamType(a, b) {
  const wet = k => k === 'ocean' || k === 'sky-isles';
  if (wet(a.kind) || wet(b.kind)) return 'coast';
  const ids = [a.module?.id, b.module?.id];
  if (ids.includes('ruin-city') && ids.includes('gobi-rift')) return 'ridge';
  if (ids.includes('gobi-rift')) return 'rift';
  if (ids.includes('volcano-forge')) return 'ridge';
  if (ids.includes('salt-mirror')) return 'ridge';
  if (ids.includes('sunken-wetland')) return 'strait';
  const h = Math.abs(Math.sin((a.id * 31 + b.id * 17) * 12.9898) * 43758.5453) % 1;
  return h < 0.5 ? 'ridge' : h < 0.75 ? 'rift' : 'strait';
}
