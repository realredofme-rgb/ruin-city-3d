// 星球上的 7 个模块。顺序就是编号；ROUTE 是环星飞艇经过它们的顺序。
// 新模块按 src/modules/README.md 的接口写好后，替换掉 placeholders.js 里对应的那一项即可。
import city from './ruin-city/index.js';
import skyIsles from './sky-isles/index.js';
import { PLACEHOLDERS } from './placeholders.js';

const BUILT = [city, skyIsles];
export const MODULES = [...BUILT, ...PLACEHOLDERS.filter(p => !BUILT.some(b => b.id === p.id))].sort((a, b) => a.no - b.no);
export const ROUTE = ['ruin-city', 'sunken-wetland', 'sky-isles', 'volcano-forge', 'ice-wreck', 'salt-mirror', 'gobi-rift'];
