// 模块 4：浮空群岛 —— 地壳被撕开，碎块浮上天空。
// 一圈特普伊式的平顶台地围着中间的深渊，深渊和台地外侧都沉在云海下；张家界式的砂岩石柱从云里伸出来；
// 被掀起的地壳碎块悬在几百米高的空中，用铁链拴着台地、用吊桥互相连着，瀑布从岛边直接落进云海。
import * as THREE from 'three';
import { smooth, clamp, lerp, rng } from '../../util.js';
import { height, color, plateauMask, abyssR, outerR, strata, nz, CLOUD_Y, PLATEAU } from './terrain.js';
import { makeIsland, ruinsTemple, ruinsArch, ruinsTower, crystalCluster, SHARED } from './isles.js';
import { Links, fixed, onIsle } from './links.js';
import { makeSkySea, fallMaterial, fallGeo } from './clouds.js';
import { Pack, at } from './geo.js';
import { TOURS, HOME } from './tours.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CORE = { x0: -2000, x1: 2000, z0: -2000, z1: 2000 };

/* ---------- 岛的清单 ---------- */
// 心岛在深渊正上方；周围几座近的用吊桥连着，远的只用铁链拴着
const ISLES = [
  { id: 'heart', name: '心岛', x: 0, y: 620, z: 40, r: 230, seed: 1, falls: [2.3, 4.1], depth: 0.85, hill: 0.07, amp: 1.6, crystals: 14,
    clear: [[40, -30, 46], [-90, 70, 26]], ruins(P, R, topY) { ruinsTemple(P, R, 40, topY(40, -30), -30, 30); ruinsTower(P, R, -90, topY(-90, 70) - 1, 70, 52, 10); ruinsArch(P, R, 120, topY(120, 40), 40, 0.4, 1.2); ruinsArch(P, R, -40, topY(-40, -140), -140, 1.4); } },
  { id: 'east', name: '东栈岛', x: 330, y: 600, z: 230, r: 85, seed: 2, falls: [0.9], clear: [[0, 0, 18]], ruins(P, R, topY) { ruinsArch(P, R, 0, topY(0, 0), 0, 2.2); } },
  { id: 'west', name: '西栈岛', x: -300, y: 590, z: -170, r: 70, seed: 3, falls: [3.6], ruins(P, R, topY) { ruinsArch(P, R, 10, topY(10, 10), 10, 0.9, 0.9); } },
  { id: 'lantern', name: '灯岛', x: -440, y: 600, z: 40, r: 55, seed: 4, ruins(P, R, topY) { ruinsTower(P, R, 0, topY(0, 0) - 1, 0, 26, 6); }, clear: [[0, 0, 12]] },
  { id: 'garden', name: '林岛', x: 560, y: 570, z: 380, r: 95, seed: 5, falls: [5.7, 0.3], trees: 1.6 },
  { id: 'stair', name: '阶岛', x: 120, y: 650, z: -380, r: 75, seed: 6, ruins(P, R, topY) { for (let i = 0; i < 9; i++) ruinsArch(P, R, -30 + i * 7, topY(-30 + i * 7, 0) - i * 0.2, 0, Math.PI / 2, 0.55); } },
  { id: 'north', name: '北锚岛', x: -700, y: 470, z: -540, r: 110, seed: 7, falls: [4.6], depth: 0.9 },
  { id: 'high', name: '孤岛', x: 700, y: 780, z: -360, r: 62, seed: 8, crystals: 6 },
  { id: 'cloud', name: '云岛', x: -150, y: 880, z: 560, r: 48, seed: 9, amp: 4 },
  { id: 'moor', name: '系留岛', x: 980, y: 560, z: 0, r: 80, seed: 10, ruins(P, R, topY) { ruinsTemple(P, R, 0, topY(0, 0), 0, 12); }, clear: [[0, 0, 22]] },
  { id: 'drift', name: '流岛', x: -980, y: 620, z: 520, r: 70, seed: 11, falls: [1.2] }
];
// 吊桥：[岛 A, 岛 B]
const BRIDGES = [['heart', 'east'], ['heart', 'west'], ['west', 'lantern'], ['east', 'garden'], ['heart', 'stair']];

/* ---------- 地形网格（核心区，比星球网格精细得多） ---------- */
function makeTerrain(mat) {
  const S = 2 * CORE.x1, N = 300, step = S / N;
  const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const sl = Math.sqrt(Math.max(0, 1 - nrm.getY(i) ** 2)) / Math.max(nrm.getY(i), 0.05);
    color(p.getX(i), p.getZ(i), p.getY(i), sl, c); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv');
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; m.userData.step = step;
  return m;
}

/* ---------- 张家界式的砂岩石柱 ---------- */
function pillarGeo(x, z, base, top, rad, R) {
  const sides = 7 + Math.floor(R() * 5), rows = Math.max(6, Math.round((top - base) / 11)), pos = [], col = [], c = new THREE.Color();
  const lean = [R.range(-0.04, 0.04), R.range(-0.04, 0.04)], seed = R() * 50;
  const ring = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, y = lerp(base, top, v) + (j && j < rows ? R.range(-3, 3) : 0), notch = (j % 2 ? 0.9 : 1) * (1 + 0.22 * nz(seed + v * 5, seed * 0.7, 2)) * lerp(1.2, 0.86, v);
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2 + 0.25 * Math.sin(seed + i), k = rad * notch * (1 + 0.16 * Math.sin(a * 3 + seed + v * 5) + 0.1 * Math.sin(a * 5 - seed + v * 13));
      pts.push([x + Math.cos(a) * k + lean[0] * (y - base), y, z + Math.sin(a) * k + lean[1] * (y - base)]);
    }
    ring.push(pts);
  }
  const push = (q, cTop, j = 0) => {
    pos.push(...q);
    if (cTop) c.copy(cTop);
    else {
      strata(q[1], q[0], q[2], c); c.lerp(PILLAR, 0.55);
      const a = Math.atan2(q[2] - z, q[0] - x), streak = nz(a * 3 + seed, q[1] * 0.004, 2);
      c.multiplyScalar(0.85 + 0.25 * streak);
      c.lerp(MOSSC, clamp(smooth(0.2, 1.1, nz(q[0] * 0.07 + a, q[1] * 0.045, 2)) * 0.55 + (j % 3 === 0 ? 0.25 : 0), 0, 0.8));
      c.multiplyScalar(lerp(0.5, 1, smooth(0, CLOUD_Y + 30, q[1])));
    }
    col.push(c.r, c.g, c.b);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < sides; i++) {
    const a = ring[j][i], b = ring[j][(i + 1) % sides], cc = ring[j + 1][i], d = ring[j + 1][(i + 1) % sides];
    push(a, null, j); push(cc, null, j + 1); push(b, null, j); push(b, null, j); push(cc, null, j + 1); push(d, null, j + 1);
  }
  // 顶：微微隆起的草帽
  const tp = ring[rows], cx = tp.reduce((s, q) => s + q[0], 0) / sides, cz = tp.reduce((s, q) => s + q[2], 0) / sides;
  for (let i = 0; i < sides; i++) { const a = tp[i], b = tp[(i + 1) % sides]; push(a, GRASSC); push([cx, top + rad * 0.18, cz], GRASSC2); push(b, GRASSC); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return { g, cx, cz };
}
const PILLAR = new THREE.Color(0xa49886), MOSSC = new THREE.Color(0x55703c), GRASSC = new THREE.Color(0x6a8a42), GRASSC2 = new THREE.Color(0x87974f);

/* ---------- 漂浮的碎石 ---------- */
function rockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position, R = rng(5);
  const map = new Map();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!map.has(k)) map.set(k, R.range(0.7, 1.25)); const s = map.get(k); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s); }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3).fill(1), 3)); return g;
}

export default {
  id: 'sky-isles', no: 4, name: '浮空群岛', sub: '撕开的地壳浮在云海上空', status: 'built', want: [25, 140],
  note: '地壳在这里被整个撕开：一圈平顶的砂岩台地围着一道深渊，深渊和台地外都沉在云海下面，只有石柱从云里伸出来。被掀起的地壳碎块悬在几百米高的空中，粗铁链把它们拴在台地上，近的几座之间挂着木板吊桥，瀑布从岛边直接落进云海。最大的「心岛」下面吊着一颗发光的晶核。参考张家界的砂岩峰林和委内瑞拉的特普伊平顶山。',
  core: CORE, home: HOME, tours: TOURS,
  route: { x: 0, z: 0, alt: 760 },
  height, color,
  build({ root }) {
    const R = rng(404);
    const M = {
      terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
      stone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
      root: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
      tree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x4a423b, roughness: 0.55, metalness: 0.65 }),
      wood: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
      rope: new THREE.MeshStandardMaterial({ color: 0x8c7a5a, roughness: 1 }),
      crystal: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.9, 2.3) }),
      core: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 3.0) }),
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.2, 2.4), transparent: true, opacity: 0.6, depthWrite: false }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5) }),
      water: new THREE.MeshStandardMaterial({ color: 0x4d7a80, roughness: 0.1, metalness: 0.35 })
    };
    // 地面
    const terrain = makeTerrain(M.terrain); root.add(terrain);

    // 石柱：落在深渊、裂口和台地外侧（地面在云下的地方）
    const pillars = new Pack(), tops = [];
    for (let tries = 0; tries < 5000 && tops.length < 260; tries++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 1950, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h0 = height(x, z); if (h0 > 40) continue;
      const near = Math.min(Math.abs(r - abyssR(a, x, z)), Math.abs(r - outerR(a, x, z)));
      const rad = R.range(11, 30) * (near < 250 ? 1.2 : 1);
      if (tops.some(t => Math.hypot(t.x - x, t.z - z) < t.rad + rad + 18)) continue;
      if (Math.hypot(x, z - 40) < 260 && R() < 0.6) continue; // 心岛正下方留空一些
      const top = Math.min((near < 300 ? R.range(230, 360) : R.range(180, 330)) + (R() < 0.12 ? 90 : 0), 415);
      if (Math.abs(Math.hypot(x, z - 40) - 360) < rad + 45) continue; // 给「心岛之下」的巡游航线让路
      const { g, cx, cz } = pillarGeo(x, z, h0 - 10, top, rad, R);
      pillars.add(g); tops.push({ x: cx, z: cz, y: top, rad });
      // 峰林：主峰旁边常常挤着一两根矮一些、细一些的
      for (let k = 0, n = R() < 0.55 ? Math.floor(R.range(1, 3.99)) : 0; k < n; k++) {
        const b = R() * 6.28, r2 = rad * R.range(0.35, 0.7), x2 = x + Math.cos(b) * (rad + r2 + R.range(3, 10)), z2 = z + Math.sin(b) * (rad + r2 + R.range(3, 10)), h2 = height(x2, z2);
        if (h2 > 40 || tops.some(t => Math.hypot(t.x - x2, t.z - z2) < t.rad + r2 + 4) || Math.abs(Math.hypot(x2, z2 - 40) - 360) < r2 + 45) continue;
        const top2 = top * R.range(0.6, 0.92); if (top2 < CLOUD_Y + 15) continue;
        const p2 = pillarGeo(x2, z2, h2 - 10, top2, r2, R); pillars.add(p2.g); tops.push({ x: p2.cx, z: p2.cz, y: top2, rad: r2 });
      }
    }
    root.add(pillars.build(M.rock));

    // 浮岛
    const shared = SHARED();
    const isles = ISLES.map(s => makeIsland(s, M, shared));
    const byId = Object.fromEntries(isles.map(i => [i.spec.id, i]));
    for (const i of isles) root.add(i.g);

    // 晶簇（每座岛一个实例化网格）
    const octa = new THREE.OctahedronGeometry(1, 0), d = new THREE.Object3D();
    for (const i of isles) {
      if (!i.crystals.length) continue;
      const im = new THREE.InstancedMesh(octa, M.crystal, i.crystals.length);
      i.crystals.forEach((c, k) => { d.position.set(c.x, c.y, c.z); d.rotation.set(c.rx, c.ry, c.rz); d.scale.set(c.sx, c.sy, c.sx); d.updateMatrix(); im.setMatrixAt(k, d.matrix); });
      im.userData.noPick = true; i.g.add(im);
    }
    // 心岛下面吊着的晶核，和两道慢慢转的光环
    const heart = byId.heart, tipY = -heart.r * 0.85 * 1.53, coreY = tipY - 68;
    const coreG = new THREE.Group(); coreG.position.set(0, coreY, 0);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), M.core); gem.scale.set(16, 52, 16); coreG.add(gem);
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(46, 1.2, 6, 72), M.ring), ringB = new THREE.Mesh(new THREE.TorusGeometry(64, 0.8, 6, 90), M.ring);
    ringA.rotation.x = Math.PI / 2 + 0.25; ringB.rotation.x = Math.PI / 2 - 0.35; coreG.add(ringA, ringB);
    // 从岛底垂下来、吊住晶核的几根链（静止，跟着岛走）
    {
      const P = new Pack();
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * 6.28 + 0.4, top = V(Math.cos(a) * 22, tipY * 0.9, Math.sin(a) * 22), bot = V(Math.cos(a) * 9, coreY + 46, Math.sin(a) * 9);
        const l = top.distanceTo(bot), n = Math.round(l / 2.4), dir = bot.clone().sub(top).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
        for (let j = 0; j < n; j++) { const p = top.clone().lerp(bot, (j + 0.5) / n), qq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), (j % 2) * Math.PI / 2)); P.add(new THREE.TorusGeometry(0.7, 0.22, 5, 10).scale(1, 1.55, 1), new THREE.Matrix4().compose(p, qq, V(1.2, 1.2, 1.2)), new THREE.Color(0x4a423b)); }
      }
      const m = P.build(M.iron); heart.g.add(m);
    }
    heart.g.add(coreG);
    // 绕着心岛转的小晶体（和城市浮空岛一样）
    const orbit = [];
    for (let k = 0; k < 26; k++) {
      const c = new THREE.Mesh(octa, M.crystal), s = R.range(1.5, 4); c.scale.set(s * 0.6, s * 1.7, s * 0.6);
      c.userData = { a: R() * 6.28, r: R.range(250, 340), y: R.range(-260, 10), sp: R.range(0.05, 0.14) * (R() < 0.5 ? -1 : 1) };
      heart.g.add(c); orbit.push(c);
    }

    // 灯：吊桥两头的灯笼、心岛神殿里
    const lamps = [], lampGeo = new THREE.SphereGeometry(0.55, 8, 6), postGeo = new THREE.CylinderGeometry(0.12, 0.16, 3.2, 5).translate(0, 1.6, 0);
    const lampAt = (isle, x, z) => {
      const y = isle.topY(x, z); const post = new THREE.Mesh(postGeo, M.iron); post.position.set(x, y, z); isle.g.add(post);
      const l = new THREE.Mesh(lampGeo, M.lamp); l.position.set(x, y + 3.3, z); isle.g.add(l); lamps.push([isle, x, y + 3.3, z]);
    };

    // 吊桥和铁链
    const links = new Links(M);
    const edge = (isle, toward, inset = 0.96) => { const a = Math.atan2(toward.z - isle.g.position.z, toward.x - isle.g.position.x), x = Math.cos(a) * isle.rho(a) * inset, z = Math.sin(a) * isle.rho(a) * inset; return { a, x, z, y: isle.topY(x, z) + 0.25 }; };
    for (const [ia, ib] of BRIDGES) {
      const A = byId[ia], B = byId[ib], ea = edge(A, B.g.position), eb = edge(B, A.g.position);
      links.bridge(onIsle(A, V(ea.x, ea.y, ea.z)), onIsle(B, V(eb.x, eb.y, eb.z)));
      for (const [I, e] of [[A, ea], [B, eb]]) for (const s of [-1, 1]) { const px = e.x - Math.cos(e.a) * 1.5 + Math.cos(e.a + Math.PI / 2) * s * 2.6, pz = e.z - Math.sin(e.a) * 1.5 + Math.sin(e.a + Math.PI / 2) * s * 2.6; lampAt(I, px, pz); }
    }
    // 台地上的锚：石墩 + 铁桩
    const anchors = new Pack(), plateauAnchor = a => {
      let r = abyssR(a, 0, 0) + 70, x = Math.cos(a) * r, z = Math.sin(a) * r;
      for (let k = 0; k < 20 && plateauMask(x, z) < 0.95; k++) { r += 25; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const y = height(x, z);
      anchors.add(new THREE.BoxGeometry(22, 8, 22).translate(0, 2, 0), at(x, y, z, a), (px, py, pz, o) => strata(py * 2, px, pz, o).multiplyScalar(0.9));
      anchors.add(new THREE.CylinderGeometry(4.5, 5.5, 12, 10).translate(0, 12, 0), at(x, y, z), new THREE.Color(0x4a423b));
      anchors.add(new THREE.TorusGeometry(5, 1.2, 6, 16), at(x, y + 17, z, a + Math.PI / 2), new THREE.Color(0x3b3632));
      return V(x, y + 17, z);
    };
    // 心岛拴在五块台地上
    for (const a of [0.95, 2.1, 3.15, 4.2, 5.25]) {
      const B = plateauAnchor(a), loc = V(Math.cos(a) * heart.rho(a) * 0.9, -heart.r * 0.22, Math.sin(a) * heart.rho(a) * 0.9);
      links.chain(onIsle(heart, loc), fixed(B), { size: 2.6, sag: 0.05 });
    }
    // 别的岛：拴在最近的台地上，或拴在心岛上
    const chainTo = (id, toward, size = 1.6) => { const I = byId[id], a = Math.atan2(toward.z - I.g.position.z, toward.x - I.g.position.x), loc = V(Math.cos(a) * I.rho(a) * 0.9, -I.r * 0.2, Math.sin(a) * I.rho(a) * 0.9); links.chain(onIsle(I, loc), fixed(toward), { size, sag: 0.04 }); };
    for (const id of ['north', 'garden', 'moor', 'drift']) { const I = byId[id], a = Math.atan2(I.g.position.z, I.g.position.x); chainTo(id, plateauAnchor(a + (id === 'moor' ? 0 : 0.15))); }
    for (const id of ['high', 'cloud', 'lantern']) {
      const I = byId[id], a = Math.atan2(heart.g.position.z - I.g.position.z, heart.g.position.x - I.g.position.x), loc = V(Math.cos(a) * I.rho(a) * 0.9, -I.r * 0.25, Math.sin(a) * I.rho(a) * 0.9);
      const b = Math.atan2(I.g.position.z - heart.g.position.z, I.g.position.x - heart.g.position.x), locH = V(Math.cos(b) * heart.rho(b) * 0.92, -heart.r * 0.3, Math.sin(b) * heart.rho(b) * 0.92);
      links.chain(onIsle(I, loc), onIsle(heart, locH), { size: 1.4, sag: 0.08 });
    }
    // 断掉的链：从岛边垂进云里
    for (const [id, a, l] of [['cloud', 2.5, 260], ['stair', 4.4, 190], ['high', 1.0, 300], ['east', 5.2, 150], ['heart', 0.2, 280]]) {
      const I = byId[id], loc = V(Math.cos(a) * I.rho(a) * 0.95, -I.r * 0.12, Math.sin(a) * I.rho(a) * 0.95);
      links.chain(onIsle(I, loc), out => out.copy(loc).add(I.g.position).add(V(Math.cos(a) * 12, -l, Math.sin(a) * 12)), { size: id === 'heart' ? 2.2 : 1.3, sag: 0.02 });
    }
    root.add(anchors.build(M.stone));
    links.build(root);

    // 台地上的林子与废墟
    const shared2 = shared, ptrees = { pine: [], oak: [] };
    for (let x = CORE.x0; x < CORE.x1; x += 17) for (let z = CORE.z0; z < CORE.z1; z += 17) {
      const px = x + R.range(-6, 6), pz = z + R.range(-6, 6);
      if (plateauMask(px, pz) < 0.9) continue;
      const f = nz(px * 0.0045 + 9, pz * 0.0045 - 2, 3); if (f < -0.25 && R() > 0.05) continue; if (f < 0.25 && R() > 0.45) continue;
      ptrees[f > 0.5 || R() < 0.7 ? 'pine' : 'oak'].push([px, height(px, pz) - 0.4, pz, R.range(1.1, 2.1)]);
    }
    for (const t of tops) for (let k = 0; k < Math.round(t.rad / 5); k++) { const a = R() * 6.28, rr = Math.sqrt(R()) * t.rad * 0.7; ptrees.pine.push([t.x + Math.cos(a) * rr, t.y + t.rad * 0.12, t.z + Math.sin(a) * rr, R.range(0.6, 1.3)]); }
    for (const k of ['pine', 'oak']) {
      const list = ptrees[k], im = new THREE.InstancedMesh(shared2[k], M.tree, list.length), c = new THREE.Color();
      list.forEach(([x, y, z, s], i) => { d.position.set(x, y, z); d.rotation.set(R.range(-0.06, 0.06), R() * 6.28, R.range(-0.06, 0.06)); d.scale.set(s, s * R.range(0.85, 1.3), s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.setHSL(0.24 + R.range(-0.04, 0.05), 0.3, R.range(0.4, 0.58)).multiplyScalar(1.8)); });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
    }
    const ruins = new Pack();
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * 6.28 + R.range(-0.2, 0.2), r = abyssR(a) + R.range(90, 280), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (plateauMask(x, z) < 0.98) continue;
      const y = height(x, z);
      if (k % 3 === 0) ruinsTower(ruins, R, x, y - 2, z, R.range(22, 40), R.range(6, 9)); else ruinsArch(ruins, R, x, y - 0.5, z, R() * 3, R.range(0.9, 1.4));
    }
    { const m = ruins.build(M.stone); if (m) root.add(m); }

    // 瀑布：浮岛边上的，和台地内崖上的（特普伊式）
    const fallMat = fallMaterial({ uTime: { value: 0 }, uFallBright: { value: 1 } }), mist = [];
    for (const I of isles) for (const s of I.fallSpots) {
      const H = I.spec.y - CLOUD_Y + 30, fm = new THREE.Mesh(fallGeo(s.w, H), fallMat);
      fm.position.set(s.x, I.topY(s.x, s.z) + 0.3, s.z); fm.rotation.y = -s.a; fm.renderOrder = 3; I.g.add(fm);
      // 岛顶：泉眼的水潭 + 一道小溪通到崖边
      const pool = new THREE.Mesh(new THREE.CircleGeometry(s.w * 0.9, 16).rotateX(-Math.PI / 2), M.water), px = s.x * 0.55, pz = s.z * 0.55;
      pool.position.set(px, I.topY(px, pz) + 0.35, pz); I.g.add(pool);
      const len = Math.hypot(s.x - px, s.z - pz), brook = new THREE.Mesh(new THREE.PlaneGeometry(len, s.w * 0.4).rotateX(-Math.PI / 2), M.water);
      brook.position.set((s.x + px) / 2, Math.max(I.topY((s.x + px) / 2, (s.z + pz) / 2), I.topY(s.x, s.z)) + 0.4, (s.z + pz) / 2); brook.rotation.y = -s.a; I.g.add(brook);
      const out = Math.min(Math.sqrt(H * 6), 26) + H * 0.02;
      mist.push([I.spec.x + s.x + Math.cos(s.a) * out, CLOUD_Y + 6, I.spec.z + s.z + Math.sin(s.a) * out, s.w * 2.2]);
    }
    for (const a of [0.6, 1.95, 3.4, 5.0, 5.95]) {
      let r = abyssR(a) + 12, x = Math.cos(a) * r, z = Math.sin(a) * r;
      for (let k = 0; k < 30 && height(x, z) < PLATEAU - 60; k++) { r += 6; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const y = height(x, z), H = y - CLOUD_Y + 30, w = R.range(9, 16);
      const fm = new THREE.Mesh(fallGeo(w, H), fallMat); fm.position.set(x, y + 0.5, z); fm.rotation.y = -(a + Math.PI); fm.renderOrder = 3; root.add(fm);
      // 台地上流向崖边的河
      const L = 260, river = new THREE.Mesh(new THREE.PlaneGeometry(L, w * 0.9, 24, 1).rotateX(-Math.PI / 2), M.water);
      const rp = river.geometry.attributes.position;
      for (let i = 0; i < rp.count; i++) { const lx = rp.getX(i) + L / 2, lz = rp.getZ(i), px = x + Math.cos(a) * lx - Math.sin(a) * lz, pz = z + Math.sin(a) * lx + Math.cos(a) * lz; rp.setXYZ(i, px, height(px, pz) + 0.6, pz); }
      river.geometry.computeVertexNormals(); river.receiveShadow = true; root.add(river);
      const out = Math.min(Math.sqrt(H * 6), 26);
      mist.push([x - Math.cos(a) * out, CLOUD_Y + 6, z - Math.sin(a) * out, w * 2]);
    }

    // 云海
    for (const t of tops) if (R() < 0.6) mist.push([t.x, CLOUD_Y - 4, t.z, t.rad * 1.6, 0]);
    const sea = makeSkySea(root, mist, R);
    fallMat.uniforms.uTime = sea.U.uTime; fallMat.uniforms.uBright = sea.U.uFallBright;

    // 漂浮碎石：被撕下来的小块地壳，绕着深渊慢慢转
    const NR = 220, rocks = new THREE.InstancedMesh(rockGeo(), M.rock, NR), rockData = [];
    { const c = new THREE.Color(); for (let i = 0; i < NR; i++) {
      const big = R() < 0.1, r = R.range(260, 1250), s = big ? R.range(7, 16) : R.range(1.5, 5);
      rockData.push({ a: R() * 6.28, r, y: R.range(260, 900), s, sp: R.range(0.004, 0.012) * (r < 600 ? 1.4 : 1), ph: R() * 6.28, rx: R() * 6, rz: R() * 6, spin: R.range(-0.1, 0.1) });
      rocks.setColorAt(i, strata(R() * 300, R() * 100, 0, c).multiplyScalar(0.85));
    } }
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.frustumCulled = false; root.add(rocks);
    const placeRocks = t => {
      for (let i = 0; i < NR; i++) {
        const q = rockData[i], a = q.a + t * q.sp;
        d.position.set(Math.cos(a) * q.r, q.y + Math.sin(t * 0.2 + q.ph) * 5, 40 + Math.sin(a) * q.r);
        d.rotation.set(q.rx + t * q.spin * 0.3, q.ph + t * q.spin, q.rz); d.scale.setScalar(q.s); d.updateMatrix(); rocks.setMatrixAt(i, d.matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
    };
    placeRocks(0);

    // 从太空看得见的夜光
    const lights = [];
    for (const [I, x, y, z] of lamps) lights.push([I.spec.x + x, I.spec.y + y, I.spec.z + z, 0.6]);
    lights.push([0, heart.spec.y + coreY, 40, 1]);
    for (const I of isles) lights.push([I.spec.x, I.spec.y - I.r * 0.8, I.spec.z, 0.35]);

    let frame = 0;
    return {
      isles, links, sea, lights,
      update(dt, t, env) {
        const night = env.night;
        // 岛：缓慢上下浮动、轻微摇摆
        for (const I of isles) {
          const u = I.g.userData; I.g.position.y = u.base + Math.sin(t * 0.22 + u.ph) * u.amp;
          I.g.rotation.set(Math.sin(t * 0.13 + u.ph) * u.sway, 0, Math.cos(t * 0.11 + u.ph * 1.3) * u.sway);
        }
        if ((frame++ & 1) === 0) links.update();
        placeRocks(t);
        coreG.rotation.y = t * 0.15; gem.position.y = Math.sin(t * 0.5) * 3; ringA.rotation.z = t * 0.08; ringB.rotation.z = -t * 0.05;
        for (const c of orbit) { const q = c.userData, a = q.a + t * q.sp; c.position.set(Math.cos(a) * q.r, q.y + Math.sin(t * 0.6 + q.a) * 3, Math.sin(a) * q.r); c.rotation.y = t * 0.4 + q.a; }
        M.crystal.color.setRGB(0.7 + 0.4 * night, 1.9 + 0.8 * night, 2.3 + 0.8 * night);
        M.core.color.setRGB(1.2 + 0.6 * night, 2.4 + 1.2 * night, 2.8 + 1.4 * night).multiplyScalar(0.9 + 0.1 * Math.sin(t * 1.3));
        M.ring.opacity = 0.4 + 0.45 * night;
        const L = clamp(env.lamp, 0, 1); M.lamp.color.setRGB(0.5 + 2.2 * L, 0.42 + 1.4 * L, 0.3 + 0.6 * L);
        // 下雨时岩面和木板变湿
        M.rock.roughness = lerp(0.92, 0.45, env.wet); M.terrain.roughness = lerp(0.95, 0.5, env.wet); M.wood.roughness = lerp(0.9, 0.5, env.wet);
        sea.update(t, env);
      },
      setPixelRatio(px) { sea.U.uPx.value = px; }
    };
  }
};
