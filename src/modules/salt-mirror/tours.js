// 盐湖镜原的风景巡游（平面局部坐标）
import * as THREE from 'three';
import { along, ARRAY, ISLE, RING_T } from './structures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const A = (t, s, y) => { const p = along(t, s); return V(p.x, y, p.z); };

export const TOURS = [
  { id: 'salt-dusk', name: '镜中列柱', desc: '贴着水面沿列柱大道飞向巨环，夕阳和柱子都在脚下再出现一次', hour: 17.5, weather: 'clear', dur: 85,
    keys: [[A(-1000, -70, 22), A(RING_T, 0, 60)], [A(-600, -55, 19), A(RING_T + 100, 0, 70)], [A(-250, -60, 18), A(RING_T + 200, 0, 80)], [A(60, -150, 22), A(RING_T, 0, 90)], [A(RING_T + 30, -230, 30), A(RING_T, 0, 120)], [A(RING_T + 250, -120, 40), A(RING_T, 0, 80)], [A(500, 120, 24), A(-200, 0, 60)], [A(-300, 140, 30), A(-900, 0, 60)]] },
  { id: 'salt-night', name: '天地星海', desc: '夜里湖面映出整片星空，光纹一道道扫过列柱', hour: 22.2, weather: 'clear', dur: 90,
    keys: [[A(-500, -160, 22), A(RING_T, 0, 70)], [A(-100, -200, 18), A(RING_T + 100, 0, 90)], [A(RING_T, -260, 26), A(RING_T, 0, 110)], [A(RING_T + 300, -180, 30), A(RING_T - 100, 0, 80)], [A(RING_T + 300, 160, 40), A(0, 0, 80)], [A(-200, 180, 26), A(-600, 0, 60)]] },
  { id: 'salt-array', name: '回声阵列', desc: '清晨掠过还望着同一片天的射电天线，再绕过仙人掌岛', hour: 8.2, weather: 'clear', dur: 80,
    keys: [[V(ARRAY.x + 380, 40, ARRAY.z - 240), V(ARRAY.x, 25, ARRAY.z)], [V(ARRAY.x + 120, 28, ARRAY.z - 40), V(ARRAY.x - 200, 25, ARRAY.z + 150)], [V(ARRAY.x - 120, 34, ARRAY.z + 60), V(ARRAY.x - 300, 30, ARRAY.z - 100)], [V(ARRAY.x + 200, 60, ARRAY.z + 200), V(ARRAY.x, 20, ARRAY.z)], [V(ISLE.x - 200, 50, ISLE.z + 220), V(ISLE.x, 30, ISLE.z)], [V(ISLE.x + 220, 45, ISLE.z - 60), V(ISLE.x, 30, ISLE.z)], [V(ISLE.x - 50, 60, ISLE.z - 260), V(ISLE.x, 25, ISLE.z)]] }
];
