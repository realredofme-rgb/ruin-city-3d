// 云海、瀑布和水雾。
// 云海是几层叠在一起的半透明圆盘，用标准材质（有光照、会被星球的雾吃掉），在片元里用噪声算出云团的形状并慢慢流动。
import * as THREE from 'three';
import { CLOUD_Y } from './terrain.js';
import { dotTexture, lerp } from '../../util.js';

const NOISE = `
float ih(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float inn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(ih(i),ih(i+vec2(1,0)),f.x),mix(ih(i+vec2(0,1)),ih(i+vec2(1,1)),f.x),f.y); }
float ifb(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*inn(p); p=p*2.03+vec2(1.7,-3.1); a*=.5; } return s; }`;

/** 一层云：y 高度，scale 云团尺度（米），cover 覆盖率 0..1 */
function cloudLayer(y, scale, cover, seed, U) {
  const g = new THREE.RingGeometry(1, 2750, 160, 44); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, xz = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { xz[i * 2] = p.getX(i); xz[i * 2 + 1] = p.getZ(i); p.setY(i, y); }
  g.setAttribute('aXZ', new THREE.BufferAttribute(xz, 2)); g.deleteAttribute('uv');
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, depthWrite: false, emissive: 0x9aa6b4, emissiveIntensity: 0.18, side: THREE.DoubleSide });
  m.userData.layer = { scale, cover, seed };
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uCover = U.uCover; sh.uniforms.uWarm = U.uWarm;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aXZ; varying vec2 vXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = aXZ;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vXZ; uniform float uTime, uCover; uniform vec3 uWarm;${NOISE}`)
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        vec2 q = vXZ / ${scale.toFixed(1)} + vec2(${seed.toFixed(2)}, ${(seed * 1.7).toFixed(2)});
        vec2 w = vec2(ifb(q * .6 + uTime * .004), ifb(q * .6 - uTime * .003 + 5.2));
        float d = ifb(q + w * 1.6 + vec2(uTime * .006, uTime * .002));
        float r = length(vXZ);
        float cov = ${cover.toFixed(2)} + uCover;
        float a = smoothstep(.62 - cov * .5, .78 - cov * .45, d + .08);
        a *= smoothstep(2700., 1900., r + d * 500.);
        diffuseColor.a *= a * .92;
        diffuseColor.rgb *= mix(vec3(.6, .65, .75), vec3(1.05), smoothstep(.42, .8, d)) * uWarm;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; mesh.receiveShadow = true; mesh.userData.noPick = true;
  return mesh;
}

/** 软云团与水雾：大号的柔光精灵，在顶点着色器里漂动 */
function wisps(points, U) {
  const n = points.length, pos = new Float32Array(n * 3), aS = new Float32Array(n), aP = new Float32Array(n), aK = new Float32Array(n);
  points.forEach(([x, y, z, s, k], i) => { pos.set([x, y, z], i * 3); aS[i] = s; aP[i] = Math.random() * 100; aK[i] = k || 0; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 1)); g.setAttribute('aP', new THREE.BufferAttribute(aP, 1)); g.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: U.uTime, uCol: U.uWisp, uPx: U.uPx, uMap: { value: dotTexture() } },
    vertexShader: `attribute float aS, aP, aK; uniform float uTime, uPx; varying float vA, vK;
      void main(){
        vec3 p = position;
        float t = uTime * mix(.05, .5, aK) + aP;
        p.x += sin(t * .7) * aS * .12; p.z += cos(t * .5) * aS * .12; p.y += mix(sin(t * .4) * 4., fract(t * .15) * 60., aK);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        vA = mix(1., 1. - fract(t * .15), aK) * smoothstep(20., 300., -mv.z); vK = aK;
        gl_PointSize = min(uPx * aS * 900. / -mv.z, 900.);
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; varying float vA, vK;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uCol * mix(1., 1.1, vK), a * vA * mix(.32, .45, vK)); }`
  });
  const p = new THREE.Points(g, m); p.renderOrder = 3; p.frustumCulled = false; p.userData.noPick = true;
  return p;
}

/** 瀑布材质：流动的白色条纹，越往下越散 */
export function fallMaterial(U) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uBright: U.uFallBright },
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uTime, uBright; varying vec2 vU;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float v = vU.y;  // 0 = 顶，1 = 底
        float s = n(vec2(vU.x * 16., v * 26. - uTime * 2.6)) * .55 + n(vec2(vU.x * 38., v * 70. - uTime * 4.4)) * .45;
        float edge = smoothstep(0., .22, vU.x) * smoothstep(1., .78, vU.x);
        float fade = smoothstep(1., .62, v) * smoothstep(0., .02, v);
        float a = (.3 + .65 * s) * edge * fade * mix(1., .55, v);
        vec3 c = mix(vec3(.86, .93, .97), vec3(1.), s) * uBright;
        gl_FragColor = vec4(c, a);
      }`
  });
}

/** 瀑布带：从 (0,0,0) 往 +x 方向冲出去，再落下 H 米；宽 w，越往下越宽 */
export function fallGeo(w, H) {
  const rows = 28, cols = 6, pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, drop = v * H, out = Math.min(Math.sqrt(drop * 6), 26) + drop * 0.02;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, wide = w * (1 + 1.6 * v), bow = Math.sin(u * Math.PI) * w * 0.25;
      pos.push(out + bow, -drop, (u - 0.5) * wide); uv.push(u, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function makeSkySea(root, mistAt, R) {
  const U = { uTime: { value: 0 }, uCover: { value: 0 }, uWarm: { value: new THREE.Color(1, 1, 1) }, uWisp: { value: new THREE.Color(1, 1, 1) }, uPx: { value: 1 }, uFallBright: { value: 1 } };
  const layers = [cloudLayer(CLOUD_Y - 34, 520, 0.62, 1.3, U), cloudLayer(CLOUD_Y - 14, 380, 0.5, 7.7, U), cloudLayer(CLOUD_Y + 4, 300, 0.36, 3.1, U)];
  for (const l of layers) root.add(l);
  // 贴着云顶的软云团 + 瀑布落点的水雾
  const pts = [];
  for (let i = 0; i < 260; i++) { const a = R() * 6.28, r = Math.sqrt(R()) * 2300; pts.push([Math.cos(a) * r, CLOUD_Y + R.range(-10, 22), Math.sin(a) * r, R.range(90, 220), 0]); }
  for (const [x, y, z, w, kind = 1] of mistAt) {
    if (kind) for (let k = 0; k < 14; k++) pts.push([x + R.range(-1, 1) * w, y + R.range(-8, 14), z + R.range(-1, 1) * w, R.range(18, 45) * Math.sqrt(w / 10), 1]);
    else for (let k = 0; k < 3; k++) { const a = R() * 6.28; pts.push([x + Math.cos(a) * w, y + R.range(-6, 16), z + Math.sin(a) * w, R.range(40, 90), 0]); } // 石柱脚下缠着的云
  }
  const wp = wisps(pts, U); root.add(wp);
  return {
    U, layers, wisps: wp,
    update(t, env) {
      U.uTime.value = t;
      U.uCover.value = env.wx.fog * 0.35 + env.wx.rain * 0.25 + (env.wx.cloud - 0.32) * 0.2;
      // 黄昏和清晨，云海被染成暖色；夜里发蓝发暗
      const warm = THREE.MathUtils.smoothstep(0.32, 0.02, env.e) * (1 - env.night);
      U.uWarm.value.setRGB(1 + warm * 0.12, 1 - warm * 0.08, 1 - warm * 0.22);
      const day = 1 - env.night * 0.86;
      U.uWisp.value.setRGB((0.95 + warm * 0.15) * day, (0.96 - warm * 0.05) * day, (1 - warm * 0.2) * day + env.night * 0.08);
      U.uFallBright.value = 0.35 + 0.65 * (1 - env.night * 0.75);
      // 夜里云海被月光照成灰蓝色，不至于整片黑掉
      for (const l of layers) { l.material.emissive.setRGB(lerp(0.6, 0.34, env.night), lerp(0.65, 0.4, env.night), lerp(0.7, 0.58, env.night)); l.material.emissiveIntensity = 0.28 + env.night * 0.1; }
    }
  };
}
