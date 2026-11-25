// 从城市来的铁路：北端断头崖下的隧道口 → 沙埋的铁路小镇「北站」→ 齿轮拱门 → 绿洲站 → 巨人身下 → 盐湖站。
// 一列旧电车在这条线上往返，进站减速、停一会儿、再出发；夜里车头灯和车窗会亮。
import * as THREE from 'three';
import { Kit, M, PAL } from './kit.js';
import { ground, xRail, railY, RAIL, floorY, xc, halfW, floorFrac, HEAD_Z, OASES, smooth, clamp, lerp } from './terrain.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = c => new THREE.Color(c);
const CON = { concrete: C(0xb9ac95), concrete2: C(0x9c8f7b), adobe: C(0xc39a70), adobe2: C(0xa87c58), dark: C(0x231d19), wood: C(0x6b5440), roof: C(0x7d6a58), win: C(0xffb868) };

/** 铁轨中线（北 → 南），每 3 米一个点 */
export function railPath() {
  const pts = [];
  for (let z = RAIL.z0; z >= RAIL.z1; z -= 3) pts.push(V(xRail(z), railY(z), z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  curve.arcLengthDivisions = 2000;
  return curve;
}
export const STATIONS = [
  { name: '北站', z: 1265 }, { name: '绿洲站', z: OASES[0].z - 20 }, { name: '盐湖站', z: RAIL.z1 + 40 }
];

/** 轨道：两条钢轨 + 枕木 + 碎石道床 */
function track(root, curve, dust) {
  const L = curve.getLength(), N = Math.floor(L / 1.0);
  const bal = [], idx = [], col = [], rails = new Kit();
  const p = V(), t = V(), side = V(), up = V(0, 1, 0), cc = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    curve.getPointAt(i / N, p); curve.getTangentAt(i / N, t); side.crossVectors(t, up).normalize();
    for (const [o, dy] of [[-2.4, -0.5], [-1.6, 0.02], [1.6, 0.02], [2.4, -0.5]]) bal.push(p.x + side.x * o, p.y - 0.12 + dy, p.z + side.z * o);
    const n = Math.sin(i * 0.37) * 0.5 + Math.sin(i * 0.071) * 0.5;
    for (let k = 0; k < 4; k++) { cc.setRGB(0.42, 0.37, 0.32).lerp(C(0xd49a62), clamp(n * 0.6 + 0.2, 0, 0.8)); col.push(cc.r, cc.g, cc.b); }
    if (i < N) for (let k = 0; k < 3; k++) { const a = i * 4 + k, b = a + 4; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bal, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const ballast = new THREE.Mesh(g, dust(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))); ballast.receiveShadow = true; root.add(ballast);
  // 钢轨：沿线每 6 米一段细长方块
  const seg = Math.floor(L / 6), a = V(), b = V();
  for (let i = 0; i < seg; i++) {
    curve.getPointAt(i / seg, a); curve.getPointAt((i + 1) / seg, b); t.subVectors(b, a); const len = t.length(); t.normalize(); side.crossVectors(t, up).normalize();
    const yaw = Math.atan2(t.x, t.z);
    for (const o of [-0.72, 0.72]) rails.box(0.14, 0.16, len + 0.05, M((a.x + b.x) / 2 + side.x * o, (a.y + b.y) / 2 + 0.12, (a.z + b.z) / 2 + side.z * o, -Math.asin(t.y), yaw, 0), C(0x5d4a3c), { rust: 0.9, sand: 0.1 });
  }
  const r = rails.build(dust(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.45 }))); root.add(r.solid);
  // 枕木
  const NS = Math.floor(L / 0.95), im = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.16, 0.24), dust(new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 })), NS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < NS; i++) {
    curve.getPointAt(i / NS, p); curve.getTangentAt(i / NS, t);
    q.setFromAxisAngle(up, Math.atan2(t.x, t.z) + (Math.sin(i * 12.9) * 0.04));
    m.compose(V(p.x, p.y - 0.02, p.z), q, V(1, 1, 1)); im.setMatrixAt(i, m);
  }
  im.receiveShadow = true; root.add(im);
}

/** 北端隧道口：混凝土门脸嵌在断头崖里 */
function portal(k) {
  const z = RAIL.z0 + 2, x = xRail(z), y = railY(z) - 0.4;
  k.push(M(x, y, z, 0, Math.atan2(xRail(z - 3) - x, -3), 0));
  const c = CON.concrete, o = { rust: 0.15, sand: 0.7 };
  // 门脸：两根墩柱 + 拱顶 + 上方挡墙（门洞朝南）
  for (const s of [1, -1]) { k.box(4, 13, 5, M(s * 7, 6.5, 0), c, o); k.box(9, 18, 3, M(s * 13.5, 9, 1.5, 0, 0, 0), CON.concrete2, o); }
  k.torus(5, 2, Math.PI, M(0, 13, 0), c, o, 16);
  k.box(18, 8, 5, M(0, 20, 0.5), c, o);
  k.box(20, 1.4, 6, M(0, 24.5, 0.5), CON.concrete2, o);
  k.box(12, 13, 0.5, M(0, 6.5, 2.4), CON.dark, { rust: 0, sand: 0 });   // 门洞里的黑
  k.box(5, 1.2, 0.3, M(0, 21, -2.1), C(0x6c6150), o);                     // 站名牌
  k.pop();
}

/** 沙埋的铁路小镇 */
function town(k, lamps, rnd) {
  const o = { rust: 0.12, sand: 0.85 };
  const lots = [];
  for (let i = 0; i < 26; i++) {
    const z = 1080 + rnd() * 330, X = xc(z), fw = floorFrac(z) * halfW(z), xr = xRail(z);
    const x = rnd() < 0.55 ? xr + 9 + rnd() * (X + fw - xr - 12) : X - fw * 0.15 + rnd() * (xr - X - 8);
    if (Math.abs(x - xr) < 8) continue;
    if (lots.some(([a, b, r]) => Math.hypot(a - x, b - z) < r + 9)) continue;
    const w = 6 + rnd() * 10, d = 6 + rnd() * 8, h = 3.5 + rnd() * 8, yaw = Math.atan2(xRail(z - 5) - xr, -5) + (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.12;
    lots.push([x, z, Math.max(w, d) / 2]);
    const y = ground(x, z) - 0.6, col = rnd() < 0.5 ? CON.adobe : CON.concrete, col2 = col === CON.adobe ? CON.adobe2 : CON.concrete2;
    k.push(M(x, y, z, 0, yaw, 0));
    // 四面墙，墙头参差不齐；门窗是黑洞
    const t = 0.6;
    for (const [px, pz, ww, rot] of [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
      const parts = Math.max(2, Math.round(ww / 3));
      for (let j = 0; j < parts; j++) {
        const hh = h * (rnd() < 0.3 ? 0.35 + rnd() * 0.4 : 0.85 + rnd() * 0.15), off = -ww / 2 + (j + 0.5) * ww / parts;
        k.box(ww / parts + 0.02, hh, t, M(px + Math.cos(rot) * off, hh / 2, pz - Math.sin(rot) * off, 0, rot, 0), j % 2 ? col : col2, o);
      }
      for (let j = 0; j < Math.floor(ww / 4); j++) { const off = -ww / 2 + 2 + j * 4; k.box(1.2, 1.4, t + 0.1, M(px + Math.cos(rot) * off, h * 0.55, pz - Math.sin(rot) * off, 0, rot, 0), CON.dark, { rust: 0, sand: 0 }); }
    }
    if (rnd() < 0.45) k.box(w * 0.7, 0.35, d * 0.6, M(-w * 0.1, h * 0.8, 0, 0.05, 0, 0.12), CON.roof, o); // 残留的屋顶板
    if (rnd() < 0.18) { k.box(1.3, 1.3, 0.2, M(w * 0.2, h * 0.5, d / 2 + 0.35), CON.win, { glow: true }); lamps.push(V(w * 0.2, h * 0.5, d / 2 + 0.5).applyMatrix4(k.top)); }
    k.pop();
  }
  // 水塔
  { const z = 1330, x = xRail(z) + 26, y = ground(x, z);
    k.push(M(x, y, z, 0, 0.3, 0.04));
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.cyl(0.25, 0.3, 15, 6, M(a * 3, 7.5, b * 3, b * 0.06, 0, -a * 0.06), PAL.iron, { rust: 0.8 });
    k.cyl(5, 5, 6, 18, M(0, 18, 0), PAL.teal, { rust: 0.7, sand: 0.2 }); k.cyl(0.1, 5.4, 2.4, 18, M(0, 22.2, 0), PAL.iron2, { rust: 0.7 });
    k.pop(); }
  // 翻倒的货车厢
  { const z = 1150, x = xRail(z) - 12, y = ground(x, z);
    k.push(M(x, y + 1.8, z, 0.08, 0.5, 1.35)); k.box(3, 3.2, 12, null, PAL.rust2, { rust: 0.9, sand: 0.4 }); k.box(3.1, 0.3, 12.2, M(0, 1.7, 0), PAL.iron, { rust: 0.8 }); k.pop(); }
}

/** 站台：北站有雨棚，其余是简单的站台 + 小亭子 */
function station(k, st, lamps, big) {
  const z = st.z, x = xRail(z), side = 1, yaw = Math.atan2(xRail(z - 3) - x, -3);
  const y = railY(z) - 0.3;
  k.push(M(x, y, z, 0, yaw, 0));
  const o = { rust: 0.3, sand: 0.75 }, len = big ? 60 : 30;
  k.box(4.5, 1.1, len, M(side * 4.2, 0.55, 0), CON.concrete, o);
  k.box(0.3, 0.3, len, M(side * 2.05, 1.05, 0), C(0xc8b58a), o);
  const posts = big ? 7 : 3;
  for (let i = 0; i < posts; i++) {
    const zz = -len / 2 + 5 + i * (len - 10) / (posts - 1), lean = (i * 37 % 5 - 2) * 0.03;
    k.cyl(0.15, 0.18, 4.2, 6, M(side * 5.2, 3.1, zz, lean, 0, 0), PAL.iron, { rust: 0.8 });
    if (!(big && i === 4)) k.box(4.8, 0.18, (len - 10) / (posts - 1) + 0.4, M(side * 4.5, 5.25, zz + (len - 10) / (posts - 1) / 2, 0, 0, -0.08 + lean), CON.roof, o);
  }
  // 站名牌、灯
  k.box(0.12, 0.8, 2.6, M(side * 6.4, 2.6, -len / 2 + 6), C(0xd8ceb5), { rust: 0.4, sand: 0.1 });
  k.cyl(0.08, 0.1, 4.6, 5, M(side * 2.6, 3.4, len / 2 - 4), PAL.iron, { rust: 0.6 });
  k.sph(0.35, M(side * 2.6, 5.8, len / 2 - 4), CON.win, { glow: true }, 8, 6);
  lamps.push(V(side * 2.6, 5.8, len / 2 - 4).applyMatrix4(k.top));
  if (!big) { k.box(3, 2.6, 3.2, M(side * 4.6, 2.4, 4), CON.adobe, o); k.box(3.6, 0.2, 3.8, M(side * 4.6, 3.8, 4, 0, 0, 0.06), CON.roof, o); }
  k.pop();
}

/** 沿线电线杆（一半倒了） */
function poles(k, curve, rnd) {
  const L = curve.getLength(), p = V(), t = V();
  for (let s = 20; s < L - 20; s += 46) {
    curve.getPointAt(s / L, p); curve.getTangentAt(s / L, t);
    const sx = t.z, sz = -t.x, x = p.x - sx * 5, z = p.z - sz * 5, y = ground(x, z);
    const fall = rnd(); const lean = fall < 0.2 ? 1.3 : fall < 0.45 ? 0.25 : 0.04;
    k.push(M(x, y - 0.3, z, 0, Math.atan2(t.x, t.z), (rnd() < 0.5 ? 1 : -1) * lean));
    k.cyl(0.14, 0.2, 8, 6, M(0, 4, 0), CON.wood, { rust: 0, sand: 0.3 });
    k.box(2.2, 0.15, 0.15, M(0, 7.4, 0), CON.wood, { rust: 0, sand: 0.2 });
    k.pop();
  }
}

/** 电车：车头 + 两节车厢 */
function makeTrain(root, dust, glowMat) {
  const cars = [];
  const body = dust(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 }));
  for (let i = 0; i < 3; i++) {
    const k = new Kit(), head = i === 0, L = head ? 12 : 13;
    const paint = head ? C(0x6f8f86) : C(0x8a9a8c);
    k.box(2.8, 0.5, L, M(0, 0.85, 0), PAL.iron, { rust: 0.7, sand: 0.1 });
    k.box(2.7, 2.6, L - 0.4, M(0, 2.4, 0), paint, { rust: 0.55, sand: 0.2 });
    k.box(2.3, 0.35, L - 1, M(0, 3.85, 0), C(0x5c5a52), { rust: 0.4, sand: 0.5 });
    for (let w = 0; w < Math.floor(L / 2.2); w++) for (const s of [1, -1]) k.box(0.05, 0.95, 1.4, M(s * 1.37, 2.75, -L / 2 + 1.5 + w * 2.2), CON.win, { glow: true });
    for (const zz of [-L / 2 + 2.2, L / 2 - 2.2]) for (const s of [1, -1]) k.cyl(0.42, 0.42, 0.2, 10, M(s * 0.72, 0.42, zz, 0, 0, Math.PI / 2), PAL.dark, { rust: 0.5 });
    if (head) { k.box(2.5, 1.2, 0.2, M(0, 2.9, L / 2 - 0.05), C(0x30363a), { rust: 0, sand: 0 }); k.sph(0.3, M(0, 1.6, L / 2 + 0.05), CON.win, { glow: true }, 8, 6); k.cyl(0.04, 0.04, 1.6, 4, M(0, 4.8, 1.5, 0.5), PAL.iron, {}); }
    const out = k.build(body, glowMat);
    const g = new THREE.Group(); g.add(out.solid, out.glow); g.userData.dynamic = true; g.userData.len = L;
    root.add(g); cars.push({ g, L });
  }
  return cars;
}

export class Railway {
  constructor(root, dust, glowMat, rnd) {
    this.curve = railPath(); this.L = this.curve.getLength();
    track(root, this.curve, dust);
    const k = new Kit(); this.lamps = [];
    portal(k); town(k, this.lamps, rnd); poles(k, this.curve, rnd);
    STATIONS.forEach((s, i) => station(k, s, this.lamps, i === 0));
    const out = k.build(dust(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05 })), glowMat);
    root.add(out.solid); if (out.glow) root.add(out.glow);
    this.cars = makeTrain(root, dust, glowMat);
    // 车站在弧长上的位置
    this.stops = STATIONS.map(st => { let best = 0, bd = 1e9; for (let i = 0; i <= 400; i++) { const p = this.curve.getPointAt(i / 400); const d = Math.abs(p.z - st.z); if (d < bd) { bd = d; best = i / 400 * this.L; } } return best; });
    this.total = this.cars.reduce((a, c) => a + c.L + 0.8, -0.8) - (this.cars[0].L + this.cars[this.cars.length - 1].L) / 2;
    this.s = this.stops[0] + 1; this.dir = 1; this.wait = 6; this.v = 0; this.leg = 1;
    this.place();
  }
  place() {
    const p = V(), t = V();
    let s = this.s;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const u = clamp(s / this.L, 0, 1); this.curve.getPointAt(u, p); this.curve.getTangentAt(u, t);
      c.g.position.set(p.x, p.y + 0.15, p.z);
      c.g.rotation.set(-Math.asin(clamp(t.y, -1, 1)), Math.atan2(t.x, t.z), 0);
      s -= this.dir * ((c.L + (this.cars[i + 1]?.L ?? 0)) / 2 + 0.8);
    }
  }
  update(dt) {
    if (this.wait > 0) { this.wait -= dt; this.v = 0; }
    else {
      const target = this.stops[this.leg], d = (target - this.s) * this.dir;
      const brake = Math.sqrt(Math.max(d, 0) * 2 * 0.9);
      this.v = Math.min(14, this.v + dt * 1.2, brake + 0.3);
      this.s += this.v * this.dir * dt;
      if (d <= 0.2) {
        this.s = target; this.wait = 14; this.v = 0;
        if (this.leg === 0 || this.leg === this.stops.length - 1) {
          // 终点站：不掉头，改由原来的车尾领头（推拉式运行）
          this.s -= this.dir * this.total; this.dir *= -1; this.cars.reverse();
        }
        this.leg += this.dir;
      }
    }
    this.place();
  }
}
