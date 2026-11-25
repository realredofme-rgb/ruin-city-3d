// 城市：断裂的高楼废墟、高架残桥、摩天轮、沉没楼群、雾港老城、码头与灯塔、白塔与浮空岛
import * as THREE from 'three';
import { Builder, mat, rng, fbm, smooth, clamp, lerp, wallTextures } from '../../util.js';
import { ground, shoreZ } from './terrain.js';

/* ---------- 区域划分 ---------- */
export const RUIN_C = new THREE.Vector2(-190, -130);
export function ruinMask(x, z) {
  const s = shoreZ(x);
  return smooth(-600, -540, x) * (1 - smooth(200, 260, x)) * smooth(-380, -330, z) * (1 - smooth(s - 40, s - 20, z));
}
export const FERRIS = new THREE.Vector3(-430, 0, 40);
export const PLAZA = new THREE.Vector2(-175, -55);
export const TOWER = new THREE.Vector3(-40, 0, -900);
/** 所有材质共用的时间、风、灯火 uniform */
export const U = { uTime: { value: 0 }, uWind: { value: 0.2 }, uLamp: { value: 0 } };
const C = c => new THREE.Color(c);
/** 流畅档（?q=low 或手机）：不做阳台和楼顶小零件 */
const LOW = typeof location !== 'undefined' && (new URLSearchParams(location.search).get('q') === 'low' || matchMedia('(max-width: 760px)').matches);

/* 高架残桥中线 */
export const HIGHWAY = new THREE.CatmullRomCurve3([
  [-640, 22, -210], [-470, 17, -180], [-330, 16, -230], [-200, 17, -250], [-60, 16, -190], [70, 15, -110], [170, 14, -30], [270, 18, -40], [380, 26, -120]
].map(p => new THREE.Vector3(p[0], p[1], p[2])));
const HW_GAPS = [[0.205, 0.235], [0.47, 0.5], [0.66, 0.672]];

function distToCurve(curve, x, z, n = 140) {
  let best = 1e9;
  for (let i = 0; i <= n; i++) { const p = curve.getPointAt(i / n); best = Math.min(best, Math.hypot(p.x - x, p.z - z)); }
  return best;
}

/* ---------- 材质 ---------- */
export function makeMaterials() {
  const hs = wallTextures('house', 23);
  const seam = (() => { // 白塔的发光接缝
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#7fe8ff'; g.fillRect(30, 0, 3, 256); for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 64, 2);
    g.fillStyle = '#c8f6ff'; g.fillRect(8, 100, 10, 3);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const tex = Object.fromEntries(STYLES.map((k, i) => [k, ruinTextures(k, 11 + i * 7)]));
  const towerMat = k => weatherMat(new THREE.MeshStandardMaterial({ map: tex[k].map, bumpMap: tex[k].bump, bumpScale: 2.2, roughnessMap: tex[k].rough, vertexColors: true, roughness: 1 }));
  return {
    tower: towerMat('grid'), towerResi: towerMat('resi'), towerBrut: towerMat('brut'),
    house: litMat(new THREE.MeshStandardMaterial({ map: hs.map, emissiveMap: hs.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, vertexColors: true, roughness: 0.88 })),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    tree: swayMat(),
    beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 0.2) }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.55, emissive: 0xffffff, emissiveMap: seam, emissiveIntensity: 0.2 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.75) }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5) }),
    crystal: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.4, 2.8) }),
    ring: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 2.6), transparent: true, opacity: 0.75, depthWrite: false })
  };
}

/* ---------- 废墟高楼的立面 ---------- */
// 三种立面：grid 办公楼（横向带窗 + 竖肋）、resi 住宅（方窗 + 阳台）、brut 粗野主义（深窗洞 + 木模板纹）
export const STYLES = ['grid', 'resi', 'brut'];
/** 每种立面三张图：颜色、凹凸（窗洞凹进去、窗框和楼板凸出来）、粗糙度（玻璃反光） */
function ruinTextures(style, seed) {
  const R = rng(seed), S = 1024, cw = S / 4, ch = S / 4;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; };
  const [c, g] = mk(), [b, gb] = mk(), [r, gr] = mk();
  g.fillStyle = { grid: '#d2cdc2', resi: '#dbd4c6', brut: '#c3beb3' }[style]; g.fillRect(0, 0, S, S);
  gb.fillStyle = '#8c8c8c'; gb.fillRect(0, 0, S, S);
  gr.fillStyle = '#f0f0f0'; gr.fillRect(0, 0, S, S);
  const rect = (ctx, col, x, y, w, h) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // 大块斑驳与细颗粒
  for (let i = 0; i < 900; i++) { const s = 6 + R() * 50; g.fillStyle = `rgba(${R() < 0.5 ? '70,64,54' : '255,250,238'},${0.02 + R() * 0.045})`; g.beginPath(); g.ellipse(R() * S, R() * S, s, s * (0.4 + R()), R() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 9000; i++) { const v = R() < 0.5 ? 40 : 230; g.fillStyle = `rgba(${v},${v},${v - 8},${0.05 + R() * 0.08})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  if (style === 'brut') for (let y = 0; y < S; y += 16) { rect(g, 'rgba(60,56,50,0.10)', 0, y, S, 2); rect(gb, 'rgba(40,40,40,0.5)', 0, y, S, 2); for (let x = R() * 200; x < S; x += 120 + R() * 200) rect(g, 'rgba(60,56,50,0.08)', x, y, 2, 16); }
  if (style === 'resi') for (let i = 0; i <= 8; i++) { rect(g, 'rgba(80,74,64,0.25)', i * S / 8 - 1, 0, 2, S); rect(gb, '#555', i * S / 8 - 1, 0, 2, S); }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x0 = i * cw, y0 = j * ch;
    // 楼板边（凸出的一条），不能盖到 v≈0.03 处：顶面和底面取的是那里的素墙色
    rect(g, 'rgba(95,90,80,0.45)', x0, y0 + ch - 12, cw, 10); rect(gb, '#c8c8c8', x0, y0 + ch - 12, cw, 10);
    let wx, wy, ww, wh;
    if (style === 'grid') { wx = x0; ww = cw; wy = y0 + ch * 0.26; wh = ch * 0.5; }
    else if (style === 'resi') { ww = cw * 0.5; wh = ch * 0.52; wx = x0 + (cw - ww) / 2; wy = y0 + ch * 0.2; }
    else { ww = cw * 0.32; wh = ch * 0.44; wx = x0 + (cw - ww) / 2; wy = y0 + ch * 0.24; }
    const st = R(), broken = st < 0.42, boarded = !broken && st < 0.52;
    // 窗洞：先画深色洞口，再按状态填玻璃、残片或木板
    rect(g, '#141617', wx, wy, ww, wh); rect(gb, '#141414', wx, wy, ww, wh); rect(gr, '#e0e0e0', wx, wy, ww, wh);
    if (boarded) { for (let k = 0; k < wh; k += 14) rect(g, `rgb(${96 + R() * 30},${74 + R() * 20},${52 + R() * 14})`, wx + 3, wy + k + 1, ww - 6, 11); rect(gb, '#3a3a3a', wx, wy, ww, wh); }
    else if (!broken) {
      const gg = g.createLinearGradient(wx, wy, wx + ww * 0.3, wy + wh); gg.addColorStop(0, '#7a8a90'); gg.addColorStop(1, '#3c474b'); g.fillStyle = gg; g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      rect(g, 'rgba(210,225,230,0.22)', wx + 6, wy + 4, ww * 0.18, wh - 8); rect(gr, '#3a3a3a', wx + 2, wy + 2, ww - 4, wh - 4); rect(gb, '#2a2a2a', wx + 2, wy + 2, ww - 4, wh - 4);
    } else for (let k = 0; k < 3; k++) { // 碎玻璃残片挂在窗角
      g.fillStyle = 'rgba(90,108,114,0.85)'; gr.fillStyle = '#404040';
      const cx = R() < 0.5 ? wx : wx + ww, cy = R() < 0.5 ? wy : wy + wh, s = 10 + R() * 26;
      for (const ctx of [g, gr]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (cx === wx ? s : -s), cy); ctx.lineTo(cx, cy + (cy === wy ? s * 1.4 : -s * 1.4)); ctx.fill(); }
    }
    // 窗框与竖梃
    const fr = 'rgba(70,72,70,0.9)', mul = style === 'grid' ? 3 : style === 'resi' ? 2 : 1;
    for (let k = 0; k <= mul; k++) { const xx = wx + k * ww / mul - 3; rect(g, fr, xx, wy, 6, wh); rect(gb, '#d8d8d8', xx, wy, 6, wh); }
    rect(g, fr, wx, wy - 3, ww, 6); rect(gb, '#d8d8d8', wx, wy - 3, ww, 6);
    if (style !== 'grid') { rect(g, 'rgba(225,220,208,0.9)', wx - 8, wy + wh, ww + 16, 8); rect(gb, '#e8e8e8', wx - 8, wy + wh, ww + 16, 8); } // 窗台
    if (style === 'brut') { rect(g, 'rgba(30,30,28,0.35)', wx, wy, ww, 10); rect(g, 'rgba(30,30,28,0.25)', wx, wy, 8, wh); } // 深窗洞的阴影
    // 窗下的锈水痕
    if (R() < 0.5) { const sx = wx + R() * ww, gl = g.createLinearGradient(0, wy + wh, 0, wy + wh + 40 + R() * 110); gl.addColorStop(0, 'rgba(112,74,44,0.32)'); gl.addColorStop(1, 'rgba(112,74,44,0)'); g.fillStyle = gl; g.fillRect(sx, wy + wh, 3 + R() * 9, 150); }
  }
  // 雨水冲刷的竖向条痕
  for (let i = 0; i < 140; i++) { const x = R() * S, y = R() * S, l = 80 + R() * 260, gl = g.createLinearGradient(0, y, 0, y + l); gl.addColorStop(0, 'rgba(62,58,48,0.2)'); gl.addColorStop(1, 'rgba(62,58,48,0)'); g.fillStyle = gl; g.fillRect(x, y, 2 + R() * 7, l); }
  // 裂缝
  for (let i = 0; i < 14; i++) {
    let x = R() * S, y = R() * S; g.strokeStyle = 'rgba(40,36,32,0.35)'; gb.strokeStyle = '#202020'; g.lineWidth = gb.lineWidth = 1.5;
    g.beginPath(); gb.beginPath(); g.moveTo(x, y); gb.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 40; y += 8 + R() * 26; g.lineTo(x, y); gb.lineTo(x, y); }
    g.stroke(); gb.stroke();
  }
  // 顶面、底面取 v≈0.03 处：在那附近铺一块干净的素墙
  rect(g, { grid: '#bdb8ad', resi: '#c6bfb1', brut: '#b0aba0' }[style], 0, S - 44, 64, 30);
  const T = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const map = T(c); map.colorSpace = THREE.SRGBColorSpace;
  return { map, bump: T(b), rough: T(r) };
}

/* 高楼的风化：墙根污渍、断口下方的雨痕、大片色斑（打破贴图重复）。aW = (离楼底的高度, 离这段墙顶的距离) */
function weatherMat(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec2 aW;\nvarying vec2 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;');
    sh.fragmentShader = `varying vec2 vW;
      float wh1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(wh1(i), wh1(i + vec2(1, 0)), f.x), mix(wh1(i + vec2(0, 1)), wh1(i + vec2(1, 1)), f.x), f.y); }
      ` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
      {
        vec2 u = vMapUv;
        float patchy = wn(u * vec2(1.3, 0.9) + 7.) * .6 + wn(u * 4.1) * .4;
        diffuseColor.rgb *= mix(.86, 1.06, patchy);
        float col = floor(u.x * 26.), hs = wh1(vec2(col, 3.7)), len = 4. + hs * 30.;
        float prof = sin(fract(u.x * 26.) * 3.1416);
        float streak = (1. - smoothstep(0., len, vW.y)) * step(.42, hs) * prof * (.6 + .4 * wn(vec2(u.x * 90., u.y * 2.)));
        diffuseColor.rgb *= 1. - .3 * streak;
        float grime = 1. - smoothstep(0., 10. + wn(u * 3.) * 8., vW.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.55, .6, .5), grime * .7);
      }
      #endif`);
  };
  return m;
}

/** 给每个顶点附上 aW（见 weatherMat）。base 是当前这栋楼的楼底高度 */
class WBuilder extends Builder {
  constructor() { super(); this.base = 0; }
  add(g, m, color, moss, mossTop, lit) {
    g = g.index ? g.toNonIndexed() : g;
    g.computeBoundingBox();
    const top = g.boundingBox.max.y, p = g.attributes.position, a = new Float32Array(p.count * 2), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); a[i * 2 + 1] = top - v.y; if (m) v.applyMatrix4(m); a[i * 2] = v.y - this.base; }
    super.add(g, m, color, moss, mossTop, lit);
    this.list[this.list.length - 1].setAttribute('aW', new THREE.BufferAttribute(a, 2));
  }
}

/* 窗户按 aLit 门槛逐户亮起 */
function litMat(m) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uLamp = U.uLamp;
    sh.vertexShader = 'attribute float aLit;\nvarying float vLit;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
    sh.fragmentShader = 'uniform float uLamp;\nvarying float vLit;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= smoothstep(vLit - 0.02, vLit + 0.02, uLamp);');
  };
  return m;
}
/* 树、灌木、草丛随风摆动（越高摆得越多，每棵相位不同） */
function swayMat() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
    sh.vertexShader = 'uniform float uTime, uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = instanceMatrix[3].xz;
      #else
        vec2 ip = vec2(0.);
      #endif
      float sw = max(position.y - 0.4, 0.) / 6.;
      float ph = uTime * (1.3 + uWind) + ip.x * .05 + ip.y * .07;
      transformed.x += (sin(ph) * .7 + sin(ph * 2.7) * .25) * uWind * sw;
      transformed.z += cos(ph * .8) * .45 * uWind * sw;`);
  };
  return m;
}

/* ---------- 树与灌木的单体几何 ---------- */
function treeGeo(kind) {
  const B = new Builder(), R = rng(kind === 'pine' ? 3 : 9);
  const trunk = new THREE.CylinderGeometry(0.22, 0.42, 3.2, 5); trunk.translate(0, 1.6, 0);
  B.add(trunk, null, C(0x6a5440));
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(2.6 - i * 0.6, 3.2, 7); g.translate(0, 3.6 + i * 1.7, 0); B.add(g, null, C(i ? 0x52703f : 0x4a6638)); }
  } else {
    const blob = (r, x, y, z, c) => { const g = new THREE.IcosahedronGeometry(r, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.82 + R() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); } g.translate(x, y, z); B.add(g, null, C(c)); };
    blob(2.4, 0, 4.4, 0, 0x6b8a45); blob(1.6, 1.3, 3.7, 0.6, 0x7c9a4c); blob(1.5, -1.1, 3.9, -0.8, 0x5f7f3f);
  }
  const m = B.build(null); const g = m.geometry; return g;
}
function grassGeo() {
  const B = new Builder();
  for (let i = 0; i < 5; i++) { const g = new THREE.ConeGeometry(0.12, 1.3, 3); g.translate(0, 0.65, 0); B.add(g, mat(Math.cos(i * 1.3) * 0.25, 0, Math.sin(i * 1.3) * 0.25, i, Math.cos(i * 2) * 0.3, Math.sin(i * 2) * 0.3), C(i % 2 ? 0x7d9a48 : 0x93a752)); }
  return B.build(null).geometry;
}
function bushGeo() {
  const g = new THREE.IcosahedronGeometry(1, 0); const B = new Builder(); B.add(g, null, C(0x6f8f45)); return B.build(null).geometry;
}

/* ================================================================= */
export function buildCity(scene, M) {
  const R = rng(20261125);
  const TB = Object.fromEntries(STYLES.map(k => [k, new WBuilder()]));
  const detail = new Builder(); // 阳台、楼顶水箱这类小零件：离得远时整块隐藏
  const house = new Builder(true), plain = new Builder(), leaf = new Builder(), metal = new Builder(), rock = new Builder(), glowB = new Builder();
  const footprints = [], trees = [], bushes = [], lamps = [], grass = [], tops = [], beacons = [];
  const v = new THREE.Vector3();
  const world = (m, x, y, z) => v.set(x, y, z).applyMatrix4(m).clone();

  /* ---------- 高楼的零件（精修） ---------- */
  const FL = 3.5, RUST = C(0x6b4a36), RAIL = C(0x4e4640);
  /** 从断口竖着戳出来的钢筋（base = 0 朝上，π 朝下） */
  function rebar(m, base, RD) {
    metal.box(0.12, RD.range(1, 3.6), 0.12, m.multiply(mat(0, 0, 0, 0, base + RD.range(-0.6, 0.6), RD.range(-0.6, 0.6))), RUST);
  }
  /** 从楼板边缘水平伸出、往下耷拉的钢筋。axis 是伸出的方向（'x' 或 'z'），s 是正负 */
  function rebarOut(m, axis, s, RD) {
    const t = Math.PI / 2 + RD.range(0.1, 0.9), len = RD.range(0.8, 2.6);
    const r = axis === 'x' ? mat(0, 0, 0, RD.range(-0.3, 0.3), 0, -s * t) : mat(0, 0, 0, RD.range(-0.3, 0.3), s * t, 0);
    metal.box(0.1, len, 0.1, m.multiply(r), RUST);
  }
  /** 撕开的楼角：每层楼板断在不同长度，边上伸出钢筋，偶尔有一块断板斜挂着 */
  function tornCorner(T, L, Mt, w, d, tint, RD) {
    const { a, b, sx, sz, cw, cd } = T, ix = sx * (w / 2 - cw), iz = sz * (d / 2 - cd);
    const slabC = tint.clone().multiplyScalar(0.68), inner = tint.clone().multiplyScalar(0.45);
    // 里面的隔墙和柱子（暗一些，像在阴影里）
    plain.box(0.3, b - a, cd * RD.range(0.5, 0.95), L(ix + sx * cw * RD.range(0.15, 0.45), a, iz + sz * cd * 0.45), inner);
    plain.box(0.8, b - a, 0.8, L(sx * (w / 2 - 0.6), a, sz * (d / 2 - 0.6)).multiply(mat(0, 0, 0, 0, RD.range(-0.03, 0.03), RD.range(-0.03, 0.03))), dark(tint));
    for (let y = a + FL; y <= b + 0.01; y += FL) {
      const isTop = y > b - 0.01;
      for (let k = 0; k < 2; k++) {
        const half = cd / 2, zc = iz + sz * cd * (0.25 + 0.5 * k), ext = isTop ? cw : cw * RD.range(0.25, 1);
        if (!isTop) plain.box(ext, 0.35, half - 0.05, L(ix + sx * ext / 2, y - 0.35, zc), slabC, { moss: 0.3, mossTop: 1 });
        else plain.box(cw, 0.35, half - 0.05, L(ix + sx * cw / 2, y - 0.35, zc), slabC); // 上面那段楼的底板
        if (isTop) continue;
        for (let r = 0; r < 3; r++) if (RD() < 0.75) rebarOut(L(ix + sx * ext, y - 0.18, zc + RD.range(-half / 2, half / 2)), 'x', sx, RD);
        if (ext < cw * 0.7 && RD() < 0.35) { // 断下来的一截，斜挂在断口
          const hl = RD.range(1.4, 3.2), tilt = RD.range(0.5, 1.3);
          plain.box(hl, 0.3, half * 0.8, L(ix + sx * ext, y - 0.35, zc).multiply(mat(0, 0, 0, 0, 0, -sx * tilt)).multiply(mat(sx * hl / 2, 0, 0)), slabC);
        }
        if (RD() < 0.25) bushes.push([world(Mt, ix + sx * ext * 0.4, y, zc), RD.range(0.7, 1.4)]);
      }
      // 沿 z 方向的楼板边也伸出钢筋
      for (let r = 0; r < 2; r++) if (!isTop && RD() < 0.6) rebarOut(L(ix + sx * cw * RD.range(0.1, 0.5), y - 0.18, sz * d / 2), 'z', sz, RD);
    }
    // 撕口下沿的碎块
    for (let i = 0; i < 4; i++) { const s = RD.range(0.5, 1.4); plain.box(s * 1.5, s, s, L(ix + sx * cw * RD.range(0.1, 0.8), a, iz + sz * cd * RD.range(0.1, 0.9)).multiply(mat(0, 0, 0, RD() * 3, RD.range(-0.4, 0.4), RD.range(-0.4, 0.4))), slabC, { moss: 0.6, mossTop: 1 }); }
  }
  const dark = t => t.clone().multiplyScalar(0.72);
  /** 某个高度、某段墙是不是被断层或撕口挖掉了 */
  function gone(F, face, lx, lz, y0, y1) {
    if (F.notch && y1 > F.notch[0] && y0 < F.notch[1]) return true;
    const T = F.tear; if (!T || y1 <= T.a || y0 >= T.b) return false;
    if (face === 'x') return Math.sign(lx) === T.sx && T.sz * lz > F.d / 2 - T.cd - 0.3;
    return Math.sign(lz) === T.sz && T.sx * lx > F.w / 2 - T.cw - 0.3;
  }
  /** 竖向的构件（肋、壁柱）在断层和撕口处断开 */
  function column(F, face, lx, lz, bw, bd, y0, y1, B, col) {
    const cuts = [];
    if (F.notch) cuts.push(F.notch);
    if (F.tear && gone(F, face, lx, lz, F.tear.a, F.tear.b)) cuts.push([F.tear.a, F.tear.b]);
    let y = y0;
    for (const [a, b] of cuts.sort((p, q) => p[0] - q[0])) { if (a > y) B.box(bw, a - y, bd, F.L(lx, y, lz), col); y = Math.max(y, b); }
    if (y1 > y) B.box(bw, y1 - y, bd, F.L(lx, y, lz), col);
  }
  /** 立面：办公楼的竖肋、住宅的阳台、粗野主义的遮阳板，以及所有楼的转角壁柱 */
  function facade(sty, F) {
    const { w, d, hMain, L, tint, TBs, RD } = F, tl = tint.clone().multiplyScalar(1.04);
    const faces = [['z', 1], ['z', -1], ['x', 1], ['x', -1]];
    if (sty !== 'grid') for (const cx of [-1, 1]) for (const cz of [-1, 1]) column(F, 'x', cx * (w / 2 - 0.3), cz * (d / 2 - 0.3), 1.1, 1.1, 0, hMain, TBs, tl);
    if (sty === 'grid') for (const [ax, sgn] of faces) {
      const span = ax === 'z' ? w : d, n = Math.max(2, Math.round(span / 4));
      for (let i = 1; i < n; i++) {
        const u = -span / 2 + span * i / n;
        const lx = ax === 'z' ? u : sgn * (w / 2 + 0.3), lz = ax === 'z' ? sgn * (d / 2 + 0.3) : u;
        column(F, ax, lx, lz, ax === 'z' ? 0.28 : 0.6, ax === 'z' ? 0.6 : 0.28, 0.6, hMain - 0.3, TBs, tl);
      }
    }
    if (sty === 'brut') for (let y = 4.5; y < hMain - 2; y += 7) {
      if (gone(F, 'x', 0, 0, y - 1, y + 1) || (F.tear && y > F.tear.a - 1 && y < F.tear.b + 1)) continue;
      TBs.box(w + 2.2, 0.45, d + 2.2, L(0, y, 0), dark(tint).multiplyScalar(1.15), { moss: 0.4, mossTop: 1 });
    }
    if (sty === 'resi' && !LOW && F.mode !== 'sunk') {
      const f0 = Math.floor(RD() * 4), use = [f0]; if (RD() < 0.55) use.push(f0 ^ 1);
      const railMetal = RD() < 0.4, slabC = tint.clone().multiplyScalar(0.9), parC = railMetal ? RAIL : tl;
      for (const fi of use) {
        const [ax, sgn] = faces[fi], span = ax === 'z' ? w : d, n = Math.max(2, Math.floor(span / 4.4)), sp = span / n, bw = sp - 0.8;
        for (let y = FL + 0.05; y < hMain - 2; y += FL) for (let i = 0; i < n; i++) {
          const u = -span / 2 + sp * (i + 0.5);
          const lx = ax === 'z' ? u : sgn * w / 2, lz = ax === 'z' ? sgn * d / 2 : u;
          if (gone(F, ax, lx, lz, y - 0.5, y + 1.2) || RD() < 0.14) continue;
          const hang = RD() < 0.05 ? RD.range(0.6, 1.3) : 0;
          const m = L(lx, y, lz).multiply(ax === 'z' ? mat(0, 0, 0, 0, sgn * hang, 0) : mat(0, 0, 0, 0, 0, -sgn * hang));
          const o = (ax === 'z') ? (dz => mat(0, 0, sgn * dz)) : (dx => mat(sgn * dx, 0, 0));
          const [sw, sd] = ax === 'z' ? [bw, 1.2] : [1.2, bw];
          detail.box(sw, 0.22, sd, m.clone().multiply(o(0.6)), slabC);
          if (RD() < 0.92) detail.box(ax === 'z' ? bw : 0.12, 0.95, ax === 'z' ? 0.12 : bw, m.clone().multiply(o(1.14)).multiply(mat(0, 0.22, 0)), parC);
          if (!hang && RD() < 0.08) bushes.push([world(F.Mt, lx + (ax === 'x' ? sgn * 0.6 : 0), y + 0.3, lz + (ax === 'z' ? sgn * 0.6 : 0)), RD.range(0.5, 0.9)]);
        }
      }
    }
  }
  /** 楼顶：完好的那几块屋面有一圈残破的女儿墙、水箱和空调外机；高出来的残段顶上竖着几片断墙 */
  function roofline(F) {
    const { w, d, hMain, exts, qs, L, tint, TBs, RD, opt } = F;
    qs.forEach(([qx, qz], k) => {
      const ox = qx * w / 4, oz = qz * d / 4, ext = exts[k];
      if (ext > 1) { // 残段顶上的断墙片
        for (let i = 0; i < 2; i++) if (RD() < 0.6) {
          const alongX = RD() < 0.5, fw = RD.range(1.5, Math.max(1.6, (alongX ? w : d) / 2 - 1)), fh = RD.range(1, 4.5);
          const m = alongX ? L(ox + RD.range(-1, 1), hMain + ext, qz * (d / 2 - 0.45)) : L(qx * (w / 2 - 0.45), hMain + ext, oz + RD.range(-1, 1));
          TBs.box(alongX ? fw : 0.4, fh, alongX ? 0.4 : fw, m.multiply(mat(0, 0, 0, 0, RD.range(-0.08, 0.08), RD.range(-0.1, 0.1))), tint, { ...opt, off: [opt.off[0], ((hMain + ext) / 14) % 1] });
        }
        return;
      }
      if (ext < 0 || F.mode === 'fallen') return;
      // 女儿墙：沿两条外沿，一段段的，有缺口
      for (const alongX of [true, false]) {
        const len = (alongX ? w : d) / 2;
        for (let s = 0; s < len - 0.5;) {
          const sl = Math.min(RD.range(1.5, 5), len - s);
          if (RD() < 0.72) {
            const p = alongX ? [qx * (s + sl / 2), qz * (d / 2 - 0.2)] : [qx * (w / 2 - 0.2), qz * (s + sl / 2)];
            TBs.box(alongX ? sl : 0.4, RD.range(0.6, 1.1), alongX ? 0.4 : sl, L(p[0], hMain, p[1]), tint);
          }
          s += sl;
        }
      }
      if (LOW) return;
      if (RD() < 0.4) { // 水箱
        const px = ox + RD.range(-1.5, 1.5), pz = oz + RD.range(-1.5, 1.5), m = L(px, hMain, pz), tc = RD() < 0.5 ? C(0x8a7a64) : C(0x6e5a4a);
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) detail.box(0.18, 1.3, 0.18, m.clone().multiply(mat(a * 1.1, 0, b * 1.1)), RAIL);
        detail.add(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 10).translate(0, 2.6, 0), m, tc);
        detail.add(new THREE.ConeGeometry(1.6, 0.6, 10).translate(0, 4.2, 0), m, tc);
      }
      for (let i = 0; i < 3; i++) if (RD() < 0.4) detail.box(1.1, 0.8, 0.7, L(ox + RD.range(-w / 5, w / 5), hMain, oz + RD.range(-d / 5, d / 5)).multiply(mat(0, 0, 0, RD() < 0.5 ? 0 : Math.PI / 2)), C(0x9a958a));
      if (RD() < 0.12) { // 天线
        const m = L(ox, hMain, oz); detail.box(0.25, RD.range(6, 12), 0.25, m.clone(), RAIL);
        detail.box(2.4, 0.12, 0.12, m.clone().multiply(mat(0, 4, 0)), RAIL);
      }
    });
  }

  /* ---------- 断裂高楼 ---------- */
  const CONC = [0xd8d2c4, 0xc9c3b5, 0xa9a69c, 0x9a978e, 0xb5aa96, 0x8f8a80, 0xc4b8a0, 0xbdb3a2].map(C);
  let towerNo = 0;
  function ruinTower(x, z, w, d, h, yaw, mode, baseY) {
    const y0 = baseY ?? ground(x, z) - 2;
    let rx = R.range(-0.025, 0.025), rz = R.range(-0.025, 0.025);
    if (mode === 'lean') { const a = R.range(0.1, 0.3) * (R() < 0.5 ? -1 : 1); if (R() < 0.5) rx = a; else rz = a; }
    if (mode === 'fallen') { rz = R.range(1.15, 1.38) * (R() < 0.5 ? -1 : 1); h = Math.min(h, 70); }
    if (mode === 'sunk') { rx = R.range(-0.3, 0.3); rz = R.range(-0.3, 0.3); }
    const Mt = mat(x, y0, z, yaw, rx, rz);
    const L = (lx, ly, lz) => Mt.clone().multiply(mat(lx, ly, lz));
    const tint = CONC[Math.floor(R() * CONC.length)].clone().multiplyScalar(R.range(0.86, 1.04));
    const dk = dark(tint);
    const opt = { tile: [16, 14], moss: mode === 'sunk' ? 0.2 : 0.55, mossTop: 1, off: [Math.floor(R() * 4) / 4, Math.floor(R() * 4) / 4] };
    // 精修用的随机数单独一条流，按楼的位置播种：v1 的布局（R 的取数顺序）一点不变
    const RD = rng(((Math.round(x * 13) * 73856093) ^ (Math.round(z * 17) * 19349663)) >>> 0 || 7);
    const sty = mode === 'sunk' ? 'brut' : STYLES[Math.floor(RD() * 3)], TBs = TB[sty];
    TBs.base = mode === 'sunk' ? 0 : y0 + 2; // 沉楼的「墙根污渍」落在水线上
    const body = (bw, bh, bd, lx, ly, lz) => { if (bh > 0.05) TBs.box(bw, bh, bd, L(lx, ly, lz), tint, { ...opt, off: [opt.off[0], (ly / 14) % 1] }); };
    const hMain = h * R.range(0.58, 0.86);
    let notch = null, tear = null;
    if (R() < 0.42 && hMain > 34) { const a = hMain * R.range(0.25, 0.55); notch = [a, a + R.range(7, 15)]; }
    // 楼角被撕开几层，露出一层层楼板和钢筋
    if (!notch && hMain > 30 && RD() < (mode === 'sunk' ? 0.3 : 0.45)) {
      const a = Math.max(FL * 2, Math.round(hMain * RD.range(0.2, 0.62) / FL) * FL);
      const b = Math.min(a + FL * Math.floor(RD.range(3, 9)), Math.floor((hMain - 3) / FL) * FL);
      if (b - a >= FL * 2) tear = { a, b, sx: RD() < 0.5 ? -1 : 1, sz: RD() < 0.5 ? -1 : 1, cw: w * RD.range(0.32, 0.55), cd: d * RD.range(0.32, 0.55) };
    }
    if (notch) {
      const [a, b] = notch, side = R() < 0.5 ? -1 : 1, kw = w * R.range(0.4, 0.6);
      body(w, a, d, 0, 0, 0);
      body(w - kw, b - a, d, side * kw / 2, a, 0);
      for (let i = 0; i < 4; i++) plain.box(0.7, b - a, 0.7, L(-side * (w / 2 - kw * (i + 0.5) / 4) * 0.98, a, R.range(-d / 2, d / 2) * 0.9), dk);
      for (let i = 0; i < 3; i++) plain.box(kw, 0.45, d * R.range(0.3, 0.9), L(-side * (w / 2 - kw / 2), a + (b - a) * (i + 1) / 4, 0), dk);
      body(w, hMain - b, d, 0, b, 0);
      bushes.push([world(Mt, -side * (w / 2 - kw / 2), a + 0.4, 0), R.range(1.2, 2.4)]);
      // 断层上下的楼板断口挂着钢筋
      for (const yy of [a, b]) for (let i = 0; i < 6; i++) rebar(L(-side * (w / 2 - kw * RD()), yy, RD.range(-d / 2, d / 2) * 0.9), yy === a ? 0 : Math.PI, RD);
    } else if (tear) {
      const { a, b, sx, cw } = tear;
      body(w, a, d, 0, 0, 0);
      body(w - cw, b - a, d, -sx * cw / 2, a, 0);
      body(cw, b - a, d - tear.cd, sx * (w / 2 - cw / 2), a, -tear.sz * tear.cd / 2);
      body(w, hMain - b, d, 0, b, 0);
      tornCorner(tear, L, Mt, w, d, tint, RD);
    } else body(w, hMain, d, 0, 0, 0);
    facade(sty, { w, d, hMain, notch, tear, L, Mt, tint, TBs, RD, mode });
    // 楼层腰线
    for (let y = 11; y < hMain - 3; y += 14) if (!notch || y < notch[0] || y > notch[1]) plain.box(w + 0.7, 0.55, d + 0.7, L(0, y, 0), dk, { moss: 0.3, mossTop: 0.9 });
    // 参差的残顶：四个象限各自断在不同高度
    const qs = [[-1, -1], [1, -1], [-1, 1], [1, 1]], exts = [];
    for (const [qx, qz] of qs) {
      if (R() < 0.22) { exts.push(-1); bushes.push([world(Mt, qx * w / 4, hMain + 0.4, qz * d / 4), R.range(1.5, 3)]); continue; }
      const ext = R() * (h - hMain), ox = qx * w / 4, oz = qz * d / 4;
      exts.push(ext);
      if (ext > 1) body(w / 2 - 0.25, ext, d / 2 - 0.25, ox, hMain, oz);
      const top = hMain + ext;
      if (R() < 0.6) plain.box(w / 2 + R.range(0, 3), 0.5, d / 2 * R.range(0.5, 1.1), L(ox + qx * R.range(0, 1.5), top - R.range(0, 3), oz), dk);
      for (let i = 0; i < 3; i++) if (R() < 0.6) { // 钢筋
        const rb = mat(0, 0, 0, 0, R.range(-0.5, 0.5), R.range(-0.5, 0.5));
        metal.box(0.18, R.range(1.5, 5), 0.18, L(ox + R.range(-w / 4, w / 4), top, oz + R.range(-d / 4, d / 4)).multiply(rb), C(0x6b4a36));
      }
      if (R() < 0.7) bushes.push([world(Mt, ox + R.range(-1, 1), top + 0.3, oz), R.range(1, 2.6)]);
      if (R() < 0.3 && mode !== 'fallen') trees.push([world(Mt, ox, top, oz), R.range(0.5, 0.9), 'oak']);
    }
    roofline({ w, d, hMain, exts, qs, L, Mt, tint, TBs, RD, opt, mode });
    // 垂落的藤蔓
    const nv = mode === 'sunk' ? 2 : Math.floor(R.range(3, 9));
    for (let i = 0; i < nv; i++) {
      const f = Math.floor(R() * 4), t = R.range(-0.45, 0.45), len = R.range(5, hMain * 0.65), vw = R.range(1, 3.2);
      const off = sty === 'grid' ? 0.75 : 0.2, top = hMain - 0.2, px = f < 2 ? (f ? 1 : -1) * (w / 2 + off) : t * w, pz = f >= 2 ? (f === 3 ? 1 : -1) * (d / 2 + off) : t * d;
      const vc = C(R() < 0.5 ? 0x4e6b34 : 0x63803d);
      // 一帘藤蔓：顶上一团厚的，下面是长短不一的几股
      leaf.box(f < 2 ? 0.5 : vw + 0.6, Math.min(len, RD.range(1.5, 3.5)), f < 2 ? vw + 0.6 : 0.5, L(px, top - Math.min(len, 2.5), pz), vc.clone().multiplyScalar(0.85));
      const ns = Math.max(2, Math.round(vw / 0.55));
      for (let k = 0; k < ns; k++) {
        const u = (k + 0.5) / ns - 0.5, sl = len * RD.range(0.3, 1), sw = RD.range(0.22, 0.5), sc = vc.clone().multiplyScalar(RD.range(0.75, 1.1));
        const sx = f < 2 ? px : px + u * vw, sz = f < 2 ? pz + u * vw : pz;
        leaf.box(f < 2 ? 0.3 : sw, sl, f < 2 ? sw : 0.3, L(sx, top - sl, sz), sc);
      }
    }
    // 楼下的碎块
    if (mode !== 'sunk') for (let i = 0; i < 8; i++) {
      const a = R() * Math.PI * 2, r = R.range(w * 0.6, w * 1.1), bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, s = R.range(0.6, 2.6);
      plain.box(s * R.range(1, 2.2), s, s * R.range(1, 1.8), mat(bx, ground(bx, bz) - s * 0.3, bz, R() * 6, R.range(-0.4, 0.4), R.range(-0.4, 0.4)), tint.clone().multiplyScalar(0.9), { moss: 0.5, mossTop: 1 });
    }
    if (mode !== 'fallen' && mode !== 'sunk') {
      footprints.push({ x, z, hx: w / 2 + 0.8, hz: d / 2 + 0.8, c: Math.cos(yaw), s: Math.sin(yaw), kind: 'ruin', no: ++towerNo, h: Math.round(h), tilt: Math.round(Math.max(Math.abs(rx), Math.abs(rz)) * 57.3), notch: !!notch, green: Math.round(30 + R() * 60) });
      if (h > 45) tops.push(world(Mt, 0, hMain + 0.5, 0));
      if (h > 95 && R() < 0.55) beacons.push(world(Mt, R.range(-w / 3, w / 3), h + 0.6, R.range(-d / 3, d / 3)));
    }
  }

  /* 废墟街区：微斜的街网 + 噪声控制的高度起伏 */
  const ang = 0.09, ca = Math.cos(ang), sa = Math.sin(ang);
  const hwBlock = (x, z, r) => distToCurve(HIGHWAY, x, z, 90) < r + 9;
  for (let gx = -560; gx <= 230; gx += 50) for (let gz = -340; gz <= 170; gz += 46) {
    const cx = gx * ca - gz * sa + R.range(-4, 4), cz = gx * sa + gz * ca + R.range(-4, 4);
    if (ruinMask(cx, cz) < 0.6) continue;
    if (Math.hypot(cx - FERRIS.x, cz - FERRIS.z) < 70 || Math.hypot(cx - PLAZA.x, cz - PLAZA.y) < 52) continue;
    const dC = Math.hypot(cx - RUIN_C.x, cz - RUIN_C.y), n = fbm(cx * 0.006 + 2, cz * 0.006, 3);
    const H = clamp(lerp(195, 30, smooth(0, 430, dC)) * (0.5 + n * 1.1), 14, 215);
    const lots = R() < 0.45 ? [[0, 0, R.range(22, 32), R.range(20, 30)]] : [[-9.5, 0, R.range(14, 17), R.range(18, 30)], [9.5, R.range(-4, 4), R.range(13, 17), R.range(16, 28)]];
    for (const [lx, lz, w, d] of lots) {
      const x = cx + lx * ca, z = cz + lx * sa + lz;
      if (hwBlock(x, z, Math.max(w, d) / 2)) { if (R() < 0.6) trees.push([new THREE.Vector3(x, ground(x, z), z), R.range(0.8, 1.3), 'oak']); continue; }
      if (R() < 0.07) { // 空地：长满树
        for (let i = 0; i < 6; i++) { const tx = x + R.range(-12, 12), tz = z + R.range(-12, 12); trees.push([new THREE.Vector3(tx, ground(tx, tz), tz), R.range(0.8, 1.5), 'oak']); }
        continue;
      }
      const r = R(), mode = r < 0.05 ? 'fallen' : r < 0.2 ? 'lean' : 'stand';
      ruinTower(x, z, w, d, H * R.range(0.7, 1.15), ang + R.range(-0.04, 0.04), mode);
    }
  }
  // 街道上的树、灌木和废弃车辆
  for (let i = 0; i < 16000; i++) {
    const x = R.range(-600, 240), z = R.range(-360, 170);
    if (ruinMask(x, z) < 0.5 || insideFoot(footprints, x, z, 1.5)) continue;
    const y = ground(x, z);
    if (i > 5000) { if (fbm(x * 0.04, z * 0.04, 2) > 0.42) grass.push([new THREE.Vector3(x, y - 0.1, z), R.range(0.8, 1.8)]); continue; }
    if (insideFoot(footprints, x, z, 3)) continue;
    if (R() < 0.38) trees.push([new THREE.Vector3(x, y, z), R.range(0.7, 1.4), 'oak']);
    else bushes.push([new THREE.Vector3(x, y, z), R.range(0.8, 2.2)]);
    if (R() < 0.04) car(x, y, z, R() * 6);
  }
  function car(x, y, z, yaw) {
    const c = R.pick([0x8a4b32, 0x5d6b6e, 0x9c8a5a, 0x6e3c30, 0x4a5a48]);
    const m = mat(x, y - 0.1, z, yaw, R.range(-0.1, 0.1), R.range(-0.12, 0.12));
    metal.box(2, 0.9, 4.2, m.clone().multiply(mat(0, 0.3, 0)), C(c));
    metal.box(1.8, 0.7, 2.2, m.clone().multiply(mat(0, 1.2, -0.2)), C(c).multiplyScalar(0.8));
  }

  /* 沉入海湾的楼群 */
  for (const [x, z, h] of [[-330, 290, 92], [-250, 350, 120], [-140, 300, 70], [-40, 380, 105], [-470, 250, 60], [60, 330, 64], [-190, 450, 140]]) {
    ruinTower(x, z, R.range(18, 26), R.range(18, 24), h, R() * 3, 'sunk', -32);
  }

  /* ---------- 高架残桥 ---------- */
  {
    const N = 320, segL = HIGHWAY.getLength() / N, deck = C(0xb9b3a6), side = C(0x9c978c);
    const inGap = t => HW_GAPS.some(([a, b]) => t > a && t < b);
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N; if (inGap(t)) continue;
      const p = HIGHWAY.getPointAt(t), tg = HIGHWAY.getTangentAt(t), yaw = Math.atan2(tg.x, tg.z), pitch = -Math.asin(tg.y);
      const m = mat(p.x, p.y - 1.4, p.z, yaw, pitch, 0);
      plain.box(13, 1.4, segL + 0.15, m, deck, { moss: 0.3, mossTop: 0.7 });
      for (const sx of [-6.3, 6.3]) if (R() < 0.9) plain.box(0.5, 1.1, segL + 0.1, m.clone().multiply(mat(sx, 1.4, 0)), side);
      if (R() < 0.08) bushes.push([world(m, R.range(-5, 5), 1.5, 0), R.range(1, 2)]);
      if (R() < 0.025) car(p.x + R.range(-3, 3), p.y, p.z, yaw + R.range(-0.4, 0.4));
      if (i % 11 === 0) { // 桥墩
        const gy = ground(p.x, p.z), hh = p.y - 1.4 - gy + 2;
        if (hh > 2) { plain.box(3.2, hh, 3.2, mat(p.x, gy - 2, p.z, yaw), side, { moss: 0.6 }); plain.box(11, 1.6, 3.4, mat(p.x, p.y - 3, p.z, yaw), side); }
      }
    }
    // 断口处垂落到地面的桥段
    for (const [a] of HW_GAPS) {
      const p0 = HIGHWAY.getPointAt(a + 0.004), tg = HIGHWAY.getTangentAt(a), dir = new THREE.Vector3(tg.x, 0, tg.z).normalize();
      const len = 36, p1 = p0.clone().addScaledVector(dir, len * 0.92); p1.y = ground(p1.x, p1.z);
      const mid = p0.clone().lerp(p1, 0.5), drop = Math.atan2(p0.y - p1.y, len * 0.92), yaw = Math.atan2(dir.x, dir.z);
      plain.box(13, 1.4, len, mat(mid.x, mid.y - 1.4, mid.z, yaw, drop, R.range(-0.08, 0.08)), deck, { moss: 0.6, mossTop: 1 });
    }
  }

  /* ---------- 锈蚀的摩天轮 ---------- */
  {
    const gy = ground(FERRIS.x, FERRIS.z), Rw = 34, hub = gy + Rw + 6;
    const base = mat(FERRIS.x, hub, FERRIS.z, 0.6, 0, 0.14);
    const rust = C(0x9a5a3a), rust2 = C(0x7d4a34);
    for (const oz of [-2.2, 2.2]) { const t = new THREE.TorusGeometry(Rw, 0.55, 6, 72); metal.add(t, base.clone().multiply(mat(0, 0, oz)), rust); const t2 = new THREE.TorusGeometry(Rw - 3, 0.3, 5, 72); metal.add(t2, base.clone().multiply(mat(0, 0, oz)), rust2); }
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2;
      for (const oz of [-2.2, 2.2]) metal.box(0.35, Rw, 0.35, base.clone().multiply(mat(0, 0, oz, 0, 0, a)), rust2);
      metal.box(0.3, 4.4, 0.3, base.clone().multiply(mat(Math.cos(a) * Rw, Math.sin(a) * Rw - 0, -2.2, 0, Math.PI / 2, 0)), rust2);
      if (R() < 0.72) { // 吊厢
        const gx = Math.cos(a) * Rw, gz = Math.sin(a) * Rw;
        const pm = base.clone().multiply(mat(gx, gz - 4.6, 0));
        metal.box(3.2, 3, 3.2, pm, C(R.pick([0xb8a070, 0x7c8d8a, 0xa86a52, 0xd0c8b0])));
        metal.box(3.6, 0.4, 3.6, pm.clone().multiply(mat(0, 3, 0)), rust);
      }
    }
    metal.add(new THREE.CylinderGeometry(1.6, 1.6, 7, 10).rotateX(Math.PI / 2), base, rust2);
    for (const oz of [-5, 5]) for (const s of [-1, 1]) {
      const legLen = (hub - gy + 1) / Math.cos(0.42);
      metal.box(1, legLen, 1, mat(FERRIS.x, 0, FERRIS.z, 0.6).multiply(mat(0, hub - FERRIS.y, oz)).multiply(mat(0, 0, 0, 0, 0, Math.PI + s * 0.42)), rust);
    }
    for (let i = 0; i < 8; i++) { const a = R() * 6.28, l = R.range(8, 22); leaf.box(1.4, l, 0.4, base.clone().multiply(mat(Math.cos(a) * Rw, Math.sin(a) * Rw - l, 2.6)), C(0x58753a)); }
    for (let i = 0; i < 20; i++) { const a = R() * 6.28, r = R.range(30, 60), x = FERRIS.x + Math.cos(a) * r, z = FERRIS.z + Math.sin(a) * r; trees.push([new THREE.Vector3(x, ground(x, z), z), R.range(0.8, 1.4), 'oak']); }
  }

  /* ---------- 雾港老城：沿台地层层叠起的小楼 ---------- */
  const WALL = [0xefe3cf, 0xe8d2c0, 0xf0dcb0, 0xd3dcdc, 0xe9e4da, 0xd8c3a5, 0xc9d4c3].map(C);
  const ROOF = [0xb5583b, 0xa14a33, 0x51606a, 0x4f7a6e, 0xc49a4a, 0x8d3f35].map(C);
  let houseNo = 0;
  function townHouse(x, z, w, d, h, yaw) {
    const gy = Math.min(ground(x - w / 2, z - d / 2), ground(x + w / 2, z + d / 2), ground(x + w / 2, z - d / 2), ground(x - w / 2, z + d / 2));
    const gyMax = Math.max(ground(x - w / 2, z - d / 2), ground(x + w / 2, z + d / 2), ground(x, z));
    if (gyMax - gy > 7 || distToCurve(HIGHWAY, x, z, 90) < 13) return false;
    const y0 = gy - 0.5, m = mat(x, y0, z, yaw), top = gyMax + h;
    const wall = WALL[Math.floor(R() * WALL.length)].clone().multiplyScalar(R.range(0.9, 1.03));
    const lit = R() * 0.95;
    house.box(w, top - y0, d, m, wall, { tile: [12, 12], off: [Math.floor(R() * 4) / 4, Math.floor(R() * 4) / 4], moss: 0.05, lit });
    plain.box(w + 0.3, gyMax - y0 + 0.7, d + 0.3, m, C(0x9c8f7c)); // 石砌基座
    const rh = R.range(2.6, 4.2), roof = ROOF[Math.floor(R() * ROOF.length)].clone().multiplyScalar(R.range(0.85, 1.05));
    const sh = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.5, 0), new THREE.Vector2(w / 2 + 0.5, 0), new THREE.Vector2(0, rh)]);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: d + 0.8, bevelEnabled: false }); rg.translate(0, 0, -d / 2 - 0.4);
    const turn = R() < 0.5 ? 0 : Math.PI / 2;
    plain.add(rg, mat(x, top - y0 + y0, z, yaw + turn, 0, 0, turn ? d / w : 1, 1, turn ? w / d : 1), roof);
    if (R() < 0.6) plain.box(0.9, rh + 1.2, 0.9, mat(x + R.range(-w / 3, w / 3), top, z + R.range(-d / 4, d / 4), yaw), C(0x8a6e5a));
    footprints.push({ x, z, hx: w / 2 + 0.5, hz: d / 2 + 0.5, c: Math.cos(yaw), s: Math.sin(yaw), kind: 'house', no: ++houseNo, floors: Math.max(2, Math.round(h / 3.4)), lit });
    return true;
  }
  for (let x = 262; x < 660; x += R.range(11, 15)) for (let z = -330; z < 170; z += R.range(10.5, 14)) {
    const s = shoreZ(x); if (z > s - 40) continue;
    if (x > 600 && z > s - 90) continue;
    const rowStreet = Math.floor((z + 330) / 52) !== Math.floor((z + 330 + 12) / 52);
    if (rowStreet) { if (R() < 0.5) lamps.push(new THREE.Vector3(x, ground(x, z) + 4.4, z)); continue; }
    if (Math.hypot(x - 450, z + 70) < 16) continue; // 钟楼广场
    if (R() < 0.12) { trees.push([new THREE.Vector3(x, ground(x, z), z), R.range(0.6, 1), 'oak']); continue; }
    const yaw = R.range(-0.08, 0.08) + (R() < 0.15 ? 0.5 : 0);
    const farther = smooth(-150, -330, z);
    townHouse(x + R.range(-1.5, 1.5), z + R.range(-1, 1), R.range(7.5, 10.5), R.range(7, 9.5), R.range(6.5, 15) * (1 - farther * 0.3), yaw);
  }
  // 钟楼
  {
    const x = 450, z = -70, gy = ground(x, z) - 1, m = mat(x, gy, z, 0.05);
    house.box(9, 36, 9, m, C(0xe6dcc8), { tile: [9, 9], lit: 0.05 });
    plain.box(10.4, 1.2, 10.4, m.clone().multiply(mat(0, 36, 0)), C(0x9c8f7c));
    plain.add(new THREE.ConeGeometry(7.4, 12, 4).rotateY(Math.PI / 4).translate(0, 6, 0), m.clone().multiply(mat(0, 37, 0)), C(0x4f7a6e));
    for (const [ox, oz, ry] of [[0, 4.6, 0], [0, -4.6, Math.PI], [4.6, 0, Math.PI / 2], [-4.6, 0, -Math.PI / 2]]) glowB.add(new THREE.CircleGeometry(2.6, 24), m.clone().multiply(mat(ox, 30, oz, ry)), C(0xffffff));
    footprints.push({ x, z, hx: 5, hz: 5, c: 1, s: 0, kind: 'clock' });
  }

  /* ---------- 码头：石砌岸墙、栈桥、仓库、起重机 ---------- */
  for (let x = 222; x < 612; x += 8) {
    const z = shoreZ(x) - 5, z2 = shoreZ(x + 8) - 5, yaw = Math.atan2(8, -(z2 - z)) - Math.PI / 2;
    plain.box(8.6, 7.6, 14, mat(x + 4, -5, (z + z2) / 2, -Math.atan2(z2 - z, 8)), C(0x9b9180), { moss: 0.15 });
    if (x % 24 < 8) lamps.push(new THREE.Vector3(x, 6.2, z - 4));
  }
  for (const px of [300, 360, 420, 500]) {
    const z0 = shoreZ(px) + 1, len = R.range(40, 70);
    plain.box(5, 0.6, len, mat(px, 2.2, z0 + len / 2), C(0x7a6248));
    for (let k = 0; k < len; k += 6) for (const sx of [-2.2, 2.2]) plain.box(0.5, 10, 0.5, mat(px + sx, -8, z0 + k + 2), C(0x5c4a38));
    lamps.push(new THREE.Vector3(px, 5.8, z0 + len - 2));
  }
  for (let i = 0; i < 6; i++) { // 仓库
    const x = 236 + i * 24, z = shoreZ(x) - 15, gy = ground(x, z) - 0.5;
    house.box(22, 9, 14, mat(x, gy, z, -0.05), C(R.pick([0xc9b8a0, 0xa8b4b0, 0xb89a80])), { tile: [24, 16], lit: 0.2 + R() * 0.7 });
    const sh = new THREE.Shape([new THREE.Vector2(-11.6, 0), new THREE.Vector2(11.6, 0), new THREE.Vector2(0, 3.2)]);
    plain.add(new THREE.ExtrudeGeometry(sh, { depth: 14.8, bevelEnabled: false }).translate(0, 0, -7.4), mat(x, gy + 9, z, -0.05), C(R.pick([0x8d3f35, 0x51606a, 0x4f6f78])));
    footprints.push({ x, z, hx: 11.5, hz: 7.5, c: 1, s: 0, kind: 'warehouse', no: i + 1 });
  }
  for (const [x, ry] of [[395, 0.3], [445, -0.2], [525, 0.5]]) { // 门式起重机
    const z = shoreZ(x) - 2, col = C(R.pick([0xb04a30, 0x3e6a73])), m = mat(x, 2, z, ry);
    for (const [lx, lz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) metal.box(0.9, 22, 0.9, m.clone().multiply(mat(lx, 0, lz)), col);
    metal.box(11, 1.4, 9.5, m.clone().multiply(mat(0, 22, 0)), col);
    metal.box(4, 3.5, 4, m.clone().multiply(mat(0, 23.4, -2)), C(0xe8e0d0));
    metal.box(1.4, 1.4, 48, m.clone().multiply(mat(0, 24.5, 8, 0, -0.18, 0)), col);
    metal.box(0.2, 12, 0.2, m.clone().multiply(mat(0, 16, 26)), C(0x333333));
  }
  /* 灯塔 */
  const LH = new THREE.Vector3(648, 0, shoreZ(648) - 22); LH.y = ground(LH.x, LH.z) - 1;
  {
    const m = mat(LH.x, LH.y, LH.z);
    for (let i = 0; i < 5; i++) plain.add(new THREE.CylinderGeometry(3.6 - (i + 1) * 0.36, 3.6 - i * 0.36, 6, 16).translate(0, 3 + i * 6, 0), m, C(i % 2 ? 0xb3402e : 0xf2ede4));
    plain.add(new THREE.CylinderGeometry(3.2, 3.2, 0.8, 16).translate(0, 30.4, 0), m, C(0x333a3c));
    glowB.add(new THREE.CylinderGeometry(1.6, 1.6, 3, 12).translate(0, 32.3, 0), m, C(0xffffff));
    plain.add(new THREE.ConeGeometry(2.4, 3, 12).translate(0, 35.3, 0), m, C(0xb3402e));
    house.box(8, 5, 6, mat(LH.x - 6, LH.y, LH.z + 2), C(0xf2ede4), { tile: [8, 8], lit: 0.1 });
  }
  /* 飞艇系留塔 */
  const MAST = new THREE.Vector3(585, 0, -185); MAST.y = ground(MAST.x, MAST.z) - 0.5;
  {
    const Hm = 46, m = mat(MAST.x, MAST.y, MAST.z), col = C(0x6e5a48);
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) metal.box(0.7, Hm, 0.7, m.clone().multiply(mat(lx * 0.9, 0, lz * 0.9, 0, -lz * 0.03, lx * 0.03)), col);
    for (let y = 6; y < Hm; y += 8) metal.box(6.4, 0.4, 6.4, m.clone().multiply(mat(0, y, 0)), col);
    plain.add(new THREE.CylinderGeometry(1.4, 2.6, 4, 10).translate(0, Hm + 2, 0), m, C(0xb3402e));
    lamps.push(new THREE.Vector3(MAST.x, MAST.y + Hm + 5, MAST.z));
    footprints.push({ x: MAST.x, z: MAST.z, hx: 3.5, hz: 3.5, c: 1, s: 0, kind: 'mast' });
    MAST.y += Hm + 4;
  }

  /* ---------- 电车线：沿着海岸从废墟一路开进雾港 ---------- */
  const STATIONS = [[0.04, '旧港西口'], [0.24, '断桥下'], [0.42, '摩天轮公园'], [0.58, '海湾大道'], [0.75, '雾港码头'], [0.88, '钟楼坡'], [0.97, '灯塔岬']];
  const stations = [];
  const tp = [];
  for (let x = -470; x <= 610; x += 30) { const z = shoreZ(x) - 30; tp.push(new THREE.Vector3(x, 0, z)); }
  const TRAM = new THREE.CatmullRomCurve3(tp);
  {
    const N = 300, pts = [];
    for (let i = 0; i <= N; i++) { const p = TRAM.getPointAt(i / N); p.y = ground(p.x, p.z) + 0.15; pts.push(p); }
    TRAM.points = pts; TRAM.updateArcLengths();
    const L = TRAM.getLength(), n = Math.floor(L / 3);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = TRAM.getPointAt(t), tg = TRAM.getTangentAt(t), yaw = Math.atan2(tg.x, tg.z), pitch = -Math.asin(tg.y);
      const m = mat(p.x, p.y - 0.2, p.z, yaw, pitch, 0);
      plain.box(3.4, 0.25, 3.1, m, C(0x7f776a));
      for (const sx of [-0.75, 0.75]) metal.box(0.14, 0.18, 3.1, m.clone().multiply(mat(sx, 0.25, 0)), C(0x6e6660));
      if (i % 9 === 0) {
        metal.box(0.22, 6.4, 0.22, m.clone().multiply(mat(2.4, 0, 0)), C(0x4a4a46));
        metal.box(2.6, 0.14, 0.14, m.clone().multiply(mat(1.2, 5.9, 0)), C(0x4a4a46));
        if (i % 18 === 0) lamps.push(world(m, 2.4, 6.6, 0));
      }
      metal.box(0.05, 0.05, 3.1, m.clone().multiply(mat(0, 5.85, 0)), C(0x222222));
    }
    for (const [u, name] of STATIONS) { // 站台与雨棚
      const p = TRAM.getPointAt(u), tg = TRAM.getTangentAt(u), yaw = Math.atan2(tg.x, tg.z), m = mat(p.x, p.y - 0.4, p.z, yaw);
      plain.box(3, 0.8, 22, m.clone().multiply(mat(-3.3, 0, 0)), C(0xa89c88));
      for (const lz of [-8, 0, 8]) metal.box(0.2, 3.4, 0.2, m.clone().multiply(mat(-4.4, 0.8, lz)), C(0x3e4a48));
      plain.box(3.6, 0.2, 20, m.clone().multiply(mat(-3.4, 4.2, 0, 0, 0, -0.12)), C(0x4f7a6e));
      lamps.push(world(m, -3.3, 3.8, 9));
      stations.push({ u, name, pos: world(m, -3.3, 0.8, 0), side: new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw)), along: new THREE.Vector3(tg.x, 0, tg.z).normalize() });
    }
  }

  /* ---------- 白塔：远山上的断裂巨塔 ---------- */
  const towerGroup = new THREE.Group(); scene.add(towerGroup);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(120, 1.4, 8, 200), M.ring), ringB = new THREE.Mesh(new THREE.TorusGeometry(84, 0.8, 6, 160), M.ring);
  const shards = new THREE.Group();
  {
    TOWER.y = ground(TOWER.x, TOWER.z) - 4;
    const H = 600, seg = 8, white = new THREE.Group();
    for (let i = 0; i < seg; i++) {
      const r0 = lerp(46, 22, i / seg), r1 = lerp(46, 22, (i + 1) / seg), hh = H / seg;
      const g = new THREE.CylinderGeometry(r1, r0, hh - 1.5, 6, 1, true);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 6, uv.getY(k) * hh / 64);
      const m = new THREE.Mesh(g, M.white); m.position.y = i * hh + hh / 2; white.add(m);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(r1 + 1.5, r1 + 1.5, 1.6, 6), M.white); collar.position.y = (i + 1) * hh - 0.8; white.add(collar);
    }
    white.position.copy(TOWER); towerGroup.add(white);
    white.traverse(o => { o.castShadow = false; o.receiveShadow = true; });
    // 断顶碎块
    for (let i = 0; i < 9; i++) {
      const s = R.range(6, 18), g = new THREE.CylinderGeometry(s * 0.8, s, s * R.range(1.2, 2.6), 6);
      const m = new THREE.Mesh(g, M.white);
      const a = i / 9 * Math.PI * 2, r = R.range(10, 40);
      m.position.set(Math.cos(a) * r, R.range(30, 130), Math.sin(a) * r); m.rotation.set(R() * 3, R() * 3, R() * 3);
      m.userData.spin = R.range(-0.2, 0.2); shards.add(m);
    }
    shards.position.set(TOWER.x, TOWER.y + H, TOWER.z); towerGroup.add(shards);
    ringA.position.set(TOWER.x, TOWER.y + H - 60, TOWER.z); ringA.rotation.x = Math.PI / 2 + 0.22;
    ringB.position.set(TOWER.x, TOWER.y + H + 70, TOWER.z); ringB.rotation.x = Math.PI / 2 - 0.3;
    towerGroup.add(ringA, ringB);
  }

  /* ---------- 浮空岛 ---------- */
  const islands = [];
  const falls = [];
  const fallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 } },
    vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime,uBright; varying vec2 vU;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ float s=n(vec2(vU.x*14., vU.y*40.+uTime*3.2))*.6+n(vec2(vU.x*30., vU.y*90.+uTime*5.))*.4;
        float edge=smoothstep(0.,.25,vU.x)*smoothstep(1.,.75,vU.x); float fade=smoothstep(0.,.55,vU.y);
        float spread=mix(1.,.4,1.-vU.y);
        gl_FragColor=vec4(vec3(.92,.97,1.)*uBright, (.25+.6*s)*edge*fade*spread); }`
  });
  function island(cx, cy, cz, r, opts = {}) {
    const g = new THREE.Group(); g.position.set(cx, cy, cz);
    const RB = new Builder(), LB = new Builder(), SB = new WBuilder(); SB.base = -1000;
    const hgt = r * R.range(1.3, 1.9), cone = new THREE.ConeGeometry(r, hgt, 14, 7); cone.rotateX(Math.PI); cone.translate(0, -hgt / 2, 0);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = fbm(x * 0.08 + cx, z * 0.08 + y * 0.05, 3);
      const k = 0.75 + n * 0.55; p.setXYZ(i, x * k, y * (0.9 + n * 0.2), z * k);
    }
    RB.add(cone, null, C(0x8b7f6e));
    const cgeo = RB.list[RB.list.length - 1], cg = cgeo.attributes.color; for (let i = 0; i < cg.count; i++) { const y = cgeo.attributes.position.getY(i); const t = smooth(-3, -hgt * 0.6, y); cg.setXYZ(i, lerp(0.42, 0.55, t), lerp(0.38, 0.52, t), lerp(0.28, 0.48, t)); }
    const top = new THREE.CylinderGeometry(r * 0.98, r * 0.9, 2.4, 14, 1); top.translate(0, -0.6, 0); RB.add(top, null, C(0x7d9a4d));
    // 顶上的废墟：残柱、拱门、半截小楼
    const ncol = Math.floor(r / 4);
    for (let i = 0; i < ncol; i++) {
      const a = i / ncol * Math.PI * 2, rr = r * 0.55, hh = R() < 0.3 ? R.range(1, 3) : R.range(5, 11);
      SB.add(new THREE.CylinderGeometry(0.8, 0.9, hh, 8).translate(0, hh / 2, 0), mat(Math.cos(a) * rr, 0.6, Math.sin(a) * rr), C(0xe2dccf), 0.4, 1);
    }
    if (r > 20) {
      SB.box(2, 12, 2, mat(-5, 0.5, 0), C(0xe2dccf), { moss: 0.4, mossTop: 1 }); SB.box(2, 12, 2, mat(5, 0.5, 0), C(0xe2dccf), { moss: 0.4, mossTop: 1 }); SB.box(13, 2.2, 2.4, mat(0, 12.5, 0), C(0xe2dccf), { mossTop: 1 });
      SB.box(9, 16, 8, mat(r * 0.3, 0, -r * 0.35, 0.4, 0.05, 0), C(0xcfc6b3), { moss: 0.6, mossTop: 1 });
    }
    const nt = Math.floor(r * 0.5);
    for (let i = 0; i < nt; i++) { const a = R() * 6.28, rr = Math.sqrt(R()) * r * 0.8; trees.push([null, R.range(0.6, 1.2), 'oak', g, new THREE.Vector3(Math.cos(a) * rr, 0.4, Math.sin(a) * rr)]); }
    // 垂根
    for (let i = 0; i < r * 0.6; i++) { const a = R() * 6.28, l = R.range(4, r * 0.8); LB.box(0.4, l, 0.4, mat(Math.cos(a) * r * 0.85, -l - 1, Math.sin(a) * r * 0.85), C(0x5a6b3a)); }
    for (const [B, m] of [[RB, M.rock], [LB, M.leaf], [SB, M.tower]]) { const mesh = B.build(m); if (mesh) g.add(mesh); }
    if (opts.fall) {
      const fh = opts.fall, a = R() * 6.28;
      const fg = new THREE.PlaneGeometry(r * 0.22, fh, 1, 1); fg.translate(0, -fh / 2, 0);
      const fm = new THREE.Mesh(fg, fallMat); fm.position.set(Math.cos(a) * r * 0.92, 0.6, Math.sin(a) * r * 0.92); fm.rotation.y = -a + Math.PI / 2;
      fm.renderOrder = 3; g.add(fm); falls.push(fm);
    }
    const crys = [];
    for (let i = 0; i < (opts.crystals ?? 4); i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), M.crystal); const s = R.range(1.2, 3.2);
      c.scale.set(s * 0.6, s * 1.6, s * 0.6); const a = R() * 6.28;
      c.userData = { a, r: r * R.range(0.9, 1.4), y: R.range(-hgt * 0.4, 6), sp: R.range(0.1, 0.3) * (R() < 0.5 ? -1 : 1) };
      g.add(c); crys.push(c);
    }
    g.userData = { base: cy, ph: R() * 6.28, crys, spin: R.range(-0.01, 0.01) };
    scene.add(g); islands.push(g);
    return g;
  }
  island(PLAZA.x, 150, PLAZA.y, 48, { fall: 148, crystals: 8 });
  island(-60, 215, -230, 22, { crystals: 3 });
  island(-330, 190, -170, 28, { fall: 186, crystals: 4 });
  island(70, 125, 30, 15, { crystals: 2 });
  island(-260, 108, 20, 11, { crystals: 2 });
  island(120, 245, -300, 30, { crystals: 5 });
  island(-470, 230, -320, 18, { crystals: 3 });
  // 浮空岛下方的水潭
  {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(26, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f6a6c, roughness: 0.15, metalness: 0.3 }));
    pool.position.set(PLAZA.x, ground(PLAZA.x, PLAZA.y) + 0.15, PLAZA.y); pool.receiveShadow = true; scene.add(pool);
    for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28, x = PLAZA.x + Math.cos(a) * 30, z = PLAZA.y + Math.sin(a) * 30; plain.box(R.range(2, 4), R.range(0.6, 3), R.range(2, 4), mat(x, ground(x, z) - 0.5, z, a, R.range(-0.3, 0.3), 0), C(0xc8c0b0), { moss: 0.8, mossTop: 1 }); }
  }

  /* ---------- 自然：山林、海岸、街边 ---------- */
  for (let i = 0; i < 9000; i++) {
    const x = R.range(-1000, 1100), z = R.range(-1100, 260), y = ground(x, z);
    if (y < 3 || y > 250 || ruinMask(x, z) > 0.2) continue;
    const town = x > 250 && x < 680 && z > -340 && z < 200;
    const n = fbm(x * 0.006 + 30, z * 0.006, 3);
    if (town ? R() > 0.05 : n < 0.42 && R() > 0.25) continue;
    if (insideFoot(footprints, x, z, 2)) continue;
    const e = 4, sl = Math.abs(ground(x + e, z) - ground(x - e, z)) + Math.abs(ground(x, z + e) - ground(x, z - e));
    if (sl > 9) continue;
    trees.push([new THREE.Vector3(x, y - 0.3, z), R.range(0.8, 1.7) * (y > 120 ? 1.2 : 1), y > 90 || R() < 0.25 ? 'pine' : 'oak']);
  }

  for (const p of lamps) { const gy = ground(p.x, p.z); if (p.y - gy > 1.5) metal.box(0.22, p.y - gy, 0.22, mat(p.x, gy - 0.2, p.z), C(0x3e3d3a)); }

  /* ---------- 组装 ---------- */
  const add = (b, m, o) => { const mesh = b.build(m, o); if (mesh) scene.add(mesh); return mesh; };
  add(TB.grid, M.tower); add(TB.resi, M.towerResi); add(TB.brut, M.towerBrut);
  const detailMesh = add(detail, M.plain);
  add(house, M.house); add(plain, M.plain); add(leaf, M.leaf); add(metal, M.metal); add(rock, M.rock);
  add(glowB, M.glow, { cast: false, receive: false });

  // 树（实例化；浮空岛上的树挂到岛的组里）
  const tg = { oak: treeGeo('oak'), pine: treeGeo('pine') }, dummy = new THREE.Object3D(), tc = new THREE.Color();
  for (const kind of ['oak', 'pine']) {
    const list = trees.filter(t => t[2] === kind && !t[3]);
    const im = new THREE.InstancedMesh(tg[kind], M.tree, list.length);
    list.forEach((t, i) => { dummy.position.copy(t[0]); dummy.rotation.set(0, R() * 6.28, 0); dummy.scale.setScalar(t[1]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tc.setHSL(0.22 + R.range(-0.04, 0.05), 0.35, R.range(0.42, 0.6)).multiplyScalar(1.9)); });
    im.userData.flora = true; im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  }
  for (const t of trees.filter(t => t[3])) { const m = new THREE.Mesh(tg.oak, M.tree); m.position.copy(t[4]); m.scale.setScalar(t[1]); m.castShadow = true; t[3].add(m); }
  {
    const im = new THREE.InstancedMesh(bushGeo(), M.tree, bushes.length);
    bushes.forEach(([p, s], i) => { dummy.position.copy(p); dummy.rotation.set(R(), R() * 6, R()); dummy.scale.set(s * R.range(1, 1.6), s * R.range(0.6, 1), s * R.range(1, 1.6)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tc.setHSL(0.23 + R.range(-0.05, 0.04), 0.4, R.range(0.38, 0.55)).multiplyScalar(1.6)); });
    im.userData.flora = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }
  {
    const im = new THREE.InstancedMesh(grassGeo(), M.tree, grass.length);
    grass.forEach(([p, s], i) => { dummy.position.copy(p); dummy.rotation.set(0, R() * 6, 0); dummy.scale.set(s, s * R.range(0.7, 1.3), s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tc.setHSL(0.2 + R.range(-0.03, 0.05), 0.4, R.range(0.45, 0.62)).multiplyScalar(1.5)); });
    im.userData.flora = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }
  // 路灯：天黑后一盏一盏亮起来
  const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), M.lamp, lamps.length);
  const lampTh = lamps.map(() => R.range(0.05, 0.6));
  lamps.forEach((p, i) => { dummy.position.copy(p); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); lampMesh.setMatrixAt(i, dummy.matrix); lampMesh.setColorAt(i, tc.setRGB(1, 1, 1)); });
  lampMesh.userData.noPick = true; scene.add(lampMesh);
  // 废墟楼顶仍在闪的航空障碍灯
  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 6), M.beacon, beacons.length);
  const beaconPh = beacons.map(() => R() * 6.28);
  beacons.forEach((p, i) => { dummy.position.copy(p); dummy.scale.setScalar(1); dummy.updateMatrix(); beaconMesh.setMatrixAt(i, dummy.matrix); });
  beaconMesh.userData.noPick = true; scene.add(beaconMesh);
  // 灯塔光束
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOp: { value: 0 } },
    vertexShader: `varying float vV, vF; void main(){ vV = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.); vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOp; varying float vV, vF; void main(){ float a = pow(vV, 2.2) * pow(vF, 2.) * uOp; gl_FragColor = vec4(vec3(1., .94, .78) * a, a); }`
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 160, 24, 1, true).translate(0, -80, 0).rotateZ(Math.PI / 2), beamMat);
  const beamPivot = new THREE.Group(); beamPivot.position.set(LH.x, LH.y + 32.3, LH.z); beamPivot.add(beam); beamPivot.userData.noPick = true; scene.add(beamPivot);
  const beam2 = beam.clone(); beam2.rotation.y = Math.PI; beamPivot.add(beam2);

  const lampCol = new THREE.Color();
  return {
    footprints, detail: detailMesh, tram: TRAM, highway: HIGHWAY, lighthouse: LH, islands, stations, tops, mast: MAST,
    update(t, env) {
      const L = clamp(env.lamp, 0, 1);
      U.uTime.value = t; U.uLamp.value = L * 1.02;
      M.lamp.color.setRGB(1, 1, 1);
      for (let i = 0; i < lamps.length; i++) {
        const on = smooth(lampTh[i], lampTh[i] + 0.04, L);
        lampMesh.setColorAt(i, lampCol.setRGB(0.55 + 2.1 * on, 0.47 + 1.5 * on, 0.36 + 0.8 * on));
      }
      lampMesh.instanceColor.needsUpdate = true;
      const bOn = env.night > 0.3 || env.wx.fog > 0.5;
      for (let i = 0; i < beacons.length; i++) {
        const on = bOn && Math.sin(t * 2.2 + beaconPh[i]) > 0.55; dummy.position.copy(beacons[i]); dummy.scale.setScalar(on ? 1 : 0.001); dummy.updateMatrix(); beaconMesh.setMatrixAt(i, dummy.matrix);
      }
      beaconMesh.instanceMatrix.needsUpdate = true;
      M.glow.color.setRGB(0.9 + 1.6 * L, 0.8 + 1.0 * L, 0.6 + 0.5 * L);
      M.white.emissiveIntensity = 0.12 + 0.9 * env.night;
      M.crystal.color.setRGB(0.7 + 0.4 * env.night, 1.9 + 0.8 * env.night, 2.3 + 0.8 * env.night);
      M.ring.opacity = 0.45 + 0.4 * env.night;
      beamMat.uniforms.uOp.value = 0.5 * L * (0.6 + env.wx.fog * 0.8); beamPivot.rotation.y = t * 0.6; beamPivot.visible = L > 0.05;
      ringA.rotation.z = t * 0.03; ringB.rotation.z = -t * 0.05;
      shards.rotation.y = t * 0.02; shards.children.forEach(s => { s.rotation.x += s.userData.spin * 0.01; s.rotation.y += s.userData.spin * 0.013; });
      fallMat.uniforms.uTime.value = t; fallMat.uniforms.uBright.value = 0.35 + 0.65 * (1 - env.night * 0.7);
      for (const g of islands) {
        const u = g.userData; g.position.y = u.base + Math.sin(t * 0.25 + u.ph) * 2.2; g.rotation.y += u.spin * 0.016;
        for (const c of u.crys) { const d = c.userData, a = d.a + t * d.sp; c.position.set(Math.cos(a) * d.r, d.y + Math.sin(t * 0.8 + d.a) * 1.5, Math.sin(a) * d.r); c.rotation.y = t * 0.5 + d.a; }
      }
    }
  };
}

export function insideFoot(fp, x, z, pad = 0) {
  for (let i = 0; i < fp.length; i++) {
    const f = fp[i], dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx) > f.hx + f.hz + pad) continue;
    const a = dx * f.c - dz * f.s, b = dx * f.s + dz * f.c;
    if (Math.abs(a) < f.hx + pad && Math.abs(b) < f.hz + pad) return f;
  }
  return null;
}
