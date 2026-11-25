// 戈壁大裂谷的风景巡游（平面局部坐标）与「前往」的落点镜头
import * as THREE from 'three';
import { xc, PINCH, LAKE } from './terrain.js';
import { HAND, HEAD } from './machines.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X0 = xc(PINCH);
const circle = (cx, cy, cz, r, n, ty, wob = 14) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [V(cx + Math.cos(a) * r, cy + Math.sin(a * 2) * wob, cz + Math.sin(a) * r), V(cx, ty, cz)]; });

export const TOURS = [
  { id: 'rift-dusk', name: '裂谷黄昏', desc: '从北站顺着裂谷往南低飞，穿过横在谷上的巨人身下，飞到碱湖', hour: 17.45, weather: 'clear', dur: 95,
    keys: [
      [V(xc(1380) + 20, 55, 1400), V(xc(1100), 25, 1050)],
      [V(xc(1000) - 10, 40, 960), V(xc(700), 25, 650)],
      [V(xc(560) + 35, 38, 540), V(xc(250), 55, 200)],
      [V(xc(180), 48, 180), V(X0, 110, PINCH)],
      [V(xc(PINCH) + 8, 62, PINCH + 15), V(xc(-320), 40, -350)],
      [V(xc(-420), 42, -430), V(xc(-900), 25, -1000)],
      [V(xc(-950) + 50, 70, -980), V(LAKE.x, 10, LAKE.z)],
      [V(xc(-1250) + 230, 170, -1180), V(X0, 140, PINCH)],
      [V(xc(0) + 420, 260, 200), V(X0 - 100, 100, PINCH + 300)]
    ] },
  { id: 'buttes', name: '孤峰长影', desc: '绕着西岸的「手套」孤峰飞一圈，夕阳把影子拉过整片台地', hour: 17.7, weather: 'clear', dur: 100,
    keys: circle(820, 250, 420, 560, 8, 170, 30) },
  { id: 'storm', name: '沙暴巨手', desc: '沙暴里贴着沙丘飞过伸出地面的巨手和沉睡的巨首', hour: 15.4, weather: 'fog', dur: 80,
    keys: [
      [V(-300, 45, 620), V(HAND.x, 80, HAND.z)],
      [V(-440, 32, 430), V(HAND.x, 95, HAND.z)],
      [V(-640, 50, 250), V(HEAD.x, 40, HEAD.z)],
      [V(-690, 36, -170), V(HEAD.x, 30, HEAD.z)],
      [V(-640, 60, -470), V(-900, 20, -880)],
      [V(-470, 90, -620), V(X0, 140, PINCH)],
      [V(-260, 70, 200), V(HAND.x, 90, HAND.z)]
    ] },
  { id: 'night', name: '机械微光', desc: '夜里绕着横谷巨人慢慢飞，它身上的核心和接缝时不时亮一下', hour: 22.4, weather: 'clear', dur: 90,
    keys: circle(X0, 250, PINCH, 340, 8, 110, 40) }
];

export const HOME = { cam: [1250, 430, 700], target: [-80, 90, -150] };
