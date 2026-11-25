// 把一个在平面里搭好的模块「装」到球面上。
//
// 模块照常往 root 里加物件、照常每帧改 position / quaternion / setMatrixAt，完全不用知道星球的存在；
// Mount 负责把它们弯到球面上，分四种处理：
//   1. 大块静态网格（合并后的建筑、地形，变换为单位矩阵）：逐顶点烘焙到球面，法线跟着转。
//   2. 带自身位置的物件（车、船、飞艇、浮岛、塔的碎块……）：当作刚体，每帧按它的平面位置放到球面上，
//      平面里的朝向再叠加该点切平面的朝向。它的 position / quaternion 始终保持平面值，模块逻辑不受影响。
//   3. InstancedMesh：拦截 setMatrixAt，模块写进来的是平面矩阵，Mount 存一份副本，再逐个实例弯到球面。
//   4. 粒子（Points + ShaderMaterial）：在顶点着色器里做同样的弯曲。
import * as THREE from 'three';
import { BEND_GLSL } from './sphere.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _b = new THREE.Box3();
const isIdentity = m => m.equals(_m2.identity());

export class Mount {
  constructor(frame, root) {
    this.frame = frame; this.root = root;
    this.rigid = []; this.inst = []; this.baked = 0;
  }
  /** 构建完成后调用一次 */
  process() {
    this.root.updateMatrixWorld(true);
    const refs = new Map();
    this.root.traverse(o => { if (o.geometry) refs.set(o.geometry, (refs.get(o.geometry) || 0) + 1); });
    this.refs = refs;
    for (const c of [...this.root.children]) this.classify(c);
    this.sync();
  }
  classify(o) {
    o.updateMatrix();
    const ident = isIdentity(o.matrix);
    if (o.isInstancedMesh) return this.hookInstanced(o);
    if (o.isPoints || (o.isLine && o.material && o.material.isShaderMaterial)) return this.gpuBend(o);
    if (ident && !o.userData.dynamic && !o.isMesh && !o.isLine && !o.isPoints) { for (const c of [...o.children]) this.classify(c); return; }
    if (ident && !o.userData.dynamic) return this.bake(o);
    _b.setFromObject(o, false); _b.getCenter(_v);
    const ext = _b.isEmpty() ? 0 : Math.max(_v.distanceTo(o.position) + _b.getSize(_s).length() / 2, 0);
    if (ext > 700 && !o.userData.dynamic) return this.bake(o);
    this.addRigid(o);
  }
  addRigid(o) {
    o.matrixAutoUpdate = false;
    // Object3D.lookAt 会读世界矩阵（已经在球面上），改成直接用平面坐标
    o.lookAt = function (x, y, z) {
      const t = x.isVector3 ? _v.copy(x) : _v.set(x, y, z);
      _m.lookAt(t, this.position, this.up); this.quaternion.setFromRotationMatrix(_m);
    };
    this.rigid.push(o); this.place(o);
  }
  place(o) {
    const p = o.position;
    this.frame.quatAt(p.x, p.z, _q).multiply(o.quaternion);
    this.frame.toWorld(p.x, p.y, p.z, _p);
    o.matrix.compose(_p, _q, o.scale); o.matrixWorldNeedsUpdate = true;
  }
  bake(o) {
    o.updateMatrixWorld(true);
    const meshes = []; o.traverse(m => { if ((m.isMesh || m.isLine) && !m.isInstancedMesh) meshes.push(m); });
    const F = this.frame;
    for (const m of meshes) {
      let g = m.geometry; if (this.refs.get(g) > 1) g = g.clone();
      g.applyMatrix4(m.matrixWorld);
      const pos = g.attributes.position, nor = g.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (nor) { F.quatAt(x, z, _q); _v.fromBufferAttribute(nor, i).applyQuaternion(_q); nor.setXYZ(i, _v.x, _v.y, _v.z); }
        F.toWorld(x, y, z, _p); pos.setXYZ(i, _p.x, _p.y, _p.z);
      }
      pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
      g.computeBoundingSphere(); g.computeBoundingBox();
      m.geometry = g;
      this.root.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
      m.matrixAutoUpdate = false; m.matrix.identity(); m.matrixWorldNeedsUpdate = true;
      this.baked += pos.count;
    }
    if (o.parent && !meshes.includes(o)) o.parent.remove(o);
  }
  /**
   * InstancedMesh：模块照常用平面坐标 setMatrixAt，这里记下平面矩阵（getFlatMatrixAt 可读回），
   * 真正的 instanceMatrix 存弯到球面后的矩阵。getMatrixAt 保持 three.js 的原意，返回球面上的矩阵，
   * 所以包围球、视锥裁剪和点击拾取都按实例真实所在的位置算。
   * InstancedMesh 自身若有位置或旋转，在挂载时并进每个实例里（之后再改它自身的变换不会生效）。
   */
  hookInstanced(im) {
    im.updateMatrix();
    const pre = isIdentity(im.matrix) ? null : im.matrix.clone();
    if (pre) { im.position.set(0, 0, 0); im.quaternion.identity(); im.scale.set(1, 1, 1); im.updateMatrix(); }
    im.matrixAutoUpdate = false;
    const flat = new Float32Array(im.instanceMatrix.array), rec = { im, flat, pre, dirty: true };
    const get = THREE.InstancedMesh.prototype.getMatrixAt;
    im.setMatrixAt = (i, m) => { m.toArray(flat, i * 16); rec.dirty = true; };
    im.getFlatMatrixAt = (i, m) => m.fromArray(flat, i * 16);
    im.getMatrixAt = (i, m) => { if (rec.dirty) this.bendInstances(rec); return get.call(im, i, m); };
    this.inst.push(rec);
  }
  bendInstances(r) {
    r.dirty = false;
    const F = this.frame, a = r.im.instanceMatrix.array, f = r.flat, n = r.im.count;
    for (let i = 0; i < n; i++) {
      const k = i * 16;
      _m.fromArray(f, k); if (r.pre) _m.premultiply(r.pre);
      const e = _m.elements, x = e[12], y = e[13], z = e[14];
      e[12] = e[13] = e[14] = 0;
      _m2.makeRotationFromQuaternion(F.quatAt(x, z, _q)).multiply(_m);
      F.toWorld(x, y, z, _p); _m2.elements[12] = _p.x; _m2.elements[13] = _p.y; _m2.elements[14] = _p.z;
      _m2.toArray(a, k);
    }
    r.im.instanceMatrix.needsUpdate = true;
    // 实例搬到了球面上，旧的包围体作废；下一次视锥裁剪或拾取时 three.js 会按新矩阵重算
    r.im.boundingSphere = null; r.im.boundingBox = null;
  }
  gpuBend(o) {
    const mat = o.material;
    Object.assign(mat.uniforms, this.frame.uniforms());
    mat.vertexShader = BEND_GLSL + '\n' + mat.vertexShader.replace(/modelViewMatrix\s*\*\s*vec4\(\s*([\w.]+)\s*,\s*1\.0?\s*\)/g, 'viewMatrix*vec4(planetBend((modelMatrix*vec4($1,1.)).xyz),1.)');
    mat.needsUpdate = true; o.frustumCulled = false;
  }
  /** 每帧在模块更新之后调用 */
  sync() {
    for (const o of this.rigid) this.place(o);
    for (const r of this.inst) if (r.dirty) this.bendInstances(r);
  }
  /** 世界中的相机 → 一个带平面位置与朝向的代理（给模块里用距离、方位的逻辑） */
  localCamera(cam, proxy) {
    this.frame.toLocal(cam.position, proxy.position);
    this.frame.quatAt(proxy.position.x, proxy.position.z, _q).invert();
    proxy.quaternion.copy(_q).multiply(cam.quaternion);
    proxy.updateMatrixWorld(true);
    return proxy;
  }
}
