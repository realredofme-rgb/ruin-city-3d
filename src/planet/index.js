// 星球：分块、地表、模块挂载、夜灯、分块轮廓，全部在这里装起来。
import * as THREE from 'three';
import { R } from './sphere.js';
import { makeTiles } from './tiles.js';
import { Surface, surfaceMaterial, tileOutline } from './surface.js';
import { Mount } from './mount.js';
import { FILLERS } from './biomes.js';

const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

export class Planet {
  constructor(scene, modules) { this.scene = scene; this.modules = modules; }
  async build({ detail = 110, status = () => {} } = {}) {
    status('正在给星球分块…', 0.06); await frame();
    this.tiles = makeTiles(this.modules);
    this.surface = new Surface(this.tiles);
    status('正在铺开整颗星球的地表…', 0.12); await frame();
    const t0 = performance.now();
    this.mesh = new THREE.Mesh(this.surface.buildMesh(detail), surfaceMaterial());
    this.mesh.receiveShadow = true; this.mesh.userData.planet = true; this.scene.add(this.mesh);
    this.buildMs = performance.now() - t0;
    // 模块
    let k = 0;
    for (const m of this.modules) {
      status(m.status === 'built' ? `正在搭建模块 ${m.no}「${m.name}」…` : `正在给模块 ${m.no}「${m.name}」留出地块…`, 0.3 + 0.55 * (k++ / this.modules.length)); await frame();
      const root = new THREE.Group(); root.name = m.id; this.scene.add(root);
      m.root = root; m.frame = m.tile.frame;
      m.inst = m.build ? m.build.call(m, { root, frame: m.frame, status }) || {} : {};
      m.mount = new Mount(m.frame, root); m.mount.process();
    }
    status('正在点亮夜灯…', 0.88); await frame();
    this.lights = this.makeLights();
    this.outline = tileOutline(this.tiles, this.surface); this.scene.add(this.outline);
    return this;
  }
  height(d) { return this.surface.height(d); }
  /** d 处所在地块（按未扰动的最近中心） */
  tileAt(d) { let best = null, bd = -2; for (const t of this.tiles) { const k = t.c.dot(d); if (k > bd) { bd = k; best = t; } } return best; }
  placeName(d) { const t = this.tileAt(d); return t.module ? t.module.name : FILLERS[t.kind].name; }
  /** 从太空看得见的夜灯（模块提供平面坐标，这里转到球面） */
  makeLights() {
    const pos = [], b = [];
    for (const m of this.modules) for (const [x, y, z, w] of m.inst.lights || []) { const p = m.frame.toWorld(x, y, z); pos.push(p.x, p.y, p.z); b.push(w); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3() }, uOp: { value: 0 }, uPx: { value: 1 } },
      vertexShader: `attribute float aB; uniform vec3 uSun; uniform float uPx; varying float vA;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
          float night=smoothstep(.08,-.12,dot(normalize(position),normalize(uSun)));
          vA=night*aB; gl_PointSize=uPx*clamp(42000./-mv.z,1.4,5.); }`,
      fragmentShader: `uniform float uOp; varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(1.,.72,.38)*smoothstep(.5,0.,d)*vA*uOp*1.6,1.); }`
    });
    const p = new THREE.Points(g, mat); p.frustumCulled = false; p.userData.noPick = true; this.scene.add(p);
    return p;
  }
  /** 每帧：各模块逻辑 → 弯到球面 */
  update(dt, t, ctx) {
    for (const m of this.modules) {
      if (m.inst.update) m.inst.update(dt, t, ctx.envOf(m), ctx.camOf(m), ctx.speed);
      m.mount.sync();
    }
    const L = this.lights.material.uniforms; L.uSun.value.copy(ctx.sun);
    L.uOp.value = THREE.MathUtils.smoothstep(ctx.cam.position.length() - R, 1500, 5000);
  }
}
