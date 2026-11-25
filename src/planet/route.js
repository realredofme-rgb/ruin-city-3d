// 环星航线：一艘大飞艇「巡星号」按顺序飞过 7 个模块再回到城市，模块上空放慢，模块之间加速。
import * as THREE from 'three';
import { R } from './sphere.js';
import { smooth, lerp, clamp } from '../util.js';

const CRUISE = 1400;

export class Route {
  constructor(scene, planet, order) {
    this.P = planet;
    const mods = order.map(id => planet.modules.find(m => m.id === id));
    const pts = [], marks = [];
    const wp = mods.map(m => { const r = m.route; return { m, p: m.tile.frame.toWorld(r.x, r.alt, r.z), alt: r.alt }; });
    const d = new THREE.Vector3();
    for (let i = 0; i < wp.length; i++) {
      const A = wp[i], B = wp[(i + 1) % wp.length];
      const a = A.p.clone().normalize(), b = B.p.clone().normalize(), ang = a.angleTo(b), n = Math.max(2, Math.ceil(ang / 0.1));
      marks.push({ m: A.m, i: pts.length });
      for (let k = 0; k < n; k++) {
        const s = k / n; d.copy(a).lerp(b, s).normalize();
        let alt = lerp(A.alt, B.alt, s); alt += (CRUISE - alt) * Math.pow(Math.sin(Math.PI * s), 0.6);
        alt = Math.max(alt, planet.height(d) + 260);
        pts.push(d.clone().multiplyScalar(R + alt));
      }
    }
    const curve = this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = 6000;
    this.len = curve.getLength();
    // 速度表：靠近模块时慢，远离时快
    const N = 1500; this.speed = new Float32Array(N); this.near = new Array(N);
    const centers = mods.map(m => m.tile.frame.toWorld(m.route.x, m.route.alt, m.route.z));
    for (let i = 0; i < N; i++) {
      const p = curve.getPointAt(i / N); let best = 0, who = null;
      centers.forEach((c, j) => { const k = smooth(3400, 900, p.distanceTo(c)); if (k > best) { best = k; who = mods[j]; } });
      this.speed[i] = lerp(560, 48, best); this.near[i] = best > 0.3 ? who : null;
    }
    // 航线（从高空看得见的一圈虚线）
    const lp = curve.getSpacedPoints(3000);
    const lg = new THREE.BufferGeometry().setFromPoints(lp);
    this.line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffd28a, dashSize: 260, gapSize: 180, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.line.computeLineDistances(); this.line.userData.noPick = true; this.line.frustumCulled = false; scene.add(this.line);
    // 巡星号
    this.ship = makeShip(110); scene.add(this.ship);
    this.u = 0.0; this.name = '巡星号';
    this.update(0, null);
  }
  /** 当前正在飞越的模块（没有就是 null） */
  get over() { return this.near[Math.floor(this.u * this.near.length) % this.near.length]; }
  update(dt, cam) {
    const v = this.speed[Math.floor(this.u * this.speed.length) % this.speed.length];
    this.u = (this.u + v * dt / this.len) % 1;
    const p = this.curve.getPointAt(this.u), t = this.curve.getTangentAt(this.u);
    const up = p.clone().normalize(), fwd = t.addScaledVector(up, -t.dot(up)).normalize(), x = new THREE.Vector3().crossVectors(up, fwd);
    this.ship.position.copy(p); this.ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fwd));
    const prop = this.ship.userData.prop; if (prop) prop.rotation.z += dt * (4 + v * 0.05);
    if (cam) {
      const alt = cam.position.length() - R;
      this.line.material.opacity = 0.75 * smooth(1800, 6000, alt);
      this.line.visible = this.line.material.opacity > 0.01;
    }
  }
}

function makeShip(len) {
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), std(0xe9dfc8)); hull.scale.set(len * 0.15, len * 0.15, len / 2); g.add(hull);
  for (let i = 0; i < 6; i++) { const r = len * 0.14 * (1 - Math.abs(i - 2.5) * 0.06), band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.3, 4, 32), std(0x7a5a38)); band.position.z = (i - 2.5) * len * 0.12; g.add(band); }
  const gon = new THREE.Mesh(new THREE.BoxGeometry(len * 0.07, len * 0.05, len * 0.34), std(0x5e3a2c)); gon.position.y = -len * 0.18; g.add(gon);
  const win = new THREE.Mesh(new THREE.BoxGeometry(len * 0.072, len * 0.016, len * 0.3), new THREE.MeshStandardMaterial({ color: 0x332a22, emissive: 0xffc070, emissiveIntensity: 1.4 })); win.position.y = -len * 0.172; g.add(win);
  for (const rz of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, len * 0.13, len * 0.12), std(0xa8452f)); fin.position.set(0, len * 0.13, -len * 0.43); const p = new THREE.Group(); p.rotation.z = rz; p.add(fin); g.add(p); }
  const prop = new THREE.Group(); prop.position.set(0, 0, -len * 0.52);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(len * 0.12, 0.8, 0.4), std(0x333333)); b.rotation.z = i / 3 * Math.PI; prop.add(b); }
  g.add(prop);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.5) })); beacon.position.set(0, -len * 0.22, len * 0.12); g.add(beacon);
  g.traverse(o => { o.castShadow = true; });
  g.userData = { len, prop };
  return g;
}
