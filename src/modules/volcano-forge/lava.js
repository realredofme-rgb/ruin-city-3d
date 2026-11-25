// 熔岩与「被熔岩照亮」：流动的熔岩材质、熔岩带/湖/瀑布的几何、热场，以及给建筑和地形用的自发光补丁。
import * as THREE from 'three';
import { clamp, smooth } from '../../util.js';

/** 全模块共享的动画 uniform */
export const LU = { uTime: { value: 0 }, uNight: { value: 0 }, uPulse: { value: 0 } };

const GLSL_NOISE = `
float vh2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(vh2(i), vh2(i + vec2(1, 0)), f.x), mix(vh2(i + vec2(0, 1)), vh2(i + vec2(1, 1)), f.x), f.y); }
float vf2(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vn2(p); p = p * 2.03 + 11.7; a *= .5; } return s / .9375; }
float vh3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(vh3(i), vh3(i + vec3(1, 0, 0)), f.x), mix(vh3(i + vec3(0, 1, 0)), vh3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vh3(i + vec3(0, 0, 1)), vh3(i + vec3(1, 0, 1)), f.x), mix(vh3(i + vec3(0, 1, 1)), vh3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
`;

/* =============== 熔岩材质 ===============
   每个顶点带 aL = (图案 x, 图案 y, 离边缘 0..1, 沿 y 的流速 m/s)。
   表面是会裂开的黑色硬壳，裂缝和中心是橙黄的熔岩，整片图案顺着流向滑动。 */
export function lavaMaterial({ side = THREE.FrontSide, crust = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0x1a100c, roughness: 0.82, metalness: 0, side });
  m.userData.lava = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = LU.uTime; sh.uniforms.uNight = LU.uNight; sh.uniforms.uCrust = { value: crust };
    sh.vertexShader = 'attribute vec4 aL;\nvarying vec4 vL;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = aL;');
    sh.fragmentShader = 'uniform float uTime, uNight, uCrust;\nvarying vec4 vL;\nfloat lavaHeat;\n' + GLSL_NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vec2(vL.x, vL.y - uTime * vL.w);
          float warp = vf2(q * .021 + vec2(uTime * .013, 0.));
          float n = vf2(q * .055 + warp * 1.6), n2 = vf2(q * .19 + 7.3 + warp);
          float crack = 1. - smoothstep(.0, .05 + .07 * n2, abs(n - .5));
          float core = 1. - smoothstep(.15, .95, vL.z);
          float swirl = .5 + .5 * sin(uTime * .7 + n * 12. + vL.x * .02);
          lavaHeat = clamp(core * (.55 + .35 * swirl) * (1. - .55 * uCrust * smoothstep(.35, .62, n2)) + crack * (.75 - .3 * vL.z), 0., 1.);
          diffuseColor.rgb = mix(vec3(.05, .04, .035), vec3(.3, .08, .03), lavaHeat);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float h = lavaHeat;
          vec3 e = vec3(.35, .025, .0) * smoothstep(.05, .35, h) + vec3(3.4, .85, .12) * smoothstep(.3, .75, h) + vec3(2.4, 1.9, .7) * smoothstep(.8, 1., h);
          totalEmissiveRadiance = e * (.9 + .5 * uNight);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(.9, .35, lavaHeat);');
  };
  m.customProgramCacheKey = () => 'vf-lava' + crust + side;
  return m;
}

/** 沿一条带高度的路径铺一条熔岩带。pts: [{x,y,z}]，width 宽，speed 流速，cross 横向分段数 */
export function ribbon(pts, width, speed = 3, { cross = 6, lift = 0, up = null } = {}) {
  const pos = [], aL = [], idx = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z);
    const w = (typeof width === 'function' ? width(i / (pts.length - 1)) : width) / 2;
    for (let k = 0; k <= cross; k++) {
      const f = k / cross * 2 - 1, ox = -tz * w * f, oz = tx * w * f;
      const sag = (1 - f * f) * lift;
      if (up) pos.push(p.x + up[0] * f * w, p.y + up[1] * f * w + sag, p.z + up[2] * f * w);
      else pos.push(p.x + ox, p.y + sag, p.z + oz);
      aL.push(f * w, s, Math.abs(f), speed);
    }
  }
  const row = cross + 1;
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < cross; k++) {
    const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(aL, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** 圆形熔岩池：图案坐标用平面 x/z，边缘更冷、结壳更多 */
export function lavaDisc(x, y, z, r, speed = 0.5, seg = 64, rings = 10, ex = 2.2) {
  const pos = [], aL = [], idx = [];
  pos.push(x, y, z); aL.push(x, z, 0, speed);
  for (let j = 1; j <= rings; j++) for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2, rr = r * j / rings, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    pos.push(px, y, pz); aL.push(px, pz, Math.pow(j / rings, ex), speed);
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + (i + 1) % seg, 1 + i);
  for (let j = 1; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = 1 + (j - 1) * seg + i, b = 1 + (j - 1) * seg + (i + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(aL, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** 两点之间的熔岩瀑布（抛物线），返回路径点 */
export function fallPath(a, b, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

/* =============== 热场 ===============
   把所有熔岩的采样点摊到一张 6 米的网格上：每格记下最近熔岩的「热度」和那块熔岩的高度，
   之后任何顶点（地面、墙、管道）都能查到自己被熔岩烤得多红。 */
export class HeatField {
  constructor(x0, z0, size, cell = 6) {
    this.x0 = x0; this.z0 = z0; this.cell = cell; this.n = Math.ceil(size / cell);
    this.h = new Float32Array(this.n * this.n); this.y = new Float32Array(this.n * this.n).fill(-1e4);
    // 远一点的「暖光」：熔岩把周围几百米的烟和岩壁都映成暗红，网格粗一些
    this.wc = 24; this.wn = Math.ceil(size / this.wc); this.w = new Float32Array(this.wn * this.wn);
  }
  /** 一个熔岩点：半径 reach 米内都会被烤热，strength 0..1 */
  splat(x, y, z, reach = 40, strength = 1) {
    const c = this.cell, n = this.n, cx = (x - this.x0) / c, cz = (z - this.z0) / c, rr = Math.ceil(reach / c);
    for (let j = Math.max(0, Math.floor(cz - rr)); j <= Math.min(n - 1, Math.ceil(cz + rr)); j++)
      for (let i = Math.max(0, Math.floor(cx - rr)); i <= Math.min(n - 1, Math.ceil(cx + rr)); i++) {
        const d = Math.hypot((i - cx) * c, (j - cz) * c), v = strength * Math.exp(-d / (reach * 0.33));
        const k = j * n + i; if (v > this.h[k]) { this.h[k] = v; this.y[k] = y; }
      }
    if (strength >= 0.4) this.warm(x, z, 300, strength);
  }
  warm(x, z, reach, strength) {
    const c = this.wc, n = this.wn, cx = (x - this.x0) / c, cz = (z - this.z0) / c, rr = Math.ceil(reach / c);
    for (let j = Math.max(0, Math.floor(cz - rr)); j <= Math.min(n - 1, Math.ceil(cz + rr)); j++)
      for (let i = Math.max(0, Math.floor(cx - rr)); i <= Math.min(n - 1, Math.ceil(cx + rr)); i++) {
        const d = Math.hypot((i - cx) * c, (j - cz) * c), v = strength * Math.exp(-d / (reach * 0.4));
        const k = j * n + i; if (v > this.w[k]) this.w[k] = v;
      }
  }
  warmAt(x, z) {
    const c = this.wc, n = this.wn, fx = (x - this.x0) / c, fz = (z - this.z0) / c, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return 0;
    const u = fx - i, v = fz - j, w = this.w;
    return (w[j * n + i] * (1 - u) + w[j * n + i + 1] * u) * (1 - v) + (w[(j + 1) * n + i] * (1 - u) + w[(j + 1) * n + i + 1] * u) * v;
  }
  splatPath(pts, reach, strength) { let last = null; for (const p of pts) { if (last && Math.hypot(p.x - last.x, p.z - last.z) < this.cell * 0.7) continue; this.splat(p.x, p.y, p.z, reach, strength); last = p; } }
  at(x, y, z) {
    const c = this.cell, n = this.n, i = Math.round((x - this.x0) / c), j = Math.round((z - this.z0) / c);
    if (i < 0 || j < 0 || i >= n || j >= n) return 0;
    const k = j * n + i, dy = Math.abs(y - this.y[k]);
    return this.h[k] * Math.exp(-Math.max(0, dy - 2) / 16);
  }
  /** 给几何体写入 aHeat 属性 */
  apply(geo, matrix = null) {
    const p = geo.attributes.position, a = new Float32Array(p.count), w = new Float32Array(p.count), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); if (matrix) v.applyMatrix4(matrix);
      a[i] = clamp(this.at(v.x, v.y, v.z), 0, 1); w[i] = clamp(this.warmAt(v.x, v.z), 0, 1);
    }
    geo.setAttribute('aHeat', new THREE.BufferAttribute(a, 1));
    geo.setAttribute('aWarm', new THREE.BufferAttribute(w, 1));
    return geo;
  }
  /** 一组（刚体）物件：按它们现在的位置写入热度 */
  applyGroup(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse(o => { if (o.isMesh && o.geometry.attributes.aLit) this.apply(o.geometry, o.matrixWorld); });
  }
}

/* =============== 建筑/地形的自发光补丁 ===============
   aLit（Builder 的属性）≤ 1 时当作炉口/窗/灼热金属的自发光强度；aHeat 是被熔岩烤红的程度。
   另外按世界坐标叠一层污渍噪声，免得大面积的墙一样平。 */
export function forgeMaterial(opts = {}, { grime = 1, key = 'a' } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1, ...opts });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = LU.uTime; sh.uniforms.uNight = LU.uNight; sh.uniforms.uPulse = LU.uPulse; sh.uniforms.uGrime = { value: grime };
    sh.vertexShader = 'attribute float aLit;\nattribute float aHeat;\nattribute float aWarm;\nvarying float vEm;\nvarying float vHeat;\nvarying float vWarm;\nvarying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvEm = aLit <= 1.0 ? aLit : 0.0; vHeat = aHeat; vWarm = aWarm; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTime, uNight, uPulse, uGrime;\nvarying float vEm;\nvarying float vHeat;\nvarying float vWarm;\nvarying vec3 vWP;\n' + GLSL_NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float g = vn3(vWP * .045) * .55 + vn3(vWP * .21) * .3 + vn3(vWP * .9) * .15;
          diffuseColor.rgb *= mix(1., mix(.55, 1.18, g), uGrime);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.03, .025, .02), vHeat * vHeat * .5); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fl = .8 + .2 * sin(uTime * 2.3 + vWP.x * .07) * sin(uTime * 1.3 + vWP.z * .05) + .12 * uPulse;
          float lava = vHeat * vHeat;
          totalEmissiveRadiance += vec3(2.8, .9, .26) * vEm * fl * (.75 + .5 * uNight)
            + vec3(1.5, .3, .05) * lava * (.25 + .75 * uNight) * (.85 + .15 * sin(uTime * 1.7 + vWP.y * .1))
            + diffuseColor.rgb * vec3(2.4, .75, .28) * vWarm * vWarm * uNight * (.9 + .1 * sin(uTime * .8)); }`);
  };
  m.customProgramCacheKey = () => 'vf-forge-' + key;
  return m;
}

/** 给没有 aLit/aHeat 的几何体补上默认值 */
export function ensureAttrs(geo, lit = 2) {
  const n = geo.attributes.position.count;
  if (!geo.attributes.aLit) geo.setAttribute('aLit', new THREE.BufferAttribute(new Float32Array(n).fill(lit), 1));
  if (!geo.attributes.aHeat) geo.setAttribute('aHeat', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!geo.attributes.aWarm) geo.setAttribute('aWarm', new THREE.BufferAttribute(new Float32Array(n), 1));
  return geo;
}
export { smooth };
