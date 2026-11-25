// 外部 GLB 模型：加载、缓存，以及把程序化占位的 InstancedMesh 换成 GLB 的几何和材质。
// 模型放在 assets/models/<模块>/<名字>.glb（规范见 docs/model-list.md）：米、Y 朝上、+Z 是正面、原点在底面中心。
// 加载失败（离线、文件缺失）时什么也不做，场景保留程序化的占位模型。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 流畅档（?q=low 或手机屏）：GLB 植物只用 LOD1，距离也收短 */
export const LOW_Q = typeof location !== 'undefined' && (new URLSearchParams(location.search).get('q') === 'low' || matchMedia('(max-width: 760px)').matches);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

// 同名贴图只留一份：同一批的几个变体（和它们的 LOD1）各自打包了同一张贴图，读进来以后合成一张，省显存
const texShare = new Map();
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];
function shareTextures(mtl) {
  for (const k of TEX_KEYS) {
    const t = mtl[k]; if (!t || !t.name || !t.image) continue;
    const key = `${t.name}|${t.image.width}x${t.image.height}`, had = texShare.get(key);
    if (!had) texShare.set(key, t); else if (had !== t) { mtl[k] = had; t.dispose(); }
  }
}

/**
 * 镂空叶片（alphaTest）离远了会「掉叶子」：贴图缩小后 alpha 被平均掉，低于阈值就整片消失，树只剩枝干。
 * 按当前用到的 mip 级别把 alpha 放大一些，远处的树冠保持原来的疏密。
 */
function keepLeaves(mtl) {
  if (!(mtl.alphaTest > 0) || !mtl.map || mtl.userData.keepLeaves) return;
  mtl.userData.keepLeaves = true;
  const prev = mtl.onBeforeCompile;
  mtl.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mtl, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
      vec2 lfS = vec2(textureSize(map, 0)), lfX = dFdx(vMapUv * lfS), lfY = dFdy(vMapUv * lfS);
      diffuseColor.a *= 1. + max(0., .5 * log2(max(dot(lfX, lfX), dot(lfY, lfY)))) * .35;
      #include <alphatest_fragment>`);
  };
  const key = mtl.customProgramCacheKey.bind(mtl);
  mtl.customProgramCacheKey = () => key() + '|leaves';
}

/**
 * 读一个模型，返回 { geometry, material }。整个场景合成一块几何（节点变换已烘进去）。
 * 只有一个网格时 material 是单个材质；有几个网格（比如树的 Bark 和 Leaf）时，几何按网格分组，material 是数组。
 */
export function loadModel(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(`assets/models/${path}.glb`).then(gltf => {
    gltf.scene.updateMatrixWorld(true);
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) throw new Error(`${path}: 没有网格`);
    for (const m of meshes) { shareTextures(m.material); keepLeaves(m.material); }
    if (meshes.length === 1) {
      const m = meshes[0], geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
      geometry.computeBoundingSphere();
      return { geometry, material: m.material };
    }
    // 几块网格的顶点属性要一致才能合并：只留大家都有的
    const geos = meshes.map(m => m.geometry.clone().applyMatrix4(m.matrixWorld));
    const common = Object.keys(geos[0].attributes).filter(k => geos.every(g => g.attributes[k]));
    for (const g of geos) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
    const geometry = mergeGeometries(geos, true);
    if (!geometry) throw new Error(`${path}: 网格合并失败`);
    geometry.computeBoundingSphere();
    return { geometry, material: meshes.map(m => m.material) };
  }));
  return cache.get(path);
}

/**
 * 把一个 InstancedMesh 换成 GLB 模型（实例矩阵不动）。tint(i) 可选，返回每个实例的颜色（乘在贴图上）。
 * 返回 Promise<boolean>：换成功为 true，加载失败为 false（保留占位）。
 */
export function upgradeInstanced(im, path, tint) {
  return loadModel(path).then(({ geometry, material }) => {
    im.geometry = geometry; im.material = material;
    if (tint) { const c = new THREE.Color(); for (let i = 0; i < im.count; i++) im.setColorAt(i, tint(i, c)); im.instanceColor.needsUpdate = true; }
    im.boundingSphere = null; im.boundingBox = null;
    return true;
  }).catch(e => { console.warn('模型没加载上，继续用程序化的占位：', path, e.message || e); return false; });
}

/**
 * 一类实例化植物（或道具）的分级显示：近处用 GLB 的 LOD0，中距离用 LOD1，再远保留程序化的占位模型。
 *
 * parent      实例挂在哪（模块的 root，或浮岛这类会动的组）
 * items       [{ m: 平面矩阵（占位模型用）, c: 占位颜色, mg?: GLB 用的矩阵（缺省同 m）, g?: GLB 的染色（缺省白） }]
 * placeholder { geometry, material }：程序化占位，加载前和远处都用它
 * variants    GLB 路径列表，实例按序号轮流分给各个变体；每个变体还要有 <路径>_lod1.glb
 * near / mid  LOD0、LOD1 的最远距离（米）。near 为 0 时不用 LOD0；mid 不大于 near 时不用 LOD1（也不下载）
 * prep        可选，加工 GLB 的材质（比如加上风吹摇摆），返回新材质
 *
 * 实例网格在构建时就全部建好（数量先为 0），这样星球挂载时能接管它们的 setMatrixAt。
 * 返回 { update(camPos) }：camPos 是相机在 parent 坐标系里的位置，相机走动时重新分一次远近。
 */
export function floraLod(parent, items, placeholder, variants, { near = 60, mid = 260, prep, cast = true, flags = {} } = {}) {
  const n = items.length, white = new THREE.Color(1, 1, 1);
  const mk = (cap, count) => {
    const im = new THREE.InstancedMesh(placeholder.geometry, placeholder.material, Math.max(cap, 1));
    im.count = count; im.castShadow = cast; im.receiveShadow = true; Object.assign(im.userData, flags);
    im.setColorAt(0, white); parent.add(im); return im;
  };
  const base = mk(n, n);
  items.forEach((it, i) => { base.setMatrixAt(i, it.m); base.setColorAt(i, it.c); });
  base.instanceMatrix.needsUpdate = true; base.instanceColor.needsUpdate = true; base.computeBoundingSphere();
  const pos = items.map(it => new THREE.Vector3().setFromMatrixPosition(it.m));
  const V = variants.map((path, k) => {
    const cap = Math.ceil((n - k) / variants.length);
    return { path, l0: near > 0 ? mk(cap, 0) : null, l1: mid > near ? mk(cap, 0) : null, ready: false };
  });
  let dirty = false;
  for (const v of V) {
    Promise.all([v.l0 ? loadModel(v.path) : null, v.l1 ? loadModel(v.path + '_lod1') : null]).then(([a, b]) => {
      const fix = m => (Array.isArray(m) ? m.map(x => prep ? prep(x) : x) : (prep ? prep(m) : m));
      const mtl = fix((a || b).material); // LOD1 和 LOD0 共用一套材质
      if (v.l0) { v.l0.geometry = a.geometry; v.l0.material = mtl; }
      if (v.l1) { v.l1.geometry = b.geometry; v.l1.material = mtl; }
      v.ready = true; dirty = true;
    }).catch(e => console.warn('模型没加载上，继续用程序化的占位：', v.path, e.message || e));
  }
  const last = new THREE.Vector3(1e9, 0, 0);
  return {
    update(cam) {
      if (!dirty && cam.distanceToSquared(last) < 64) return; // 走了 8 米以上才重分
      dirty = false; last.copy(cam);
      const N2 = near * near, M2 = Math.max(mid, near) ** 2;
      let nb = 0; for (const v of V) v.a = v.b = 0;
      for (let i = 0; i < n; i++) {
        const v = V[i % V.length], d2 = pos[i].distanceToSquared(cam), it = items[i];
        if (v.ready && d2 < M2) {
          const im = v.l0 && (d2 < N2 || !v.l1) ? v.l0 : v.l1, k = im === v.l0 ? v.a++ : v.b++;
          im.setMatrixAt(k, it.mg || it.m); im.setColorAt(k, it.g || white);
        } else { base.setMatrixAt(nb, it.m); base.setColorAt(nb, it.c); nb++; }
      }
      base.count = nb;
      for (const v of V) { if (v.l0) v.l0.count = v.a; if (v.l1) v.l1.count = v.b; }
      for (const im of [base, ...V.flatMap(v => [v.l0, v.l1])]) {
        if (!im) continue;
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.boundingSphere = null;
      }
    }
  };
}
