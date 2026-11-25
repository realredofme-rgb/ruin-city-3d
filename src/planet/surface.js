// 星球地表：把 42 块地块各自的高度场拼成一张连续的球面，交界处做自然过渡，然后生成整颗星球的地形网格。
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, noise3, fbm3 } from './sphere.js';
import { FILLERS, PAL } from './biomes.js';
import { seamType } from './tiles.js';
import { smooth, clamp } from '../util.js';

const W = 360;
const WET = new Set(['ocean', 'sky-isles']);       // 地块之间高度混合的半宽（米）
const WARP = 0.032;  // 交界线的扰动（弧度，约 250 米），让分界不是直线
const _w = new THREE.Vector3(), _l = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();

export class Surface {
  constructor(tiles) {
    this.tiles = tiles;
    this.seams = new Map();
    for (const a of tiles) for (const j of a.n) { const b = tiles[j]; this.seams.set(a.id * 64 + b.id, seamType(a, b)); }
    this.cand = []; this.dist = new Float64Array(8); this.wt = new Float64Array(8);
    this.cores = tiles.filter(t => t.module); // 所有模块的中心区都不让海岸线噪声侵入
  }
  fieldOf(t) { return t.module || FILLERS[t.kind]; }
  /** 找到最近的地块与权重，写进 this.cand / this.wt；返回最近地块 */
  weigh(d) {
    _w.set(d.x + WARP * (noise3(d.x * 3.1 + 5, d.y * 3.1, d.z * 3.1) - 0.5) * 2,
      d.y + WARP * (noise3(d.x * 3.1, d.y * 3.1 + 7, d.z * 3.1) - 0.5) * 2,
      d.z + WARP * (noise3(d.x * 3.1, d.y * 3.1, d.z * 3.1 + 9) - 0.5) * 2).normalize();
    let best = null, bd = -2;
    for (const t of this.tiles) { const k = t.c.dot(_w); if (k > bd) { bd = k; best = t; } }
    const cand = this.cand; cand.length = 0; cand.push(best); for (const j of best.n) cand.push(this.tiles[j]);
    let d0 = 1e9, wet = 0;
    for (let i = 0; i < cand.length; i++) { this.dist[i] = Math.acos(clamp(cand[i].c.dot(_w), -1, 1)) * R; if (WET.has(cand[i].kind)) wet++; }
    // 海岸线：陆地与海洋之间的分界按噪声前后推移 ±800 米，免得陆地是规整的六边形（模块核心区附近不动）
    if (wet && wet < cand.length) {
      let prot = 1; for (const t of this.cores) prot = Math.min(prot, smooth(1650, 2000, Math.acos(clamp(t.c.dot(d), -1, 1)) * R));
      const off = ((fbm3(d.x * 5.5 + 3, d.y * 5.5, d.z * 5.5 - 2, 3) - 0.5) * 2600 + (fbm3(d.x * 24, d.y * 24 + 5, d.z * 24, 2) - 0.5) * 600) * prot;
      for (let i = 0; i < cand.length; i++) if (WET.has(cand[i].kind)) this.dist[i] += off;
    }
    for (let i = 0; i < cand.length; i++) d0 = Math.min(d0, this.dist[i]);
    for (let i = 0; i < cand.length; i++) { const w = Math.max(0, 1 - (this.dist[i] - d0) / (2 * W)); this.wt[i] = w * w * (3 - 2 * w); }
    return best;
  }
  /**
   * 单位方向 d 处的海拔（米）；info 可选，会写入 { tile, seam, glow, color }
   */
  height(d, info) {
    const best = this.weigh(d), cand = this.cand;
    let h = 0, ws = 0, glow = 0;
    if (info) _c.setRGB(0, 0, 0);
    for (let i = 0; i < cand.length; i++) {
      const w = this.wt[i]; if (w <= 0) continue;
      const t = cand[i], f = this.fieldOf(t);
      t.frame.dirToLocal(d, _l);
      const hi = f.height(_l.x, _l.z);
      h += hi * w; ws += w;
      if (info) { if (f.glow) glow += f.glow(_l.x, _l.z) * w; info.loc ??= []; info.loc[i] = [_l.x, _l.z, hi, w]; }
    }
    h /= ws; glow /= ws;
    // —— 交界地貌 ——
    let seam = 0, seamKind = null;
    for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
      const wi = this.wt[i], wj = this.wt[j]; if (wi <= 0 || wj <= 0) continue;
      const a = cand[i], b = cand[j]; if (!a.n.includes(b.id)) continue;
      const type = this.seams.get(a.id * 64 + b.id); if (type === 'coast') continue;
      const s = Math.abs(this.dist[i] - this.dist[j]) / 2, g = wi * wj;
      if (type === 'ridge') {
        const f = Math.exp(-((s / 520) ** 2)) * g, n = fbm3(d.x * 44, d.y * 44, d.z * 44, 4), rr = 1 - Math.abs(n * 2 - 1);
        const add = f * (150 + 330 * rr * rr); if (add > seam) { seam = add; seamKind = type; } h += add;
      } else if (type === 'rift') {
        const f = smooth(0.25, 0.85, Math.exp(-((s / 240) ** 2)) * g), floor = 8 + 14 * fbm3(d.x * 60, d.y * 60, d.z * 60, 2);
        h = h + (Math.min(h, floor) - h) * f; if (f > seam / 200) { seam = Math.max(seam, f * 200); seamKind = type; }
      } else if (type === 'strait') {
        const f = smooth(0.3, 0.9, Math.exp(-((s / 230) ** 2)) * g); h = h + (Math.min(h, -24) - h) * f;
      }
    }
    if (info) { info.tile = best; info.seam = seam; info.seamKind = seamKind; info.glow = glow; info.ws = ws; }
    return h;
  }
  /** 颜色：按同样的权重混合各地块的地表色，交界山脊盖上岩石与积雪 */
  color(d, h, sl, info, out) {
    out.setRGB(0, 0, 0);
    const cand = this.cand; let ws = 0;
    for (let i = 0; i < cand.length; i++) {
      const L = info.loc[i]; if (!L || L[3] <= 0) continue;
      this.fieldOf(cand[i]).color(L[0], L[1], h, sl, _c2);
      out.r += _c2.r * L[3]; out.g += _c2.g * L[3]; out.b += _c2.b * L[3]; ws += L[3];
    }
    out.multiplyScalar(1 / ws);
    if (info.seamKind === 'ridge') { const k = smooth(40, 160, info.seam); out.lerp(_c2.copy(PAL.rock).lerp(PAL.rock2, fbm3(d.x * 90, d.y * 90, d.z * 90, 2)), k * 0.85).lerp(PAL.snow, smooth(380, 520, h) * 0.85); }
    if (info.seamKind === 'rift') out.lerp(_c2.set(0x9a6a48), smooth(30, 120, info.seam) * 0.7);
    if (h < -1.5) out.lerp(PAL.bed, smooth(-1.5, -10, h));
    return out;
  }

  /** 生成整颗星球的地形网格。detail：二十面体每条边分成多少段 */
  buildMesh(detail) {
    let g = new THREE.IcosahedronGeometry(1, detail - 1);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position, n = pos.count;
    const hs = new Float32Array(n), glow = new Float32Array(n), col = new Float32Array(n * 3), dirs = new Float32Array(n * 3);
    const d = new THREE.Vector3(), infos = new Array(n);
    for (let i = 0; i < n; i++) {
      d.fromBufferAttribute(pos, i).normalize(); dirs.set([d.x, d.y, d.z], i * 3);
      const info = { loc: [] };
      let h = this.height(d, info);
      // 模块核心区：模块自带更精细的地形网格，星球网格往下藏 30 米，避免互相穿插
      const m = info.tile.module;
      if (m && m.core) {
        const L = info.tile.frame.dirToLocal(d, _l), c = m.core, e = 110;
        const k = smooth(c.x0, c.x0 + e, L.x) * smooth(c.x1, c.x1 - e, L.x) * smooth(c.z0, c.z0 + e, L.z) * smooth(c.z1, c.z1 - e, L.z);
        h -= 30 * k;
      }
      hs[i] = h; glow[i] = info.glow; infos[i] = { loc: info.loc.slice(), seam: info.seam, seamKind: info.seamKind, tile: info.tile };
      pos.setXYZ(i, d.x * (R + h), d.y * (R + h), d.z * (R + h));
    }
    g.computeVertexNormals();
    const nor = g.attributes.normal, nv = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      d.fromArray(dirs, i * 3); nv.fromBufferAttribute(nor, i);
      const cs = clamp(nv.dot(d), 0.05, 1), sl = Math.sqrt(1 - cs * cs) / cs;
      this.cand = []; const info = infos[i]; this.cand = this.candOf(info);
      this.color(d, hs[i], sl, info, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    g.computeBoundingSphere();
    return g;
  }
  candOf(info) { const t = info.tile; return [t, ...t.n.map(j => this.tiles[j])]; }
}

/** 星球地形的材质：顶点色 + 熔岩自发光；一点点 polygonOffset，让模块自带的精细地形在重叠处胜出 */
export function surfaceMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 3 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(2.6, 0.75, 0.18) * vGlow * vGlow;');
  };
  return m;
}

/** 分块轮廓线（「显示分块」时可见） */
export function tileOutline(tiles, surface) {
  const pts = [], seen = new Set(), d = new THREE.Vector3();
  for (const a of tiles) for (const j of a.n) {
    const key = Math.min(a.id, j) * 64 + Math.max(a.id, j); if (seen.has(key)) continue; seen.add(key);
    const b = tiles[j], shared = a.corners.filter(p => b.corners.some(q => q.distanceTo(p) < 1e-6));
    if (shared.length < 2) continue;
    const [p, q] = shared, N = 14;
    for (let k = 0; k < N; k++) for (const t of [k / N, (k + 1) / N]) {
      d.copy(p).lerp(q, t).normalize(); const h = Math.max(surface.height(d), 0);
      pts.push(d.x * (R + h + 160), d.y * (R + h + 160), d.z * (R + h + 160));
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
  l.visible = false; l.userData.noPick = true; return l;
}
