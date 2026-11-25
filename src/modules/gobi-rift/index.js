// 模块 2：戈壁大裂谷 —— 纪念碑谷的红色孤峰 × 东非大裂谷的断层崖 × 半埋在沙里的巨型机械。
import * as THREE from 'three';
import { ground, color, makeTerrain, makeWater, CORE, xRail, smooth, lerp, clamp } from './terrain.js';
import { buildRocks } from './rocks.js';
import { buildMachines } from './machines.js';
import { Railway } from './rail.js';
import { buildFlora } from './flora.js';
import { Storm, dust } from './weather.js';
import { TOURS, HOME } from './tours.js';

export default {
  id: 'gobi-rift', no: 2, name: '戈壁大裂谷', sub: '红色孤峰、断层裂谷与半埋的巨型机械', status: 'built', want: [-52, 0],
  note: '纪念碑谷式的红色孤峰与平顶方山立在两岸台地上，中间是一条东非大裂谷式的阶梯断崖。一具巨人机械脸朝下卡在裂谷最窄处，成了一座桥；东岸沙海里伸出巨手、埋着巨首。铁路从城市钻过山脊，沿谷底一路开到南端的碱湖。在这里「雾」会变成沙暴。',
  core: CORE, home: HOME, tours: TOURS,
  route: { x: 0, z: 0, alt: 640 },
  // 星球网格只用到碎石坡为止：孤峰的崖壁在核心网格里另有模型，粗网格要是也拉起崖壁，会从地里戳出三角形
  height: (x, z) => ground(x, z, false),
  color,
  build({ root, frame }) {
    let seed = 2024; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const terrain = makeTerrain(); dust(terrain.material); root.add(terrain);
    for (const w of makeWater()) { dust(w.material); root.add(w); }
    buildRocks(root, dust);
    const mach = buildMachines(root, dust);
    const lampMat = dust(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x000000 }));
    const rail = new Railway(root, dust, lampMat, rnd);
    buildFlora(root, dust, rnd);
    const storm = new Storm(root, frame, mach.falls);
    // 从太空看得见的夜灯：车站和小镇里还亮着的几扇窗、机械的眼睛
    const lights = [...rail.lamps.map(p => [p.x, p.y, p.z, 0.7]), ...mach.groups.flatMap(g => g.glowPts.map(p => [p.x, p.y, p.z, 0.9]))];
    let nextWake = 20;
    return {
      lights, rail, mach, storm,
      ground: (x, z) => ground(x, z),
      canStand: (x, z) => Math.abs(x) < 1500 && Math.abs(z) < 1650,
      walkStart: () => ({ x: xRail(1240) + 12, z: 1240, yaw: Math.PI }),
      update(dt, t, env, camLocal) {
        rail.update(dt);
        const S = storm.update(dt, t, env, camLocal);
        // 机械微光：白天几乎看不见，入夜后慢慢呼吸；隔一阵会有一台「醒」过来，闪几秒
        if (t > nextWake) { const g = mach.groups[Math.floor(Math.random() * 3)]; g.wake = 1; nextWake = t + 25 + Math.random() * 50; }
        const night = env.night;
        for (const g of mach.groups) {
          g.wake = Math.max(0, g.wake - dt / 6);
          const breathe = 0.55 + 0.45 * Math.sin(t * 0.45 + g.phase);
          const flick = g.wake > 0 ? (0.6 + 0.4 * Math.sin(t * 23 + g.phase) * Math.sin(t * 7.1)) * smooth(0, 0.25, g.wake) : 0;
          const k = lerp(0.12, 1.25, smooth(0.15, 0.85, night)) * breathe * (1 + S * 0.6) + flick * (1.2 + night * 1.8);
          g.mat.color.setScalar(k);
        }
        lampMat.color.setScalar(lerp(0.04, 2.4, smooth(0.3, 0.85, night)));
      },
      setPixelRatio(px) { storm.setPixelRatio(px); }
    };
  }
};
