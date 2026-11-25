// 沉没森林湿地的地形：被水淹没的林床、冒出水面的泥丘与根岛、神庙所在的石台、外圈慢慢抬起的林丘；
// 还有模块自己的一层静水（茶色的黑水，比星球海面低调得多，倒映天光，水面上漂着浮萍）。
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, rng } from '../../util.js';

/** fbm 的实测中位数约 0.25、标准差约 0.07，这里拉回到 0..1、中位数 0.5 */
export const nf = (x, z, o = 4) => clamp((fbm(x, z, o) - 0.25) / 0.3 + 0.5, 0, 1);

/** 水面高度（模块自带的静水层；星球海面在 0，这层盖在它上面） */
export const WATER = 0.3;

/** 主河道：从东南蜿蜒到西北，比周围深，水面开阔，没有树 */
export const channelZ = x => -120 + 210 * Math.sin(x / 610 + 0.8) + 70 * Math.sin(x / 233);
/** 神庙岛中心 */
export const TEMPLE = { x: 40, z: -330, r: 70, top: 3.4 };

export function ground(x, z) {
  const r = Math.hypot(x, z);
  const n1 = nf(x * 0.0021 + 4, z * 0.0021, 4), n2 = nf(x * 0.0085 - 3, z * 0.0085 + 7, 3);
  let y = -2.4 + 1.8 * (n1 - 0.5);
  // 泥丘与根岛：一块块露出水面，边缘是浅滩
  const isl = smooth(0.7, 0.84, n2 * 0.65 + n1 * 0.5);
  y += isl * (2.6 + 1.6 * nf(x * 0.03, z * 0.03, 2));
  // 主河道
  const dc = Math.abs(z - channelZ(x)) / (46 + 26 * n1);
  y = lerp(y, -6.5, smooth(1.4, 0.4, dc));
  // 神庙岛：平顶的夯土台，边缘被水啃得参差
  const dt = Math.hypot(x - TEMPLE.x, z - TEMPLE.z) + (nf(x * 0.05, z * 0.05, 2) - 0.5) * 24;
  y = lerp(y, TEMPLE.top + 0.3 * nf(x * 0.2, z * 0.2, 2), smooth(TEMPLE.r + 34, TEMPLE.r, dt));
  // 外圈：湿地的边，抬成长满林子的低丘，接到相邻的地块
  // （外面通常是海，抬得太高会在交界处拉出一道崖，所以只抬几米，边缘再用噪声揉乱）
  const rim = smooth(1500, 1900, r + (nf(x * 0.0012 + 9, z * 0.0012 - 2, 4) - 0.5) * 520);
  y += rim * (4.5 + 9 * nf(x * 0.004 + 1, z * 0.004 + 6, 3));
  return y;
}

const P = {
  bed: new THREE.Color(0x2c2a20), mud: new THREE.Color(0x4a4130), mud2: new THREE.Color(0x5e5238), moss: new THREE.Color(0x4f6a2e),
  grass: new THREE.Color(0x6f8a3c), fern: new THREE.Color(0x3d5a2a), forest: new THREE.Color(0x34502a), stone: new THREE.Color(0x8b8270), rock: new THREE.Color(0x77705f)
};
export function groundColor(x, z, y, sl, c) {
  const n = nf(x * 0.03, z * 0.03, 3), n2 = nf(x * 0.13 + 9, z * 0.13, 2);
  if (y < WATER - 0.2) c.copy(P.bed).lerp(P.mud, clamp((y + 3) / 3, 0, 1) * 0.6);
  else if (y < WATER + 0.6) c.copy(P.mud).lerp(P.mud2, n2);                          // 泥滩，有水渍
  else {
    c.copy(P.moss).lerp(P.grass, smooth(0.35, 0.75, n)).lerp(P.fern, smooth(0.55, 0.8, n2) * 0.6);
    c.lerp(P.forest, smooth(6, 20, y));
    if (sl > 0.8) c.lerp(P.rock, 0.6);
    const dt = Math.hypot(x - TEMPLE.x, z - TEMPLE.z);
    if (dt < TEMPLE.r + 6) c.lerp(P.stone, smooth(TEMPLE.r + 6, TEMPLE.r - 10, dt) * 0.45 * (0.5 + n2));
  }
  return c.multiplyScalar(0.86 + n2 * 0.26);
}

export const CORE = { x0: -1300, x1: 1300, z0: -1300, z1: 1300 };

/** 核心区的精细地形网格（约 8.7 米一格） */
export function makeTerrain() {
  const S = 2600, N = 300;
  const geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = ground(x, z); p.setY(i, y);
    const e = 3, sl = Math.hypot(ground(x + e, z) - ground(x - e, z), ground(x, z + e) - ground(x, z - e)) / (2 * e);
    groundColor(x, z, y, sl, c); col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true; return m;
}

/* ---------- 静水 ---------- */
function rippleNormal() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), R = rng(9);
  // 若干个可平铺的正弦波叠加 → 高度场 → 法线
  const W = Array.from({ length: 9 }, () => ({ kx: Math.round(R.range(-6, 6)), kz: Math.round(R.range(-6, 6)) || 1, a: R.range(0.3, 1), ph: R() * 6.28 }));
  const h = (u, v) => W.reduce((s, w) => s + w.a * Math.sin((w.kx * u + w.kz * v) * Math.PI * 2 + w.ph), 0);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S, e = 1 / S, dx = (h(u + e, v) - h(u - e, v)) * 0.6, dz = (h(u, v + e) - h(u, v - e)) * 0.6;
    const l = Math.hypot(dx, dz, 1), k = (j * S + i) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dz / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(260, 260); return t;
}

/** 一整片圆形静水，半径 2 公里，盖住整个湿地。浮萍的多少写在 aWeed 里：浮萍处更粗糙、更绿。 */
export function makeWater() {
  const g = new THREE.RingGeometry(0.5, 2000, 260, 90); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, weed = new Float32Array(p.count), loc = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = ground(x, z);
    const dc = Math.abs(z - channelZ(x));
    // 浮萍的「可能性」：贴着岸长，河道里被水流冲开；具体一块块的形状在片元着色器里按噪声算（顶点太稀，插值会出块）
    weed[i] = clamp(0.35 + smooth(-1.4, 0.2, y) * 0.65, 0, 1) * smooth(40, 110, dc);
    loc[i * 2] = x; loc[i * 2 + 1] = z;
  }
  g.setAttribute('aWeed', new THREE.BufferAttribute(weed, 1));
  g.setAttribute('aLoc', new THREE.BufferAttribute(loc, 2));
  const nm = rippleNormal();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a110b, roughness: 0.05, metalness: 0.0, normalMap: nm, normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.75 });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWeed; attribute vec2 aLoc; varying float vWeed; varying vec2 vLoc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeed = aWeed; vLoc = aLoc;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vWeedA; varying vec2 vLoc; varying float vWeed;
      float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
      float weedAt(vec2 p){ float n = wn(p * .03) * .55 + wn(p * .09) * .3 + wn(p * .4) * .15; return smoothstep(.5, .62, n * (.55 + vWeed * .6)); }`)
      .replace('varying float vWeedA; ', '')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat wd = weedAt(vLoc);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.08, 0.02) * (.8 + .4 * wn(vLoc * 1.3)), wd);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, wd);');
  };
  const m = new THREE.Mesh(g, mat); m.position.y = 0; g.translate(0, WATER, 0);
  m.receiveShadow = false; m.userData.noPick = true; // 大片近乎水平的水面收阴影会起大块的阴影痤疮
  return m;
}
