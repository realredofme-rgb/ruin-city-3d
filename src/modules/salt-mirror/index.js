// 模块 7：盐湖镜原 —— 一大片积着薄水的盐湖，把天空整个倒映下来。
// 参考玻利维亚乌尤尼盐沼：雨季的镜面、六边形的盐壳裂纹、湖心长满仙人掌的岛、一排排晒盐的小丘、远处的彩色火山和废弃列车。
// 奇幻的部分：一条横穿湖面的巨石列柱大道、半没在水里的巨环、环顶悬停的碎石，以及一组仍然望着同一片天的射电天线。
//
// 平面局部坐标：+z 指北，+x 指西（和城市一致）；湖面海拔 L。
import * as THREE from 'three';
import { fbm, smooth, clamp, lerp } from '../../util.js';
import { mirrorGeometry } from './kit.js';
import { makeLake } from './lake.js';
import { makeKits, tintStone, buildColonnade, buildRing, buildArray, buildCacti, buildPiles, buildYard, along, ISLE, RING_T } from './structures.js';

const L = 12;                                       // 湖面海拔
const CORE = { x0: -1500, x1: 1500, z0: -1500, z1: 1500 };
const VOLC = { x: -300, z: 1950 };                  // 北岸的彩色火山
const C = c => new THREE.Color(c);
const nz = v => (v - 0.25) / 0.12;                  // util 的 fbm 中位数约 0.25，这里拉回 [-1, 1] 左右

/** 北面（火山方向）水多，岸也更远 */
const lobe = (x, z) => smooth(0.3, 1, Math.cos(Math.atan2(z, x) - 1.72));

function isle(x, z) {
  const d = Math.hypot(x - ISLE.x, z - ISLE.z), n = fbm(x * 0.02 + 3, z * 0.02 - 1, 3);
  const k = smooth(ISLE.r, ISLE.r * 0.25, d + nz(n) * 22);
  if (k <= 0) return 0;
  const rock = fbm(x * 0.035, z * 0.035, 3), lump = fbm(x * 0.12 + 5, z * 0.12, 2);
  return Math.pow(k, 0.6) * (30 + 9 * nz(rock)) + smooth(0, 0.4, k) * 7 * clamp(nz(lump) * 0.5 + 0.5, 0, 1.2);
}

function height(x, z) {
  const r = Math.hypot(x, z), lb = lobe(x, z);
  const rr = r + nz(fbm(x * 0.0011 + 3, z * 0.0011, 3)) * 170;
  const shore = 1290 + 170 * lb;
  const rise = smooth(shore, shore + 520, rr);
  const n = fbm(x * 0.0022 + 1, z * 0.0022 - 4, 4), ridge = 1 - Math.abs(fbm(x * 0.004 + 9, z * 0.004, 3) * 4 - 1);
  let h = rise * (30 + 120 * clamp(nz(n) * 0.5 + 0.6, 0, 1.4) + 60 * clamp(ridge, 0, 1));
  const dv = Math.hypot(x - VOLC.x, z - VOLC.z);
  const volc = 460 * Math.exp(-Math.pow(dv / 760, 1.7)) - 70 * Math.exp(-((dv / 110) ** 2));
  h = Math.max(h, volc * smooth(shore - 120, shore + 260, rr));
  return L + h + isle(x, z);
}

const SALT = C(0xeeece6), BANDS = [C(0xb4875a), C(0xa05a3c), C(0xc9a457), C(0x86706c), C(0xb79a7a)], ROCK = C(0x6a5e50), CORAL = C(0x9e917f), SNOW = C(0xf0efea);
function color(x, z, y, sl, out) {
  const n = fbm(x * 0.01, z * 0.01, 3);
  if (y < L + 0.8) return out.copy(SALT).multiplyScalar(0.94 + 0.06 * nz(n) * 0.5);
  const di = Math.hypot(x - ISLE.x, z - ISLE.z);
  if (di < ISLE.r + 30) { // 湖心岛：珊瑚化石一样的灰白岩块
    out.copy(ROCK).lerp(CORAL, smooth(0.2, 0.32, fbm(x * 0.09, z * 0.09, 2))).lerp(C(0x8c8a62), smooth(0.25, 0.4, fbm(x * 0.05 + 4, z * 0.05, 2)) * 0.35 * (1 - smooth(0.5, 1, sl)));
    return out.lerp(SALT, smooth(L + 3, L + 0.8, y));
  }
  // 岸边：火山带出来的赭红、硫黄和紫灰色岩层
  const t = (y * 0.022 + nz(n) * 0.6 + 10) % BANDS.length, i = Math.floor(t), f = smooth(0.7, 1, t - i);
  out.copy(BANDS[i]).lerp(BANDS[(i + 1) % BANDS.length], f).lerp(C(0xa08a74), 0.45 + 0.25 * smooth(0.2, 0.3, fbm(x * 0.004 + 2, z * 0.004, 2)));
  out.lerp(ROCK, smooth(0.7, 1.3, sl) * 0.55);
  out.lerp(SALT, smooth(L + 7, L + 1, y + nz(n) * 3) * 0.9);
  return out.lerp(SNOW, smooth(330, 400, y + nz(n) * 30));
}

/** 核心区的精细地形；湖底压低 1.5 米，交给湖面去画 */
function makeTerrain() {
  const S = CORE.x1 - CORE.x0, N = 400, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), e = 110;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = height(x, z);
    const k = smooth(CORE.x0, CORE.x0 + e, x) * smooth(CORE.x1, CORE.x1 - e, x) * smooth(CORE.z0, CORE.z0 + e, z) * smooth(CORE.z1, CORE.z1 - e, z);
    p.setY(i, y - 1.5 * k);
    const d = 2, sl = Math.hypot(height(x + d, z) - height(x - d, z), height(x, z + d) - height(x, z - d)) / (2 * d);
    color(x, z, y, sl, c); col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 倒影用的外圈地形（核心区以外，星球网格画实物，这里只给倒影补上远山） */
function makeFarMirrorTerrain() {
  const S = 5000, N = 200, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = height(x, z); p.setY(i, y);
    const d = 12, sl = Math.hypot(height(x + d, z) - height(x - d, z), height(x, z + d) - height(x, z - d)) / (2 * d);
    color(x, z, y, sl, c); col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // 只留核心区外面的三角形
  const g = geo.toNonIndexed(), pos = g.attributes.position, keep = [];
  for (let i = 0; i < pos.count; i += 3) {
    let inside = true; for (let k = 0; k < 3; k++) if (Math.max(Math.abs(pos.getX(i + k)), Math.abs(pos.getZ(i + k))) > CORE.x1 - 20) inside = false;
    if (!inside) keep.push(i);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const s = a.itemSize, arr = new Float32Array(keep.length * 3 * s); let w = 0;
    for (const i of keep) for (let k = 0; k < 3 * s; k++) arr[w++] = a.array[i * s + k];
    out.setAttribute(name, new THREE.BufferAttribute(arr, s));
  }
  return out;
}

/** 光纹：一道「回声」沿着大道从东往西慢慢扫过去，夜里更亮 */
function glowMaterial(U, blink) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float aPh;\nvarying float vPh;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPh = aPh;');
    sh.fragmentShader = 'uniform float uT, uK;\nvarying float vPh;\n' + sh.fragmentShader.replace('#include <color_fragment>', blink
      ? '#include <color_fragment>\n{ float b = fract(uT * 0.45 + vPh); diffuseColor.rgb *= (0.12 + 1.4 * smoothstep(0.0, 0.05, b) * smoothstep(0.2, 0.12, b)) * uK; }'
      : '#include <color_fragment>\n{ float w = fract(uT * 0.035 - vPh) - 0.5; diffuseColor.rgb *= uK * (0.32 + 1.7 * exp(-w * w * 90.0)); }');
  };
  m.customProgramCacheKey = () => blink ? 'salt-beacon' : 'salt-glow';
  return m;
}

export default {
  id: 'salt-mirror', no: 7, name: '盐湖镜原', sub: '一层薄水把天空整个倒映下来', status: 'built', want: [12, -72],
  note: '雨季的盐湖上积着几厘米的水，天和地连成一片。一条巨石列柱大道横穿湖面，尽头是半没在水里的巨环；东北角的射电天线阵仍然齐齐望着同一片天，湖心岛上长满了仙人掌。',
  core: CORE,
  route: { x: 0, z: 0, alt: 320 },
  home: { cam: [-700, 26, -330], target: [200, 60, 40] },
  height,
  color,
  build({ root }) {
    const scene = root.parent;
    const U = { uT: { value: 0 }, uK: { value: 1 } };
    const M = {
      terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      stone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.25, side: THREE.DoubleSide }),
      rust: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.35 }),
      glow: glowMaterial(U, false), beacon: glowMaterial(U, true)
    };
    const add = (geo, mat, { mirror = true, shadow = true } = {}) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; root.add(m);
      if (mirror) {
        const mg = mirrorGeometry(geo, L);
        if (mg.attributes.position.count) { const mm = new THREE.Mesh(mg, mat); mm.renderOrder = -9; mm.userData.noPick = true; root.add(mm); }
      }
      return m;
    };

    // 地形：实物 + 倒影（核心区内用精细网格翻转，外圈补一张粗网格只做倒影）
    const terrain = makeTerrain();
    add(terrain, M.terrain, { shadow: false });
    const far = mirrorGeometry(makeFarMirrorTerrain(), L);
    const farM = new THREE.Mesh(far, M.terrain); farM.renderOrder = -9; root.add(farM);

    // 湖上的东西
    const K = makeKits();
    const tops = buildColonnade(K, L, height);
    const ring = buildRing(K, L);
    const beacons = buildArray(K, L, height);
    buildCacti(K, L, height);
    buildPiles(K, L);
    buildYard(K, L);
    const stone = K.stone.geometry(); tintStone(stone, L);
    const rust = K.rust.geometry(); tintStone(rust, L, 0.6);
    const metal = K.metal.geometry(); tintStone(metal, L, 0.25);
    add(stone, M.stone); add(metal, M.metal); add(rust, M.rust);
    add(K.glow.geometry(), M.glow, { shadow: false }); add(K.beacon.geometry(), M.beacon, { shadow: false });

    // 湖面
    const lake = makeLake({ L, radius: 1500, scene, wet: () => wet });
    for (const m of lake.meshes) root.add(m);
    let wet = 0;

    const lights = [...tops.filter((_, i) => i % 3 === 0).map(p => [p.x, p.y, p.z, 0.35]), ...beacons.map(b => [b.x, b.y, b.z, 0.6]), [ring.center.x, L + 128, ring.center.z, 0.8]];
    return {
      lights,
      update(dt, t, env) {
        if (!env) return;
        U.uT.value = t;
        U.uK.value = lerp(0.6, 2.1, env.night) * (1 - (env.wx?.fog || 0) * 0.25);
        wet = env.wet;
        lake.update(t, env);
      }
    };
  }
};

export { L as LAKE_LEVEL, along, RING_T };
