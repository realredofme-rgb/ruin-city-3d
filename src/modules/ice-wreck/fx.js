// 冰原坠舰带的冰块、极光、飘雪、裂缝里升起的蓝色光点，以及一座废弃的科考站。
import * as THREE from 'three';
import { lerp, smooth, rng, fbm, mat, dotTexture } from '../../util.js';
import { Kit } from './kit.js';
import { ground, furrowZ, BOW, RIFTS, valleyZ } from './terrain.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- 冰块：撞击脊上的乱冰、犁沟两侧翻起的冰板、裂缝边的冰塔 ---------- */
function lump(seed, detail = 1, stretch = [1, 1, 1]) {
  const R = rng(seed), g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.75 + 0.5 * fbm(x * 1.7 + seed, y * 1.7 + z * 1.3, 2);
    p.setXYZ(i, x * k * stretch[0], Math.max(y * k, -0.35) * stretch[1], z * k * stretch[2]);
  }
  void R; g.computeVertexNormals(); return g;
}
export function buildIce(root, U) {
  const R = rng(707), d = new THREE.Object3D(), c = new THREE.Color(), white = new THREE.Color(0xeef4f8), blue = new THREE.Color(0x6fb2d8);
  const mat0 = new THREE.MeshStandardMaterial({ roughness: 0.18, metalness: 0.1, flatShading: true, emissive: 0x2a7fb5, emissiveIntensity: 0.1 });
  const out = [];
  const make = (geo, list) => {
    const im = new THREE.InstancedMesh(geo, mat0, list.length);
    list.forEach(([x, z, s, rx, ry, rz, sy, sink, b], i) => {
      d.position.set(x, ground(x, z) - s * sink, z); d.rotation.set(rx, ry, rz); d.scale.set(s, s * sy, s * (0.7 + R() * 0.6)); d.updateMatrix();
      im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.copy(white).lerp(blue, b));
    });
    im.castShadow = true; im.receiveShadow = true; root.add(im); out.push(im);
  };
  const blocks = [], shards = [];
  // 舰首前方弧形的压力脊
  for (let i = 0; i < 260; i++) {
    const a = R.range(-1.25, 1.25), rr = R.range(110, 240), x = BOW.x + Math.cos(a) * rr * 1.2, z = BOW.z + Math.sin(a) * rr;
    blocks.push([x, z, R.range(5, 22) * (1 - Math.abs(a) * 0.35), R.range(-0.6, 0.6), R() * 6.3, R.range(-0.6, 0.6), R.range(0.5, 1.1), 0.25, R() * 0.7]);
  }
  for (let i = 0; i < 55; i++) {
    const a = R.range(-1.1, 1.1), rr = R.range(80, 200), x = BOW.x + Math.cos(a) * rr * 1.2, z = BOW.z + Math.sin(a) * rr;
    shards.push([x, z, R.range(3, 6), R.range(-0.5, 0.5) + Math.cos(a) * 0.4, R() * 6.3, R.range(-0.5, 0.5) + Math.sin(a) * 0.4, R.range(4, 8), 0.3, 0.3 + R() * 0.6]);
  }
  // 犁沟两侧的冰堤
  for (let i = 0; i < 360; i++) {
    const x = R.range(-1850, 250), prog = (x + 1900) / 2230, half = 55 + 45 * prog, side = R() < 0.5 ? -1 : 1, z = furrowZ(x) + side * (half + R.range(5, 85));
    blocks.push([x, z, R.range(3, 10) * (0.6 + prog * 0.8), R.range(-0.5, 0.5), R() * 6.3, side * R.range(0.1, 0.7), R.range(0.35, 0.8), 0.3, R() * 0.5]);
  }
  // 大裂缝边缘的冰塔
  for (const rf of RIFTS) for (let i = 0; i < 26; i++) {
    const k = R() * (rf.pts.length - 1), j = Math.floor(k), f = k - j, a = rf.pts[j], b = rf.pts[j + 1];
    const tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz), side = R() < 0.5 ? -1 : 1, off = rf.w + R.range(2, 14);
    const x = lerp(a[0], b[0], f) - tz / L * off * side, z = lerp(a[1], b[1], f) + tx / L * off * side;
    (R() < 0.3 ? shards : blocks).push([x, z, R.range(2.5, 7), R.range(-0.3, 0.3), R() * 6.3, R.range(-0.3, 0.3), R() < 0.3 ? R.range(2.5, 5) : R.range(0.5, 1.2), 0.2, 0.5 + R() * 0.5]);
  }
  make(lump(3, 0, [1.2, 0.8, 1]), blocks);
  make(lump(9, 0, [0.5, 1, 0.35]), shards);
  return { mats: [mat0], update(env) { mat0.emissiveIntensity = lerp(0.05, 0.35, env.night) * U.uGlow.value; } };
}

/* ---------- 极光：几道竖着的光帘，在夜空里慢慢流动 ---------- */
export function buildAurora(root) {
  const R = rng(808), U = { uTime: { value: 0 }, uOn: { value: 0 } };
  const mat0 = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: U,
    vertexShader: `attribute vec2 aUv; attribute float aLen; varying vec2 vUv; varying float vLen; void main(){ vUv = aUv; vLen = aLen; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uOn; varying vec2 vUv; varying float vLen;
      float h(float p){ return fract(sin(p * 127.1) * 43758.5453); }
      float n(float p){ float i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(h(i), h(i + 1.), f); }
      void main(){
        float s = vUv.x * vLen, v = vUv.y, t = uTime;
        float fold = n(s * .004 - t * .05) * 2.;
        v = clamp(v - .1 * n(s * .012 + t * .12), 0., 1.);                       // 下沿参差
        float rays = .55 * n(s * .03 + fold * 4. + t * .2) + .5 * pow(n(s * .075 - t * .3 + fold), 2.);
        float wave = smoothstep(.2, .85, n(s * .0018 + t * .05 + fold));
        float base = smoothstep(0., .1, v) * exp(-v * 2.3) + .06 * (1. - v);
        float ends = smoothstep(0., .12, vUv.x) * smoothstep(1., .88, vUv.x);
        vec3 col = mix(vec3(.12, 1., .45), vec3(.6, .25, 1.), smoothstep(.35, .95, v));
        col = mix(col, vec3(1., .35, .55), (1. - smoothstep(0., .06, v)) * .5);
        float a = rays * wave * base * ends * uOn * .85;
        gl_FragColor = vec4(col * a, 1.);
      }`
  });
  for (let k = 0; k < 4; k++) {
    const N = 260, len = R.range(4200, 6200), A = R.range(-0.5, 0.5) + 0.15, y0 = R.range(520, 800), H = R.range(600, 950), amp = R.range(250, 520), fr = R.range(1.5, 3), ph = R() * 6;
    const cx = R.range(-500, 300), cz = -1700 + k * 380 + R.range(-120, 120);
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, along = (s - 0.5) * len, side = amp * Math.sin(s * fr * 6.283 + ph) + 90 * Math.sin(s * 23 + ph);
      const x = cx + Math.cos(A) * along - Math.sin(A) * side, z = cz + Math.sin(A) * along + Math.cos(A) * side, sag = 120 * Math.sin(s * 3.14);
      pos.push(x, y0 - sag, z, x, y0 - sag + H, z); uv.push(s, 0, s, 1);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aLen', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(len), 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat0); m.frustumCulled = false; m.renderOrder = 2; m.userData.noPick = true; root.add(m);
  }
  return {
    level: () => U.uOn.value,
    update(t, env) {
      U.uTime.value = t;
      U.uOn.value = smooth(0.35, 0.9, env.night) * (1 - env.wx.cloud * 0.75) * (1 - env.wx.fog * 0.8) * (1 - env.wx.rain);
    }
  };
}

/* ---------- 粒子：贴地吹过的雪、冰裂缝里升起的蓝光点 ---------- */
export function buildParticles(root, U) {
  const R = rng(909), tex = dotTexture(), out = [];
  // 飘雪
  {
    const N = 4200, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = R.range(-1500, 700), z = furrowZ(x) + R.range(-600, 600); pos.set([x, ground(x, z) + R() * R() * 22, z], i * 3); seed[i] = R() * 100; }
    out.push(points(pos, seed, tex, U, `p.x += mod(uTime * (6. + uWind * 30.) + seed * 37., 80.) - 40.; p.y += sin(uTime * 1.3 + seed) * 1.2 + 1.5 * fract(seed * 3.1); p.z += sin(uTime * .7 + seed * 2.) * 4.;`,
      `vA = .55 * smoothstep(700., 40., -mv.z) * (.4 + uWind); gl_PointSize = min(uPx * 2.2 * (160. / -mv.z), uPx * 5.);`, `vec3(.95, .97, 1.)`));
  }
  // 裂缝蓝光
  {
    const N = 900, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const rf = R.pick(RIFTS), k = R() * (rf.pts.length - 1), j = Math.floor(k), f = k - j, a = rf.pts[j], b = rf.pts[j + 1];
      const x = lerp(a[0], b[0], f) + R.range(-5, 5), z = lerp(a[1], b[1], f) + R.range(-5, 5);
      pos.set([x, ground(x, z), z], i * 3); seed[i] = R() * 100;
    }
    out.push(points(pos, seed, tex, U, `float k = fract(uTime * .045 + seed * .137); p.y += k * 90.; p.x += sin(uTime * .5 + seed) * 6. * k; p.z += cos(uTime * .4 + seed) * 6. * k;`,
      `vA = uGlow * sin(k * 3.1416) * smoothstep(1400., 60., -mv.z); gl_PointSize = min(uPx * 3.5 * (220. / -mv.z), uPx * 8.);`, `vec3(.35, .85, 1.6)`));
  }
  // 舰尾断口冒出的蒸汽：反应堆还热着
  {
    const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N), x0 = -885, z0 = furrowZ(-885), y0 = ground(x0, z0) + 30;
    for (let i = 0; i < N; i++) { pos.set([x0 + R.range(-12, 12), y0, z0 + R.range(-18, 18)], i * 3); seed[i] = R() * 100; }
    const p = points(pos, seed, tex, U, `float k = fract(uTime * .03 + seed * .173); p.y += k * 260.; p.x += (k * k * 160. + sin(seed) * 25. * k) * (.5 + uWind); p.z += cos(seed * 1.7) * 40. * k;`,
      `vA = .16 * sin(k * 3.1416) * smoothstep(3000., 50., -mv.z); gl_PointSize = min(uPx * (12. + 70. * k) * (300. / -mv.z), uPx * 140.);`, `vec3(.92, .95, 1.)`);
    p.material.blending = THREE.NormalBlending;
    p.material.fragmentShader = `uniform sampler2D uTex; uniform float uGlow; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(.9, .93, .97) * clamp(1.25 - .8 * uGlow, .16, 1.), t.a * vA); }`;   // 夜里蒸汽是暗的
    out.push(p);
  }
  for (const p of out) root.add(p);
  return out;
}
function points(pos, seed, tex, U, move, look, col) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uWind: U.uWind, uGlow: U.uGlow, uPx: U.uPx, uTex: { value: tex } },
    vertexShader: `attribute float seed; uniform float uTime, uWind, uGlow, uPx; varying float vA;
      void main(){ vec3 p = position; ${move}
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix * mv; ${look} }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(${col} * t.a * vA, 1.); }`
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.noPick = true; return p;
}

/* ---------- 废弃科考站：干谷边缘的冰面上，几栋高脚小屋和一根无线电塔 ---------- */
export const CAMP = { x: 180, z: 0 };
CAMP.z = valleyZ(180) - 330;
export function buildCamp(root) {
  const R = rng(1001), K = new Kit(), W = new Kit(), B = new Kit(), lights = [];
  const cols = [0xc2462c, 0xd99a2b, 0xc2462c, 0x9aa3a8, 0x2f6f7a].map(h => new THREE.Color(h));
  const huts = [[0, 0, 0.2, 22, 8, 10], [34, 18, 0.25, 16, 7, 9], [-30, 26, 1.75, 18, 7, 9], [12, 44, 0.1, 26, 9, 12], [-8, -28, 0.4, 10, 6, 8]];
  huts.forEach(([dx, dz, ry, w, h, d], i) => {
    const x = CAMP.x + dx, z = CAMP.z + dz, y = ground(x, z);
    K.set(mat(x, y, z, ry));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.geo(new THREE.CylinderGeometry(0.25, 0.25, 3, 5).translate(0, 1.5, 0), mat(sx * (w / 2 - 1), -1, sz * (d / 2 - 1)), new THREE.Color(0x3a3a3a));
    K.box(w, h, d, mat(0, 2, 0), cols[i]);
    K.geo(new THREE.CylinderGeometry(d / 2, d / 2, w, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), mat(0, 2 + h, 0), cols[i].clone().multiplyScalar(0.85));
    W.set(K.M);
    const lit = i !== 2;
    for (let k = -1; k <= 1; k += 2) for (const s of [-1, 1]) {
      const wx = k * w * 0.25, wy = 2 + h * 0.55;
      W.quad(V(wx - 1, wy - 0.7, s * (d / 2 + 0.05)), V(wx + 1, wy - 0.7, s * (d / 2 + 0.05)), V(wx + 1, wy + 0.7, s * (d / 2 + 0.05)), V(wx - 1, wy + 0.7, s * (d / 2 + 0.05)), lit ? new THREE.Color(2.4, 1.5, 0.7) : new THREE.Color(0.05, 0.05, 0.05));
    }
    if (lit) lights.push([x, y + 8, z, 1]);
  });
  // 无线电塔与信标
  const mx = CAMP.x + 50, mz = CAMP.z - 20, my = ground(mx, mz);
  K.set(new THREE.Matrix4());
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2;
    K.geo(new THREE.CylinderGeometry(0.3, 0.6, 44, 4).translate(0, 22, 0), mat(mx + Math.cos(a) * 1.5, my, mz + Math.sin(a) * 1.5, 0, Math.sin(a) * 0.035, -Math.cos(a) * 0.035), new THREE.Color(0xb7412b));
  }
  for (let y = 4; y < 44; y += 4) K.geo(new THREE.TorusGeometry(1.4, 0.15, 3, 6).rotateX(Math.PI / 2), mat(mx, my + y, mz), new THREE.Color(0xd9d9d9));
  B.set(new THREE.Matrix4()); B.geo(new THREE.SphereGeometry(1.1, 8, 6), mat(mx, my + 45, mz), new THREE.Color(0xffffff));
  lights.push([mx, my + 45, mz, 0.5]);
  // 油桶和雪地车
  for (let i = 0; i < 18; i++) { const x = CAMP.x + R.range(-40, 40), z = CAMP.z + R.range(-40, 50); K.geo(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8).translate(0, 0.9, 0), mat(x, ground(x, z) - 0.2, z, 0, R() < 0.2 ? 1.5 : 0), R() < 0.5 ? new THREE.Color(0x2f5d8a) : new THREE.Color(0xa83a22)); }
  {
    const x = CAMP.x - 20, z = CAMP.z - 8, y = ground(x, z);
    K.set(mat(x, y, z, 0.8)); K.box(7, 2.2, 3.2, mat(0, 0.7, 0), new THREE.Color(0xd39a2a)); K.box(3, 1.6, 3, mat(-1.5, 2.9, 0), new THREE.Color(0xd39a2a));
    for (const s of [-1, 1]) K.box(7.8, 0.9, 0.9, mat(0, 0, s * 1.5), new THREE.Color(0x222222));
  }
  const mWin = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), mBea = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.3) });
  const meshes = [K.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }), { snow: 0.9 }), W.build(mWin, { cast: false }), B.build(mBea, { cast: false })];
  for (const m of meshes) root.add(m);
  return {
    lights,
    update(t, env) { mWin.color.setScalar(0.25 + 0.75 * env.lamp); const b = ((t + 1.1) % 3) < 0.3 ? 1 : 0.03; mBea.color.setRGB(3 * b, 0.4 * b, 0.3 * b); }
  };
}
