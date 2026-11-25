// 纪念碑谷式的孤峰、方山和石柱：
//   每座孤峰 = 一圈不规则的轮廓（带凸出的扶壁和竖向冲沟）沿高度拉起来的崖壁 + 硬质盖岩的平顶。
//   颜色按真实地层来：脚下暗红的页岩，中段橙红的砂岩崖，顶上灰褐的盖岩；崖面挂着从顶部流下来的黑色「沙漠漆」。
//   碎石坡由 terrain.js 的高度场负责，这里登记轮廓参数，并生成崖壁网格和散落的落石。
import * as THREE from 'three';
import { BUTTES, ground, plateau, edgeDist, loopNoise, fb, vn, ridge, smooth, clamp, lerp, grainTexture } from './terrain.js';

const C = c => new THREE.Color(c);
const ROCK = {
  organ: C(0x8b3b22), organ2: C(0xa95a38), stripe: C(0xc99a78),
  chelly: C(0xc8622e), chelly2: C(0xdb8247), chelly3: C(0xb4532a),
  cap: C(0x957559), cap2: C(0x7b604c), top: C(0xa8754f), topSand: C(0xcc8d58),
  varnish: C(0x45281b)
};

/**
 * 登记一座孤峰。kind：butte 孤峰 / mesa 方山 / spire 石柱 / talus 只有碎石坡 / far 远景（只进高度场，不建网格）
 */
function add(name, x, z, o) {
  const b = {
    name, x, z, rot: 0, rx: 80, rz: 50, H: 140, tal: 48, tw: 0.85, kind: 'butte', taper: 1, flute: 0.06, nf: 52, nv: 70, seed: BUTTES.length * 7.31 + 1.7,
    ...o
  };
  b.base = plateau(x, z);
  b.prof = new Float32Array(256);
  // 平面轮廓：圆角矩形（超椭圆）打底，叠上大的凸凹和几处凹进去的岩龛
  const lobes = b.kind === 'spire' ? 0.07 : 0.16, sq = b.kind === 'spire' ? 2 : b.kind === 'mesa' ? 4.5 : 3.2;
  for (let i = 0; i < 256; i++) {
    const t = i / 256, a = t * Math.PI * 2;
    const se = Math.pow(Math.pow(Math.abs(Math.cos(a)), sq) + Math.pow(Math.abs(Math.sin(a)), sq), -1 / sq);
    const notch = b.kind === 'spire' ? 0 : 0.1 * smooth(0.62, 0.8, loopNoise(t, 5, b.seed + 9));
    b.prof[i] = se * (1 + lobes * (loopNoise(t, 1.2, b.seed) - 0.5) * 2.2 + 0.05 * (loopNoise(t, 4.2, b.seed + 4) - 0.5) * 2 - notch);
  }
  BUTTES.push(b);
  return b;
}

/* —— 西岸：孤峰群 —— */
add('西手套', 640, 600, { rx: 100, rz: 52, rot: 0.35, H: 168, tal: 52 });
add('西手套·拇指', 575, 690, { kind: 'spire', rx: 21, rz: 16, H: 152, tal: 30, tw: 0.4, taper: 0.72 });
add('东手套', 880, 230, { rx: 106, rz: 56, rot: -0.25, H: 160, tal: 50 });
add('东手套·拇指', 955, 150, { kind: 'spire', rx: 22, rz: 17, H: 146, tal: 30, tw: 0.4, taper: 0.7 });
add('梅里克孤峰', 1110, 780, { rx: 86, rz: 60, rot: 0.9, H: 142, tal: 46 });
add('大方山', 1190, -390, { kind: 'mesa', rx: 300, rz: 145, rot: 0.15, H: 122, tal: 40, tw: 0.55, nf: 120 });
add('三姐妹·岭', 590, -770, { kind: 'talus', rx: 95, rz: 30, rot: -0.5, H: 0, tal: 34, tw: 0.9 });
add('三姐妹·长姐', 540, -730, { kind: 'spire', rx: 18, rz: 15, H: 128, tal: 34, tw: 0.3, taper: 0.62 });
add('三姐妹·二姐', 590, -768, { kind: 'spire', rx: 15, rz: 13, H: 140, tal: 34, tw: 0.3, taper: 0.58 });
add('三姐妹·小妹', 637, -806, { kind: 'spire', rx: 19, rz: 15, H: 112, tal: 34, tw: 0.3, taper: 0.66 });
add('图腾柱', 840, -930, { kind: 'spire', rx: 8.5, rz: 7, H: 136, tal: 36, tw: 1.4, taper: 0.6, flute: 0.03 });
add('图腾柱·伴', 875, -955, { kind: 'spire', rx: 11, rz: 9, H: 108, tal: 30, tw: 1.2, taper: 0.64 });
add('图腾柱·小峰', 760, -1080, { rx: 42, rz: 30, rot: 0.6, H: 88, tal: 34, tw: 1 });
add('北孤峰', 470, 1190, { rx: 70, rz: 45, rot: 1.2, H: 128, tal: 44 });
add('哨兵石', 445, -150, { kind: 'spire', rx: 22, rz: 18, H: 96, tal: 30, tw: 0.9, taper: 0.75 });
add('远方山', 1250, 330, { rx: 90, rz: 70, rot: 0.4, H: 150, tal: 50, tw: 0.7 });
/* —— 东岸：沙海背后的方山 —— */
add('东方山', -1100, 720, { kind: 'mesa', rx: 210, rz: 115, rot: -0.4, H: 128, tal: 44, tw: 0.6, nf: 100 });
add('东孤峰', -1000, -800, { rx: 90, rz: 68, rot: 0.3, H: 140, tal: 46 });
add('北岸孤峰', -470, 1270, { rx: 58, rz: 40, rot: -0.7, H: 104, tal: 38 });
const profAt = (b, t) => { const f = t * 256, i = Math.floor(f), k = f - i; return lerp(b.prof[i & 255], b.prof[(i + 1) & 255], k); };

/** 一座孤峰的崖壁 + 平顶网格，写进共享的数组 */
function butteMesh(b, A) {
  const per = Math.PI * (b.rx + b.rz) * 1.1;
  const NA = clamp(Math.round(per / (b.kind === 'spire' ? 2.2 : 3.6)), 64, 300);
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  // 底边：沿轮廓取地面最低处，再往下埋 5 米
  let yb = 1e9;
  for (let i = 0; i < 48; i++) {
    const t = i / 48, a = t * Math.PI * 2, k = profAt(b, t) * 1.04, lx = Math.cos(a) * b.rx * k, lz = Math.sin(a) * b.rz * k;
    yb = Math.min(yb, ground(b.x + lx * c + lz * s, b.z - lx * s + lz * c, false));
  }
  yb -= 5;
  const yTop = b.base + b.H, yFoot = b.base + b.tal;
  // 行：崖壁每 3.5 米一行，顶上是盖岩的檐和平顶
  const rows = [];
  const span = yTop - 7 - yb, NR = Math.max(8, Math.round(span / 3.5));
  for (let j = 0; j <= NR; j++) {
    const y = yb + span * j / NR, h = (y - yb) / (yTop - yb);
    let m = 1 + 0.04 * smooth(yFoot + 6, yb, y);                    // 脚下微微外撇，埋进碎石坡
    const st = (y - yFoot) / 11, fr = st - Math.floor(st);
    m -= 0.012 * smooth(0.65, 1, fr);                               // 岩层的小台阶
    m *= lerp(1, b.taper, h);
    if (b.kind === 'spire') m *= 1 + 0.09 * Math.sin(h * 7.5 + b.seed) * smooth(0, 0.2, h);
    rows.push({ y, m, cliff: 1 });
  }
  const capM = b.taper;
  rows.push({ y: yTop - 4.5, m: capM * 1.018, cliff: 0.4 }, { y: yTop - 1.2, m: capM * 1.01, cliff: 0.2 }, { y: yTop, m: capM * 0.975, cliff: 0, top: 1 });
  const dome = b.kind === 'spire' ? 3 : 1.6;
  for (const [mm, dy] of [[0.86, 0.5], [0.6, 1.1], [0.3, 1.5], [0.0, 1.7]]) rows.push({ y: yTop + dy * dome, m: capM * mm, cliff: 0, top: 1 });

  const v0 = A.pos.length / 3, col = new THREE.Color();
  for (let j = 0; j < rows.length; j++) {
    const R = rows[j];
    for (let i = 0; i <= NA; i++) {
      const t = (i % NA) / NA, a = t * Math.PI * 2;
      const k = profAt(b, t);
      // 竖向冲沟：山脊噪声 + 一点随高度的扭动
      const joint = Math.pow(ridge(t * b.nf * 0.3 + b.seed, R.y * 0.004, 2), 3), g2 = vn(t * b.nf * 1.7 + 3, R.y * 0.03);
      const mask = 0.4 + 0.6 * vn(t * 7 + b.seed, 0.5);
      const groove = (0.7 * joint + 0.3 * g2) * mask * R.cliff;
      const sc = k * R.m * (1 - b.flute * groove * (b.kind === 'spire' ? 0.6 : 1));
      const lx = Math.cos(a) * b.rx * sc, lz = Math.sin(a) * b.rz * sc;
      const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
      let y = R.y;
      if (R.top) y += 1.2 * (fb(x * 0.03, z * 0.03, 2) - 0.5);
      A.pos.push(x, y, z);
      if (R.top) A.uv.push(x / 23, z / 23); else A.uv.push(t * per / 23, y / 23);
      // —— 颜色 ——
      if (R.top) col.copy(ROCK.top).lerp(ROCK.topSand, smooth(0.4, 0.7, fb(x * 0.02, z * 0.02, 3)) * 0.7);
      else if (y < yFoot + 16) {
        const sp = Math.sin((y - yb) * 0.9 + 2 * vn(t * 9, 0)) * 0.5 + 0.5;
        col.copy(ROCK.organ).lerp(ROCK.organ2, fb(t * 20, y * 0.08, 2)).lerp(ROCK.stripe, smooth(0.85, 1, sp) * 0.45);
        col.lerp(ROCK.chelly3, smooth(yFoot + 8, yFoot + 16, y));
      } else if (y > yTop - 9) col.copy(ROCK.cap).lerp(ROCK.cap2, vn(t * 30, y * 0.3));
      else {
        const band = fb(y * 0.045 + b.seed, t * 3, 3);
        col.copy(ROCK.chelly).lerp(ROCK.chelly2, smooth(0.35, 0.7, band)).lerp(ROCK.chelly3, smooth(0.6, 0.85, fb(t * 14, y * 0.01, 2)) * 0.5);
        // 沙漠漆：从盖岩檐下流下来的黑色竖纹
        const streak = smooth(0.52, 0.74, vn(t * b.nv + b.seed, y * 0.004)), fall = smooth(yTop - 95, yTop - 10, y);
        col.lerp(ROCK.varnish, streak * (0.15 + 0.55 * fall) * 0.6);
      }
      col.multiplyScalar(1 - 0.32 * groove);
      A.col.push(col.r, col.g, col.b);
    }
  }
  const W = NA + 1;
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < NA; i++) {
    const a = v0 + j * W + i, b2 = a + 1, c2 = a + W, d = c2 + 1;
    A.idx.push(a, c2, b2, b2, c2, d);
  }
  A.seams.push([v0, W, rows.length]);
}

/** 所有孤峰合成一个网格 + 落石 */
export function buildRocks(root, dust) {
  const A = { pos: [], col: [], uv: [], idx: [], seams: [] };
  for (const b of BUTTES) if (b.kind !== 'talus' && b.kind !== 'far') butteMesh(b, A);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
  g.setIndex(A.idx);
  g.computeVertexNormals();
  // 首尾两列是同一条竖线：法线取平均，免得出现一道接缝
  const n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (const [v0, W, NR] of A.seams) for (let j = 0; j < NR; j++) {
    const a = v0 + j * W, b = a + W - 1;
    v.fromBufferAttribute(n, a).add(w.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  const mat = dust(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
  root.add(mesh);

  // —— 落石：碎石坡上散落的大石块，和崖脚下崩落的整块岩体 ——
  const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + 0.5 * vn(p.getX(i) * 2 + 5, p.getY(i) * 2 + p.getZ(i) * 2); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const list = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const b of BUTTES) {
    if (b.kind === 'far') continue;
    const N = b.kind === 'spire' ? 14 : b.kind === 'mesa' ? 90 : 55;
    for (let i = 0; i < N; i++) {
      const t = rnd(), a = t * Math.PI * 2, e = 1.03 + Math.pow(rnd(), 1.6) * b.tw * 1.1;
      const k = profAt(b, t), lx = Math.cos(a) * b.rx * k * e, lz = Math.sin(a) * b.rz * k * e;
      const c = Math.cos(b.rot), s = Math.sin(b.rot), x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
      const big = e < 1.2 && rnd() < 0.3;
      const sz = big ? 3 + rnd() * 3.5 : 0.8 + Math.pow(rnd(), 2) * 3;
      list.push([x, ground(x, z) - sz * 0.25, z, sz, rnd() * 6.28, big]);
    }
  }
  // 平原上零星的碎石
  for (let i = 0; i < 700; i++) {
    const x = (rnd() - 0.5) * 3000, z = (rnd() - 0.5) * 3200, sz = 0.5 + Math.pow(rnd(), 3) * 3;
    if (edgeDist(x, z) > 0.66) continue;
    list.push([x, ground(x, z) - sz * 0.3, z, sz, rnd() * 6.28, false]);
  }
  const im = new THREE.InstancedMesh(geo, dust(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true })), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), cc = new THREE.Color();
  list.forEach(([x, y, z, sz, r, big], i) => {
    e.set(rnd() * 0.5, r, rnd() * 0.5); q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sz * (big ? 1.4 : 1), sz * (big ? 1.1 : 0.8), sz));
    im.setMatrixAt(i, m);
    cc.copy(ROCK.organ2).lerp(ROCK.chelly, rnd()).lerp(ROCK.varnish, rnd() * 0.35); im.setColorAt(i, cc);
  });
  im.castShadow = true; im.receiveShadow = true;
  root.add(im);
  return { mesh };
}
