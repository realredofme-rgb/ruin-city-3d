// 城市模块的地形：高度函数、地表颜色、核心地形网格、漂浮光尘
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, rng, dotTexture } from '../../util.js';
import { ruinMask } from './city.js';

/* ---------- 地理骨架 ----------
   模块局部坐标：x、z 是地面（米），y 是海拔。下面的「东南西北」是城里人的叫法：海在 +z，群山在 -z。
   （装到星球上后，这座城位于南纬 22°，+z 实际朝向地理北，太阳正午在海的上空。）
   西 / 中：断裂高楼的废墟城；东：沿山坡层层叠起的雾港老城；南：海湾与沉没的楼群；北：群山与白塔。 */
export const SEA = 0;
export function shoreZ(x) {
  return 150 + 46 * Math.sin(x / 230 + 0.5) + 24 * Math.sin(x / 97)
    - 70 * Math.exp(-(((x + 120) / 170) ** 2))      // 中央海湾
    + 150 * Math.exp(-(((x - 640) / 55) ** 2));     // 东侧灯塔岬角
}
const terrace = (v, step) => { const k = Math.floor(v / step), f = v / step - k; return step * (k + smooth(0.72, 0.98, f)); };

export function ground(x, z) {
  const n = fbm(x * 0.0035 + 4, z * 0.0035 - 2, 5);
  let y = 2 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 0.6;
  // 北部群山
  y += smooth(-330, -620, z + (n - 0.5) * 120) * (55 + 210 * n);
  // 西部山丘
  y += smooth(-520, -760, x + (n - 0.5) * 100) * (40 + 160 * n);
  // 东部：雾港台地，向东北抬升
  const town = smooth(230, 330, x);
  const rise = Math.max(0, x - 250) * 0.085 + Math.max(0, 90 - z) * 0.075;
  y += town * terrace(rise, 5.5) * (1 - smooth(-380, -470, z) * 0);
  y += smooth(700, 900, x) * (70 + 130 * n);
  // 海岸
  const dz = z - shoreZ(x);
  const beach = 1.6 - dz * 0.32 - Math.max(0, dz - 40) * 0.25;
  y = Math.min(y, beach);
  return Math.max(y, -34);
}

/* ---------- 地表颜色（核心地形网格和星球远景网格共用） ---------- */
const TC = {
  sand: new THREE.Color(0xcbbd98), grass: new THREE.Color(0x7d9450), grass2: new THREE.Color(0xa3a764), forest: new THREE.Color(0x4f6b3c),
  rock: new THREE.Color(0x8e867a), rock2: new THREE.Color(0x6c675e), asphalt: new THREE.Color(0x77756d), pave: new THREE.Color(0xb3a58f), bed: new THREE.Color(0x4e6766), snow: new THREE.Color(0xe8e8e2)
};
export function terrainColor(x, z, y, sl, c) {
  const n = fbm(x * 0.03, z * 0.03, 3), n2 = fbm(x * 0.11 + 9, z * 0.11, 2);
  const dz = z - shoreZ(x);
  if (y < -0.6) c.copy(TC.bed).lerp(TC.sand, clamp((y + 8) / 8, 0, 1));
  else if (dz > -14) c.copy(TC.sand).lerp(TC.rock, n * 0.5);
  else if (sl > 0.9) c.copy(TC.rock).lerp(TC.rock2, n);
  else {
    const r = ruinMask(x, z);
    if (r > 0) { // 废墟街面：开裂沥青被草吞没
      c.copy(TC.asphalt).lerp(TC.pave, n2 * 0.5).lerp(n > 0.5 ? TC.grass : TC.grass2, smooth(0.38, 0.62, n * 0.7 + n2 * 0.4) * 0.9 * r);
    } else if (x > 250 && z > -300 && y < 70) {
      c.copy(TC.pave).lerp(TC.grass2, smooth(0.5, 0.75, n) * 0.6);
    } else {
      c.copy(TC.forest).lerp(TC.grass2, smooth(0.35, 0.7, n)).lerp(TC.rock, smooth(140, 230, y + n * 60) * 0.8);
      c.lerp(TC.snow, smooth(230, 290, y + n * 40));
    }
  }
  return c.multiplyScalar(0.88 + n2 * 0.24);
}

/* ---------- 核心地形网格（城市所在的 2.4 公里见方，精度约 6.7 米；更远处由星球网格接上） ---------- */
export const CORE = { x0: -1140, x1: 1260, z0: -1320, z1: 1080 };
export function makeTerrain() {
  const SIZE = 2400, N = 360;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.translate(60, 0, -120);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = ground(x, z); p.setY(i, y);
    const e = 3, sl = Math.hypot(ground(x + e, z) - ground(x - e, z), ground(x, z + e) - ground(x, z - e)) / (2 * e);
    terrainColor(x, z, y, sl, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** 漂浮光尘：白天是阳光里的尘埃与花粉，夜里是萤火 */
export function makeMotes() {
  const N = 2400, R = rng(5), pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([R.range(-520, 260), R.range(1, 70), R.range(-340, 150)], i * 3); seed[i] = R() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uTex: { value: dotTexture() }, uPx: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime,uNight,uPx; varying float vA;
      void main(){ vec3 p=position; float t=uTime*.25+seed;
        p+=vec3(sin(t*1.3)*6., sin(t*.9+seed)*3.+sin(t*.31)*4., cos(t*1.1)*6.);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float blink=.5+.5*sin(uTime*2.+seed*7.);
        vA=mix(.35, blink, uNight)*smoothstep(600.,60.,-mv.z);
        gl_PointSize=min(uPx*mix(2.2,4.,uNight)*(220./-mv.z)*1.6, uPx*7.); }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uNight; varying float vA;
      void main(){ vec4 t=texture2D(uTex,gl_PointCoord); vec3 c=mix(vec3(1.,.95,.8),vec3(.75,1.,.45)*1.8,uNight); gl_FragColor=vec4(c*t.a*vA,1.); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false;
  return p;
}
