// 烟、蒸汽、火星和熔岩喷泉：全部是在顶点着色器里按时间算位置的粒子，CPU 每帧只改几个 uniform。
import * as THREE from 'three';
import { rng, dotTexture } from '../../util.js';
import { LU } from './lava.js';

let _tex = null;
const tex = () => _tex || (_tex = dotTexture());
/** 烟团贴图：边缘毛糙的软圆 */
let _puff = null;
function puffTexture() {
  if (_puff) return _puff;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), R = rng(9);
  for (let i = 0; i < 40; i++) {
    const x = 64 + (R() - 0.5) * 50, y = 64 + (R() - 0.5) * 50, r = 18 + R() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  _puff = new THREE.CanvasTexture(c); _puff.colorSpace = THREE.SRGBColorSpace; return _puff;
}

const U = { uWind: { value: new THREE.Vector2(0.6, 0.2) }, uScale: { value: 800 }, uDay: { value: 1 } };
export const FXU = U;

/**
 * 烟与蒸汽。sources: [{ x, y, z, n 粒子数, rise 上升高度, spread 扩散半径, size 粒子尺寸, period 寿命秒, kind 0 黑烟 / 1 白汽, hot 0..1 底部被熔岩照亮 }]
 */
export function makeSmoke(sources, seed = 1) {
  const R = rng(seed), src = [], p4 = [], k4 = [];
  for (const s of sources) for (let i = 0; i < s.n; i++) {
    src.push(s.x + (R() - 0.5) * (s.jx || 0), s.y, s.z + (R() - 0.5) * (s.jz || 0));
    p4.push(R(), s.period * (0.8 + R() * 0.4), s.rise * (0.7 + R() * 0.6), s.size * (0.7 + R() * 0.6));
    k4.push(s.kind, s.hot || 0, s.spread, R() * 6.283);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(src, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(p4, 4));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(k4, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: LU.uTime, uNight: LU.uNight, uWind: U.uWind, uScale: U.uScale, uDay: U.uDay, uTex: { value: puffTexture() } },
    vertexShader: `attribute vec4 aP; attribute vec4 aK; uniform float uTime, uNight, uScale; uniform vec2 uWind;
      varying float vA; varying vec3 vC; varying float vRot;
      void main(){
        float life = fract(uTime / aP.y + aP.x);
        float s = aP.x * 91.7;
        vec3 p = position;
        float up = aP.z * (1. - pow(1. - life, 1.6));
        p.y += up;
        p.xz += vec2(sin(s * 1.7), cos(s * 2.3)) * aK.z * (.25 + life) + uWind * aP.z * .9 * life * life;
        p.xz += vec2(sin(uTime * .3 + s), cos(uTime * .27 + s)) * aK.z * .3 * life;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix * mv;
        float size = aP.w * (.35 + 1.65 * sqrt(life));
        gl_PointSize = clamp(size * uScale / -mv.z, 0., 900.);
        float fade = smoothstep(0., .08, life) * pow(1. - life, 1.3);
        vA = fade * (aK.x > .5 ? .5 : .78) * smoothstep(3., 40., -mv.z);
        vec3 smoke = mix(vec3(.16, .14, .13), vec3(.32, .3, .29), life);
        vec3 steam = vec3(.92, .9, .87);
        vC = mix(smoke, steam, aK.x);
        vC = mix(vC, vec3(1.25, .38, .1) * (.6 + .5 * uNight), aK.y * (1. - smoothstep(.0, .3, life)) * mix(.08, 1., uNight));
        vRot = aK.w + life * 1.3;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uNight, uDay; varying float vA; varying vec3 vC; varying float vRot;
      void main(){
        vec2 q = gl_PointCoord - .5; float c = cos(vRot), s = sin(vRot); q = mat2(c, -s, s, c) * q + .5;
        float a = texture2D(uTex, q).a * vA;
        if (a < .004) discard;
        vec3 col = vC * mix(1., .1, uNight) + max(vC - 1., 0.) * uNight;
        gl_FragColor = vec4(col * uDay, a);
      }`
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 2;
  return pts;
}

/**
 * 火星与熔岩喷泉（叠加发光）。jets: [{ x, y, z, n, vy 上抛速度, vh 横向速度, g 重力系数（负数 = 往上飘）, period, size, jx, jz 发射口大小 }]
 */
export function makeEmbers(jets, seed = 2) {
  const R = rng(seed), src = [], vel = [], p4 = [];
  for (const j of jets) for (let i = 0; i < j.n; i++) {
    const a = R() * 6.283, h = j.vh * Math.sqrt(R());
    src.push(j.x + (R() - 0.5) * (j.jx || 0), j.y, j.z + (R() - 0.5) * (j.jz || 0));
    vel.push(Math.cos(a) * h + (j.dx || 0), j.vy * (0.6 + R() * 0.5), Math.sin(a) * h + (j.dz || 0));
    p4.push(R(), j.period * (0.7 + R() * 0.6), j.g, j.size * (0.6 + R() * 0.8));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(src, 3));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(vel, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(p4, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: LU.uTime, uNight: LU.uNight, uWind: U.uWind, uScale: U.uScale, uTex: { value: tex() } },
    vertexShader: `attribute vec3 aV; attribute vec4 aP; uniform float uTime, uNight, uScale; uniform vec2 uWind;
      varying float vA; varying float vT;
      void main(){
        float life = fract(uTime / aP.y + aP.x), tt = life * aP.y;
        vec3 p = position + aV * tt;
        p.y -= 4.9 * aP.z * tt * tt;
        p.xz += uWind * tt * tt * .25 * (1. - aP.z);
        p.x += sin(tt * 2. + aP.x * 40.) * (1. - aP.z) * 2.;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aP.w * uScale / -mv.z, 1., 40.);
        vT = life;
        vA = (1. - life) * smoothstep(0., .05, life) * (.55 + .7 * uNight) * (.6 + .4 * sin(uTime * 13. + aP.x * 70.));
      }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; varying float vT;
      void main(){ float t = texture2D(uTex, gl_PointCoord).a;
        vec3 c = mix(vec3(2.4, 1.5, .55), vec3(1.6, .32, .05), vT);
        gl_FragColor = vec4(c * t * vA, 1.); }`
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 3;
  return pts;
}

/** 夜里笼在熔岩上空的红色光晕（大而淡的叠加精灵，给烟和空气一点被照亮的感觉） */
export function makeHalos(list) {
  const pos = [], p2 = [];
  for (const h of list) { pos.push(h.x, h.y, h.z); p2.push(h.size, h.k); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(p2, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: LU.uTime, uNight: LU.uNight, uScale: U.uScale, uTex: { value: tex() } },
    vertexShader: `attribute vec2 aS; uniform float uTime, uNight, uScale; varying float vA;
      void main(){ vec3 p = position; vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aS.x * uScale / -mv.z, 2., 1400.);
        vA = aS.y * (.15 + .85 * uNight) * (.85 + .15 * sin(uTime * .9 + p.x)) * smoothstep(60., 400., -mv.z); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ float t = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vec3(1., .3, .08) * t * t * vA, 1.); }`
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 1;
  return pts;
}
