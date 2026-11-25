// 湿地的风景巡游（平面局部坐标）。格式同 ruin-city/tours.js。
import * as THREE from 'three';
import { TEMPLE } from './terrain.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const TOURS = [
  { id: 'wet-dawn', name: '晨雾林海', desc: '贴着水面穿过雾里的板根，古树一棵接一棵从雾中浮出来', hour: 6.1, weather: 'fog', dur: 90,
    keys: [[V(700, 6, 900), V(400, 20, 500)], [V(300, 8, 640), V(-100, 30, 600)], [V(-100, 10, 420), V(-260, 40, 690)], [V(-420, 14, 300), V(-450, 23, 420)], [V(-200, 30, 120), V(150, 30, 260)], [V(300, 20, 520), V(700, 20, 900)]] },
  { id: 'wet-bridge', name: '断桥列车', desc: '沿着断掉的高架飞，看悬在半空的车头和坐在断口边钓鱼的小机械', hour: 16.8, weather: 'clear', dur: 80,
    keys: [[V(-900, 40, 250), V(-600, 23, 400)], [V(-640, 30, 360), V(-430, 22, 430)], [V(-470, 28, 470), V(-380, 20, 380)], [V(-300, 35, 380), V(-460, 18, 420)], [V(0, 60, 420), V(640, 60, 330)], [V(450, 40, 260), V(640, 80, 330)], [V(700, 120, 450), V(640, 60, 330)]] },
  { id: 'wet-temple', name: '树下石庙', desc: '绕着被古榕吞没的石庙转一圈，根从门楼顶上一路垂进水里', hour: 10.2, weather: 'clear', dur: 80,
    keys: Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2; return [V(TEMPLE.x + Math.cos(a) * 110, 22 + Math.sin(a * 2) * 8, TEMPLE.z + Math.sin(a) * 110), V(TEMPLE.x, 14, TEMPLE.z)]; }) },
  { id: 'wet-night', name: '萤火之夜', desc: '夜里低飞过水面，萤火在树根之间飘，菌菇和王莲的白花在发光', hour: 22.5, weather: 'clear', dur: 90,
    keys: [[V(-700, 5, -300), V(-780, 10, -420)], [V(-500, 7, -200), V(-300, 6, -100)], [V(-150, 6, -200), V(TEMPLE.x, 10, TEMPLE.z)], [V(150, 8, -260), V(330, 30, -930)], [V(-300, 10, -500), V(-780, 30, -420)]] }
];

/** 落点镜头：从东南方的高处看过去，前景是神庙，远处是断桥和古树 */
export const HOME = { cam: [430, 150, -760], target: [-60, 30, -40] };
