// 浮空群岛的风景巡游（平面局部坐标；心岛在 (0, 620, 40)）
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ring = (cx, cz, r, n, y0, yA, target, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + i / n * Math.PI * 2; return [V(cx + Math.cos(a) * r, y0 + Math.sin(a * 2) * yA, cz + Math.sin(a) * r), target.clone()]; });

export const TOURS = [
  { id: 'isles-dawn', name: '云海日出', desc: '贴着云海在石柱之间穿行，太阳从云上升起，照亮悬在深渊上的心岛', hour: 6.15, weather: 'clear', dur: 110,
    keys: ring(0, 40, 1250, 9, 445, 15, V(0, 470, 40), 3.6) },
  { id: 'isles-bridge', name: '吊桥与铁链', desc: '沿着木板吊桥一座岛一座岛地走过去，脚下几百米就是云海', hour: 10.4, weather: 'clear', dur: 95,
    keys: [[V(640, 597, 500), V(330, 617, 230)], [V(440, 627, 300), V(150, 637, 140)], [V(230, 637, 170), V(-40, 652, -20)], [V(30, 662, -60), V(-300, 612, -170)], [V(-250, 632, -170), V(-440, 622, 40)], [V(-470, 662, 150), V(0, 662, 40)], [V(-150, 772, 300), V(330, 622, 230)], [V(380, 702, 560), V(330, 612, 230)]] },
  { id: 'isles-under', name: '心岛之下', desc: '傍晚绕到心岛底下，看吊着的晶核在暮色里亮起来，瀑布落进被染红的云', hour: 17.9, weather: 'clear', dur: 100,
    keys: ring(0, 40, 360, 8, 225, 25, V(0, 300, 40), 0.5) }
];

/** 点「前往」时的落点：从南边台地上空望向心岛 */
export const HOME = { cam: [-420, 700, -1450], target: [0, 430, 40] };
