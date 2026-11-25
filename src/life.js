// 城里还在动的东西：电车与乘客、行人、渡船、飞艇、鸟群、废墟里的小机械、落石
import * as THREE from 'three';
import { rng, clamp, smooth, lerp, dotTexture } from './util.js';
import { ground, shoreZ } from './world.js';
import { ruinMask, insideFoot } from './city.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });

export function buildLife(scene, city) {
  const R = rng(4242);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2a2f33, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.3 });
  const navMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.4) });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.5) });
  const movers = {}, pickables = [], events = [];
  const emit = (type, pos, extra) => events.push({ type, pos: pos.clone(), ...extra });
  const dummy = new THREE.Object3D(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  /* ================= 电车：靠站、开门、上下客 ================= */
  function tramCar(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.2, 9), std(color)); body.position.y = 1.7; g.add(body);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.5, 9.1), std(0x3b4a48)); skirt.position.y = 0.55; g.add(skirt);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 7.6), winMat); win.position.y = 2.2; g.add(win);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 8.6), std(0x6e3b2e)); roof.position.y = 2.95; g.add(roof);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), std(0x222222)); pole.position.set(0, 4.2, 1); pole.rotation.x = -0.5; g.add(pole);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 1.3), std(0x5d4a3a)); door.position.set(-1.28, 1.55, 0); g.add(door);
    g.userData.door = door;
    g.traverse(o => { o.castShadow = true; });
    scene.add(g); return g;
  }
  const TL = city.tram.getLength(), ST = city.stations;
  const trams = [[0.1, 1, 0xcfd8c4], [0.66, -1, 0xd9c48f]].map(([u, dir, c], i) => {
    const tr = { name: i ? '二号电车' : '一号电车', u, dir, v: 0, max: 9, wait: 0, at: null, last: null, pax: 6 + Math.floor(R() * 10), cars: [tramCar(c), tramCar(c)] };
    tr.cars.forEach(car => pickables.push({ obj: car, kind: 'tram', ref: tr }));
    return tr;
  });
  function placeOnCurve(obj, curve, u) {
    u = clamp(u, 0.0005, 0.9995);
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    obj.position.copy(p); obj.lookAt(p.x + t.x, p.y + t.y, p.z + t.z);
  }
  function nextStation(tr) {
    let best = null, bd = 1e9;
    for (const s of ST) { const d = (s.u - tr.u) * tr.dir * TL; if (d > 0.8 && d < bd && s !== tr.last) { bd = d; best = s; } }
    return best ? [best, bd] : [null, 0];
  }

  /* ================= 行人：散步、候车、下车、雨天撑伞或跑去屋檐下躲雨 ================= */
  const NP = 170;
  const pBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1.15, 7).translate(0, 0.58, 0), std(0xffffff, { roughness: 0.8 }), NP);
  const pHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.38, 0), std(0xd9b89a), NP);
  const umbG = new THREE.ConeGeometry(0.75, 0.35, 8, 1, true).translate(0, 2.05, 0);
  const pUmb = new THREE.InstancedMesh(umbG, std(0xffffff, { side: THREE.DoubleSide, roughness: 0.5 }), NP);
  for (const m of [pBody, pHead, pUmb]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  const CLOTH = [0x3e4a5c, 0x7a3b2e, 0x5c6b4a, 0xc8b89a, 0x2f2f33, 0x8a6e4a, 0x4f7a8a, 0xa45a48].map(c => new THREE.Color(c));
  const UMB = [0x2f3b52, 0xb3402e, 0x3e6a5a, 0xd9c48f, 0x6a4a6e, 0x222222].map(c => new THREE.Color(c));
  const townArea = (x, z) => x > 268 && x < 640 && z > -320 && z < shoreZ(x) - 22 && !(x > 600 && z > shoreZ(x) - 90);
  function freeSpot(x0, z0, r, test) {
    for (let k = 0; k < 20; k++) { const a = R() * 6.28, d = R() * r, x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d; if (test(x, z) && !insideFoot(city.footprints, x, z, 1.2)) return [x, z]; }
    return null;
  }
  const people = [];
  for (let i = 0; i < NP; i++) {
    const p = { i, x: 0, z: 0, tx: 0, tz: 0, state: 'hidden', speed: R.range(1.1, 1.6), wait: 0, umb: R() < 0.75, night: R(), ph: R() * 6, yaw: 0, st: null, home: null };
    pBody.setColorAt(i, CLOTH[i % CLOTH.length]); pUmb.setColorAt(i, UMB[i % UMB.length]);
    pHead.setColorAt(i, new THREE.Color().setHSL(0.07, 0.35, R.range(0.45, 0.75)));
    people.push(p);
  }
  function spawnWalker(p) {
    let spot = null;
    for (let k = 0; k < 30 && !spot; k++) spot = freeSpot(R.range(270, 630), R.range(-300, 140), 2, townArea);
    if (!spot) return;
    p.x = spot[0]; p.z = spot[1]; p.state = 'walk'; p.wait = R() * 4; pickTarget(p);
  }
  function pickTarget(p) {
    const s = freeSpot(p.x, p.z, 30, townArea);
    if (s) { p.tx = s[0]; p.tz = s[1]; } else { p.tx = p.x; p.tz = p.z; }
  }
  // 初始：大部分在城里散步，一部分在站台候车
  people.forEach((p, i) => {
    if (i < 42) { const s = ST[i % ST.length]; p.state = 'wait'; p.st = s; const o = R.range(-8, 8); p.x = s.pos.x + s.along.x * o + s.side.x * R.range(-0.6, 0.6); p.z = s.pos.z + s.along.z * o + s.side.z * R.range(-0.6, 0.6); p.yaw = Math.atan2(-s.side.x, -s.side.z); }
    else spawnWalker(p);
  });
  function stationArrive(tr, s, carPos) {
    // 下车：几位乘客从车门走出来
    const off = Math.min(tr.pax, 1 + Math.floor(R() * 4));
    tr.pax -= off;
    for (let k = 0; k < off; k++) {
      const p = people.find(q => q.state === 'hidden'); if (!p) break;
      p.x = carPos.x + s.side.x * 1.6 + s.along.x * R.range(-6, 6); p.z = carPos.z + s.side.z * 1.6 + s.along.z * R.range(-6, 6);
      p.state = 'alight'; p.wait = k * 0.8; p.tx = p.x + s.side.x * 14 + R.range(-6, 6); p.tz = p.z + s.side.z * 14 + R.range(-6, 6);
    }
    // 上车：候车的人走向车门
    for (const p of people) if (p.state === 'wait' && p.st === s) { p.state = 'board'; p.tx = carPos.x + s.side.x * 1.4; p.tz = carPos.z + s.side.z * 1.4; p.board = tr; }
    emit('tramArrive', carPos, { tram: tr, station: s });
  }
  let spawnT = 0;
  function updatePeople(dt, t, env) {
    const rainy = env.wx.rain > 0.45, night = env.night;
    // 夜里人渐少，清晨又出来；车站隔一阵会有人来等车
    spawnT -= dt;
    if (spawnT < 0) {
      spawnT = R.range(2, 5);
      const p = people.find(q => q.state === 'hidden');
      if (p && p.night > night * 0.75) {
        if (R() < 0.35) { const s = ST[Math.floor(R() * ST.length)]; const o = R.range(-8, 8); p.st = s; p.state = 'wait'; p.x = s.pos.x + s.along.x * o; p.z = s.pos.z + s.along.z * o; p.yaw = Math.atan2(-s.side.x, -s.side.z); }
        else spawnWalker(p);
      }
    }
    for (const p of people) {
      const i = p.i;
      if (p.state === 'hidden') { dummy.scale.setScalar(0.0001); dummy.updateMatrix(); pBody.setMatrixAt(i, dummy.matrix); pHead.setMatrixAt(i, dummy.matrix); pUmb.setMatrixAt(i, dummy.matrix); continue; }
      let moving = false, sp = p.speed;
      if (p.state === 'walk') {
        if (p.night < night * 0.75 && R() < dt * 0.05) p.state = 'home';
        if (rainy && !p.umb) { p.state = 'shelter'; const f = nearestEave(p.x, p.z); if (f) { p.tx = f[0]; p.tz = f[1]; } }
      }
      if (p.state === 'shelter') { sp = 3.6; if (!rainy) { p.state = 'walk'; pickTarget(p); } }
      if (p.state === 'home') { sp = 1.8; if (Math.hypot(p.tx - p.x, p.tz - p.z) < 0.8 || R() < dt * 0.04) { p.state = 'hidden'; continue; } }
      if (rainy && p.umb && p.state === 'walk') sp *= 1.25;
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (p.wait > 0) p.wait -= dt;
      else if (d > 0.3) {
        const st = Math.min(d, sp * dt), nx = p.x + dx / d * st, nz = p.z + dz / d * st;
        if ((p.state === 'walk' || p.state === 'home') && insideFoot(city.footprints, nx, nz, 0.5)) pickTarget(p);
        else { p.x = nx; p.z = nz; moving = true; p.yaw = Math.atan2(dx, dz); }
      } else {
        if (p.state === 'walk') { p.wait = R.range(1, 8); pickTarget(p); }
        else if (p.state === 'board') { p.state = 'hidden'; if (p.board) p.board.pax++; continue; }
        else if (p.state === 'alight') { if (townArea(p.x, p.z)) { p.state = 'walk'; pickTarget(p); } else { p.state = 'home'; } }
      }
      const y = ground(p.x, p.z) + (moving ? Math.abs(Math.sin(t * 8 * sp + p.ph)) * 0.06 : 0);
      dummy.position.set(p.x, y, p.z); dummy.rotation.set(moving && sp > 3 ? 0.25 : 0, p.yaw, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      pBody.setMatrixAt(i, dummy.matrix); pHead.setMatrixAt(i, dummy.matrix);
      const showUmb = p.umb && env.wx.rain > 0.3;
      dummy.scale.setScalar(showUmb ? 1 : 0.0001); dummy.updateMatrix(); pUmb.setMatrixAt(i, dummy.matrix);
    }
    pBody.instanceMatrix.needsUpdate = pHead.instanceMatrix.needsUpdate = pUmb.instanceMatrix.needsUpdate = true;
  }
  function nearestEave(x, z) {
    let best = null, bd = 60;
    for (const f of city.footprints) {
      if (f.kind !== 'house' && f.kind !== 'warehouse') continue;
      const dx = x - f.x, dz = z - f.z; if (Math.abs(dx) > bd + 12 || Math.abs(dz) > bd + 12) continue;
      // 最近的墙外 0.9 米处（屋檐下）
      const a = dx * f.c - dz * f.s, b = dx * f.s + dz * f.c;
      const ca = clamp(a, -f.hx, f.hx), cb = clamp(b, -f.hz, f.hz);
      let ea = ca, eb = cb;
      if (Math.abs(ca) < f.hx && Math.abs(cb) < f.hz) continue;
      const nrm = Math.hypot(a - ca, b - cb) || 1; ea += (a - ca) / nrm * 0.9; eb += (b - cb) / nrm * 0.9;
      const wx = f.x + ea * f.c + eb * f.s, wz = f.z - ea * f.s + eb * f.c;
      const dd = Math.hypot(wx - x, wz - z);
      if (dd < bd) { bd = dd; best = [wx, wz]; }
    }
    return best;
  }

  /* ================= 船 ================= */
  function boat(size, hull, cabin) {
    const g = new THREE.Group();
    const sh = new THREE.Shape(); sh.moveTo(-1, 0); sh.lineTo(1, 0); sh.lineTo(1.25, 1); sh.lineTo(-1.25, 1); sh.closePath();
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false }).translate(0, -0.6, -3), std(hull)));
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.2, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).translate(0, 0, 4), std(hull)); bow.scale.y = 0.6; g.add(bow);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 2.4), std(cabin)); c.position.set(0, 1.0, -0.8); g.add(c);
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.45, 2), winMat); w.position.set(0, 1.25, -0.8); g.add(w);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 8), std(0xb3402e)); st.position.set(0, 2.1, -1.4); g.add(st);
    g.scale.setScalar(size); g.traverse(o => { o.castShadow = true; }); scene.add(g); return g;
  }
  const boats = [
    [boat(2.2, 0x2f4b57, 0xefe6d6), 60, 430, 260, 90, 0.018, '雾港渡轮'],
    [boat(1.4, 0x7a3b2e, 0xe8e0c8), -300, 500, 140, 60, -0.03, '沉城观光艇'],
    [boat(1.2, 0x3a5d4f, 0xf2ead8), 430, 300, 110, 55, 0.035, '渔船 · 海鸥号'],
    [boat(1.0, 0x5c4a3a, 0xd9cdb0), 250, 560, 200, 80, -0.022, '渔船 · 晚潮号'],
    [boat(3.2, 0x22343e, 0xe9e2d2), 200, 700, 520, 160, 0.008, '远洋货轮']
  ].map(([g, cx, cz, rx, rz, w, name]) => { const b = { g, cx, cz, rx, rz, w, ph: R() * 6.28, name }; pickables.push({ obj: g, kind: 'boat', ref: b }); return b; });

  /* ================= 飞艇：小艇定时靠上系留塔 ================= */
  function airship(len, color) {
    const g = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), std(color, { roughness: 0.55 })); env.scale.set(len * 0.17, len * 0.17, len / 2); g.add(env);
    for (let i = 0; i < 4; i++) { const r = len * 0.155; const band = new THREE.Mesh(new THREE.TorusGeometry(r * (1 - Math.abs(i - 1.5) * 0.05), 0.12, 4, 24), std(0x6e5a3e)); band.position.z = (i - 1.5) * len * 0.16; g.add(band); }
    const gon = new THREE.Mesh(new THREE.BoxGeometry(len * 0.08, len * 0.05, len * 0.3), std(0x6e3b2e)); gon.position.y = -len * 0.2; g.add(gon);
    const gw = new THREE.Mesh(new THREE.BoxGeometry(len * 0.082, len * 0.02, len * 0.26), winMat); gw.position.y = -len * 0.195; g.add(gw);
    for (const rz of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, len * 0.14, len * 0.13), std(0x8d3f35)); fin.position.set(0, len * 0.13, -len * 0.42);
      const p = new THREE.Group(); p.rotation.z = rz; p.add(fin); g.add(p);
    }
    const prop = new THREE.Mesh(new THREE.BoxGeometry(len * 0.12, 0.3, 0.3), std(0x333333)); prop.position.set(0, -len * 0.2, -len * 0.17); g.add(prop);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), navMat); nav.position.set(0, -len * 0.23, len * 0.16); g.add(nav);
    g.traverse(o => { o.castShadow = true; }); scene.add(g); g.userData.len = len;
    return { g, prop, nav, len };
  }
  const ships = [
    [airship(56, 0xe6dcc6), 60, -110, 400, 230, 128, 0.012, '云鲸号'],
    [airship(38, 0xc9a77a), -220, -60, 250, 170, 92, -0.02, '拾荒者号'],
    [airship(30, 0xb9c4bf), 470, -110, 150, 100, 120, 0.03, '邮差号']
  ].map(([s, cx, cz, rx, rz, y, w, name]) => { const o = { ...s, cx, cz, rx, rz, y, w, ph: R() * 6.28, name, state: '巡航', heading: 0 }; pickables.push({ obj: s.g, kind: 'air', ref: o }); return o; });
  const mailer = ships[2], MAST = city.mast, CYCLE = 150;
  mailer.cyc = 20;

  /* ================= 鸟群：人靠近或有落石时会惊飞 ================= */
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, -1.1, 0.2, -0.2, 0, 0, -0.3, 0, 0, 0.5, 0, 0, -0.3, 1.1, 0.2, -0.2], 3));
  birdGeo.computeVertexNormals();
  const flocks = [[-150, 60, -40, 70], [380, 50, 60, 50], [-360, 80, -200, 90], [40, 45, -120, 40]].map(([cx, y, cz, r]) => ({ cx, y, cz, r, n: 22, panic: 0, ox: 0, oz: 0 }));
  const NB = flocks.reduce((a, f) => a + f.n, 0);
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x2b2a28, side: THREE.DoubleSide }), NB);
  birds.frustumCulled = false; scene.add(birds);
  const bseed = Array.from({ length: NB }, () => [R() * 6.28, R.range(0.6, 1.3), R.range(-8, 8), R.range(-6, 6), R.range(0.8, 1.2), R.range(-1, 1), R.range(0.3, 1)]);
  function scare(pos, r) {
    for (const f of flocks) if (Math.hypot(f.cx + f.ox - pos.x, f.cz + f.oz - pos.z) < r + f.r && f.panic < 0.5) { f.panic = 1; emit('birds', tmp.set(f.cx, f.y, f.cz)); }
  }

  /* ================= 废墟里游荡的小机械「拾遗者」 ================= */
  const botBody = std(0xb9ab8c, { roughness: 0.5, metalness: 0.3 }), botDark = std(0x5d554a);
  const bots = [];
  for (let i = 0; i < 30; i++) {
    let x, z, ok = false;
    for (let k = 0; k < 40 && !ok; k++) { x = R.range(-560, 220); z = R.range(-330, 140); ok = ruinMask(x, z) > 0.8 && !insideFoot(city.footprints, x, z, 2); }
    if (!ok) continue;
    const g = new THREE.Group(), s = R.range(0.8, 1.4);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), botBody); body.position.y = 1.4; body.scale.set(1, 0.85, 1); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), botBody); head.position.y = 2.35; g.add(head);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeMat); eye.position.set(0, 2.4, 0.36); head.add(eye); eye.position.set(0, 0.05, 0.36);
    const legs = [];
    for (const sx of [-0.35, 0.35]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6).translate(0, -0.45, 0), botDark); l.position.set(sx, 0.95, 0); g.add(l); legs.push(l); }
    for (const sx of [-0.85, 0.85]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6).translate(0, -0.45, 0), botDark); a.position.set(sx, 1.6, 0); a.rotation.z = sx * 0.3; g.add(a); }
    g.scale.setScalar(s); g.position.set(x, ground(x, z), z); g.traverse(o => { o.castShadow = true; });
    scene.add(g);
    const b = { g, legs, head, tx: x, tz: z, wait: R() * 5, speed: R.range(0.9, 1.6), ph: R() * 6, no: i + 1, look: null };
    bots.push(b); pickables.push({ obj: g, kind: 'bot', ref: b });
    head.position.y = 2.35; head.children[0].position.set(0, 0.05, 0.36);
  }
  function newTarget(b) {
    for (let k = 0; k < 12; k++) {
      const a = R() * 6.28, r = R.range(8, 40), x = b.g.position.x + Math.cos(a) * r, z = b.g.position.z + Math.sin(a) * r;
      if (ruinMask(x, z) > 0.7 && !insideFoot(city.footprints, x, z, 2)) { b.tx = x; b.tz = z; return; }
    }
  }

  /* ================= 落石与扬尘 ================= */
  const rockMat = std(0xa39d90, { roughness: 0.95, flatShading: true });
  const rocks = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat); m.castShadow = true; m.visible = false; scene.add(m); return { m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, live: false, bounces: 0 }; });
  const NDUST = 480, dPos = new Float32Array(NDUST * 3), dVel = new Float32Array(NDUST * 3), dAge = new Float32Array(NDUST).fill(99), dSize = new Float32Array(NDUST);
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dGeo.setAttribute('age', new THREE.BufferAttribute(dAge, 1)); dGeo.setAttribute('sz', new THREE.BufferAttribute(dSize, 1));
  const dust = new THREE.Points(dGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTex: { value: dotTexture() }, uPx: { value: 1 }, uCol: { value: new THREE.Color(0xc8bda6) } },
    vertexShader: `attribute float age, sz; uniform float uPx; varying float vA; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; float a=clamp(age/5.,0.,1.); vA=(1.-a)*smoothstep(0.,.15,age)*.55; gl_PointSize=uPx*sz*(1.+a*3.)*(300./-mv.z); }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uCol; varying float vA; void main(){ float t=texture2D(uTex,gl_PointCoord).a; gl_FragColor=vec4(uCol, t*vA); }`
  }));
  dust.frustumCulled = false; scene.add(dust);
  let dustI = 0;
  function puff(p, n, power) {
    for (let k = 0; k < n; k++) {
      const i = dustI++ % NDUST, a = R() * 6.28, s = R.range(0.5, 1) * power;
      dPos.set([p.x + R.range(-1, 1), p.y + R.range(0, 1), p.z + R.range(-1, 1)], i * 3);
      dVel.set([Math.cos(a) * s * 3, R.range(0.4, 1.6) * power, Math.sin(a) * s * 3], i * 3);
      dAge[i] = 0; dSize[i] = R.range(2, 4.5) * Math.sqrt(power);
    }
  }
  let rockT = 6;
  function dropRock(cam) {
    const near = city.tops.filter(p => p.distanceTo(cam.position) < 420);
    const pool = near.length ? near : city.tops; if (!pool.length) return;
    const top = pool[Math.floor(R() * pool.length)], r = rocks.find(q => !q.live); if (!r) return;
    const s = R.range(0.6, 1.8);
    r.m.scale.set(s * R.range(0.8, 1.3), s, s * R.range(0.8, 1.3)); r.m.position.copy(top).add(tmp.set(R.range(-3, 3), 0, R.range(-3, 3)));
    const a = R() * 6.28; r.v.set(Math.cos(a) * R.range(1, 3), R.range(0, 2), Math.sin(a) * R.range(1, 3)); r.w.set(R.range(-3, 3), R.range(-3, 3), R.range(-3, 3));
    r.live = true; r.life = 0; r.bounces = 0; r.m.visible = true;
    puff(r.m.position, 10, 0.5); emit('crumble', r.m.position);
  }
  function updateRocks(dt, cam) {
    for (const r of rocks) {
      if (!r.live) continue;
      r.life += dt;
      const p = r.m.position;
      if (r.bounces < 3) {
        r.v.y -= 9.8 * dt; p.addScaledVector(r.v, dt);
        r.m.rotation.x += r.w.x * dt; r.m.rotation.y += r.w.y * dt; r.m.rotation.z += r.w.z * dt;
        const gy = ground(p.x, p.z) + r.m.scale.y * 0.8;
        if (p.y < gy) {
          p.y = gy; const sp = -r.v.y;
          if (sp > 4) { puff(p, Math.min(60, 12 + sp * 2), Math.min(2.5, sp / 10)); emit('impact', p, { power: Math.min(1, sp / 30) }); scare(p, 80); }
          r.v.y = sp * 0.3; r.v.x *= 0.5; r.v.z *= 0.5; r.w.multiplyScalar(0.5); r.bounces++;
          if (sp < 3) r.bounces = 3;
        }
      } else if (r.life > 30) { r.m.scale.multiplyScalar(1 - dt * 0.5); if (r.m.scale.y < 0.05) { r.live = false; r.m.visible = false; } }
    }
    for (let i = 0; i < NDUST; i++) {
      if (dAge[i] > 6) continue;
      dAge[i] += dt; const k = i * 3, drag = Math.exp(-dt * 1.4);
      dVel[k] *= drag; dVel[k + 1] = dVel[k + 1] * drag + 0.15 * dt; dVel[k + 2] *= drag;
      dPos[k] += dVel[k] * dt; dPos[k + 1] += dVel[k + 1] * dt; dPos[k + 2] += dVel[k + 2] * dt;
    }
    dGeo.attributes.position.needsUpdate = true; dGeo.attributes.age.needsUpdate = true; dGeo.attributes.sz.needsUpdate = true;
  }

  movers.tram = trams[0].cars[0]; movers.air = ships[0].g; movers.boat = boats[0].g;
  return {
    movers, pickables, events, dust, scare,
    update(dt, t, env, speed, cam) {
      const lamp = clamp(env.lamp, 0, 1);
      winMat.emissiveIntensity = 0.15 + 1.6 * lamp;
      const s = dt * speed;
      // —— 电车：加速、巡航、进站减速、停靠开门、响铃出发 ——
      for (const tr of trams) {
        const car = tr.cars[0];
        if (tr.wait > 0) {
          tr.wait -= s; tr.v = 0;
          car.userData.door.position.z = tr.cars[1].userData.door.position.z = smooth(0, 1, Math.min(tr.wait, 8 - tr.wait)) * 1.2;
          if (tr.wait <= 0) { tr.last = tr.at; tr.at = null; emit('tramDepart', car.position, { tram: tr }); const [n] = nextStation(tr); if (!n) { tr.dir *= -1; tr.last = null; } }
        } else {
          const [st, dist] = nextStation(tr);
          if (!st) { tr.dir *= -1; tr.last = null; }
          const vt = st ? Math.min(tr.max * (env.wx.rain > 0.5 ? 0.75 : 1), Math.sqrt(2 * 0.9 * Math.max(dist - 0.3, 0)) + 0.4) : 2;
          tr.v += clamp(vt - tr.v, -2.5 * s, 1.1 * s);
          const step = tr.v * s;
          if (st && step >= dist - 0.3) { tr.u = st.u; tr.at = st; tr.wait = 8; tr.v = 0; placeOnCurve(car, city.tram, tr.u); stationArrive(tr, st, car.position); }
          else tr.u = clamp(tr.u + tr.dir * step / TL, 0.001, 0.999);
        }
        const gap = 10 / TL;
        placeOnCurve(tr.cars[0], city.tram, tr.u); placeOnCurve(tr.cars[1], city.tram, tr.u - tr.dir * gap);
        if (tr.dir < 0) for (const c of tr.cars) c.rotateY(Math.PI);
      }
      updatePeople(s, t, env);
      for (const b of boats) {
        const a = b.ph + t * b.w * speed, x = b.cx + Math.cos(a) * b.rx, z = b.cz + Math.sin(a) * b.rz;
        const nx = b.cx + Math.cos(a + 0.01 * Math.sign(b.w)) * b.rx, nz = b.cz + Math.sin(a + 0.01 * Math.sign(b.w)) * b.rz;
        const sea = 1 + env.wx.rain * 2.5 + env.wind;
        b.g.position.set(x, 0.35 + Math.sin(t * 1.3 + b.ph) * 0.15 * sea, z); b.g.lookAt(nx, b.g.position.y, nz);
        b.g.rotateZ(Math.sin(t * 0.9 + b.ph) * 0.04 * sea); b.g.rotateX(Math.sin(t * 0.7 + b.ph * 2) * 0.02 * sea);
      }
      for (const sh of ships) {
        const a = sh.ph + t * sh.w * speed;
        let x = sh.cx + Math.cos(a) * sh.rx, z = sh.cz + Math.sin(a) * sh.rz, y = sh.y + Math.sin(t * 0.2 + sh.ph) * 6;
        let hx = sh.cx + Math.cos(a + 0.01 * Math.sign(sh.w)) * sh.rx - x, hz = sh.cz + Math.sin(a + 0.01 * Math.sign(sh.w)) * sh.rz - z;
        if (sh === mailer) { // 邮差号：巡航一圈后靠上系留塔，机头随风转向
          sh.cyc = (sh.cyc + s) % CYCLE;
          const c = sh.cyc, w = smooth(80, 105, c) * (1 - smooth(130, 150, c));
          const wd = t * 0.05 + Math.sin(t * 0.13) * 0.6, dx = Math.cos(wd), dz = Math.sin(wd);
          const dock = tmp2.set(MAST.x - dx * sh.len * 0.5, MAST.y - 1, MAST.z - dz * sh.len * 0.5);
          x = lerp(x, dock.x, w); y = lerp(y, dock.y, w); z = lerp(z, dock.z, w);
          if (w > 0.6) { hx = lerp(hx, dx, (w - 0.6) / 0.4); hz = lerp(hz, dz, (w - 0.6) / 0.4); }
          sh.state = w > 0.98 ? '停靠系留塔' : c > 80 && c < 105 ? '进港中' : c >= 130 ? '离港' : '巡航';
        }
        sh.g.position.set(x, y, z); sh.g.lookAt(x + hx, y, z + hz); sh.g.rotateZ(Math.sin(a) * 0.05 * Math.sign(sh.w) + Math.sin(t * 0.8 + sh.ph) * 0.02 * env.wind);
        sh.prop.rotation.z = t * (sh.state === '停靠系留塔' ? 2 : 12); sh.nav.visible = Math.sin(t * 3 + sh.ph) > 0.2;
      }
      // —— 鸟群 ——
      let k = 0;
      for (const f of flocks) {
        if (cam && Math.hypot(cam.position.x - f.cx - f.ox, cam.position.z - f.cz - f.oz) < 70 && Math.abs(cam.position.y - f.y) < 60 && f.panic < 0.3) { f.panic = 1; emit('birds', tmp.set(f.cx, f.y, f.cz)); }
        f.panic = Math.max(0, f.panic - dt / 9);
        if (f.panic > 0.6) { f.ox += dt * 6; f.oz -= dt * 4; } else { f.ox *= 1 - dt * 0.05; f.oz *= 1 - dt * 0.05; }
        const P = f.panic;
        for (let i = 0; i < f.n; i++, k++) {
          const [ph, sp, ox, oy, sc, sx, sy] = bseed[k], a = ph * 0.15 + t * 0.12 * sp * speed * (1 + P * 1.5) + i * 0.05;
          const r = f.r + ox + Math.sin(t * 0.3 + ph) * 10 + P * 50 * sy;
          dummy.position.set(f.cx + f.ox + Math.cos(a) * r, f.y + oy + Math.sin(t * 0.5 + ph) * 4 + P * 45 * sy, f.cz + f.oz + Math.sin(a) * r * 0.7);
          tmp.set(f.cx + f.ox + Math.cos(a + 0.02) * r, dummy.position.y + P * 0.5, f.cz + f.oz + Math.sin(a + 0.02) * r * 0.7);
          dummy.lookAt(tmp); const flap = Math.sin(t * (9 + P * 10) * sp + ph * 3);
          dummy.scale.set(sc * 1.3, sc * (0.4 + flap * 1.2), sc * 1.3); dummy.updateMatrix(); birds.setMatrixAt(k, dummy.matrix);
        }
      }
      birds.instanceMatrix.needsUpdate = true;
      // —— 小机械：会转头看向靠近的镜头 ——
      for (const b of bots) {
        const p = b.g.position, dx = b.tx - p.x, dz = b.tz - p.z, d = Math.hypot(dx, dz);
        const near = cam && cam.position.distanceTo(p) < 18;
        let walking = false;
        if (near) {
          const ang = Math.atan2(cam.position.x - p.x, cam.position.z - p.z) - b.g.rotation.y;
          b.head.rotation.y += (Math.atan2(Math.sin(ang), Math.cos(ang)) - b.head.rotation.y) * Math.min(1, dt * 4);
          b.head.rotation.x = -0.25;
        } else if (b.wait > 0) { b.wait -= s; b.head.rotation.y = Math.sin(t * 0.7 + b.ph) * 0.8; b.head.rotation.x = 0; }
        else if (d < 0.6) { b.wait = R.range(2, 9); newTarget(b); }
        else {
          walking = true;
          const st = Math.min(d, b.speed * s * (env.wx.rain > 0.5 ? 0.6 : 1)), nx = p.x + dx / d * st, nz = p.z + dz / d * st;
          if (insideFoot(city.footprints, nx, nz, 1)) newTarget(b); else { p.x = nx; p.z = nz; }
          const want = Math.atan2(dx, dz); let dr = want - b.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); b.g.rotation.y += dr * Math.min(1, s * 4);
          b.head.rotation.y *= 0.9; b.head.rotation.x = 0;
        }
        const ph = t * 6 * b.speed + b.ph;
        b.legs[0].rotation.x = walking ? Math.sin(ph) * 0.5 : 0; b.legs[1].rotation.x = walking ? -Math.sin(ph) * 0.5 : 0;
        p.y = ground(p.x, p.z) + (walking ? Math.abs(Math.sin(ph)) * 0.12 : 0);
      }
      // —— 落石：风雨越大越频繁 ——
      if (cam) {
        rockT -= s * (1 + env.wx.rain * 2 + env.wind);
        if (rockT < 0) { rockT = R.range(7, 16); dropRock(cam); }
        updateRocks(s, cam);
      }
    }
  };
}
