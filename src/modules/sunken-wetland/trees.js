// 树：板根巨木（吉贝木棉）、绞杀榕、顶天的「古树」、布里蒂棕榈、枯立木。
// 每棵树由树干、枝、树冠团块、气根、垂苔、贴地的板根组成；颜色里有洪水线（泡过水的深色树皮）、水线上的藻绿和成片的苔藓。
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth } from '../../util.js';
import { Acc, grow, along } from './geo.js';
import { nf, WATER } from './terrain.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = c => new THREE.Color(c);
const BARK = { ceiba: C(0x7d786a), fig: C(0x6a5c4a), titan: C(0x6e6454), round: C(0x5f5548), snag: C(0x8a857a), palm: C(0x5e5244) };
const DARK = C(0x3f3a30), ALGAE = C(0x4d5a2a), MOSS = C(0x55702f), MOSS2 = C(0x7a8a45), LICHEN = C(0xc4c2a8);
export const LEAF = {
  deep: C(0x3a6226), yg: C(0x678a2c), blue: C(0x3b6150), olive: C(0x5a6a2e), dark: C(0x2c4a22),
  pink: C(0xb86a8a), yellow: C(0xc9a43a), rust: C(0x8a5e2c)
};
const HANG = [C(0x8a9a6a), C(0x6f7d52), C(0x9aa27a)];
export const FLOOD = 6.5; // 雨季最高水位留在树干上的线

// 树冠团块的模板（两档细节），合并后带索引
const ICO = [1, 2].map(d => { const g = new THREE.IcosahedronGeometry(1, d); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return mergeVertices(g); });
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** 一团叶子：压扁的、表面起伏的球，上亮下暗 */
export function clump(acc, p, r, base, R, detail = 0, flat = 0.58) {
  const g = ICO[detail], pos = g.attributes.position, b = acc.n, ph = R() * 50;
  _e.set(R.range(-0.3, 0.3), R() * 6.28, R.range(-0.3, 0.3)); _q.setFromEuler(_e);
  const tint = _w.set(R.range(-0.05, 0.05), R.range(-0.07, 0.07), 0);
  for (let k = 0; k < pos.count; k++) {
    _v.fromBufferAttribute(pos, k);
    const bump = 1 + 0.32 * (nf(_v.x * 2.1 + ph, _v.z * 2.1 + _v.y * 1.7, 2) - 0.5) * 2;
    const yy = _v.y;
    _v.multiplyScalar(bump); _v.y *= flat; _v.applyQuaternion(_q).multiplyScalar(r).add(p);
    const dap = nf(_v.x * 0.35 + ph, _v.z * 0.35 + _v.y * 0.3, 2);                       // 叶团上的斑驳：新叶亮、老叶暗
    _c.copy(base).offsetHSL(tint.x * 0.3 + (dap - 0.5) * 0.04, tint.y, tint.y * 0.5 + (dap - 0.5) * 0.12).multiplyScalar(lerp(0.45, 1.15, smooth(-0.9, 0.9, yy)) * (0.85 + 0.35 * (bump - 1)));
    acc.v(_v.x, _v.y, _v.z, _c);
  }
  const idx = g.index.array; for (let k = 0; k < idx.length; k++) acc.i.push(b + idx[k]);
}

function barkColor(base, R) {
  const b = base.clone().offsetHSL(0, R.range(-0.03, 0.03), R.range(-0.05, 0.04));
  return (p, t, th, c) => {
    const n = nf(p.x * 0.18 + p.y * 0.07, p.z * 0.18 - p.y * 0.05, 3), n2 = nf(p.x * 0.6 + 3, p.y * 0.6 + p.z * 0.4, 2);
    c.copy(b);
    c.lerp(DARK, smooth(FLOOD + 1.2, FLOOD - 0.6, p.y + (n - 0.5) * 1.6) * 0.55);        // 洪水线以下：泡过水的深色
    c.lerp(ALGAE, smooth(WATER + 1.6, WATER + 0.2, p.y) * smooth(WATER - 1.2, WATER, p.y) * 0.7); // 水线上一圈藻
    c.lerp(n > 0.5 ? MOSS : MOSS2, smooth(0.56, 0.78, n) * 0.75);                      // 苔藓
    c.lerp(LICHEN, smooth(0.8, 0.95, n2) * 0.3);                                      // 地衣斑
    return c.multiplyScalar(0.9 + 0.2 * n2);
  };
}

/**
 * 种一棵树。A = { wood, leaf, hang } 三个 Acc；o = { x, z, y0, H, kind, surf(x,z), lod, leaf, R0 }。
 * out 收集挂件位置：fungi（树干下部的发光菌）、tops（树冠中心，给鸟和光柱用）。
 */
export function tree(A, R, o, out = {}) {
  const { x, z, y0, H } = o, kind = o.kind, lod = o.lod || 0;
  const titan = kind === 'titan', snag = kind === 'snag', fig = kind === 'fig' || titan;
  const R0 = o.R0 ?? H * (titan ? 0.048 : kind === 'ceiba' ? 0.04 : 0.034);
  const trunkL = H * (titan ? 0.7 : snag ? R.range(0.55, 0.9) : 0.64) + 3;
  const nT = lod ? 12 : titan ? 36 : 22, seg = lod ? 8 : titan ? 30 : 16;
  // 树干中线：底部密、上面疏，靠近地面的板根才有足够的圈数
  const lean = V(R.range(-1, 1), 0, R.range(-1, 1)).multiplyScalar(o.lean ?? R.range(0.02, 0.1));
  const ph = R() * 9, spine = [], ss = [];
  for (let i = 0; i <= nT; i++) {
    const s = Math.pow(i / nT, 1.6), h = s * trunkL;
    const w = Math.sin(ph + s * 3.1) * H * 0.012, w2 = Math.cos(ph * 1.3 + s * 2.3) * H * 0.012;
    spine.push(V(x + lean.x * h + w * s, y0 - 3 + h, z + lean.z * h + w2 * s)); ss.push(s);
  }
  const fins = Array.from({ length: 4 + Math.floor(R() * 4) }, () => ({ ph: R() * 6.28, a: R.range(0.6, 1.1), k: R.range(10, 26) }));
  const finAmp = kind === 'ceiba' ? 1.5 : titan ? 1.2 : kind === 'round' ? 0.5 : snag ? 0.4 : 0.8;
  const tph = R() * 6;
  const rad = (i) => { const s = ss[i]; let r = R0 * Math.pow(1 - 0.72 * s, 1.2); r *= 1 + (fig ? 0.7 : 0.9) * Math.exp(-s * 18); return r + 0.05; };
  const prof = (th, t, i) => {
    const s = ss[i], f = finAmp * Math.exp(-s * (titan ? 30 : 22));
    let m = 1; for (const F of fins) m += f * F.a * Math.pow(Math.max(0, Math.cos(th - F.ph)), F.k);
    if (fig) m += 0.2 * Math.pow(Math.abs(Math.sin(th * 3 + s * 16 + tph)), 3) - 0.08; // 绞杀榕：扭成一股股的气根束
    else m += 0.04 * Math.sin(th * 13 + s * 30);                                         // 树皮的竖纹
    return m;
  };
  const bark = barkColor(BARK[kind] || BARK.round, R);
  const rings = A.wood.tube(spine, rad, { seg, prof, col: bark });
  // 树干下部的菌菇点位
  if (out.fungi && !lod) for (let k = 0; k < (titan ? 14 : 4); k++) {
    const i = Math.floor(R() * nT * 0.5), ring = rings[i]; if (!ring || ring.p.y < WATER + 0.6 || ring.p.y > FLOOD + 5) continue;
    const th = R() * 6.28, m = prof(th, 0, i), n = ring.N.clone().multiplyScalar(Math.cos(th)).addScaledVector(ring.B, Math.sin(th));
    out.fungi.push({ p: ring.p.clone().addScaledVector(n, ring.r * m), n });
  }

  /* ---- 枝 ---- */
  const leafCol = o.leaf || LEAF.deep, branches = [], tips = [];
  const nb = snag ? 2 + Math.floor(R() * 3) : titan ? 10 + Math.floor(R() * 4) : lod ? 4 + Math.floor(R() * 2) : 5 + Math.floor(R() * 4);
  const segB = lod ? 5 : titan ? 10 : 7, _p = V(0, 0, 0), _t = V(0, 0, 0);
  const rAt = s => R0 * Math.pow(1 - 0.72 * s, 1.2);
  for (let b = 0; b < nb + (snag ? 0 : 2); b++) {
    const leader = b >= nb;
    const s = leader ? 1 : lerp(titan ? 0.55 : 0.5, 0.97, (b + R() * 0.6) / nb);
    along(spine, Math.min(s, 0.999), _p);
    const az = b * 2.39996 + R() * 0.8, el = leader ? R.range(0.9, 1.25) : R.range(kind === 'ceiba' ? 0.15 : 0.3, kind === 'ceiba' ? 0.45 : 0.8);
    const dir = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const Lb = H * (leader ? 0.2 : R.range(0.22, 0.33)) * (snag ? 0.35 : 1.15 - s * 0.35);
    const rb = Math.max(rAt(s) * (leader ? 0.6 : R.range(0.42, 0.58)), 0.12);
    const pts = grow(_p, dir, Lb, segB, R, { up: kind === 'ceiba' ? 0.15 : 0.45, wob: 0.45, droop: fig ? 0.25 : 0 });
    A.wood.tube(pts, (i, t) => rb * (1 - 0.78 * t) + 0.04, { seg: lod ? 5 : titan ? 10 : 7, col: bark });
    branches.push({ pts, rb, L: Lb });
    if (snag) continue;
    // 二级枝
    const ns = lod ? 1 : titan ? 4 : 2 + Math.floor(R() * 2);
    for (let k = 0; k < ns; k++) {
      const u = R.range(0.35, 0.85); along(pts, u, _p, _t);
      const d = _t.clone().add(V(R.range(-1, 1), R.range(0.1, 0.8), R.range(-1, 1)).multiplyScalar(0.9)).normalize();
      const Ls = Lb * R.range(0.32, 0.55), rs = Math.max(rb * (1 - 0.78 * u) * 0.6, 0.06);
      const sp = grow(_p, d, Ls, lod ? 3 : 5, R, { up: 0.5, wob: 0.5 });
      A.wood.tube(sp, (i, t) => rs * (1 - 0.8 * t) + 0.03, { seg: 5, col: bark });
      tips.push({ p: sp[sp.length - 1], r: Ls });
      branches.push({ pts: sp, rb: rs, L: Ls });
    }
    tips.push({ p: pts[pts.length - 1], r: Lb });
  }

  /* ---- 树冠 ---- */
  if (!snag) {
    const top = V(0, 0, 0);
    for (const tp of tips) {
      const cr = clamp(tp.r * (lod ? 0.95 : kind === 'ceiba' ? 0.7 : 0.62), 2.5, titan ? 28 : 18);
      const nC = lod ? 1 : titan ? 3 : 2;
      for (let k = 0; k < nC; k++) {
        const q = tp.p.clone().add(V(R.range(-0.5, 0.5) * cr, R.range(-0.15, 0.35) * cr, R.range(-0.5, 0.5) * cr));
        clump(A.leaf, q, cr * R.range(0.6, 1.0), leafCol, R, 1, kind === 'ceiba' ? 0.45 : 0.6);
      }
      top.add(tp.p);
    }
    if (out.tops) out.tops.push({ p: top.multiplyScalar(1 / tips.length), r: H * 0.35, H });
  }

  /* ---- 气根与垂苔 ---- */
  if (!lod && A.hang) {
    const nr = titan ? 20 : fig ? 8 : 0;
    for (let k = 0; k < nr; k++) {
      const br = branches[Math.floor(R() * branches.length)]; along(br.pts, R.range(0.2, 0.85), _p);
      const end = V(_p.x + R.range(-2, 2), Math.min((o.surf || (() => y0))(_p.x, _p.z), WATER) - 1.5, _p.z + R.range(-2, 2));
      if (_p.y - end.y < 4) continue;
      const pts = []; for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(V(lerp(_p.x, end.x, t) + Math.sin(t * 3 + k) * 0.6, lerp(_p.y, end.y, t), lerp(_p.z, end.z, t) + Math.cos(t * 2.5 + k) * 0.6)); }
      const rr = titan && R() < 0.3 ? R.range(0.6, 1.3) : R.range(0.12, 0.4);
      A.wood.tube(pts, (i, t) => rr * (0.7 + 0.5 * t), { seg: rr > 0.5 ? 7 : 4, col: bark });
    }
    const nh = titan ? 70 : kind === 'round' ? 6 : 16;
    for (let k = 0; k < nh; k++) {
      const br = branches[Math.floor(R() * branches.length)]; along(br.pts, R.range(0.15, 0.95), _p);
      A.hang.ribbon(_p, R.range(2, titan ? 14 : 8), R.range(0.35, 0.9), HANG[k % 3], R, 6);
    }
  }

  /* ---- 贴地的根：沿地表（或神庙的石墙）爬出去 ---- */
  const surf = o.surf;
  if (surf && !lod) {
    const nr = o.roots ?? (titan ? 12 : kind === 'ceiba' ? 6 : 5);
    for (let k = 0; k < nr; k++) {
      const az = k / nr * 6.28 + R() * 0.4;
      root(A.wood, R, x, z, y0, az, (o.rootLen ?? (titan ? 34 : 16)) * R.range(0.7, 1.2), R0 * (titan ? 0.42 : 0.38), R0 * 1.4, surf, bark, 1);
    }
  }
  return { rings, branches, tips };
}

function root(acc, R, x, z, y0, az, len, r0, start, surf, col, depth) {
  const pts = [], d = V(Math.cos(az), 0, Math.sin(az));
  let px = x + d.x * start * 0.6, pz = z + d.z * start * 0.6;
  pts.push(V(px, y0 + r0 * 1.5, pz));
  const step = 1.6, n = Math.max(3, Math.floor(len / step));
  let a = az;
  for (let i = 1; i <= n; i++) {
    a += R.range(-0.25, 0.25); px += Math.cos(a) * step; pz += Math.sin(a) * step;
    const t = i / n, r = r0 * (1 - 0.8 * t);
    pts.push(V(px, Math.max(surf(px, pz), WATER - 2.5) + r * 0.45, pz));
  }
  acc.tube(pts, (i, t) => r0 * (1 - 0.82 * t) + 0.05, { seg: 6, col });
  if (depth > 0 && n > 6) {
    const j = Math.floor(n * R.range(0.3, 0.6)), q = pts[j];
    root(acc, R, q.x, q.z, q.y - r0 * 0.5, a + (R() < 0.5 ? -1 : 1) * R.range(0.5, 1), len * 0.5, r0 * 0.55, 0, surf, col, depth - 1);
  }
}

/** 布里蒂棕榈：细长的树干、扇形叶，冠下挂着一圈枯叶 */
export function palm(A, R, x, z, y0, H) {
  const pts = grow(V(x, y0 - 2, z), V(R.range(-0.1, 0.1), 1, R.range(-0.1, 0.1)), H + 2, 8, R, { up: 0.1, wob: 0.15 });
  A.wood.tube(pts, (i, t) => 0.42 - 0.12 * t, { seg: 7, col: barkColor(BARK.palm, R) });
  const top = pts[pts.length - 1], green = LEAF.yg.clone().lerp(LEAF.deep, R() * 0.5), dead = C(0x8a6a40);
  for (let k = 0; k < 14; k++) {
    const az = k * 2.39996, el = R.range(0.2, 0.9), d = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const stem = top.clone().addScaledVector(d, 2.6);
    A.wood.tube([top, top.clone().addScaledVector(d, 1.3).add(V(0, 0.3, 0)), stem], () => 0.07, { seg: 3, col: () => C(0x6a7a30), cap: false });
    // 扇叶：以叶柄末端为中心的一把半圆扇，朝外上方张开
    const side = V(-d.z, 0, d.x).normalize(), up = new THREE.Vector3().crossVectors(side, d).normalize(), b = A.leaf.n, rr = R.range(2.2, 3);
    A.leaf.v(stem.x, stem.y, stem.z, green);
    for (let j = 0; j <= 10; j++) {
      const a = (j / 10 - 0.5) * Math.PI * 1.1, ext = rr * (0.85 + 0.15 * Math.sin(j * 1.7));
      const q = stem.clone().addScaledVector(d, Math.cos(a) * ext * 0.7).addScaledVector(side, Math.sin(a) * ext).addScaledVector(up, Math.cos(a) * ext * 0.35 - ext * 0.15);
      A.leaf.v(q.x, q.y, q.z, _c.copy(green).multiplyScalar(0.8 + 0.4 * (j % 2)));
      if (j) A.leaf.i.push(b, b + j, b + j + 1);
    }
  }
  if (A.hang) for (let k = 0; k < 8; k++) { const az = k / 8 * 6.28; A.hang.ribbon(top.clone().add(V(Math.cos(az) * 0.5, -0.4, Math.sin(az) * 0.5)), R.range(1.8, 3), 0.35, dead, R, 3, V(Math.cos(az) * 0.3, -1, Math.sin(az) * 0.3).normalize()); }
}

/* ---------- 材质 ---------- */
export const WIND = { uT: { value: 0 }, uWind: { value: 0.2 } };
function sway(mat, amp) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = WIND.uT; sh.uniforms.uWind = WIND.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 swp = instanceMatrix[3].xyz + position * 0.3;
        #else
          vec3 swp = position;
        #endif
        float sw = sin(uT * 1.1 + swp.x * 0.045 + swp.z * 0.06) + 0.5 * sin(uT * 2.3 + swp.y * 0.11);
        transformed.xz += vec2(sw, sw * 0.6) * uWind * ${amp.toFixed(2)};`);
  };
  return mat;
}
export function treeMaterials() {
  return {
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }),
    leaf: sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }), 0.9),
    hang: sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 1.4)
  };
}
