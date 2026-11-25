// 星球上的 7 个模块。顺序就是编号；ROUTE 是环星飞艇经过它们的顺序。
// 新模块按 src/modules/README.md 的接口写好后，替换掉 placeholders.js 里对应的那一项即可。
import city from './ruin-city/index.js';
import saltMirror from './salt-mirror/index.js';
import { PLACEHOLDERS } from './placeholders.js';

// 已建成的模块会顶替 placeholders.js 里同 id 的占位
const BUILT = [city, saltMirror];
export const MODULES = [...BUILT, ...PLACEHOLDERS.filter(p => !BUILT.some(b => b.id === p.id))].sort((a, b) => a.no - b.no);
export const ROUTE = ['ruin-city', 'sunken-wetland', 'sky-isles', 'volcano-forge', 'ice-wreck', 'salt-mirror', 'gobi-rift'];
