// 通用工具：随机数、噪声、几何合并构建器、程序化纹理
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function rng(seed) {
  let s = Math.floor(seed) % 2147483647; if (s <= 0) s += 2147483646;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  r.range = (a, b) => a + (b - a) * r();
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  return r;
}

// —— 值噪声 + 分形 ——
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
export function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return lerp(lerp(hash(i, j), hash(i + 1, j), su), lerp(hash(i, j + 1), hash(i + 1, j + 1), su), sv);
}
export function fbm(x, y, o = 4) { let a = 0.5, f = 1, s = 0, n = 0; for (let k = 0; k < o; k++) { s += a * noise(x * f + k * 17.3, y * f - k * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }

// —— 矩阵 ——
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// —— 合并构建器：所有几何体统一成非索引 + position/normal/uv/color ——
const MOSS = new THREE.Color(0x5d7a3a), MOSS2 = new THREE.Color(0x7d8f4a);
export class Builder {
  /** lit=true 时每个部件带一个 aLit 属性（0..1，决定夜里第几批亮灯） */
  constructor(lit = false) { this.list = []; this.lit = lit; }
  /** 底面在 y=0 的方盒。opt.tile=[u米,v米] 时按尺寸铺窗；opt.moss 0..1 苔藓量；opt.off 随机 UV 偏移 */
  box(w, h, d, m, color, opt = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const ou = opt.off ? opt.off[0] : 0, ov = opt.off ? opt.off[1] : 0;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (opt.tile && f !== 2 && f !== 3) uv.setXY(i, uv.getX(i) * dims[f][0] / opt.tile[0] + ou, uv.getY(i) * dims[f][1] / opt.tile[1] + ov);
      else uv.setXY(i, 0.03, 0.03); // 顶/底面取纹理中的素墙区域
    }
    g.translate(0, h / 2, 0);
    this.add(g, m, color, opt.moss || 0, opt.mossTop, opt.lit);
  }
  add(g, m, color, moss = 0, mossTop = 0, lit = 2) {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2).fill(0.03), 2));
    if (m) g.applyMatrix4(m);
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
    const col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.copy(color);
      if (moss > 0 || mossTop > 0) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const nn = fbm(x * 0.05 + y * 0.03, z * 0.05 - y * 0.02, 3);
        let f = moss * smooth(0.45, 0.7, nn) * (0.6 + 0.4 * smooth(30, 0, y));
        if (nor.getY(i) > 0.7) f = Math.max(f, mossTop * smooth(0.3, 0.55, nn));
        c.lerp(nn > 0.5 ? MOSS : MOSS2, clamp(f, 0, 0.85));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.lit) g.setAttribute('aLit', new THREE.BufferAttribute(new Float32Array(n).fill(lit ?? 2), 1));
    this.list.push(g);
  }
  build(material, { cast = true, receive = true } = {}) {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    this.list.forEach(x => x.dispose()); this.list = [];
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    return mesh;
  }
}

// —— 程序化纹理 ——
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

/** 4×4 扇窗的墙面贴图；variant: 'tower' 混凝土高楼 / 'house' 雾港灰泥小楼 */
export function wallTextures(variant, seed) {
  const R = rng(seed), S = 512, cell = S / 4;
  const [c, g] = canvas(S, S), [e, ge] = canvas(S, S);
  const tower = variant === 'tower';
  g.fillStyle = tower ? '#d9d5cb' : '#efe7d8'; g.fillRect(0, 0, S, S);
  // 斑驳与雨痕
  for (let i = 0; i < 1600; i++) { const a = R() * 0.08; g.fillStyle = `rgba(${R() < 0.5 ? '60,55,45' : '255,250,240'},${a})`; g.fillRect(R() * S, R() * S, 2 + R() * 10, 2 + R() * 10); }
  for (let i = 0; i < (tower ? 70 : 25); i++) { const x = R() * S, y = R() * S; const gr = g.createLinearGradient(0, y, 0, y + 60 + R() * 120); gr.addColorStop(0, 'rgba(70,64,52,0.22)'); gr.addColorStop(1, 'rgba(70,64,52,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + R() * 6, 180); }
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x0 = i * cell, y0 = j * cell;
    // 楼板线
    g.fillStyle = tower ? 'rgba(90,86,76,0.35)' : 'rgba(120,100,80,0.25)'; g.fillRect(x0, y0 + cell - 6, cell, 6);
    const ww = tower ? cell * 0.62 : cell * 0.36, wh = tower ? cell * 0.5 : cell * 0.48;
    const wx = x0 + (cell - ww) / 2, wy = y0 + cell * 0.18;
    const broken = tower && R() < 0.35;
    g.fillStyle = broken ? '#1b1d1f' : tower ? '#3a4247' : '#3d3a36'; g.fillRect(wx, wy, ww, wh);
    if (!broken) { g.fillStyle = 'rgba(180,200,210,0.18)'; g.fillRect(wx + 3, wy + 3, ww * 0.4, wh - 6); }
    if (!tower) { g.fillStyle = '#7b5a3c'; g.fillRect(wx - 4, wy + wh, ww + 8, 6); g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); }
    else { g.fillStyle = 'rgba(40,40,40,0.5)'; g.fillRect(wx + ww / 3, wy, 2, wh); g.fillRect(wx + 2 * ww / 3, wy, 2, wh); }
    if (!tower && R() < 0.55) { ge.fillStyle = R() < 0.7 ? '#ffbe6e' : '#ffe0a8'; ge.fillRect(wx, wy, ww, wh); }
  }
  const map = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e);
  for (const t of [map, em]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace; em.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap: em };
}

/** 柔和圆点精灵（粒子用） */
export function dotTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
