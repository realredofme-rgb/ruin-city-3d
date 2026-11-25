// 环境音：全部用 WebAudio 现场合成，不需要音频文件
// 风（随风力与高度）、雨、海浪（离海岸越近越响）、鸟叫（白天、低空）、电车铃、落石、雾笛——后几种是带方位的 3D 声源
import * as THREE from 'three';
import { shoreZ } from './world.js';
import { clamp, smooth } from './util.js';

export class Ambience {
  constructor() { this.on = false; this.ctx = null; }
  start() {
    if (!this.ctx) this.init();
    this.ctx.resume(); this.on = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.4);
  }
  stop() { if (!this.ctx) return; this.on = false; this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); }
  init() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0; this.master.connect(C.destination);
    const len = C.sampleRate * 3, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.985 * b + 0.015 * w; d[i] = w * 0.6 + b * 3; } // 白噪 + 一点褐噪
    this.noise = buf;
    const loop = (type, f, q) => { const s = C.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.6; const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = C.createGain(); g.gain.value = 0; s.connect(fl).connect(g).connect(this.master); s.start(); return { s, fl, g }; };
    this.wind = loop('bandpass', 420, 0.6);
    this.rain = loop('highpass', 1400, 0.3);
    this.rain2 = loop('bandpass', 5200, 0.8);
    this.sea = loop('lowpass', 420, 0.5);
    this.birdT = 1; this.hornT = 8;
  }
  /** 一次性的带方位声源 */
  spot(pos, build, vol = 1) {
    const C = this.ctx, p = C.createPanner();
    Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 25, maxDistance: 3000, rolloffFactor: 1.1 });
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    const g = C.createGain(); g.gain.value = vol; g.connect(p).connect(this.master);
    build(g, C.currentTime);
  }
  tone(out, t, f, dur, type = 'sine', vol = 0.3, f2) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(out, t, dur, f, vol) {
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.6;
    const fl = C.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(out); s.start(t, Math.random() * 2); s.stop(t + dur);
  }
  event(e) {
    if (!this.on) return;
    if (e.type === 'tramDepart' || e.type === 'tramArrive') this.spot(e.pos, (o, t) => { const n = e.type === 'tramDepart' ? 2 : 1; for (let i = 0; i < n; i++) { this.tone(o, t + i * 0.32, 1568, 1.1, 'triangle', 0.25); this.tone(o, t + i * 0.32, 2093, 0.9, 'sine', 0.12); } });
    if (e.type === 'impact') this.spot(e.pos, (o, t) => { this.burst(o, t, 1.4, 1800, 0.9 * (0.4 + e.power)); this.tone(o, t, 70, 0.6, 'sine', 0.6 * (0.4 + e.power), 40); }, 2.2);
    if (e.type === 'crumble') this.spot(e.pos, (o, t) => this.burst(o, t, 0.5, 3000, 0.25));
    if (e.type === 'birds') this.spot(e.pos, (o, t) => { for (let i = 0; i < 14; i++) this.burst(o, t + Math.random() * 0.8, 0.12, 2500, 0.18); });
  }
  update(dt, cam, env, extra) {
    if (!this.ctx || !this.on) return;
    const C = this.ctx, t = C.currentTime, L = C.listener, p = cam.position;
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    const alt = smooth(10, 300, p.y), wx = env.wx;
    this.wind.g.gain.setTargetAtTime(0.025 + env.wind * 0.12 + alt * 0.12, t, 0.5);
    this.wind.fl.frequency.setTargetAtTime(300 + 260 * Math.sin(t * 0.23) + env.wind * 300, t, 0.8);
    this.rain.g.gain.setTargetAtTime(wx.rain * 0.16, t, 0.6); this.rain2.g.gain.setTargetAtTime(wx.rain * 0.08, t, 0.6);
    const dShore = Math.abs(p.z - shoreZ(p.x));
    this.sea.g.gain.setTargetAtTime((0.04 + 0.22 * smooth(260, 0, dShore + p.y)) * (0.6 + 0.4 * Math.sin(t * 0.55) ** 2) * (1 + wx.rain), t, 0.4);
    // 白天低空才有鸟叫
    this.birdT -= dt;
    if (this.birdT < 0) {
      this.birdT = 0.6 + Math.random() * 2.4;
      if (env.night < 0.4 && wx.rain < 0.3 && p.y < 90) {
        const a = Math.random() * 6.28, pos = new THREE.Vector3(p.x + Math.cos(a) * 30, p.y + 8, p.z + Math.sin(a) * 30), base = 2400 + Math.random() * 1800;
        this.spot(pos, (o, t0) => { const n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) this.tone(o, t0 + i * 0.11, base, 0.09, 'sine', 0.08, base * (1.2 + Math.random() * 0.4)); });
      }
    }
    // 雾天灯塔雾笛
    this.hornT -= dt;
    if (this.hornT < 0) {
      this.hornT = 26;
      if (wx.fog > 0.5) this.spot(extra.lighthouse, (o, t0) => { this.tone(o, t0, 98, 3.2, 'sawtooth', 0.18); this.tone(o, t0, 147, 3.2, 'sine', 0.12); }, 3);
    }
  }
}
