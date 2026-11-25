// 外部 GLB 模型：加载、缓存，以及把程序化占位的 InstancedMesh 换成 GLB 的几何和材质。
// 模型放在 assets/models/<模块>/<名字>.glb（规范见 docs/model-list.md）：米、Y 朝上、+Z 是正面、原点在底面中心。
// 加载失败（离线、文件缺失）时什么也不做，场景保留程序化的占位模型。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/** 读一个模型，返回 { geometry, material }：整个场景合成一块几何（节点变换已烘进去），只取第一个材质 */
export function loadModel(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(`assets/models/${path}.glb`).then(gltf => {
    gltf.scene.updateMatrixWorld(true);
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) throw new Error(`${path}: 没有网格`);
    if (meshes.length > 1) console.warn(`${path}: 有 ${meshes.length} 个网格，只用第一个`);
    const m = meshes[0], geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geometry.computeBoundingSphere();
    return { geometry, material: m.material };
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
