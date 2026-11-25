// 不属于任何模块的地块：海洋、荒原、极地。都在各自地块的平面局部坐标里求值（单位米）。
import * as THREE from 'three';
import { fbm, smooth, clamp } from '../util.js';

const C = c => new THREE.Color(c);
export const PAL = {
  bed: C(0x3f5a5c), sand: C(0xcbbd98), grass: C(0x7d9450), grass2: C(0xa3a764), forest: C(0x4f6b3c),
  rock: C(0x8e867a), rock2: C(0x6c675e), snow: C(0xe8e8e2), ice: C(0xcfe0ea), tundra: C(0x8f8f78)
};

export const FILLERS = {
  ocean: {
    name: '外海',
    height(x, z) {
      const n = fbm(x * 0.0005 + 3, z * 0.0005 - 7, 4), m = fbm(x * 0.0021 + 11, z * 0.0021, 4);
      return -55 - 55 * n + smooth(0.66, 0.84, m) * 95; // 偶尔冒出小岛
    },
    color(x, z, y, sl, out) {
      if (y < -1) return out.copy(PAL.bed).lerp(PAL.sand, clamp((y + 12) / 12, 0, 1));
      return out.copy(PAL.sand).lerp(PAL.forest, smooth(3, 14, y)).lerp(PAL.rock, smooth(0.7, 1.2, sl));
    }
  },
  wild: {
    name: '荒原',
    height(x, z) {
      const n = fbm(x * 0.0006 + 1, z * 0.0006 + 5, 5), r = 1 - Math.abs(fbm(x * 0.0016, z * 0.0016 + 9, 3) * 2 - 1);
      return 14 + 150 * n * n + 90 * r * r * n;
    },
    color(x, z, y, sl, out) {
      const n = fbm(x * 0.004, z * 0.004, 3);
      if (y < 2.5) return out.copy(PAL.sand);
      out.copy(PAL.forest).lerp(PAL.grass2, smooth(0.35, 0.7, n)).lerp(PAL.rock, smooth(120, 200, y + n * 60) * 0.8 + smooth(0.8, 1.3, sl) * 0.6);
      return out.lerp(PAL.snow, smooth(200, 260, y + n * 40));
    }
  },
  polar: {
    name: '极地冰原',
    height(x, z) { const n = fbm(x * 0.0007 + 8, z * 0.0007, 5); return 30 + 110 * n * n; },
    color(x, z, y, sl, out) { const n = fbm(x * 0.006, z * 0.006, 2); return out.copy(PAL.snow).lerp(PAL.ice, n * 0.6).lerp(PAL.rock2, smooth(0.9, 1.4, sl) * 0.7); }
  }
};
