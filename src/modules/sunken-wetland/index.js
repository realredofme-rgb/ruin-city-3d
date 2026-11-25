// 模块 3：沉没森林湿地 —— 古树从积水里长出来，树根缠着断掉的铁路高架、锈蚀的列车和被吞没的石庙。
// 参考亚马逊的洪泛林（伊加波黑水林）和吴哥的塔普伦寺。接口见 src/modules/README.md。
import * as THREE from 'three';
import { Builder, rng } from '../../util.js';
import { ground, groundColor, makeTerrain, makeWater, CORE } from './terrain.js';
import { buildViaduct, buildTrain, buildFreight, buildTemple, weather } from './ruins.js';
import { plantForest } from './forest.js';
import { WIND } from './trees.js';
import { buildLife } from './life.js';
import { TOURS, HOME } from './tours.js';

export default {
  id: 'sunken-wetland', no: 3, name: '沉没森林湿地', sub: '古树从积水里长出，树根缠着断桥和锈蚀的列车', status: 'built', want: [2, 70],
  note: '一整片林子泡在齐腰深的黑水里。上百米高的古树从水中长出，一棵从铁路高架的桥面中间长穿过去，一棵坐在石庙的门楼顶上，根顺着墙垂进水里。断桥边停着一列锈透的列车，车头悬在半空。夜里萤火贴着水面飘，树干上的菌菇泛着青光。',
  core: CORE, home: HOME, tours: TOURS,
  route: { x: 0, z: 0, alt: 380 },
  height: ground,
  color: groundColor,
  build({ root }) {
    const terrain = makeTerrain(); root.add(terrain);
    const water = makeWater(); root.add(water);
    const R = rng(808), stone = new Builder(), metal = new Builder(), spots = {};
    buildViaduct(stone, R, spots);
    buildTemple(stone, R, spots);
    buildTrain(metal, R, spots);
    spots.freight = { x: -780, z: -420 }; buildFreight(metal, R, spots.freight);
    const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });
    const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.35 });
    root.add(weather(stone.build(stoneMat), { moss: 0.55 }), weather(metal.build(metalMat), { moss: 0.35, rust: 0.85 }));
    const forest = plantForest(root, spots);
    const life = buildLife(root, spots, forest);
    const wetMats = [terrain.material, stoneMat, metalMat, forest.M.wood];
    for (const m of wetMats) m.userData.r0 = m.roughness;
    const nm = water.material.normalMap;
    return {
      lights: life.lights,
      ground,
      update(dt, t, env) {
        WIND.uT.value = t; WIND.uWind.value = env.wind;
        nm.offset.set(t * 0.0021, t * 0.0013);
        water.material.normalScale.setScalar(0.1 + env.wind * 0.12 + (env.wx ? env.wx.rain : 0) * 0.5);
        for (const m of wetMats) m.roughness = THREE.MathUtils.lerp(m.userData.r0, 0.35, env.wet * 0.8);
        life.update(dt, t, env);
      }
    };
  }
};
