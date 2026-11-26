// 模块 5：火山熔炉区 —— 一座还在运转的远古工厂嵌在活火山里。
// 参考：埃塞俄比亚达纳基尔（硫磺泉、熔岩湖）、冰岛熔岩原（苔原熔岩、玄武岩柱、裂隙喷发）。
import * as THREE from 'three';
import { rng, smooth } from '../../util.js';
import { ground, terrainColor, lavaGlow, makeTerrainGeometry, CORE, VC, LAKE, TER, CRATER } from './terrain.js';
import { HeatField, forgeMaterial, ensureAttrs, LU } from './lava.js';
import { buildForge } from './forge.js';
import { makeSmoke, makeEmbers, makeHalos, FXU } from './fx.js';
import { TOURS, HOME } from './tours.js';
import { plantSnags } from './snags.js';

/** 熔岩湖北岸的玄武岩柱（一根根六棱柱，台阶状地排开） */
function basalt(root, heat) {
  const R = rng(77), list = [];
  const add = (x, z, top) => list.push([x, z, top]);
  // 熔岩湖北岸一道弧形的柱崖
  const s = 5.2;
  for (let j = -60; j <= 60; j++) for (let i = -60; i <= 60; i++) {
    const x = LAKE.x + (i + (j & 1) * 0.5) * s, z = LAKE.z + j * s * 0.866;
    const d = Math.hypot(x - LAKE.x, z - LAKE.z), a = Math.atan2(z - LAKE.z, x - LAKE.x);
    if (d < LAKE.r + 6 || d > LAKE.r + 70) continue;
    if (!(a > 0.25 && a < 2.7)) continue;
    const e = (d - LAKE.r - 6) / 64, edgeA = smooth(0.25, 0.6, a) * smooth(2.7, 2.3, a);
    const step = Math.floor(e * 5) * 5 + 6, top = LAKE.y + (step + R() * 4) * edgeA + 2;
    if (top < ground(x, z) + 0.5) continue;
    add(x, z, top);
  }
  // 西侧熔岩场里几簇露头的柱子
  for (const [cx, cz, n] of [[640, -520, 120], [960, 360, 90], [760, -820, 80]]) {
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, d = Math.sqrt(R()) * 34, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      add(Math.round(x / s) * s, Math.round(z / (s * 0.866)) * s * 0.866, ground(x, z) + (1 - d / 34) * 22 + R() * 3);
    }
  }
  const geo = new THREE.CylinderGeometry(2.75, 2.85, 1, 6, 1).translate(0, -0.5, 0);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05, flatShading: true }), list.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  list.forEach(([x, z, top], i) => {
    const base = ground(x, z) - 4;
    d.position.set(x, top, z); d.rotation.set(0, Math.PI / 6 + (R() - 0.5) * 0.05, 0); d.scale.set(1, Math.max(top - base, 1), 1); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    const h = Math.min(1, heat.at(x, top, z) * 1.4);
    c.setHex(0x2a2a2e).lerp(new THREE.Color(0x3f3d40), R()).lerp(new THREE.Color(0x612414), h * 0.7); m.setColorAt(i, c);
  });
  m.castShadow = true; m.receiveShadow = true; root.add(m);
}

export default {
  id: 'volcano-forge', no: 5, name: '火山熔炉区', sub: '嵌在活火山里、至今还在运转的远古熔炉', status: 'built', want: [-15, -150],
  note: '火山南坡被切出四级台地，上面是一座没人知道是谁建的工厂：吊桥上的大勺从火山口舀出岩浆，倒进心炉，熔岩顺着高架槽和玻璃管一级级流下，在守门台的两尊跪姿巨像之间流出去，变成一条通往熔岩湖的河。东边是达纳基尔那样黄绿相间的硫磺泉，西边是冰岛那样长满青苔的熔岩原和喷火的裂隙。',
  core: CORE, home: HOME, tours: TOURS,
  route: { x: -300, z: -300, alt: 1250 },
  height: ground,
  color: terrainColor,
  glow: lavaGlow,
  build({ root }) {
    const heat = new HeatField(CORE.x0, CORE.z0, CORE.x1 - CORE.x0, 6);
    const F = buildForge(root, heat);
    // 地形：熔岩烤红的地方带自发光
    const tg = makeTerrainGeometry(); ensureAttrs(tg); heat.apply(tg);
    const terrain = new THREE.Mesh(tg, forgeMaterial({ roughness: 0.95, metalness: 0 }, { key: 'terrain', grime: 0.45 }));
    terrain.receiveShadow = true; root.add(terrain);
    basalt(root, heat);
    const snags = plantSnags(root);
    // 粒子
    const smoke = makeSmoke(F.smoke, 3), embers = makeEmbers(F.embers, 4), halos = makeHalos(F.halos);
    for (const p of [halos, smoke, embers]) root.add(p);
    const A = F.anim;
    const proj = 1 / Math.tan(THREE.MathUtils.degToRad(27.5));
    return {
      lights: F.lights,
      ground,
      update(dt, t, env, camLocal) {
        LU.uTime.value = t; LU.uNight.value = env.night;
        if (camLocal) snags.update(camLocal.position);
        const wa = 0.6 + t * 0.002; FXU.uWind.value.set(Math.cos(wa), Math.sin(wa)).multiplyScalar(4 + env.wind * 18);
        FXU.uScale.value = innerHeight * Math.min(devicePixelRatio, 1.25) * proj * 0.5;
        FXU.uDay.value = 1 - env.wx.fog * 0.25;
        // 齿轮
        for (const g of A.gears) g.g.rotation.x += g.w * dt;
        // 汽锤：慢慢抬起，猛地落下
        if (A.hammer) {
          const c = (t % 3.2) / 3.2, k = c < 0.8 ? smooth(0, 0.8, c) : 1 - smooth(0.8, 0.86, c);
          A.hammer.ram.position.y = A.hammer.y0 + (A.hammer.y1 - A.hammer.y0) * k;
          LU.uPulse.value = c > 0.86 && c < 0.95 ? 1 - (c - 0.86) / 0.09 : 0;
        }
        // 龙门吊沿轨道来回
        for (const c of A.cranes) {
          const s = 0.5 + 0.5 * Math.sin(t * 0.07 + c.ph);
          c.g.position.z = c.z0 + (c.z1 - c.z0) * s;
          const hk = 6 + 8 * (0.5 + 0.5 * Math.sin(t * 0.21 + c.ph)); c.hook.position.y = hk; c.cable.position.y = hk; c.cable.scale.y = (28 - hk) / 14;
        }
        // 大勺：下到火山口舀一勺 → 升起 → 沿吊桥开到熔心台 → 倾倒 → 回去
        if (A.ladle) {
          const L = A.ladle, T = 64, c = (t % T) / T;
          let z, y, tilt = 0;
          const seg = (a, b) => smooth(a, b, c);
          if (c < 0.12) { z = L.zLake; y = L.yUp + (L.yLake - L.yUp) * seg(0, 0.12); }
          else if (c < 0.2) { z = L.zLake; y = L.yLake; }
          else if (c < 0.32) { z = L.zLake; y = L.yLake + (L.yUp - L.yLake) * seg(0.2, 0.32); }
          else if (c < 0.52) { z = L.zLake + (L.zPour - L.zLake) * seg(0.32, 0.52); y = L.yUp; }
          else if (c < 0.6) { z = L.zPour; y = L.yUp + (L.yPour - L.yUp) * seg(0.52, 0.6); }
          else if (c < 0.78) { z = L.zPour; y = L.yPour; tilt = smooth(0.6, 0.65, c) * (1 - smooth(0.74, 0.78, c)); }
          else if (c < 0.84) { z = L.zPour; y = L.yPour + (L.yUp - L.yPour) * seg(0.78, 0.84); }
          else { z = L.zPour + (L.zLake - L.zPour) * seg(0.84, 1); y = L.yUp; }
          L.trolley.position.z = z;
          const drop = L.trolley.position.y - y - 22;
          L.ladle.position.y = -drop - 22; L.ladle.rotation.x = -tilt * 1.15;
          for (const cb of L.cables) cb.scale.y = Math.max(drop + 2, 1);
          L.stream.visible = tilt > 0.6;
          L.fill.visible = c > 0.12 && c < 0.76;
        }
      }
    };
  }
};
export { VC, TER, CRATER };
