// 模块 6：冰原坠舰带 —— 冰盖上躺着一艘断成三截的巨舰，冰裂缝里透出蓝光，夜里有极光。
// 现实参考：冰岛瓦特纳冰川（蓝冰、冰裂缝）、南极麦克默多干谷（无冰的岩石谷地、冰湖、冰原岛峰）。
import * as THREE from 'three';
import { ground, terrainColor, makeTerrain, CORE, furrowZ } from './terrain.js';
import { buildWreck } from './ship.js';
import { buildIce, buildAurora, buildParticles, buildCamp } from './fx.js';
import { TOURS, HOME } from './tours.js';

export default {
  id: 'ice-wreck', no: 6, name: '冰原坠舰带', sub: '断成三截的巨舰、发蓝光的冰裂缝和极光', status: 'built', want: [66, -60],
  note: '一艘一公里多长的巨舰从东边坠下，在冰盖上犁出两公里长的沟，途中断成三截：舰尾的反应堆还在发光，货舱侧翻、货柜撒了一地，舰首一头撞进自己推起的冰脊里。四周的冰裂缝透出蓝光，北边是没有冰的干谷和冻住的湖，夜里极光垂下来。参考冰岛瓦特纳冰川和南极干谷。',
  core: CORE, home: HOME, tours: TOURS,
  route: { x: -300, z: furrowZ(-300), alt: 520 },
  height: ground,
  color: terrainColor,
  build({ root }) {
    const U = { uTime: { value: 0 }, uGlow: { value: 0.5 }, uWind: { value: 0.3 }, uFill: { value: 1 }, uNightFill: { value: 0 }, uAur: { value: 0 }, uPx: { value: Math.min(globalThis.devicePixelRatio || 1, 1.5) } };
    root.add(makeTerrain(U));
    const wreck = buildWreck(root, U);
    const ice = buildIce(root, U);
    const camp = buildCamp(root);
    const aurora = buildAurora(root);
    buildParticles(root, U);
    return {
      lights: [...wreck.lights, ...camp.lights],
      ground,
      update(dt, t, env) {
        U.uTime.value = t; U.uWind.value = env.wind;
        // 裂缝的蓝光：白天只是冰缝深处的一点蓝，天越黑越亮
        U.uGlow.value = THREE.MathUtils.lerp(0.22, 1.25, env.night);
        U.uFill.value = 1 - env.night; U.uNightFill.value = env.night; U.uAur.value = aurora.level();
        wreck.update(t, env); ice.update(env); camp.update(t, env); aurora.update(t, env);
      },
      setPixelRatio(px) { U.uPx.value = px; }
    };
  }
};
