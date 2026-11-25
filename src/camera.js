// 镜头：自由俯瞰、风景巡游、搭乘、街道漫游
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ground } from './world.js';
import { insideFoot, PLAZA } from './city.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const circle = (cx, cy, cz, r, n, ty, tyOff = 0) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [V(cx + Math.cos(a) * r, cy + Math.sin(a * 2) * 12, cz + Math.sin(a) * r), V(cx, ty + tyOff, cz)]; });

export const TOURS = [
  { id: 'dusk', name: '斜阳废墟', desc: '低飞穿过断楼之间的街道，夕光照着长满藤蔓的墙', hour: 17.35, weather: 'clear', dur: 80,
    keys: [[V(150, 14, 70), V(-40, 30, -200)], [V(40, 20, 10), V(-150, 50, -260)], [V(-80, 26, -70), V(-200, 70, -380)], [V(-230, 30, -40), V(-330, 40, -200)], [V(-360, 24, 20), V(-430, 40, 40)], [V(-300, 40, 100), V(-100, 60, -100)], [V(-60, 30, 120), V(100, 30, -40)]] },
  { id: 'night', name: '雾港夜灯', desc: '从海湾回望山坡上的万家灯火，灯塔扫过水面', hour: 21.2, weather: 'clear', dur: 70,
    keys: [[V(600, 24, 330), V(470, 30, -40)], [V(460, 36, 330), V(450, 40, -80)], [V(300, 30, 300), V(430, 30, -30)], [V(220, 50, 240), V(500, 30, 0)], [V(420, 70, 260), V(640, 30, 120)]] },
  { id: 'isle', name: '浮空之岛', desc: '绕着悬在废墟上空的岛屿飞一圈，瀑布落进雾里', hour: 10.6, weather: 'clear', dur: 90,
    keys: circle(PLAZA.x, 175, PLAZA.y, 135, 8, 140) },
  { id: 'rain', name: '雨中沉城', desc: '贴着海面滑过半截沉没的高楼，远处是雾港', hour: 15, weather: 'rain', dur: 75,
    keys: [[V(-560, 10, 470), V(-300, 40, 300)], [V(-400, 8, 400), V(-200, 50, 330)], [V(-220, 12, 420), V(-40, 40, 360)], [V(-60, 16, 460), V(150, 30, 200)], [V(80, 30, 520), V(400, 40, 100)], [V(-300, 40, 560), V(-250, 60, 340)]] },
  { id: 'dawn', name: '白塔晨雾', desc: '晨雾中从海上望向北方山顶的断塔与光环', hour: 6.35, weather: 'fog', dur: 90,
    keys: [[V(80, 120, 520), V(-40, 330, -900)], [V(-80, 150, 360), V(-40, 380, -900)], [V(-200, 170, 200), V(-40, 420, -900)], [V(-60, 140, 100), V(-40, 360, -900)], [V(140, 130, 300), V(-40, 330, -900)]] }
];

export class CameraRig {
  constructor(camera, dom, city, life) {
    this.cam = camera; this.dom = dom; this.city = city; this.life = life;
    this.controls = new OrbitControls(camera, dom);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.07, maxPolarAngle: 1.52, minDistance: 15, maxDistance: 1700, zoomSpeed: 1.1, panSpeed: 0.9 });
    this.controls.screenSpacePanning = false;
    this.mode = 'orbit'; this.onModeChange = () => {};
    this.tt = 0; this.tour = null; this.ride = null;
    this.walk = { yaw: 0, pitch: 0, keys: new Set(), joy: [0, 0], pos: V(0, 0, 0) };
    this.home();
    this.bindWalk();
    dom.addEventListener('pointerdown', () => { if (this.mode === 'tour') this.toOrbit(); });
    dom.addEventListener('wheel', () => { if (this.mode === 'tour') this.toOrbit(); }, { passive: true });
  }
  home() {
    this.setMode('orbit');
    this.cam.position.set(330, 230, 560); this.controls.target.set(-130, 50, -60); this.controls.update();
  }
  setMode(m) { if (m !== 'orbit') this.fly = null; this.mode = m; this.controls.enabled = m === 'orbit'; this.onModeChange(m); }
  toOrbit() {
    const dir = new THREE.Vector3(); this.cam.getWorldDirection(dir);
    const tgt = this.cam.position.clone().addScaledVector(dir, 120);
    tgt.y = Math.max(tgt.y, ground(tgt.x, tgt.z) + 2);
    this.controls.target.copy(tgt); this.setMode('orbit'); this.controls.update();
  }
  startTour(tour) {
    this.tour = tour; this.tt = 0;
    const pts = tour.keys.map(k => k[0]), tgs = tour.keys.map(k => k[1]);
    this.tp = new THREE.CatmullRomCurve3(pts, true, 'centripetal'); this.tg = new THREE.CatmullRomCurve3(tgs, true, 'centripetal');
    this.lookNow = this.tg.getPointAt(0).clone();
    this.setMode('tour');
  }
  startRide(kind, obj) { this.ride = kind; this.rideObj = obj || this.life.movers[kind]; this.setMode('ride'); this.rideLook = null; }
  /** 平滑飞到某个点附近（保持当前朝向） */
  flyTo(target, dist) {
    if (this.mode !== 'orbit') this.toOrbit();
    const dir = this.cam.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.25) { dir.y = 0.35; dir.normalize(); }
    this.fly = { t: 0, p0: this.cam.position.clone(), t0: this.controls.target.clone(), p1: target.clone().addScaledVector(dir, dist), t1: target.clone() };
  }
  startWalk() {
    const d = new THREE.Vector3(); this.cam.getWorldDirection(d);
    // 落在废墟街道上
    const w = this.walk; w.pos.set(-60, 0, 60);
    for (let r = 0; r < 200 && insideFoot(this.city.footprints, w.pos.x, w.pos.z, 2); r += 3) w.pos.set(-60 + r, 0, 60 - r * 0.3);
    w.pos.y = ground(w.pos.x, w.pos.z) + 1.7; w.yaw = 1.0; w.pitch = 0.1;
    this.setMode('walk');
  }
  bindWalk() {
    const w = this.walk;
    addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; w.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', e => w.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => w.keys.clear());
    let drag = null;
    this.dom.addEventListener('pointerdown', e => { if (this.mode !== 'walk') return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; this.dom.setPointerCapture(e.pointerId); });
    this.dom.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      w.yaw -= (e.clientX - drag.x) * 0.0042; w.pitch = THREE.MathUtils.clamp(w.pitch - (e.clientY - drag.y) * 0.0036, -1.2, 1.2);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = e => { if (drag && drag.id === e.pointerId) drag = null; };
    this.dom.addEventListener('pointerup', end); this.dom.addEventListener('pointercancel', end);
  }
  update(dt) {
    const cam = this.cam;
    if (this.mode === 'orbit') {
      if (this.fly) {
        const f = this.fly; f.t = Math.min(1, f.t + dt / 1.6); const k = f.t * f.t * (3 - 2 * f.t);
        cam.position.lerpVectors(f.p0, f.p1, k); this.controls.target.lerpVectors(f.t0, f.t1, k);
        cam.position.y += Math.sin(k * Math.PI) * f.p0.distanceTo(f.p1) * 0.15;
        if (f.t >= 1) this.fly = null;
      }
      this.controls.update();
      const gy = ground(cam.position.x, cam.position.z) + 4;
      if (cam.position.y < gy) cam.position.y = gy;
    } else if (this.mode === 'tour') {
      this.tt += dt;
      const u = (this.tt / this.tour.dur) % 1;
      const p = this.tp.getPointAt(u), t = this.tg.getPointAt(u);
      p.y = Math.max(p.y, ground(p.x, p.z) + 6);
      cam.position.lerp(p, this.tt < 0.05 ? 1 : 1 - Math.exp(-dt * 3));
      if (this.tt < 0.05) cam.position.copy(p);
      this.lookNow.lerp(t, 1 - Math.exp(-dt * 2)); cam.lookAt(this.lookNow);
    } else if (this.mode === 'ride') {
      const o = this.rideObj; o.updateMatrixWorld();
      const sc = 1 / (o.scale.x || 1), L = o.userData.len || 56;
      const off = { tram: [0, 2.7, 3.6], air: [0, L * 0.4, -L * 1.25], boat: [0, 9 * sc, -24 * sc], bot: [0, 3, -6] }[this.ride];
      const look = { tram: [0, 2.2, 40], air: [0, 0, L], boat: [0, 2 * sc, 40 * sc], bot: [0, 1.5, 10] }[this.ride];
      const p = V(...off).applyMatrix4(o.matrixWorld), l = V(...look).applyMatrix4(o.matrixWorld);
      if (this.ride === 'tram') cam.position.copy(p); else cam.position.lerp(p, 1 - Math.exp(-dt * 4));
      if (!this.rideLook) this.rideLook = l.clone(); this.rideLook.lerp(l, 1 - Math.exp(-dt * 5)); cam.lookAt(this.rideLook);
    } else if (this.mode === 'walk') {
      const w = this.walk, k = w.keys;
      let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - w.joy[1];
      let s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + w.joy[0];
      if (k.has('q')) w.yaw += dt * 1.6; if (k.has('e')) w.yaw -= dt * 1.6;
      const sp = (k.has('shift') ? 14 : 5.5) * dt;
      const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
      const dx = (fx * f - fz * s) * sp, dz = (fz * f + fx * s) * sp;
      const fp = this.city.footprints;
      if (!insideFoot(fp, w.pos.x + dx, w.pos.z, 0.4) && ground(w.pos.x + dx, w.pos.z) > 0.8) w.pos.x += dx;
      if (!insideFoot(fp, w.pos.x, w.pos.z + dz, 0.4) && ground(w.pos.x, w.pos.z + dz) > 0.8) w.pos.z += dz;
      const gy = ground(w.pos.x, w.pos.z) + 1.7, bob = (f || s) ? Math.sin(performance.now() / 170) * 0.05 : 0;
      w.pos.y += (gy - w.pos.y) * Math.min(1, dt * 10);
      cam.position.set(w.pos.x, w.pos.y + bob, w.pos.z);
      cam.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
    }
  }
}
