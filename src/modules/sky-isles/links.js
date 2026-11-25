// 岛与岛之间的连接：粗铁链（把岛拴在台地上、或者两座岛互相拴着）和木板吊桥。
// 岛会上下浮动，所以链环和桥板每帧按两端的当前位置重新排一次（实例化网格，挂载层会自动弯到球面上）。
import * as THREE from 'three';
import { linkGeo } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _sc = new THREE.Vector3();

/** 端点：固定点，或者某座岛上的一个局部点（随岛移动） */
export const fixed = v => out => out.copy(v);
export const onIsle = (isle, local) => out => out.copy(local).applyQuaternion(isle.g.quaternion).add(isle.g.position);

/** 抛物线近似的悬链：A→B，中间下垂 sag 米 */
function curve(A, B, sag, t, out) { return out.copy(A).lerp(B, t).addScaledVector(UP, -sag * 4 * t * (1 - t)); }
function tangent(A, B, sag, t, out) { return out.copy(B).sub(A).addScaledVector(UP, -sag * 4 * (1 - 2 * t)).normalize(); }

export class Links {
  constructor(mats) {
    this.mats = mats; this.chains = []; this.bridges = [];
  }
  /** size：链环缩放（1 ≈ 2.9 米一节）；sag：下垂量（相对跨度） */
  chain(A, B, { size = 1, sag = 0.06 } = {}) {
    const a = A(new THREE.Vector3()), b = B(new THREE.Vector3()), len = a.distanceTo(b);
    const n = Math.max(4, Math.round(len * 1.04 / (2.1 * size)));
    this.chains.push({ A, B, size, sag, n, roll: Math.random() * 3 });
  }
  /** 吊桥：A、B 是两端桥面中心 */
  bridge(A, B, { width = 3.4, sag = 0.05 } = {}) {
    const a = A(new THREE.Vector3()), b = B(new THREE.Vector3()), len = a.distanceTo(b);
    this.bridges.push({ A, B, width, sag, planks: Math.round(len / 1.15), ropes: Math.ceil(len / 3.5) });
  }
  build(root) {
    const nl = this.chains.reduce((s, c) => s + c.n, 0);
    this.linkMesh = new THREE.InstancedMesh(linkGeo(), this.mats.iron, Math.max(nl, 1));
    const np = this.bridges.reduce((s, b) => s + b.planks, 0), nr = this.bridges.reduce((s, b) => s + b.ropes * 4 + Math.ceil(b.ropes / 2) * 2, 0);
    this.plankMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 0.95), this.mats.wood, Math.max(np, 1));
    this.ropeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 1), this.mats.rope, Math.max(nr, 1));
    const pc = new THREE.Color();
    for (let i = 0; i < np; i++) this.plankMesh.setColorAt(i, pc.setHSL(0.07, 0.35, 0.22 + Math.random() * 0.14).multiplyScalar(1.4));
    for (const m of [this.linkMesh, this.plankMesh, this.ropeMesh]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; root.add(m); }
    this.update();
  }
  update() {
    // 铁链
    let k = 0; const lm = this.linkMesh;
    for (const c of this.chains) {
      c.A(_a); c.B(_b); const len = _a.distanceTo(_b), sag = c.sag * len;
      for (let i = 0; i < c.n; i++) {
        const t = (i + 0.5) / c.n;
        curve(_a, _b, sag, t, _p); tangent(_a, _b, sag, t, _t);
        _q.setFromUnitVectors(UP, _t); _q2.setFromAxisAngle(UP, c.roll + (i % 2) * Math.PI / 2); _q.multiply(_q2);
        _m.compose(_p, _q, _sc.setScalar(c.size)); lm.setMatrixAt(k++, _m);
      }
    }
    lm.count = k;
    // 吊桥：桥板 + 两侧上下各一道绳 + 竖向吊绳
    let kp = 0, kr = 0; const pm = this.plankMesh, rm = this.ropeMesh;
    const rope = (p0, p1) => {
      _t.copy(p1).sub(p0); const l = _t.length(); _t.divideScalar(l || 1);
      _q.setFromUnitVectors(_u.set(0, 0, 1), _t); _m.compose(_s.copy(p0).add(p1).multiplyScalar(0.5), _q, _sc.set(1, 1, l)); rm.setMatrixAt(kr++, _m);
    };
    const side = new THREE.Vector3(), prev = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], cur = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const b of this.bridges) {
      b.A(_a); b.B(_b); const len = _a.distanceTo(_b), sag = b.sag * len;
      side.copy(_b).sub(_a).setY(0).normalize(); side.set(-side.z, 0, side.x);
      for (let i = 0; i < b.planks; i++) {
        const t = (i + 0.5) / b.planks; curve(_a, _b, sag, t, _p); tangent(_a, _b, sag, t, _t);
        _m.lookAt(_s.copy(_p).add(_t), _p, UP); _q.setFromRotationMatrix(_m);
        _q2.setFromAxisAngle(_t, Math.sin(i * 12.9898) * 0.04); _q.premultiply(_q2);
        _m.compose(_p.addScaledVector(UP, Math.sin(i * 78.233) * 0.04), _q, _sc.set(b.width * (0.92 + 0.08 * Math.sin(i * 4.1)), 1, 1)); pm.setMatrixAt(kp++, _m);
      }
      const hw = b.width / 2 + 0.15, hand = 1.25;
      for (let i = 0; i <= b.ropes; i++) {
        const t = i / b.ropes; curve(_a, _b, sag, t, _p);
        // 扶手绳比桥面下垂得少一点
        const lift = hand + sag * 4 * t * (1 - t) * 0.35;
        cur[0].copy(_p).addScaledVector(side, hw).addScaledVector(UP, lift); cur[1].copy(_p).addScaledVector(side, -hw).addScaledVector(UP, lift);
        cur[2].copy(_p).addScaledVector(side, hw).addScaledVector(UP, -0.1); cur[3].copy(_p).addScaledVector(side, -hw).addScaledVector(UP, -0.1);
        if (i > 0) for (let s = 0; s < 4; s++) rope(prev[s], cur[s]);
        if (i % 2 === 0) { rope(cur[2], cur[0]); rope(cur[3], cur[1]); }
        for (let s = 0; s < 4; s++) prev[s].copy(cur[s]);
      }
    }
    pm.count = kp; rm.count = kr;
    lm.instanceMatrix.needsUpdate = pm.instanceMatrix.needsUpdate = rm.instanceMatrix.needsUpdate = true;
  }
}
