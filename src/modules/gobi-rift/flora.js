// 植被：台地上稀疏的灌丛，谷底和裂谷肩上的平顶金合欢（东非草原的剪影），绿洲边的棕榈和芦苇。
import * as THREE from 'three';
import { Kit, M } from './kit.js';
import { dust } from './weather.js';
import { floraLod, cloneMat, LOW_Q } from '../../models.js';
import { ground, xc, halfW, floorFrac, OASES, LAKE, xRail, xRiver, BUTTES, edgeDist, fb, smooth, clamp, lerp } from './terrain.js';

const C = c => new THREE.Color(c);
const F = { trunk: C(0x5b4632), trunk2: C(0x7a6248), leaf: C(0x4e5a2a), leaf2: C(0x667233), leafDry: C(0x9a9150), palm: C(0x4f6a2a), palm2: C(0x6f8a34), reed: C(0x8a9444) };

const slopeAt = (x, z) => Math.hypot(ground(x + 3, z) - ground(x - 3, z), ground(x, z + 3) - ground(x, z - 3)) / 6;
const inButte = (x, z, pad = 1.05) => BUTTES.some(b => { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.hypot(lx / b.rx, lz / b.rz) < pad * 1.2; });
const onRail = (x, z) => Math.abs(x - xRail(z)) < 7;
const inWater = (x, z) => edgeDist(x, z) > 0.64 || Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.3 || OASES.some(o => Math.hypot(x - o.x, z - o.z) < o.r * 1.2);

/** 平顶金合欢：歪着长的树干分三四根枝，顶上一层扁平的树冠 */
function acacia(k, x, z, s, rnd) {
  const y = ground(x, z) - 0.3, ry = rnd() * 6.28;
  k.push(M(x, y, z, 0, ry, 0, s));
  const lean = (rnd() - 0.5) * 0.4, H = 4 + rnd() * 2;
  k.cyl(0.18, 0.32, H, 6, M(0, H / 2, 0, 0, 0, lean), F.trunk, { rust: 0, sand: 0.15 });
  const top = new THREE.Vector3(-Math.sin(lean) * H, Math.cos(lean) * H, 0);
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28 + rnd(), L = 2.4 + rnd() * 1.6, out = new THREE.Vector3(top.x + Math.cos(a) * L, top.y + 1.4 + rnd(), top.z + Math.sin(a) * L);
    k.rod(top, out, 0.16, 0.07, 5, F.trunk2, { rust: 0, sand: 0 });
    // 扁平的树冠：几块压扁的球
    for (let j = 0; j < 3; j++) k.sph(1.8 + rnd() * 1.4, M(out.x + (rnd() - 0.5) * 3, out.y + 0.4 + rnd() * 0.4, out.z + (rnd() - 0.5) * 3, 0, rnd() * 3, 0, 1, 0.22, 1), rnd() < 0.5 ? F.leaf : F.leaf2, { rust: 0, sand: 0.1 }, 8, 4);
  }
  k.sph(4.4, M(top.x, top.y + 2.0, top.z, 0, 0, 0, 1.5, 0.16, 1.3), F.leaf, { rust: 0, sand: 0.05 }, 10, 4);
  k.pop();
  return { x, y, z, ry, s }; // GLB 金合欢高 7 米，和程序化的差不多，直接用同一个缩放
}

/** 棕榈：弯曲的树干 + 一圈下垂的叶片 */
function palm(k, x, z, s, rnd) {
  const y = ground(x, z) - 0.2, a = rnd() * 6.28, bend = 0.15 + rnd() * 0.25, H = 8 + rnd() * 5;
  k.push(M(x, y, z, 0, a, 0, s));
  const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * bend * 2.2) * H * 0.35, t * H, 0)); }
  k.tube(pts, 0.28, F.trunk, { rust: 0, sand: 0.1 }, 6);
  const top = pts[6];
  for (let i = 0; i < 9; i++) {
    const b = i / 9 * 6.28 + rnd() * 0.3, L = 3.6 + rnd() * 1.4;
    // 叶片：一条下垂的细长弧面
    k.surf((u, v) => {
      const r = u * L, droop = u * u * 2.2, w = (v - 0.5) * 1.1 * Math.sin(u * Math.PI * 0.95 + 0.1);
      return [top.x + Math.cos(b) * r - Math.sin(b) * w, top.y + 0.6 * u - droop, top.z + Math.sin(b) * r + Math.cos(b) * w];
    }, 6, 2, null, i % 2 ? F.palm : F.palm2, { rust: 0, sand: 0 });
  }
  k.pop();
  return { x, y, z, ry: a, s: s * H / 12 }; // GLB 棕榈高 12 米
}

/**
 * 金合欢和棕榈换成 GLB。树不多（一百来棵），加载好以后不论远近都用 GLB（近处 LOD0、其余 LOD1），
 * 程序化的整块树随之隐藏；加载失败就一直用程序化的。
 */
function glbTrees(root, proc, acacias, palms) {
  const empty = { geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)), material: new THREE.MeshBasicMaterial() };
  const prep = m => { const c = cloneMat(m), key = c.customProgramCacheKey(); dust(c); c.customProgramCacheKey = () => key + '|gobiDust'; return c; };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), white = new THREE.Color(1, 1, 1);
  const items = list => list.map(t => ({ m: m.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(up, t.ry), new THREE.Vector3(t.s, t.s, t.s)).clone(), c: white }));
  let left = 2, ok = true;
  const done = good => { ok = ok && good; if (--left === 0 && ok) proc.visible = false; };
  return [
    floraLod(root, items(acacias), empty, ['gobi-rift/acacia-1', 'gobi-rift/acacia-2'], { near: LOW_Q ? 0 : 120, mid: 1e9, prep, onReady: done }),
    floraLod(root, items(palms), empty, ['gobi-rift/palm-1', 'gobi-rift/palm-2'], { near: LOW_Q ? 0 : 120, mid: 1e9, prep, onReady: done })
  ];
}

export function buildFlora(root, dust, rnd) {
  const k = new Kit(), acacias = [], palms = [];
  // 金合欢：谷底、裂谷肩、台地上零星几棵
  let n = 0;
  for (let i = 0; i < 900 && n < 85; i++) {
    const z = (rnd() - 0.5) * 3000, x = xc(z) + (rnd() - 0.5) * halfW(z) * 3.4;
    const u = Math.abs(x - xc(z)) / halfW(z), y = ground(x, z);
    if (Math.abs(x) > 1500 || inButte(x, z, 1.3) || onRail(x, z) || inWater(x, z) || slopeAt(x, z) > 0.25) continue;
    const floor = u < floorFrac(z), shoulder = u > 1 && u < 1.6;
    if (!(floor && rnd() < 0.5 || shoulder && x > xc(z) && rnd() < 0.35 || rnd() < 0.04)) continue;
    if (x < xc(z) - halfW(z) * 1.1 && rnd() < 0.85) continue; // 沙丘上很少
    acacias.push(acacia(k, x, z, 0.9 + rnd() * 0.6, rnd)); n++;
  }
  // 绿洲：棕榈围着水塘
  for (const o of OASES) for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.28, r = o.r * (1.15 + rnd() * 0.9), x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
    if (onRail(x, z)) continue;
    palms.push(palm(k, x, z, 0.85 + rnd() * 0.5, rnd));
  }
  // 湖岸几棵
  for (let i = 0; i < 6; i++) { const a = 1.2 + rnd() * 0.8, x = LAKE.x + Math.cos(a) * LAKE.rx * 1.5, z = LAKE.z + Math.sin(a) * LAKE.rz * 1.25; if (!onRail(x, z)) palms.push(palm(k, x, z, 0.9, rnd)); }
  const out = k.build(dust(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })));
  root.add(out.solid);
  const lods = glbTrees(root, out.solid, acacias, palms);

  // 灌丛：实例化的小团
  const geo = new THREE.IcosahedronGeometry(1, 0), list = [];
  for (let i = 0; i < 26000 && list.length < 3600; i++) {
    const x = (rnd() - 0.5) * 3000, z = (rnd() - 0.5) * 3300, X = xc(z), W = halfW(z), u = Math.abs(x - X) / W;
    if (onRail(x, z) || inWater(x, z)) continue;
    const dune = x < X - W * 1.1, floor = u < floorFrac(z);
    const wet = OASES.reduce((m, o) => Math.max(m, smooth(o.r * 3.5, o.r * 1.2, Math.hypot(x - o.x, z - o.z))), 0) + smooth(26, 6, Math.abs(x - xRiver(z))) * 0.4 * (floor ? 1 : 0);
    const p = (dune ? 0.03 : floor ? 0.35 : 0.22) * (fb(x * 0.01, z * 0.01, 2) * 1.5) + wet * 0.9;
    if (rnd() > p) continue;
    if (slopeAt(x, z) > 0.45 || inButte(x, z, 1.0)) continue;
    list.push([x, z, 0.5 + rnd() * (wet > 0.3 ? 1.6 : 1.1), wet]);
  }
  const im = new THREE.InstancedMesh(geo, dust(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true })), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  list.forEach(([x, z, s, wet], i) => {
    e.set(0, rnd() * 6.28, 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, ground(x, z) + s * 0.25, z), q, new THREE.Vector3(s * 1.2, s * 0.65, s * 1.1)); im.setMatrixAt(i, m);
    c.copy(F.leafDry).lerp(F.leaf2, clamp(wet * 1.4 + rnd() * 0.3, 0, 1)).multiplyScalar(0.8 + rnd() * 0.3); im.setColorAt(i, c);
  });
  im.castShadow = true; im.receiveShadow = true; root.add(im);

  // 芦苇：绿洲水边的细长锥
  const rg = new THREE.ConeGeometry(0.12, 1, 4); rg.translate(0, 0.5, 0);
  const reeds = [];
  for (const o of [...OASES, { ...LAKE, r: 0 }]) for (let i = 0; i < 500; i++) {
    let x, z;
    if (o.r) { const a = rnd() * 6.28, r = o.r * (0.95 + rnd() * 0.35); x = o.x + Math.cos(a) * r; z = o.z + Math.sin(a) * r; }
    else { const a = rnd() * 6.28, r = 1.02 + rnd() * 0.12; x = LAKE.x + Math.cos(a) * LAKE.rx * r * 1.2; z = LAKE.z + Math.sin(a) * LAKE.rz * r * 1.15; if (rnd() < 0.6) continue; }
    reeds.push([x, z, 1.2 + rnd() * 1.8]);
  }
  const rm = new THREE.InstancedMesh(rg, dust(new THREE.MeshStandardMaterial({ color: F.reed, roughness: 0.8 })), reeds.length);
  reeds.forEach(([x, z, h], i) => { e.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3); q.setFromEuler(e); m.compose(new THREE.Vector3(x, ground(x, z) - 0.1, z), q, new THREE.Vector3(1, h, 1)); rm.setMatrixAt(i, m); });
  root.add(rm);
  return lods;
}
