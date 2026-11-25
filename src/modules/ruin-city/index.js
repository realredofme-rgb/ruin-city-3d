// 模块 1：雾港残响 —— 海岸上被藤蔓吞没的旧城。城市 v1 的全部内容，按模块接口包了一层。
import * as THREE from 'three';
import { ground, terrainColor, makeTerrain, makeMotes, CORE } from './terrain.js';
import { buildCity, makeMaterials, insideFoot, U } from './city.js';
import { buildLife } from './life.js';
import { TOURS, HOME } from './tours.js';

export default {
  id: 'ruin-city', no: 1, name: '雾港残响', sub: '海岸上被藤蔓吞没的旧城', status: 'built', want: [-22, 0],
  note: '断裂倾斜的高楼废墟、沿山坡叠起的雾港老城、沉在海湾里的楼群、山顶断顶的白塔和废墟上空的浮空岛。',
  core: CORE, home: HOME, tours: TOURS,
  route: { x: 470, z: 170, alt: 430 },
  height: ground,
  color: terrainColor,
  build({ root, status }) {
    const terrain = makeTerrain(); root.add(terrain);
    const M = makeMaterials();
    const city = buildCity(root, M);
    const before = new Set(root.children);
    const life = buildLife(root, city);
    for (const o of root.children) if (!before.has(o)) o.userData.dynamic = true; // 车、船、飞艇、落石……一开始都在原点，之后才动
    const motes = makeMotes(); root.add(motes);
    const wetMats = [terrain.material, M.tower, M.towerResi, M.towerBrut, M.plain, M.house, M.metal];
    M.house.userData.wetK = 0.6;
    for (const m of wetMats) { m.userData.r0 = m.roughness; }
    // 从太空看得见的夜灯：坡上人家、码头、废墟楼顶的障碍灯
    const lights = [];
    for (const f of city.footprints) if (f.kind === 'house' || f.kind === 'warehouse' || f.kind === 'clock') lights.push([f.x, ground(f.x, f.z) + 6, f.z, 1]);
    for (const p of city.tops) lights.push([p.x, p.y, p.z, 0.5]);
    return {
      city, life,
      rides: { tram: life.movers.tram, air: life.movers.air, boat: life.movers.boat },
      lights,
      ground,
      canStand: (x, z) => !insideFoot(city.footprints, x, z, 0.4) && ground(x, z) > 0.8,
      walkStart() {
        const p = new THREE.Vector3(-60, 0, 60);
        for (let r = 0; r < 200 && insideFoot(city.footprints, p.x, p.z, 2); r += 3) p.set(-60 + r, 0, 60 - r * 0.3);
        return { x: p.x, z: p.z, yaw: 1.0 };
      },
      update(dt, t, env, camLocal, speed = 1) {
        city.update(t, env);
        // 阳台、水箱这些小零件只在近处画（城市核心区约 1.3 公里宽）
        if (city.detail) city.detail.visible = camLocal.position.length() < 2600;
        U.uWind.value = env.wind;
        life.update(dt, t, env, speed, camLocal);
        motes.material.uniforms.uTime.value = t; motes.material.uniforms.uNight.value = env.night;
        // 雨后地面变湿发亮，雨停后慢慢晾干
        for (const m of wetMats) {
          m.roughness = THREE.MathUtils.lerp(m.userData.r0, 0.22, env.wet * (m.userData.wetK ?? 1));
          m.color.setScalar(1 - 0.3 * env.wet); m.userData.envBase = 0.55 + env.wet * 0.9;
        }
      },
      setPixelRatio(px) { motes.material.uniforms.uPx.value = px; life.dust.material.uniforms.uPx.value = px; }
    };
  }
};
