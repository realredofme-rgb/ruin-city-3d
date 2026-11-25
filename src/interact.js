// 点击城市里的东西：建筑、地标、车船飞艇、小机械，弹出信息卡并高亮
import * as THREE from 'three';
import { ground } from './world.js';
import { insideFoot, TOWER, FERRIS, PLAZA, HIGHWAY } from './city.js';

const RUIN_NOTES = [
  '楼顶的航空障碍灯还在闪，没人知道电是从哪来的。',
  '十几层的窗台上长出了一整排小树，根顺着排水管往下爬。',
  '墙上还留着褪色的广告字，只剩下半个「港」字。',
  '鸽子在断开的楼板上筑巢，傍晚时整栋楼都在咕咕叫。',
  '一层的商铺卷帘门半开着，里面积了齐膝深的落叶。',
  '风从中段的缺口穿过时，会发出很低的哨音。',
  '拾遗者常在这栋楼下徘徊，像是在等什么人。'
];
const HOUSE_NOTES = ['窗台上摆着一排风干的鱼。', '门口的信箱塞满了旧报纸。', '屋里的收音机整天放着天气预报。', '阳台上晾着刚洗的帆布。', '这家的猫总蹲在屋檐下躲雨。', '二楼住着给电车修弓子的老师傅。'];
const CARGO = ['渔获', '茶叶', '旧机械零件', '灯油', '帆布与缆绳', '从废墟里拾回的铜线'];

export class Picker {
  constructor({ camera, dom, scene, city, life, rig, env, onRide }) {
    Object.assign(this, { camera, dom, scene, city, life, rig, env, onRide });
    this.ray = new THREE.Raycaster(); this.ray.far = 4000;
    this.card = document.getElementById('card'); this.sel = null;
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.9, depthTest: false }));
    this.box.renderOrder = 10; this.box.visible = false; scene.add(this.box);
    let down = null;
    dom.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    dom.addEventListener('pointerup', e => {
      if (!down || rig.mode === 'walk' && e.pointerType !== 'mouse') { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
      if (moved < 6 && dt < 450) this.pick(e.clientX, e.clientY);
    });
    document.getElementById('cardClose').onclick = () => this.close();
  }
  targets() { return this.scene.children.filter(o => (o.isMesh || o.isGroup || o.isInstancedMesh) && !o.userData.noPick); }
  pick(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1), this.camera);
    const hits = this.ray.intersectObjects(this.targets(), true);
    for (const h of hits) { const info = this.identify(h); if (info) return this.show(info); }
    this.close();
  }
  identify(hit) {
    const p = hit.point, { city, life } = this;
    for (let o = hit.object; o; o = o.parent) {
      const pk = life.pickables.find(q => q.obj === o);
      if (pk) return this.moverInfo(pk);
      if (city.islands.includes(o)) return { title: '浮空岛', rows: [['高度', `离地约 ${Math.round(o.position.y)} 米`], ['岛上', '残柱、拱门和一片小树林']], note: '没人知道它们为什么浮着。晶体在岛的周围慢慢绕圈，夜里会更亮。', focus: o.position.clone(), dist: 160 };
    }
    if (hit.object.userData.flora || hit.object.userData.noPick) return null; // 树和草丛不弹卡
    const f = insideFoot(city.footprints, p.x, p.z, 2.5);
    if (f) return this.buildingInfo(f, p);
    if (Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < 90) return { title: '白塔', rows: [['高度', '约 600 米（顶部断裂）'], ['位置', '北方山顶']], note: '塔顶断成了几块，悬在半空慢慢转动；两道光环绕着它，夜里发出青白色的光。', focus: new THREE.Vector3(TOWER.x, TOWER.y + 380, TOWER.z), dist: 900 };
    if (Math.hypot(p.x - FERRIS.x, p.z - FERRIS.z) < 48 && p.y > 4) return { title: '锈蚀的摩天轮', rows: [['直径', '68 米'], ['吊厢', '还剩十三个']], note: '它停在某一天的某一刻，整体朝海的方向歪着。藤蔓已经爬到了最高的吊厢。', focus: new THREE.Vector3(FERRIS.x, 40, FERRIS.z), dist: 120 };
    const L = city.lighthouse;
    if (Math.hypot(p.x - L.x, p.z - L.z) < 14) return { title: '岬角灯塔', rows: [['高度', '36 米'], ['灯', this.env.lamp > 0.3 ? '正在旋转' : '白天熄灯']], note: '雾天里它还会拉响雾笛。', focus: new THREE.Vector3(L.x, L.y + 20, L.z), dist: 90 };
    if (p.y > 8) {
      let best = 1e9; for (let i = 0; i <= 120; i++) { const q = HIGHWAY.getPointAt(i / 120); best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z)); }
      if (best < 10) return { title: '高架残桥', rows: [['长度', '约 1.2 公里'], ['断口', '三处']], note: '桥面上还停着几辆生锈的车，断口处的桥板斜插进了街道。', focus: p.clone(), dist: 90 };
    }
    if (Math.abs(p.y) < 0.6 && ground(p.x, p.z) < -1) return { title: '雾港海湾', rows: [['水深', `约 ${Math.round(-ground(p.x, p.z))} 米`], ['天气', this.env.wx.rain > 0.4 ? '雨，海面起涟漪' : '平静']], note: '湾里沉着七栋半截的高楼，退潮时能看到更多。', focus: p.clone(), dist: 200 };
    if (Math.hypot(p.x - PLAZA.x, p.z - PLAZA.y) < 32) return { title: '浮岛下的水潭', rows: [['来源', '浮空岛的瀑布']], note: '瀑布的水落到一半就散成了雾，只有一部分落进这里。', focus: p.clone(), dist: 80 };
    return null;
  }
  buildingInfo(f, p) {
    const lamp = this.env.lamp, gy = ground(f.x, f.z);
    if (f.kind === 'ruin') {
      const zone = Math.max(1, Math.floor((f.x + 620) / 120) + 1);
      return { title: `旧城第 ${zone} 区 · 断楼 ${f.no} 号`, f, h: f.h,
        rows: [['残高', `${f.h} 米，约 ${Math.round(f.h / 3.5)} 层`], ['倾斜', f.tilt > 2 ? `${f.tilt}°` : '基本竖直'], ['植被覆盖', `${f.green}%`], ['结构', f.notch ? '中段坍塌，上半截还撑着' : '主体尚存，顶部断裂']],
        note: RUIN_NOTES[f.no % RUIN_NOTES.length], focus: new THREE.Vector3(f.x, gy + f.h * 0.5, f.z), dist: Math.max(70, f.h * 1.3) };
    }
    if (f.kind === 'house') {
      const on = lamp * 1.02 > (f.lit ?? 2);
      return { title: `雾港 · 坡上人家 ${f.no} 号`, f, h: f.floors * 3.4 + 4, rows: [['楼层', `${f.floors} 层`], ['灯火', on ? '亮着' : lamp > 0.1 ? '还没开灯' : '白天']], note: HOUSE_NOTES[f.no % HOUSE_NOTES.length], focus: new THREE.Vector3(f.x, gy + 6, f.z), dist: 45 };
    }
    if (f.kind === 'warehouse') return { title: `码头 ${f.no} 号仓库`, f, h: 12, rows: [['存放', CARGO[f.no % CARGO.length]], ['开门', lamp > 0.5 ? '已经上锁' : '正在装卸']], note: '起重机把货从船上吊下来，电车再把它们运进城。', focus: new THREE.Vector3(f.x, gy + 6, f.z), dist: 60 };
    if (f.kind === 'clock') return { title: '钟楼', f, h: 49, rows: [['高度', '49 米'], ['现在', document.getElementById('clock').textContent]], note: '雾港的地标。四面钟盘在天黑后会亮起来。', focus: new THREE.Vector3(f.x, gy + 30, f.z), dist: 80 };
    if (f.kind === 'mast') { const m = this.life.pickables.find(q => q.kind === 'air' && q.ref.name === '邮差号'); return { title: '飞艇系留塔', f, h: 52, rows: [['高度', '50 米'], ['邮差号', m ? m.ref.state : '—']], note: '邮差号每隔一阵就会回来靠一次，机头随风转向。', focus: new THREE.Vector3(f.x, gy + 30, f.z), dist: 120 }; }
    return null;
  }
  moverInfo(pk) {
    const r = pk.ref, o = pk.obj;
    if (pk.kind === 'tram') {
      const st = r.at ? `停靠「${r.at.name}」` : r.v < 0.5 ? '准备出发' : `行驶中，${(r.v * 3.6).toFixed(0)} 公里/时`;
      return { title: r.name, obj: o, rows: [['状态', st], ['乘客', `${r.pax} 人`], ['线路', '旧港西口 — 灯塔岬']], note: '靠站时会开门上下客，出发前会响两声铃。', ride: 'tram', focus: o.position.clone(), dist: 40 };
    }
    if (pk.kind === 'boat') return { title: r.name, obj: o, rows: [['航线', '海湾环线'], ['海况', this.env.wx.rain > 0.4 ? '风浪变大，船身摇晃' : '平稳']], ride: 'boat', focus: o.position.clone(), dist: 60 };
    if (pk.kind === 'air') return { title: '飞艇 · ' + r.name, obj: o, rows: [['状态', r.state], ['高度', `${Math.round(o.position.y)} 米`]], ride: 'air', focus: o.position.clone(), dist: 140 };
    if (pk.kind === 'bot') return { title: `拾遗者 ${String(r.no).padStart(2, '0')}`, obj: o, rows: [['状态', r.wait > 0 ? '停下来东张西望' : '在废墟间游荡'], ['习惯', '有人靠近时会抬头看']], note: '一种小型机械，不知道是谁造的，也不知道在找什么。', focus: o.position.clone(), dist: 14 };
    return null;
  }
  show(info) {
    this.sel = info;
    const c = this.card;
    c.querySelector('h3').textContent = info.title;
    c.querySelector('dl').innerHTML = '';
    for (const [k, v] of info.rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; c.querySelector('dl').append(dt, dd); }
    const n = c.querySelector('p'); n.textContent = info.note || ''; n.hidden = !info.note;
    const bRide = document.getElementById('cRide'); bRide.hidden = !info.ride;
    bRide.onclick = () => { this.onRide(info.ride, info.obj); this.close(); };
    document.getElementById('cGo').onclick = () => this.rig.flyTo(info.obj ? info.obj.position.clone() : info.focus, info.dist);
    c.hidden = false;
    if (info.f) {
      const f = info.f, gy = ground(f.x, f.z);
      this.box.scale.set(f.hx * 2, info.h || 10, f.hz * 2); this.box.position.set(f.x, gy + (info.h || 10) / 2, f.z); this.box.rotation.set(0, Math.atan2(f.s, f.c), 0);
      this.box.visible = true; this.follow = null;
    } else if (info.obj) { this.follow = info.obj; this.box.visible = true; }
    else this.box.visible = false;
  }
  close() { this.card.hidden = true; this.box.visible = false; this.follow = null; this.sel = null; }
  update() {
    if (this.follow) {
      const b = new THREE.Box3().setFromObject(this.follow), s = b.getSize(new THREE.Vector3());
      b.getCenter(this.box.position); this.box.scale.copy(s.addScalar(0.6)); this.box.rotation.set(0, 0, 0);
    }
    if (this.sel && this.sel.obj && !this.card.hidden && (this._t = (this._t || 0) + 1) % 15 === 0) {
      const info = this.moverInfo(this.life.pickables.find(q => q.obj === this.sel.obj));
      const dds = this.card.querySelectorAll('dd'); info.rows.forEach((r, i) => { if (dds[i]) dds[i].textContent = r[1]; });
    }
  }
}
