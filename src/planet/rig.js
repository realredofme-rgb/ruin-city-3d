// 镜头：从整颗星球一路推到街道。
//   orbit 自由视角：盯着地面上的一个焦点，带朝向、俯仰、距离。拉远到星球尺度时自动变成俯视，近处恢复 v1 的斜俯瞰。
//   tour  风景巡游：模块提供的平面路径，或绕星球的巡航。
//   ride  搭乘：跟在车、船、飞艇后面（包括环星飞艇）。
//   walk  街道漫游：在模块的平面坐标里走，镜头按脚下的切平面摆正。
import * as THREE from 'three';
import { R, enu } from './sphere.js';
import { clamp, lerp, smooth } from '../util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
export const MAX_DIST = R * 5.2;
const tiltMax = d => lerp(1.5, 0.0, smooth(2600, 17000, d));

export class GlobeRig {
  constructor(camera, dom, planet) {
    this.cam = camera; this.dom = dom; this.P = planet;
    this.s = { f: V(0, 0, 1), h: 0, tilt: 0, dist: R * 3.4, lift: 0 };
    this.mode = 'orbit'; this.onModeChange = () => {};
    this.d = { px: 0, py: 0, rx: 0, ry: 0, z: 0 };
    this.walk = { yaw: 0, pitch: 0, keys: new Set(), joy: [0, 0], pos: V(0, 0, 0), mod: null };
    this.ptrs = new Map();
    this.bind();
  }
  surfR(dir) { return R + Math.max(this.P.height(dir), 0); }
  groundR(dir) { return R + this.P.height(dir); }

  /* ---------- 输入 ---------- */
  bind() {
    const dom = this.dom, w = this.walk;
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => {
      if (this.mode === 'tour') this.toOrbit();
      this.anim = null;
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, mod: e.shiftKey || e.ctrlKey || e.metaKey });
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', e => {
      const p = this.ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.mode === 'walk') { w.yaw -= dx * 0.0042; w.pitch = clamp(w.pitch - dy * 0.0036, -1.2, 1.2); p.x = e.clientX; p.y = e.clientY; return; }
      if (this.mode !== 'orbit') return;
      if (this.ptrs.size === 1) {
        const pan = p.btn === 2 || p.mod || this.s.dist > 2600;
        if (pan) { this.d.px += dx; this.d.py += dy; } else { this.d.rx += dx; this.d.ry += dy; }
      } else if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()], o = a === p ? b : a;
        const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        if (d0 > 10 && d1 > 10) this.d.z += Math.log(d0 / d1) * 1.6;
        this.d.px += dx / 2; this.d.py += dy / 2;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = e => this.ptrs.delete(e.pointerId);
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', e => {
      e.preventDefault(); if (this.mode === 'tour') this.toOrbit(); if (this.mode !== 'orbit') return;
      this.anim = null; this.d.z += e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0013);
    }, { passive: false });
    addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; w.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', e => w.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => w.keys.clear());
  }

  setMode(m) { this.mode = m; this.ptrs.clear(); this.onModeChange(m); }

  /* ---------- 状态 ↔ 相机 ---------- */
  basis(f, h, out = {}) {
    const [e, n] = enu(f, _e, _n);
    out.fwd = (out.fwd || V()).copy(n).multiplyScalar(Math.cos(h)).addScaledVector(e, Math.sin(h));
    out.right = (out.right || V()).crossVectors(out.fwd, f);
    return out;
  }
  focusPoint(s = this.s, out = V()) { return out.copy(s.f).multiplyScalar(this.surfR(s.f) + s.lift); }
  place(s = this.s) {
    const cam = this.cam, u = s.f, B = this.basis(u, s.h, this._B || (this._B = {}));
    const F = this.focusPoint(s, _a);
    const d = _b.copy(u).multiplyScalar(Math.cos(s.tilt)).addScaledVector(B.fwd, -Math.sin(s.tilt));
    cam.position.copy(F).addScaledVector(d, s.dist);
    const gr = this.groundR(_c.copy(cam.position).normalize()) + 3;
    if (cam.position.length() < gr) {
      cam.position.setLength(gr); cam.up.copy(cam.position).normalize(); cam.lookAt(F);
    } else {
      const upc = _c.copy(u).multiplyScalar(Math.sin(s.tilt)).addScaledVector(B.fwd, Math.cos(s.tilt));
      const right = _e.crossVectors(upc, d);
      cam.quaternion.setFromRotationMatrix(_m.makeBasis(right, upc, d));
      cam.up.copy(upc);
    }
    cam.updateMatrixWorld();
  }
  /** 从「相机位置 + 看向的点」反推状态 */
  stateFrom(camW, targetW) {
    const f = targetW.clone().normalize(), lift = Math.max(targetW.length() - this.surfR(f), 0);
    const off = camW.clone().sub(targetW), dist = Math.max(off.length(), 12), d = off.normalize();
    const tilt = Math.acos(clamp(d.dot(f), -1, 1));
    const hp = d.clone().addScaledVector(f, -d.dot(f)).negate();
    const [e, n] = enu(f, V(), V());
    const h = hp.lengthSq() > 1e-8 ? Math.atan2(hp.dot(e), hp.dot(n)) : this.s.h;
    return { f, h, tilt, dist, lift };
  }
  go(state, { fly = true, dur } = {}) {
    if (this.mode !== 'orbit') this.setMode('orbit');
    const to = { ...this.s, ...state, f: (state.f || this.s.f).clone().normalize() };
    if (!fly) { this.s = to; this.anim = null; return; }
    const ang = this.s.f.angleTo(to.f);
    this.anim = { t: 0, dur: dur || clamp(1.4 + ang * 2.2 + Math.abs(Math.log(to.dist / this.s.dist)) * 0.25, 1.4, 5.5), a: { ...this.s, f: this.s.f.clone() }, b: to, ang };
  }
  lookFrom(camW, targetW, opt) { this.go(this.stateFrom(camW, targetW), opt); }
  /** 飞到某个世界坐标附近，保持当前朝向 */
  flyToPoint(pW, dist) { const s = this.stateFrom(this.cam.position, pW); this.go({ f: s.f, lift: s.lift, dist, tilt: clamp(this.s.dist > 3000 ? 1.0 : this.s.tilt, 0.6, 1.25), h: this.s.dist > 3000 ? this.s.h : s.h }); }
  planetView() { this.go({ dist: R * 3.4, tilt: 0, lift: 0 }); }
  /** 当前「这里」：自由视角是焦点，其它模式是相机脚下 */
  here(out = V()) { return this.mode === 'orbit' ? out.copy(this.s.f) : out.copy(this.cam.position).normalize(); }
  toOrbit() {
    const dir = V(); this.cam.getWorldDirection(dir);
    const t = this.cam.position.clone().addScaledVector(dir, 120), r = this.surfR(t.clone().normalize()) + 2;
    if (t.length() < r) t.setLength(r);
    this.setMode('orbit'); this.s = this.stateFrom(this.cam.position, t); this.anim = null;
  }

  /* ---------- 模块里的巡游、搭乘、漫游 ---------- */
  startTour(tour, mod) {
    this.tour = tour; this.tmod = mod; this.tt = 0;
    if (tour.planet) { this.setMode('tour'); this.tf = this.s.f.clone(); return; }
    this.tp = new THREE.CatmullRomCurve3(tour.keys.map(k => k[0]), true, 'centripetal'); this.tg = new THREE.CatmullRomCurve3(tour.keys.map(k => k[1]), true, 'centripetal');
    this.lookNow = mod.frame.toWorld(...this.tg.getPointAt(0).toArray());
    this.setMode('tour');
  }
  startRide(kind, obj) { this.ride = kind; this.rideObj = obj; this.rideLook = null; this.setMode('ride'); }
  startWalk(mod) {
    const w = this.walk, st = mod.walkStart(); w.mod = mod;
    w.pos.set(st.x, mod.ground(st.x, st.z) + 1.7, st.z); w.yaw = st.yaw; w.pitch = 0.1;
    this.setMode('walk');
  }

  update(dt) {
    const cam = this.cam;
    if (this.mode === 'orbit') {
      const s = this.s, D = this.d, k = 1 - Math.exp(-dt * 14);
      if (this.anim) {
        const A = this.anim; A.t = Math.min(1, A.t + dt / A.dur); const u = A.t * A.t * (3 - 2 * A.t);
        _q.setFromUnitVectors(A.a.f, A.b.f); const qa = new THREE.Quaternion().slerp(_q, u);
        s.f.copy(A.a.f).applyQuaternion(qa);
        const hop = Math.log(Math.max(1, A.ang * R * 1.4 / Math.max(A.a.dist, A.b.dist)));
        s.dist = Math.exp(lerp(Math.log(A.a.dist), Math.log(A.b.dist), u) + hop * Math.sin(Math.PI * u));
        let dh = ((A.b.h - A.a.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI; s.h = A.a.h + dh * u;
        s.tilt = Math.min(lerp(A.a.tilt, A.b.tilt, u), tiltMax(s.dist) + 0.0001 + (A.t > 0.98 ? 1 : 0));
        s.lift = lerp(A.a.lift, A.b.lift, u);
        if (A.t >= 1) { Object.assign(s, A.b); this.anim = null; }
      } else {
        // 缩放：拉近时自动抬起俯仰角，像从卫星俯冲下来
        const z = D.z * k; D.z -= z;
        s.dist = clamp(s.dist * Math.exp(z), 12, MAX_DIST);
        if (z < 0) s.tilt += (lerp(1.12, 0, smooth(500, 9000, s.dist)) - s.tilt) * Math.min(1, -z * 1.4);
        // 旋转
        const rx = D.rx * k, ry = D.ry * k; D.rx -= rx; D.ry -= ry;
        s.h -= rx * 0.005; s.tilt -= ry * 0.004;
        // 平移：按屏幕上的像素换算成地面上的距离
        const px = D.px * k, py = D.py * k; D.px -= px; D.py -= py;
        if (px || py) {
          const fov = THREE.MathUtils.degToRad(cam.fov), H = this.dom.clientHeight || innerHeight;
          const mpp = 2 * Math.tan(fov / 2) * s.dist / H;
          const B = this.basis(s.f, s.h, this._B2 || (this._B2 = {}));
          const ang = mpp / R;
          s.f.addScaledVector(B.right, -px * ang).addScaledVector(B.fwd, py * ang / Math.max(Math.cos(s.tilt), 0.35)).normalize();
          s.lift *= 0.9;
        }
        s.tilt = clamp(s.tilt, 0, tiltMax(s.dist));
      }
      this.place();
    } else if (this.mode === 'tour') {
      this.tt += dt;
      if (this.tour.planet) {
        const s = this.s; s.f.copy(this.tf).applyAxisAngle(V(0, 1, 0), this.tt * 0.08); s.f.y = Math.sin(this.tt * 0.03) * 0.35; s.f.normalize();
        s.dist = lerp(s.dist, R * 2.6, 1 - Math.exp(-dt * 1.2)); s.tilt = lerp(s.tilt, 0.5, 1 - Math.exp(-dt * 0.6)); s.h = lerp(s.h, -Math.PI / 2, 1 - Math.exp(-dt * 0.5)); s.lift = 0;
        this.place(); return;
      }
      const F = this.tmod.frame, u = (this.tt / this.tour.dur) % 1;
      const p = this.tp.getPointAt(u), t = this.tg.getPointAt(u);
      p.y = Math.max(p.y, this.tmod.height(p.x, p.z) + 6);
      const pw = F.toWorld(p.x, p.y, p.z), tw = F.toWorld(t.x, t.y, t.z);
      if (this.tt < 0.05) cam.position.copy(pw); else cam.position.lerp(pw, 1 - Math.exp(-dt * 3));
      this.lookNow.lerp(tw, 1 - Math.exp(-dt * 2));
      cam.up.copy(cam.position).normalize(); cam.lookAt(this.lookNow);
    } else if (this.mode === 'ride') {
      const o = this.rideObj; o.updateMatrixWorld();
      const sc = 1 / (o.scale.x || 1), L = o.userData.len || 56;
      const off = { tram: [0, 2.7, 3.6], air: [0, L * 0.4, -L * 1.25], boat: [0, 9 * sc, -24 * sc], bot: [0, 3, -6], globe: [0, L * 0.32, -L * 1.5] }[this.ride];
      const look = { tram: [0, 2.2, 40], air: [0, 0, L], boat: [0, 2 * sc, 40 * sc], bot: [0, 1.5, 10], globe: [0, -L * 0.1, L] }[this.ride];
      const p = V(...off).applyMatrix4(o.matrixWorld), l = V(...look).applyMatrix4(o.matrixWorld);
      if (this.ride === 'tram') cam.position.copy(p); else cam.position.lerp(p, 1 - Math.exp(-dt * 4));
      if (!this.rideLook) this.rideLook = l.clone(); this.rideLook.lerp(l, 1 - Math.exp(-dt * 5));
      cam.up.copy(cam.position).normalize(); cam.lookAt(this.rideLook);
    } else if (this.mode === 'walk') {
      const w = this.walk, k = w.keys, M = w.mod;
      let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - w.joy[1];
      let s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + w.joy[0];
      if (k.has('q')) w.yaw += dt * 1.6; if (k.has('e')) w.yaw -= dt * 1.6;
      const sp = (k.has('shift') ? 14 : 5.5) * dt;
      const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
      const dx = (fx * f - fz * s) * sp, dz = (fz * f + fx * s) * sp;
      if (M.canStand(w.pos.x + dx, w.pos.z)) w.pos.x += dx;
      if (M.canStand(w.pos.x, w.pos.z + dz)) w.pos.z += dz;
      const gy = M.ground(w.pos.x, w.pos.z) + 1.7, bob = (f || s) ? Math.sin(performance.now() / 170) * 0.05 : 0;
      w.pos.y += (gy - w.pos.y) * Math.min(1, dt * 10);
      M.frame.toWorld(w.pos.x, w.pos.y + bob, w.pos.z, cam.position);
      M.frame.quatAt(w.pos.x, w.pos.z, cam.quaternion).multiply(_q.setFromEuler(new THREE.Euler(w.pitch, w.yaw, 0, 'YXZ')));
      cam.up.copy(cam.position).normalize();
    }
  }
}
