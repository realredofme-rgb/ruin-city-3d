// 焦黑的枯树：火山坡上被喷发烧死的一片片树林，只剩炭化的树干。
// 模型和湿地的枯立木是同一套 GLB（sunken-wetland/dead-tree-1、2），实例颜色压成炭黑；
// 这里原来没有树，所以没有程序化的占位，GLB 读不到就什么也不显示。
import * as THREE from 'three';
import { rng, smooth, fbm } from '../../util.js';
import { floraLod, LOW_Q } from '../../models.js';
import { ground, breachMask, lavaGlow, nearest, RIVER, FISS, LAKE, CRATER, VC, DANAKIL } from './terrain.js';

const slope = (x, z) => Math.hypot(ground(x + 4, z) - ground(x - 4, z), ground(x, z + 4) - ground(x, z - 4)) / 8;

/** 能不能种：离开火山口、工厂豁口、熔岩河、裂隙、熔岩湖、硫磺泉和太陡的坡 */
function ok(x, z) {
  const dc = Math.hypot(x - VC.x, z - VC.z);
  if (dc < CRATER.r + 110 || Math.abs(x) > 1200 || Math.abs(z) > 1200) return false;
  if (breachMask(x, z) > 0.001 || lavaGlow(x, z) > 0.01) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 120 || Math.hypot(x - DANAKIL.x, z - DANAKIL.z) < DANAKIL.r + 90) return false;
  if (nearest(RIVER, x, z, { d: 0, i: 0, t: 0 }).d < 75 || nearest(FISS, x, z, { d: 0, i: 0, t: 0 }).d < 35) return false;
  return slope(x, z) < 0.55;
}

export function plantSnags(root) {
  const R = rng(5150), pts = [];
  for (let k = 0; k < 30000 && pts.length < 280; k++) {
    const x = (R() - 0.5) * 2400, z = (R() - 0.5) * 2400;
    // 一片一片的：只在噪声高的地方成林，林子外零星几棵
    const f = fbm(x * 0.0035 + 7, z * 0.0035 - 3, 3);
    if (R() > (f > 0.55 ? 0.9 : 0.04)) continue;
    if (!ok(x, z) || pts.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 49)) continue;
    pts.push({ x, z });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const items = pts.map(({ x, z }) => {
    const s = 0.55 + R() * 0.5;
    e.set((R() - 0.5) * 0.12, R() * 6.28, (R() - 0.5) * 0.12); q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, ground(x, z) - 0.6, z), q, new THREE.Vector3(s, s * (0.85 + R() * 0.3), s));
    // 炭化程度不一：大多烧得漆黑，少数只熏黑了下半截那样偏灰褐
    const burnt = R() < 0.8, k = burnt ? 0.035 + R() * 0.03 : 0.12 + R() * 0.08; // 线性空间的值，0.04 左右才看得出炭黑
    return { m: m.clone(), c: new THREE.Color(1, 1, 1), g: new THREE.Color(k * 1.05, k * 0.97, k * 0.92) };
  });
  const empty = { geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)), material: new THREE.MeshBasicMaterial() };
  return floraLod(root, items, empty, ['sunken-wetland/dead-tree-1', 'sunken-wetland/dead-tree-2'], { near: LOW_Q ? 0 : 150, mid: 1e9 });
}
