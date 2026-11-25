// 星球上的 7 个模块，一个槽位一行。ROUTE 是环星飞艇经过它们的顺序。
//
// 模块建好后，只改自己那一行：把从 placeholders.js 取占位的 import 换成自己的目录，例如
//   import m6 from './ice-wreck/index.js';
// 别的行、MODULES 和 ROUTE 都不要动。每行之间空一行，几个模块线程同时改各自那一行时 git 能自动合并。
// 模块的 id 必须和占位的 id 一致（gobi-rift、sunken-wetland、sky-isles、volcano-forge、ice-wreck、salt-mirror）。

import m1 from './ruin-city/index.js';

import m2 from './gobi-rift/index.js';

import m3 from './sunken-wetland/index.js';

import m4 from './sky-isles/index.js';

import { volcano as m5 } from './placeholders.js';

import m6 from './ice-wreck/index.js';

import m7 from './salt-mirror/index.js';

export const MODULES = [m1, m2, m3, m4, m5, m6, m7];
export const ROUTE = ['ruin-city', 'sunken-wetland', 'sky-isles', 'volcano-forge', 'ice-wreck', 'salt-mirror', 'gobi-rift'];

// 槽位和编号对不上时直接报错，免得模块悄悄落到别的地块
MODULES.forEach((m, i) => { if (m.no !== i + 1) throw new Error(`模块槽位 ${i + 1} 放的是 ${m.id}（no = ${m.no}）`); });
