// 湿地里还在动的东西：萤火、贴水的雾、穿过树冠的光柱、树干上的发光菌、绕着古树飞的白鹭、
// 坐在断桥边钓鱼的三只小机械，和桥上一盏还会亮的旧灯。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smooth, clamp, lerp, dotTexture, mat } from '../../util.js';
import { ground, WATER, nf } from './terrain.js';
import { DECK } from './ruins.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- 萤火 ---------- */
function fireflies(R, centers) {
  const N = 6500, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = centers[Math.floor(R() * centers.length)], a = R() * 6.28, r = Math.sqrt(R()) * c.r;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    pos.set([x, Math.max(ground(x, z), WATER) + 0.6 + Math.pow(R(), 2) * 14, z], i * 3); seed[i] = R() * 100;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uTex: { value: dotTexture() }, uPx: { value: 1.25 } },
    vertexShader: `attribute float seed; uniform float uTime,uNight,uPx; varying float vA; varying float vH;
      void main(){ vec3 p=position; float t=uTime*.35+seed;
        p+=vec3(sin(t*1.3)*2.5+sin(t*.37)*4., sin(t*.9+seed)*1.2+sin(t*.23)*1.5, cos(t*1.1)*2.5+cos(t*.29)*4.);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float blink=pow(.5+.5*sin(uTime*(1.2+fract(seed*1.7)*1.6)+seed*7.),3.);
        vA=uNight*blink*smoothstep(1100.,60.,-mv.z); vH=fract(seed*3.7);
        gl_PointSize=min(uPx*(3.+blink*4.)*(200./-mv.z)*2.4+uPx*1.6, uPx*14.); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; varying float vH;
      void main(){ vec4 t=texture2D(uTex,gl_PointCoord); vec3 c=mix(vec3(.75,1.,.35),vec3(1.,.85,.35),vH)*3.2; gl_FragColor=vec4(c*t.a*vA,1.); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.userData.noPick = true; return p;
}

/* ---------- 贴着水面的雾 ---------- */
function mist(R) {
  const N = 1700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let x, z, k = 0; do { const a = R() * 6.28, r = Math.sqrt(R()) * 1650; x = Math.cos(a) * r; z = Math.sin(a) * r; } while (ground(x, z) > 4 && k++ < 8);
    pos.set([x, WATER + 1.5 + Math.pow(R(), 1.8) * 16, z], i * 3); seed[i] = R() * 100;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOp: { value: 0.5 }, uCol: { value: new THREE.Color(0.8, 0.83, 0.8) }, uH: { value: 900 }, uDrift: { value: 0 } },
    vertexShader: `attribute float seed; uniform float uTime,uH,uOp,uDrift; varying float vA;
      void main(){ vec3 p=position; float t=uTime*.03+seed;
        p.x+=sin(t*1.3)*14.+uDrift; p.z+=cos(t*1.1+seed)*14.; p.y+=sin(t*.7)*1.2;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float d=-mv.z, sz=(34.+fract(seed*7.3)*40.);
        gl_PointSize=clamp(sz*projectionMatrix[1][1]*.5*uH/d, 0., 480.);
        vA=uOp*smoothstep(6.,70.,d)*smoothstep(3000.,1200.,d)*(.45+.55*fract(seed*3.1)); }`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
      void main(){ float r=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.0,r); a*=a; gl_FragColor=vec4(uCol,a*vA*.16); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = 3; p.userData.noPick = true; return p;
}

/* ---------- 光柱 ---------- */
function shafts(R, tops) {
  const geos = [];
  const slant = V(0.32, -1, 0.18).normalize();
  for (const t of tops) {
    if (t.H < 70) continue;
    const n = t.H > 120 ? 4 : 1;
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, r = R() * t.r * 0.6, top = V(t.p.x + Math.cos(a) * r, t.p.y - t.r * 0.25, t.p.z + Math.sin(a) * r);
      const len = (top.y - WATER) / -slant.y, w = R.range(2, 5);
      const g = new THREE.CylinderGeometry(w, w * 2.2, len, 14, 1, true).translate(0, -len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), slant)); g.translate(top.x, top.y, top.z);
      geos.push(g);
    }
  }
  return geos.length ? geos : null;
}
function shaftMesh(geos) {
  // aT：顶点在自己那根光柱里的高度比例（0 = 水面，1 = 树冠下），用来做上下两头的渐隐
  for (const g of geos) {
    const p = g.attributes.position, a = new Float32Array(p.count); let y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < p.count; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
    for (let i = 0; i < p.count; i++) a[i] = (p.getY(i) - y0) / (y1 - y0);
    g.setAttribute('aT', new THREE.BufferAttribute(a, 1)); g.deleteAttribute('uv');
  }
  const g = mergeGeometries(geos);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uOp: { value: 0 }, uCol: { value: new THREE.Color(1, 0.92, 0.72) } },
    vertexShader: `attribute float aT; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); vY=aT; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOp; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float e=pow(abs(dot(normalize(vN),normalize(vV))),2.); float f=smoothstep(0.,.35,vY)*smoothstep(1.,.75,vY);
        gl_FragColor=vec4(uCol*e*f*uOp,1.); }`
  });
  return new THREE.Mesh(g, mat);
}

/* ---------- 白鹭 ---------- */
function egrets(R, around) {
  const N = 28, white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.7 });
  const body = new THREE.SphereGeometry(0.28, 8, 6).scale(1, 0.8, 2.4);
  const wingL = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0.35), V(1.5, 0, -0.1), V(0, 0, -0.35), V(0, 0, -0.35), V(1.5, 0, -0.1), V(1.1, 0, -0.45)]); wingL.computeVertexNormals();
  const wingR = wingL.clone().scale(-1, 1, 1); wingR.computeVertexNormals();
  const ims = [body, wingL, wingR].map(g => { const m = new THREE.InstancedMesh(g, g === body ? white : new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.7, side: THREE.DoubleSide }), N); m.frustumCulled = false; m.castShadow = true; return m; });
  const birds = Array.from({ length: N }, (_, i) => {
    const c = around[i % around.length];
    return { c, r: R.range(50, 130), h: R.range(c.y0 + c.H * 0.4, c.y0 + c.H * 0.85), w: R.range(0.05, 0.09) * (R() < 0.5 ? 1 : -1), ph: R() * 6.28, fl: R.range(5, 7), off: R() * 6 };
  });
  const M = new THREE.Matrix4(), W = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = V(0, 0, 0), s = V(1, 1, 1);
  function update(t) {
    birds.forEach((b, i) => {
      const a = b.ph + t * b.w, x = b.c.x + Math.cos(a) * b.r, z = b.c.z + Math.sin(a) * b.r, y = b.h + Math.sin(t * 0.3 + b.off) * 6;
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w));
      e.set(0, yaw, -Math.sign(b.w) * 0.25, 'YXZ'); q.setFromEuler(e); M.compose(p.set(x, y, z), q, s);
      ims[0].setMatrixAt(i, M);
      const glide = Math.sin(t * 0.21 + b.off) > 0.3, f = glide ? 0.08 : Math.sin(t * b.fl + b.off) * 0.55;
      ims[1].setMatrixAt(i, W.copy(M).multiply(mat(0, 0, 0, 0, 0, f)));
      ims[2].setMatrixAt(i, W.copy(M).multiply(mat(0, 0, 0, 0, 0, -f)));
    });
  }
  return { ims, update };
}

/* ---------- 断桥边的小机械 ---------- */
function robots(at) {
  const shell = new THREE.MeshStandardMaterial({ color: 0xb8ab90, roughness: 0.6, metalness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: 0.7, metalness: 0.4 });
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, 0.4) });
  const side = V(at.dir.z, 0, -at.dir.x), yaw = Math.atan2(at.dir.x, at.dir.z), list = [];
  [-2.6, 0.2, 2.8].forEach((l, i) => {
    const g = new THREE.Group(); g.position.copy(at.p).addScaledVector(side, l); g.position.y = DECK + 0.62; g.rotation.y = yaw + (i - 1) * 0.15;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10).scale(1, 1.05, 0.95), shell); body.position.y = 0.55; g.add(body);
    const head = new THREE.Group(); head.position.y = 1.32; g.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), shell));
    const eyes = new THREE.Group(); head.add(eyes);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeM); e.position.set(s * 0.15, 0.04, 0.38); eyes.add(e); }
    for (const s of [-1, 1]) { // 腿垂在断口外
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.8, 6).translate(0, -0.4, 0), dark); leg.position.set(s * 0.25, 0.25, 0.45); leg.rotation.x = 0.4; g.add(leg);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 6).translate(0, -0.3, 0), dark); arm.position.set(s * 0.55, 0.75, 0); arm.rotation.z = s * 0.3; g.add(arm);
    }
    if (i === 1) { // 中间那只在钓鱼
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 3.6, 5).translate(0, 1.8, 0), dark); rod.position.set(0.3, 0.6, 0.4); rod.rotation.x = 0.95; g.add(rod);
      const tip = V(0.3, 0.6 + Math.cos(0.95) * 3.6, 0.4 + Math.sin(0.95) * 3.6);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tip, V(tip.x, WATER - DECK - 0.62, tip.z + 1.5)]), new THREE.LineBasicMaterial({ color: 0xd8d8d0, transparent: true, opacity: 0.6 }));
      g.add(line); g.userData.rod = rod;
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = { ...g.userData, head, eyes, ph: i * 2.1 };
    list.push(g);
  });
  return list;
}

/** 桥上一盏还会亮的旧灯 */
function lamp(at) {
  const side = V(at.dir.z, 0, -at.dir.x), g = new THREE.Group();
  g.position.copy(at.p).addScaledVector(side, 4.3).addScaledVector(at.dir, -9); g.position.y = DECK + 1.1;
  const m = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.7, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6, 6).translate(0, 3, 0), m); g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 0, -0.8), m); arm.position.y = 5.9; g.add(arm);
  const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bulbM); bulb.position.set(0, 5.65, -1.5); g.add(bulb);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 10, 1, true), m); shade.position.set(0, 5.85, -1.5); g.add(shade);
  g.rotation.y = Math.atan2(side.x, side.z);
  return { g, bulbM, world: g.position.clone().add(V(0, 5.6, 0)) };
}

export function buildLife(root, spots, forest) {
  const R = rng(5150);
  // 萤火聚在水边、树下
  const centers = [...forest.titans.map(t => ({ x: t.x, z: t.z, r: 70 })), ...forest.big.filter((_, i) => i % 2 === 0).map(b => ({ x: b.x, z: b.z, r: 40 })), { x: spots.robotsAt.p.x, z: spots.robotsAt.p.z, r: 60 }];
  const ff = fireflies(R, centers); root.add(ff);
  const fog = mist(R); root.add(fog);
  // 光柱
  const sg = shafts(R, forest.tops); let shaft = null;
  if (sg) { shaft = shaftMesh(sg); shaft.userData.noPick = true; root.add(shaft); }
  // 发光菌
  const fungi = forest.fungi, cap = new THREE.CylinderGeometry(0.5, 0.42, 0.12, 12);
  const fMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const fIM = new THREE.InstancedMesh(cap, fMat, fungi.length * 3); let fi = 0;
  const up = V(0, 1, 0), q = new THREE.Quaternion(), M = new THREE.Matrix4(), s = V(1, 1, 1);
  for (const f of fungi) for (let k = 0; k < 3; k++) {
    const sc = R.range(0.5, 1.3); q.setFromAxisAngle(up, R() * 6);
    M.compose(f.p.clone().addScaledVector(f.n, 0.15 * sc).add(V(R.range(-0.4, 0.4), k * 0.35 - 0.3, R.range(-0.4, 0.4))), q, s.set(sc, sc, sc)); fIM.setMatrixAt(fi++, M);
  }
  fIM.count = fi; root.add(fIM);
  { const c = new THREE.Color(); for (let i = 0; i < fi; i++) fIM.setColorAt(i, c.setHSL(R() < 0.75 ? 0.47 : 0.33, 0.8, R.range(0.45, 0.65))); }
  const birds = egrets(R, forest.titans.slice(0, 4)); for (const m of birds.ims) root.add(m);
  const bots = robots(spots.robotsAt); for (const b of bots) root.add(b);
  const L = lamp(spots.robotsAt); root.add(L.g);

  // 接触网：相邻立柱之间垂着电线，断了的那头吊在半空
  const seg = [], cab = spots.cables;
  for (let i = 0; i < cab.length - 1; i++) {
    const a = cab[i], b = cab[i + 1];
    if (a.distanceTo(b) > 60) { if (R() < 0.6) seg.push(a, a.clone().add(V(R.range(-2, 2), -R.range(6, 18), R.range(-2, 2)))); continue; }
    for (let k = 0; k < 10; k++) { const t0 = k / 10, t1 = (k + 1) / 10; const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1); p0.y -= Math.sin(t0 * Math.PI) * 1.4; p1.y -= Math.sin(t1 * Math.PI) * 1.4; seg.push(p0, p1); }
  }
  if (seg.length) { const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color: 0x2a2622 })); l.userData.noPick = true; root.add(l); }

  const lights = [[L.world.x, L.world.y, L.world.z, 1]];
  fungi.forEach((f, i) => { if (i % 4 === 0) lights.push([f.p.x, f.p.y, f.p.z, 0.22]); });

  const fogDay = new THREE.Color(0.8, 0.84, 0.8), fogDusk = new THREE.Color(0.86, 0.68, 0.56), fogNight = new THREE.Color(0.06, 0.08, 0.12), tmp = new THREE.Color();
  return {
    lights,
    update(dt, t, env) {
      const night = env.night, e = env.e ?? (0.5 - night), h = env.hour ?? 12, wx = env.wx || { fog: 0, rain: 0, cloud: 0 };
      ff.material.uniforms.uTime.value = t; ff.material.uniforms.uNight.value = night * (1 - wx.rain * 0.7);
      // 雾：黎明最浓，夜里次之，正午最薄；雾天整片都是
      const dawn = smooth(3.5, 5.5, h) * smooth(9.5, 7, h);
      const fu = fog.material.uniforms; fu.uTime.value = t; fu.uDrift.value = Math.sin(t * 0.013) * 40;
      fu.uOp.value = clamp(0.38 + dawn * 0.55 + night * 0.25 + wx.fog * 0.6 + wx.rain * 0.2 - smooth(10, 14, h) * smooth(18, 15, h) * 0.12, 0, 1.15);
      tmp.copy(fogNight).lerp(fogDusk, smooth(-0.12, 0.02, e)).lerp(fogDay, smooth(0.04, 0.3, e)); fu.uCol.value.copy(tmp);
      fu.uH.value = innerHeight * Math.min(devicePixelRatio || 1, 1.25);
      if (shaft) shaft.material.uniforms.uOp.value = smooth(0.05, 0.3, e) * (0.1 + wx.fog * 0.35 + dawn * 0.2) * (1 - wx.rain) * (1 - wx.cloud * 0.6);
      fMat.color.setRGB(0.1, 0.55, 0.5).multiplyScalar(0.12 + 2.4 * night);
      forest.flMat.emissiveIntensity = night * 0.9;
      birds.update(t);
      for (const b of bots) {
        const u = b.userData; u.head.rotation.y = Math.sin(t * 0.25 + u.ph) * 0.7; u.head.rotation.x = 0.25 + Math.sin(t * 0.17 + u.ph) * 0.12;
        u.eyes.scale.y = (t + u.ph * 3) % 5.5 < 0.15 ? 0.1 : 1;
        if (u.rod) u.rod.rotation.x = 0.95 + Math.sin(t * 1.7) * 0.03 + (Math.sin(t * 0.13) > 0.97 ? Math.sin(t * 20) * 0.08 : 0);
      }
      const on = smooth(0.5, 0.8, env.lamp ?? night), flick = (Math.sin(t * 13) + Math.sin(t * 31.7) > 1.6) ? 0.25 : 1;
      L.bulbM.color.setRGB(3.2, 2.1, 1.0).multiplyScalar(on * flick + 0.02);
    }
  };
}
