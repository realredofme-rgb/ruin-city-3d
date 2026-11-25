// 世界：地形高度、地形网格、海面、天空、光照与天气
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, rng, dotTexture } from './util.js';

/* ---------- 地理骨架 ----------
   x 向东，z 向南（海在南），y 向上，单位米。
   西 / 中：断裂高楼的废墟城；东：沿山坡层层叠起的雾港老城；南：海湾与沉没的楼群；北：群山与白塔。 */
export const SEA = 0;
export function shoreZ(x) {
  return 150 + 46 * Math.sin(x / 230 + 0.5) + 24 * Math.sin(x / 97)
    - 70 * Math.exp(-(((x + 120) / 170) ** 2))      // 中央海湾
    + 150 * Math.exp(-(((x - 640) / 55) ** 2));     // 东侧灯塔岬角
}
const terrace = (v, step) => { const k = Math.floor(v / step), f = v / step - k; return step * (k + smooth(0.72, 0.98, f)); };

export function ground(x, z) {
  const n = fbm(x * 0.0035 + 4, z * 0.0035 - 2, 5);
  let y = 2 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 0.6;
  // 北部群山
  y += smooth(-330, -620, z + (n - 0.5) * 120) * (55 + 210 * n);
  // 西部山丘
  y += smooth(-520, -760, x + (n - 0.5) * 100) * (40 + 160 * n);
  // 东部：雾港台地，向东北抬升
  const town = smooth(230, 330, x);
  const rise = Math.max(0, x - 250) * 0.085 + Math.max(0, 90 - z) * 0.075;
  y += town * terrace(rise, 5.5) * (1 - smooth(-380, -470, z) * 0);
  y += smooth(700, 900, x) * (70 + 130 * n);
  // 海岸
  const dz = z - shoreZ(x);
  const beach = 1.6 - dz * 0.32 - Math.max(0, dz - 40) * 0.25;
  y = Math.min(y, beach);
  return Math.max(y, -34);
}

/* ---------- 地形网格 ---------- */
export function makeTerrain(ruinMask) {
  const SIZE = 2400, N = 360;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.translate(60, 0, -120);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const C = {
    sand: new THREE.Color(0xcbbd98), grass: new THREE.Color(0x7d9450), grass2: new THREE.Color(0xa3a764), forest: new THREE.Color(0x4f6b3c),
    rock: new THREE.Color(0x8e867a), rock2: new THREE.Color(0x6c675e), asphalt: new THREE.Color(0x77756d), pave: new THREE.Color(0xb3a58f), bed: new THREE.Color(0x4e6766), snow: new THREE.Color(0xe8e8e2)
  };
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = ground(x, z); p.setY(i, y);
    const e = 3, sl = Math.hypot(ground(x + e, z) - ground(x - e, z), ground(x, z + e) - ground(x, z - e)) / (2 * e);
    const n = fbm(x * 0.03, z * 0.03, 3), n2 = fbm(x * 0.11 + 9, z * 0.11, 2);
    const dz = z - shoreZ(x);
    if (y < -0.6) c.copy(C.bed).lerp(C.sand, clamp((y + 8) / 8, 0, 1));
    else if (dz > -14) c.copy(C.sand).lerp(C.rock, n * 0.5);
    else if (sl > 0.9) c.copy(C.rock).lerp(C.rock2, n);
    else {
      const r = ruinMask(x, z);
      if (r > 0) { // 废墟街面：开裂沥青被草吞没
        c.copy(C.asphalt).lerp(C.pave, n2 * 0.5).lerp(n > 0.5 ? C.grass : C.grass2, smooth(0.38, 0.62, n * 0.7 + n2 * 0.4) * 0.9 * r);
      } else if (x > 250 && z > -300 && y < 70) {
        c.copy(C.pave).lerp(C.grass2, smooth(0.5, 0.75, n) * 0.6);
      } else {
        c.copy(C.forest).lerp(C.grass2, smooth(0.35, 0.7, n)).lerp(C.rock, smooth(140, 230, y + n * 60) * 0.8);
        c.lerp(C.snow, smooth(230, 290, y + n * 40));
      }
    }
    c.multiplyScalar(0.88 + n2 * 0.24);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }));
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------- 海面 ---------- */
export function makeWater() {
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uDeep: { value: new THREE.Color(0x1d4250) },
      uFog: { value: new THREE.Color() }, uFogD: { value: 0.001 }, uRain: { value: 0 }
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform float uTime,uFogD,uRain; uniform vec3 uSun,uSunCol,uSky,uHor,uDeep,uFog; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float wav(vec2 p){ float t=uTime; return n(p*.06+vec2(t*.05,t*.03))*.55+n(p*.17-vec2(t*.09,-t*.04))*.3+n(p*.5+vec2(t*.2,t*.13))*.15; }
      void main(){
        vec2 p=vW.xz; float e=1.2;
        float a=wav(p), bx=wav(p+vec2(e,0.)), bz=wav(p+vec2(0.,e));
        vec3 N=vec3((a-bx)*(1.6+uRain), 1., (a-bz)*(1.6+uRain));
        vec3 V=normalize(cameraPosition-vW); float d=length(cameraPosition-vW);
        if(uRain>.01 && d<260.){ // 雨点在水面打出的涟漪
          for(int k=0;k<3;k++){ vec2 q=p*.45+float(k)*7.31; vec2 c=floor(q); vec2 f=fract(q)-.5;
            float r=h(c+float(k)*3.7); vec2 o=vec2(h(c+3.1),h(c+5.7))-.5; vec2 dd=f-o*.5;
            float ph=fract(uTime*.8+r); float dist=length(dd); float R=ph*.45;
            float ring=sin((dist-R)*55.)*smoothstep(.06,0.,abs(dist-R))*(1.-ph);
            N.xz+=dd/(dist+1e-3)*ring*.9*uRain*smoothstep(260.,60.,d); } }
        N=normalize(N);
        float fr=pow(1.-max(dot(N,V),0.),4.); fr=clamp(.06+fr*.94,0.,1.);
        vec3 R=reflect(-V,N); vec3 refl=mix(uHor,uSky,clamp(R.y*2.,0.,1.));
        vec3 col=mix(uDeep*(.35+.65*max(uSun.y,0.)+.1), refl, fr);
        float sp=pow(max(dot(R,normalize(uSun)),0.),220.)*3.5 + pow(max(dot(R,normalize(uSun)),0.),18.)*.18;
        col+=uSunCol*sp*step(-.05,uSun.y)*(1.-uRain*.8);
        float f=1.-exp(-pow(uFogD*d,2.)); col=mix(col,uFog,clamp(f,0.,1.));
        gl_FragColor=vec4(col, mix(.86,1.,fr));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(geo, mat); m.position.y = SEA; m.renderOrder = 1;
  return m;
}

/* ---------- 天空：渐变 + 太阳 + 云 + 星 ---------- */
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
      uMoon: { value: new THREE.Vector3() }, uNight: { value: 0 }, uCloud: { value: 0.4 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop,uHor,uSun,uSunCol,uMoon; uniform float uNight,uCloud,uTime; varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fb(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 d=normalize(vD); float y=d.y;
        vec3 col=mix(uHor,uTop,pow(clamp(y,0.,1.),.55));
        col=mix(col,uHor*.8,smoothstep(.0,-.25,y));
        vec3 s=normalize(uSun); float sd=max(dot(d,s),0.);
        col+=uSunCol*(pow(sd,8.)*.35+pow(sd,64.)*.5)*(1.-uNight*.9);
        col+=uSunCol*smoothstep(.9994,.9998,sd)*4.*step(-.04,s.y);
        // 云层：投影到天穹平面
        if(y>0.){ vec2 cp=d.xz/(y+.12)*1.6+vec2(uTime*.004,uTime*.002);
          float c=smoothstep(1.-uCloud*.75-.18,1.05,fb(cp)+.25*uCloud);
          vec3 cc=mix(uHor*1.08, uSunCol*.9+uHor*.35, pow(sd,3.)*.7)*(1.-uNight*.75);
          col=mix(col,cc,c*smoothstep(0.,.18,y)*.92); }
        // 星与月
        if(uNight>0.01){ vec3 q=d*300.; vec3 c=floor(q); float st=h(c.xy+c.z*7.1); float tw=.6+.4*sin(uTime*3.+st*60.);
          col+=vec3(.9,.95,1.)*step(.9985,st)*uNight*tw*smoothstep(0.,.2,y);
          float md=max(dot(d,normalize(uMoon)),0.); col+=vec3(.85,.9,1.)*(smoothstep(.9995,.99975,md)*1.6+pow(md,60.)*.08)*uNight; }
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -1;
  return m;
}

/* ---------- 时间调色板 ---------- */
const P = [ // 太阳高度 → 天顶、地平线、雾、阳光
  [-0.35, 0x050a18, 0x15213a, 0x121b2e, 0x6b7fb0],
  [-0.08, 0x1c2547, 0x5a4a66, 0x4b4558, 0x8a7aa0],
  [0.02, 0x3a4f80, 0xf09a62, 0xc08a74, 0xffa060],
  [0.15, 0x5f86b8, 0xf3c99a, 0xd5c0a6, 0xffd2a0],
  [0.45, 0x5d8fc8, 0xd2dbd9, 0xc6cdc6, 0xfff3e0],
  [1.0, 0x4f84c4, 0xcdd9de, 0xc2cbc8, 0xffffff]
].map(r => [r[0], new THREE.Color(r[1]), new THREE.Color(r[2]), new THREE.Color(r[3]), new THREE.Color(r[4])]);
function palette(e, out) {
  let i = 0; while (i < P.length - 2 && e > P[i + 1][0]) i++;
  const a = P[i], b = P[i + 1], t = smooth(a[0], b[0], e);
  for (let k = 0; k < 4; k++) out[k].copy(a[k + 1]).lerp(b[k + 1], t);
}

/* ---------- 环境：光、雾、天气 ---------- */
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.hour = 17.2; this.weather = 'clear'; this.wx = { fog: 0, rain: 0, cloud: 0.35 };
    this.sky = makeSky(); this.sky.userData.noPick = true; scene.add(this.sky);
    this.water = makeWater(); scene.add(this.water);
    scene.fog = new THREE.FogExp2(0xcccccc, 0.0012);
    this.hemi = new THREE.HemisphereLight(0xbcd0e0, 0x5a5040, 0.6); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -760; sc.right = 760; sc.top = 760; sc.bottom = -760; sc.near = 10; sc.far = 2600;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.6;
    this.sun.target.position.set(0, 0, -60); scene.add(this.sun, this.sun.target);
    this.cols = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    this.night = 0; this.lamp = 0; this.wet = 0; this.wind = 0.2; this.wetMats = [];
    this.renderer = renderer; this.pmrem = new THREE.PMREMGenerator(renderer); this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.geometry, this.sky.material); this.envScene.add(this.envSky); this.envKey = '';
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
    this.rain = this.makeRain(); scene.add(this.rain);
  }
  setShadowQuality(size) { this.sun.shadow.mapSize.set(size, size); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } this.sun.castShadow = size > 0; }
  makeRain() {
    const N = 7000, pos = new Float32Array(N * 6), R = rng(77);
    for (let i = 0; i < N; i++) { const x = R.range(-90, 90), y = R.range(0, 120), z = R.range(-90, 90); pos.set([x, y, z, x + 0.3, y - 2.6, z + 0.15], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0.32, depthWrite: false }));
    l.frustumCulled = false; l.visible = false; return l;
  }
  setWeather(w) {
    this.weather = w;
    this.target = { clear: { fog: 0, rain: 0, cloud: 0.32 }, cloudy: { fog: 0.25, rain: 0, cloud: 0.85 }, fog: { fog: 1, rain: 0, cloud: 0.6 }, rain: { fog: 0.55, rain: 1, cloud: 1 } }[w];
  }
  update(dt, t, cam) {
    const tg = this.target || this.wx, k = 1 - Math.exp(-dt * 1.2);
    for (const key of ['fog', 'rain', 'cloud']) this.wx[key] = lerp(this.wx[key], tg[key], k);
    const wx = this.wx;
    // 太阳轨迹：6 点升起于东，18 点落于西，略偏南
    const a = (this.hour - 6) / 12 * Math.PI;
    this.sunDir.set(-Math.cos(a), Math.sin(a) * 0.92, 0.38).normalize();
    this.moonDir.set(Math.cos(a) * 0.5, 0.75, 0.45).normalize();
    const e = this.sunDir.y;
    palette(e, this.cols);
    const [top, hor, fogC, sunC] = this.cols;
    // 天气：雨雾使天色变灰
    const grey = clamp(wx.fog * 0.55 + wx.rain * 0.5 + (wx.cloud - 0.3) * 0.3, 0, 0.85);
    const g = new THREE.Color().copy(fogC).lerp(new THREE.Color(0x9aa3a6).multiplyScalar(0.25 + 0.75 * smooth(-0.2, 0.3, e)), grey * 0.8);
    top.lerp(g, grey * 0.8); hor.lerp(g, grey); fogC.copy(g);
    this.night = 1 - smooth(-0.14, 0.12, e);
    this.lamp = 1 - smooth(-0.02, 0.2, e) + wx.rain * 0.3 + wx.fog * 0.15;
    const dens = 0.00055 + wx.fog * 0.0042 + wx.rain * 0.0012 + this.night * 0.0002;
    this.scene.fog.color.copy(fogC); this.scene.fog.density = dens;
    const su = this.sky.material.uniforms;
    su.uTop.value.copy(top); su.uHor.value.copy(hor); su.uSun.value.copy(this.sunDir); su.uSunCol.value.copy(sunC);
    su.uMoon.value.copy(this.moonDir); su.uNight.value = this.night * (1 - grey); su.uCloud.value = wx.cloud; su.uTime.value = t;
    this.sky.position.copy(cam.position);
    // 光：白天是太阳，夜里是月光
    const day = smooth(-0.06, 0.12, e), sunUp = e > -0.02;
    const L = sunUp ? this.sunDir : this.moonDir;
    this.sun.position.copy(this.sun.target.position).addScaledVector(L, 1300);
    this.sun.color.copy(sunUp ? sunC : new THREE.Color(0x8ea4d8));
    this.sun.intensity = (sunUp ? 0.4 + 2.6 * day : 0.22) * (1 - grey * 0.7);
    this.hemi.color.copy(top).lerp(hor, 0.5); this.hemi.groundColor.copy(fogC).multiplyScalar(0.45);
    this.hemi.intensity = 0.2 + 0.4 * day + grey * 0.3;
    // 雨后地面变湿发亮，雨停后慢慢晾干
    this.wet += ((wx.rain > 0.5 ? 1 : 0) - this.wet) * (1 - Math.exp(-dt / (wx.rain > 0.5 ? 12 : 45)));
    this.wind = 0.18 + wx.cloud * 0.12 + wx.rain * 0.7;
    for (const m of this.wetMats) { m.roughness = lerp(m.userData.r0 ?? (m.userData.r0 = m.roughness), 0.22, this.wet * (m.userData.wetK ?? 1)); m.color.setScalar(1 - 0.3 * this.wet); m.envMapIntensity = 0.55 + this.wet * 0.9; }
    // 用当前天空生成环境光照（时间或天气明显变化时才重算）
    const key = Math.round(this.hour * 6) + '|' + Math.round(grey * 8) + '|' + Math.round(wx.cloud * 4);
    if (key !== this.envKey && t - (this.envT || -9) > 0.6) {
      this.envKey = key; this.envT = t;
      const saved = su.uTime.value; this.envSky.position.set(0, 0, 0);
      const rt = this.pmrem.fromScene(this.envScene, 0.04, 1, 6000);
      if (this.scene.environment) this.scene.environment.dispose();
      this.scene.environment = rt.texture; su.uTime.value = saved;
    }
    const wu = this.water.material.uniforms;
    wu.uTime.value = t; wu.uSun.value.copy(sunUp ? this.sunDir : this.moonDir); wu.uSunCol.value.copy(sunUp ? sunC : new THREE.Color(0x6070a0));
    wu.uSky.value.copy(top); wu.uHor.value.copy(hor); wu.uFog.value.copy(fogC); wu.uFogD.value = dens; wu.uRain.value = wx.rain;
    wu.uDeep.value.set(0x1f4a55).lerp(new THREE.Color(0x0b1622), this.night);
    // 雨
    this.rain.visible = wx.rain > 0.05;
    if (this.rain.visible) {
      this.rain.material.opacity = 0.34 * wx.rain;
      const off = (t * 38) % 120;
      this.rain.position.set(Math.floor(cam.position.x / 4) * 4, cam.position.y - 60 + (120 - off) - 60, Math.floor(cam.position.z / 4) * 4);
      this.rain.rotation.z = -this.wind * 0.35;
    }
  }
}

/** 漂浮光尘：白天是阳光里的尘埃与花粉，夜里是萤火 */
export function makeMotes() {
  const N = 2400, R = rng(5), pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([R.range(-520, 260), R.range(1, 70), R.range(-340, 150)], i * 3); seed[i] = R() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uTex: { value: dotTexture() }, uPx: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime,uNight,uPx; varying float vA;
      void main(){ vec3 p=position; float t=uTime*.25+seed;
        p+=vec3(sin(t*1.3)*6., sin(t*.9+seed)*3.+sin(t*.31)*4., cos(t*1.1)*6.);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float blink=.5+.5*sin(uTime*2.+seed*7.);
        vA=mix(.35, blink, uNight)*smoothstep(600.,60.,-mv.z);
        gl_PointSize=min(uPx*mix(2.2,4.,uNight)*(220./-mv.z)*1.6, uPx*7.); }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uNight; varying float vA;
      void main(){ vec4 t=texture2D(uTex,gl_PointCoord); vec3 c=mix(vec3(1.,.95,.8),vec3(.75,1.,.45)*1.8,uNight); gl_FragColor=vec4(c*t.a*vA,1.); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false;
  return p;
}
