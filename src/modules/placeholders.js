// 六个还没建的模块：先给每块地一个能认出来的地貌和几件大尺度的轮廓，等正式开工时整块替换。
// 每个对象都遵守 src/modules/README.md 里的模块接口。
import * as THREE from 'three';
import { fbm, smooth, clamp, lerp, rng } from '../util.js';
import { FILLERS, PAL } from '../planet/biomes.js';

const C = c => new THREE.Color(c);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const terrace = (v, step) => { const k = Math.floor(v / step), f = v / step - k; return step * (k + smooth(0.6, 0.95, f)); };

/* ---------- 2 戈壁大裂谷 ---------- */
const rift = {
  id: 'gobi-rift', no: 2, name: '戈壁大裂谷', sub: '红色孤山、裂谷湖与半埋的巨型机械', status: 'planned', want: [-52, 0],
  note: '参考纪念碑谷纳瓦霍部落公园的红色孤山，和东非大裂谷的断层湖。沙里半埋着巨型机械的残骸。',
  route: { x: 0, z: 300, alt: 700 },
  rz: x => 260 * Math.sin(x / 900) + 120 * Math.sin(x / 340 + 1),
  height(x, z) {
    const n = fbm(x * 0.0008 + 2, z * 0.0008 - 3, 4), m = fbm(x * 0.0017 + 5, z * 0.0017 + 1, 4);
    let h = 110 + 50 * n;
    h += terrace(smooth(0.6, 0.625, m) * 200 * (0.8 + n * 0.5), 34);            // 孤山：陡壁平顶
    const d = Math.abs(z - this.rz(x));
    h -= terrace(smooth(480, 140, d) * 175, 28);                                // 裂谷：台阶状的断层崖
    return h;
  },
  color(x, z, y, sl, out) {
    if (y < -0.5) return out.copy(PAL.bed);
    const band = 0.5 + 0.5 * Math.sin(y * 0.11 + fbm(x * 0.01, z * 0.01, 2) * 2);
    out.set(0xc98652).lerp(C(0xdcb07a), fbm(x * 0.005, z * 0.005, 3) * 0.5);
    if (sl > 0.7) out.set(0xa4502c).lerp(C(0xd08a58), band);
    if (y < 8) out.lerp(C(0x9a8a60), 0.6);
    return out;
  },
  build({ root }) {
    const rust = std(0x6e4a36, { metalness: 0.5, roughness: 0.75 }), dark = std(0x3b302a, { metalness: 0.4 }), eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 0.4) });
    const y0 = this.height(-700, -650);
    // 半埋的巨型齿轮
    const gear = new THREE.Group(); gear.position.set(-700, y0 - 60, -650); gear.rotation.set(0.2, 0.7, 0.35);
    gear.add(new THREE.Mesh(new THREE.TorusGeometry(150, 22, 10, 48), rust));
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, t = new THREE.Mesh(new THREE.BoxGeometry(26, 34, 30), rust); t.position.set(Math.cos(a) * 178, Math.sin(a) * 178, 0); t.rotation.z = a; gear.add(t); }
    root.add(gear);
    // 侧卧的机械头颅，一只眼还亮着
    const y1 = this.height(650, 520), head = new THREE.Group(); head.position.set(650, y1 - 30, 520); head.rotation.set(0, -0.6, 0.5);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), dark); skull.scale.set(170, 95, 120); head.add(skull);
    const e = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 8), eye); e.position.set(60, 30, 105); head.add(e);
    root.add(head);
    // 从沙里伸出的手臂
    const y2 = this.height(200, -1100), arm = new THREE.Group(); arm.position.set(200, y2 - 10, -1100); arm.rotation.set(0.3, 0.2, -0.25);
    let h = 0; for (const [l, r] of [[220, 30], [180, 24], [90, 16]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, l, 10), rust); s.position.y = h + l / 2; arm.add(s); h += l; const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 12, 8), dark); j.position.y = h; arm.add(j); }
    root.add(arm);
    return {};
  }
};

/* ---------- 3 沉没森林湿地 ---------- */
const wetland = {
  id: 'sunken-wetland', no: 3, name: '沉没森林湿地', sub: '淹到半腰的枯树林', status: 'planned', want: [2, 70],
  note: '一整片森林沉在浅水里，枯树只露出上半截，水面上漂着雾。',
  route: { x: 0, z: 0, alt: 320 },
  height(x, z) {
    const r = Math.hypot(x, z), m = fbm(x * 0.0035 + 4, z * 0.0035, 4);
    const base = 4.5 + 3 * (fbm(x * 0.001, z * 0.001, 3) - 0.5);
    return lerp(base, -2.2, smooth(0.27, 0.31, m)) + smooth(1500, 2300, r) * 50 * fbm(x * 0.002, z * 0.002, 3);
  },
  color(x, z, y, sl, out) {
    if (y < -0.5) return out.set(0x2f3a2a);
    return out.set(0x4a5e30).lerp(C(0x6b6340), fbm(x * 0.01, z * 0.01, 2)).lerp(C(0x8a8a50), smooth(0.55, 0.7, fbm(x * 0.03, z * 0.03, 2)) * 0.5);
  },
  build({ root }) {
    const R = rng(33), N = 420, geo = new THREE.CylinderGeometry(0.5, 1.4, 1, 5).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, std(0x4a3f33, { roughness: 0.95 }), N), d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 1400, x = Math.cos(a) * r, z = Math.sin(a) * r, h = R.range(12, 34);
      d.position.set(x, Math.min(this.height(x, z), 0) - 3, z); d.rotation.set(R.range(-0.15, 0.15), R() * 6, R.range(-0.15, 0.15)); d.scale.set(R.range(0.8, 1.6), h, R.range(0.8, 1.6)); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    im.castShadow = true; root.add(im);
    return {};
  }
};

/* ---------- 4 浮空群岛 ---------- */
const isles = {
  id: 'sky-isles', no: 4, name: '浮空群岛', sub: '海面上空悬着的一群岛', status: 'planned', want: [25, 140],
  note: '大大小小的岛悬在海面上空几百米，岛与岛之间挂着锁链和栈桥，瀑布落进海里化成雾。',
  route: { x: 0, z: 0, alt: 900 },
  height: (x, z) => FILLERS.ocean.height(x, z) * 0.6 + 12 * smooth(0.6, 0.8, fbm(x * 0.003, z * 0.003, 3)),
  color: FILLERS.ocean.color,
  build({ root }) {
    const R = rng(44), rock = std(0x7d7061, { flatShading: true, roughness: 0.95 }), grass = std(0x6f8f45, { roughness: 0.9 }), list = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28 + R(), rr = i === 0 ? 0 : R.range(400, 1300), r = i === 0 ? 220 : R.range(60, 150);
      const g = new THREE.Group(); g.position.set(Math.cos(a) * rr, R.range(300, 700), Math.sin(a) * rr);
      const cone = new THREE.ConeGeometry(r, r * 1.7, 9, 3); cone.rotateX(Math.PI); cone.translate(0, -r * 0.85, 0);
      const p = cone.attributes.position; for (let k = 0; k < p.count; k++) { const s = 0.75 + R() * 0.45; p.setXYZ(k, p.getX(k) * s, p.getY(k) * (0.9 + R() * 0.2), p.getZ(k) * s); }
      cone.computeVertexNormals();
      g.add(new THREE.Mesh(cone, rock));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.92, 8, 9), grass); top.position.y = 2; g.add(top);
      g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
      g.userData = { base: g.position.y, ph: R() * 6.28 }; root.add(g); list.push(g);
    }
    return { update(dt, t) { for (const g of list) { g.position.y = g.userData.base + Math.sin(t * 0.2 + g.userData.ph) * 6; g.rotation.y += dt * 0.004; } } };
  }
};

/* ---------- 5 火山熔炉区 ---------- */
const volcano = {
  id: 'volcano-forge', no: 5, name: '火山熔炉区', sub: '熔岩河与古老的锻炉', status: 'planned', want: [-15, -150],
  note: '黑色玄武岩上流着熔岩河，火山口周围立着古代的锻炉和烟囱，夜里整片地都在发光。',
  route: { x: -500, z: 0, alt: 1500 },
  height(x, z) {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), n = fbm(x * 0.0012 + 7, z * 0.0012, 4);
    let h = 30 + 60 * n + 900 * Math.exp(-Math.pow(r / 820, 1.6)) - 420 * Math.exp(-((r / 230) ** 2));
    h += 40 * Math.abs(Math.sin(a * 9 + n * 4)) * smooth(250, 600, r) * smooth(1500, 700, r);
    return h;
  },
  glow(x, z) {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), s = Math.abs(Math.sin(a * 2.5 + fbm(x * 0.0018, z * 0.0018, 3) * 5 + r * 0.0008));
    return clamp(smooth(0.07, 0, s) * smooth(250, 420, r) * smooth(2100, 1300, r) + smooth(200, 90, r), 0, 1);
  },
  color(x, z, y, sl, out) {
    out.set(0x2e2a27).lerp(C(0x5b544d), fbm(x * 0.006, z * 0.006, 3) * 0.7);
    const g = this.glow(x, z); return out.lerp(C(0x7a2a12), g);
  },
  build({ root }) {
    const R = rng(55), brick = std(0x4a3a30, { roughness: 0.9 }), hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.9, 0.25) });
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * 6.28 + R(), r = R.range(1150, 1500), x = Math.cos(a) * r, z = Math.sin(a) * r, h = R.range(90, 160), y = this.height(x, z) - 4;
      const g = new THREE.Group(); g.position.set(x, y, z);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, h, 10), brick); c.position.y = h / 2; g.add(c);
      const m = new THREE.Mesh(new THREE.TorusGeometry(9.5, 1.6, 6, 16), hot); m.rotation.x = Math.PI / 2; m.position.y = h; g.add(m);
      const base = new THREE.Mesh(new THREE.BoxGeometry(48, 30, 36), brick); base.position.y = 15; g.add(base);
      g.traverse(o => { o.castShadow = true; }); root.add(g);
    }
    return {};
  }
};

/* ---------- 6 冰原坠舰带 ---------- */
const ice = {
  id: 'ice-wreck', no: 6, name: '冰原坠舰带', sub: '冰原上拖出几公里长的坠落痕', status: 'planned', want: [66, -60],
  note: '一艘巨舰在冰原上滑行了几公里才停下，船体半埋在冰里，身后是一道长长的犁沟。',
  route: { x: 300, z: 0, alt: 450 },
  sz: x => 80 * Math.sin(x / 520),
  height(x, z) {
    const n = fbm(x * 0.0009 + 1, z * 0.0009 + 2, 5), d = Math.abs(z - this.sz(x));
    let h = 60 + 45 * n * n + 25 * Math.abs(Math.sin(x * 0.004 + n * 6)) * n;
    h -= 30 * smooth(240, 40, d) * smooth(-2000, -1500, x) * smooth(520, 260, x);
    h += 25 * smooth(300, 230, d) * smooth(40, 120, d) * smooth(-2000, -1500, x) * smooth(520, 260, x); // 两侧推起的冰脊
    return h;
  },
  color(x, z, y, sl, out) {
    const d = Math.abs(z - this.sz(x)), scar = smooth(240, 60, d) * smooth(-2000, -1500, x) * smooth(520, 260, x);
    return out.copy(PAL.snow).lerp(PAL.ice, fbm(x * 0.004, z * 0.004, 2) * 0.8).lerp(C(0x7b8288), scar * 0.7);
  },
  build({ root }) {
    const hull = std(0x8a9096, { metalness: 0.6, roughness: 0.5 }), dark = std(0x3f4448, { metalness: 0.5 }), glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 2.4) });
    const x = 520, z = this.sz(520), y = this.height(x, z);
    const ship = new THREE.Group(); ship.position.set(x, y - 25, z); ship.rotation.set(0.08, -0.05, -0.12);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(55, 70, 640, 12, 4), hull); body.rotation.z = Math.PI / 2; body.position.x = 260; ship.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(55, 180, 12), hull); nose.rotation.z = Math.PI / 2; nose.position.x = -150; ship.add(nose);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(220, 8, 160), dark); w.position.set(360, 10, s * 130); w.rotation.x = s * 0.25; ship.add(w); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(90, 6, 8, 40), glow); ring.rotation.y = Math.PI / 2; ring.position.x = 600; ship.add(ring);
    ship.traverse(o => { o.castShadow = true; }); root.add(ship);
    return {};
  }
};

/* ---------- 7 盐湖镜原 ---------- */
const salt = {
  id: 'salt-mirror', no: 7, name: '盐湖镜原', sub: '一层薄水把天空整个倒映下来', status: 'planned', want: [12, -72],
  note: '雨季的盐湖上积着一层几厘米的水，人走在上面像走在天空里。',
  route: { x: 0, z: 0, alt: 320 },
  height(x, z) {
    const r = Math.hypot(x, z) + (fbm(x * 0.001, z * 0.001, 3) - 0.5) * 500;
    return 12 + smooth(1150, 1900, r) * (60 + 120 * fbm(x * 0.0015 + 3, z * 0.0015, 4));
  },
  color(x, z, y, sl, out) {
    if (y < 13) { const c = Math.abs(fbm(x * 0.02, z * 0.02, 2) - 0.5) < 0.03 ? 0.85 : 1; return out.set(0xeeece6).multiplyScalar(c); }
    return out.set(0xb8a888).lerp(PAL.rock, smooth(0.6, 1.2, sl));
  },
  build({ root }) {
    const g = new THREE.RingGeometry(1, 1180, 96, 32); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xe4ebef, metalness: 0.95, roughness: 0.04 }));
    m.position.y = 12.25; m.receiveShadow = true; root.add(m);
    return {};
  }
};

export const PLACEHOLDERS = [rift, wetland, isles, volcano, ice, salt];
export { rift, wetland, isles, volcano, ice, salt };
