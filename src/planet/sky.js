// 整颗星球统一的昼夜与天气，以及从街道到太空的天空、大气、云层、海面、光照。
//
// 时间：只有一个全球时钟 T（经度 0 处的时刻）。太阳在赤道面上绕星球转，每个地方的当地时间 = T + 经度 / 15°，
//       所以晨昏线会依次扫过各个模块。
// 天气：几团天气系统（雨、雾、阴云）在星球上空自西向东漂移；任何一点的天气都由它们混合而成。
//       面板上选的天气会「钉」在你正在看的地方。
import * as THREE from 'three';
import { R, latLon, lonOf, enu } from './sphere.js';
import { clamp, lerp, smooth, rng } from '../util.js';

const WX = { clear: { fog: 0, rain: 0, cloud: 0.32 }, cloudy: { fog: 0.25, rain: 0, cloud: 0.85 }, fog: { fog: 1, rain: 0, cloud: 0.6 }, rain: { fog: 0.55, rain: 1, cloud: 1 } };
export const WX_NAME = { clear: '晴', cloudy: '多云', fog: '雾', rain: '雨' };
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);

/* ================= 全球气候 ================= */
export class Climate {
  constructor() {
    this.T = 17.1; this.sun = new THREE.Vector3(); this.moon = new THREE.Vector3();
    this.cells = [
      { lat: 8, lon: 40, r: 0.32, kind: 'rain' }, { lat: 48, lon: 115, r: 0.4, kind: 'cloudy' }, { lat: -38, lon: -105, r: 0.32, kind: 'fog' },
      { lat: 40, lon: -15, r: 0.42, kind: 'cloudy' }, { lat: -30, lon: 170, r: 0.3, kind: 'rain' }, { lat: -5, lon: -40, r: 0.26, kind: 'fog' }
    ].map(c => ({ ...c, dir: latLon(c.lat, c.lon) }));
    this.pins = [];
    this.update(0);
  }
  /** 太阳方向：T=12 时在经度 0 的正上方 */
  sunAt(T, out) { const a = -(T - 12) / 12 * Math.PI; return out.set(Math.sin(a), 0, Math.cos(a)); }
  update(dtHours) {
    this.T = (this.T + dtHours + 24) % 24;
    this.sunAt(this.T, this.sun);
    this.moon.copy(this.sun).negate().add(_v.set(0, 0.5, 0)).normalize();
    const drift = dtHours * 5 * Math.PI / 180; // 天气系统每小时向东漂 5°
    for (const c of this.cells) { c.lon += dtHours * 5; c.dir.applyAxisAngle(Y, drift); }
  }
  localHour(d) { return ((this.T + lonOf(d) / 15) % 24 + 24) % 24; }
  setLocalHour(d, h) { this.T = ((h - lonOf(d) / 15) % 24 + 24) % 24; this.sunAt(this.T, this.sun); this.moon.copy(this.sun).negate().add(_v.set(0, 0.5, 0)).normalize(); }
  /** 在 d 处钉一种天气（半径约 2.4 公里） */
  pin(d, kind) {
    this.pins = this.pins.filter(p => p.dir.angleTo(d) > 0.2);
    this.pins.push({ dir: d.clone().normalize(), kind, r: 0.3 });
  }
  sample(d, out = { fog: 0, rain: 0, cloud: 0 }) {
    Object.assign(out, WX.clear);
    const mix = (p, k) => { if (k <= 0) return; const t = WX[p]; out.fog = lerp(out.fog, t.fog, k); out.rain = lerp(out.rain, t.rain, k); out.cloud = lerp(out.cloud, t.cloud, k); };
    for (const c of this.cells) mix(c.kind, smooth(c.r, c.r * 0.45, c.dir.angleTo(d)));
    for (const p of this.pins) mix(p.kind, smooth(p.r, p.r * 0.5, p.dir.angleTo(d)));
    return out;
  }
  kindAt(d) { const w = this.sample(d); return w.rain > 0.5 ? 'rain' : w.fog > 0.6 ? 'fog' : w.cloud > 0.7 ? 'cloudy' : 'clear'; }
}

/** 某一地点感受到的环境：和城市 v1 的 env 字段一致（hour、night、lamp、wx、wind、wet、weather） */
export class LocalEnv {
  constructor(climate, dir) { this.climate = climate; this.dir = dir.clone().normalize(); this.wx = climate.sample(this.dir, {}); this.wet = 0; this.tg = {}; this.update(0); }
  at(dir, jump = false) { this.dir.copy(dir).normalize(); if (jump) this.climate.sample(this.dir, this.wx); return this; }
  update(dt) {
    const C = this.climate, tg = C.sample(this.dir, this.tg), k = 1 - Math.exp(-dt * 1.2);
    for (const key of ['fog', 'rain', 'cloud']) this.wx[key] = lerp(this.wx[key], tg[key], k);
    this.weather = C.kindAt(this.dir);
    this.hour = C.localHour(this.dir);
    this.e = C.sun.dot(this.dir);       // 太阳高度角的正弦
    this.night = 1 - smooth(-0.14, 0.12, this.e);
    this.lamp = 1 - smooth(-0.02, 0.2, this.e) + this.wx.rain * 0.3 + this.wx.fog * 0.15;
    this.wet += ((this.wx.rain > 0.5 ? 1 : 0) - this.wet) * (1 - Math.exp(-dt / (this.wx.rain > 0.5 ? 12 : 45)));
    this.wind = 0.18 + this.wx.cloud * 0.12 + this.wx.rain * 0.7;
    return this;
  }
}

/* ================= 光照着色器补丁 =================
   three.js 的内置材质默认「上」是世界 Y、太阳照到哪里都一样亮。星球上每个点的「上」不同，
   这里改三处：平行光乘上晨昏线因子（背阳面不再被照亮），半球光改用局部的上，环境反射按昼夜衰减。 */
let patched = false;
export function patchLighting() {
  if (patched) return; patched = true;
  const S = THREE.ShaderChunk;
  S.lights_pars_begin = S.lights_pars_begin
    .replace('light.color = directionalLight.color;', 'light.color = directionalLight.color * planetLit( dot( planetUpV(), directionalLight.direction ) );')
    .replace('float dotNL = dot( normal, hemiLight.direction );', 'float dotNL = dot( normal, planetUpV() );')
    .replace('vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );', 'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ) * planetDay();')
    .replace('#if NUM_DIR_LIGHTS > 0', `
vec3 planetUpV() { vec3 c = ( viewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz; return normalize( - vViewPosition - c ); }
float planetLit( float e ) { return smoothstep( -0.05, -0.01, e ) * 0.133 + 0.867 * smoothstep( -0.06, 0.12, e ); }
float planetDay();
#if NUM_DIR_LIGHTS > 0`);
  S.lights_pars_begin += `
float planetDay() {
#if NUM_DIR_LIGHTS > 0
  return mix( 0.1, 1.0, smoothstep( -0.25, 0.2, dot( planetUpV(), directionalLights[ 0 ].direction ) ) );
#else
  return 1.0;
#endif
}`;
  S.lights_fragment_maps += `
#if defined( USE_ENVMAP ) && defined( STANDARD )
  iblIrradiance *= planetDay(); radiance *= planetDay();
#endif`;
}
/** CPU 端同样的因子，用来在相机所在处抵消，保证地面附近的亮度和 v1 一样 */
export const planetDayCPU = e => lerp(0.1, 1, smooth(-0.25, 0.2, e));

/* ================= 天色调色板（沿用 v1） ================= */
const P = [
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

const NOISE = `
float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }`;

/* ---------- 地面天穹（随相机，按局部的上摆正；升空后淡出） ---------- */
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
      uMoon: { value: new THREE.Vector3() }, uNight: { value: 0 }, uCloud: { value: 0.4 }, uTime: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop,uHor,uSun,uSunCol,uMoon; uniform float uNight,uCloud,uTime,uAlpha; varying vec3 vD;
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
        if(y>0.){ vec2 cp=d.xz/(y+.12)*1.6+vec2(uTime*.004,uTime*.002);
          float c=smoothstep(1.-uCloud*.75-.18,1.05,fb(cp)+.25*uCloud);
          vec3 cc=mix(uHor*1.08, uSunCol*.9+uHor*.35, pow(sd,3.)*.7)*(1.-uNight*.75);
          col=mix(col,cc,c*smoothstep(0.,.18,y)*.92); }
        if(uNight>0.01){ vec3 q=d*300.; vec3 c=floor(q); float st=h(c.xy+c.z*7.1); float tw=.6+.4*sin(uTime*3.+st*60.);
          col+=vec3(.9,.95,1.)*step(.9985,st)*uNight*tw*smoothstep(0.,.2,y);
          float md=max(dot(d,normalize(uMoon)),0.); col+=vec3(.85,.9,1.)*(smoothstep(.9995,.99975,md)*1.6+pow(md,60.)*.08)*uNight; }
        gl_FragColor=vec4(col,uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -1; m.userData.noPick = true;
  return m;
}

/* ---------- 太空：星空与太阳 ---------- */
function makeStars() {
  const N = 4000, R0 = rng(9), pos = new Float32Array(N * 3), mag = new Float32Array(N);
  for (let i = 0; i < N; i++) { const u = R0() * 2 - 1, a = R0() * 6.283, s = Math.sqrt(1 - u * u); pos.set([s * Math.cos(a), u, s * Math.sin(a)], i * 3); mag[i] = Math.pow(R0(), 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uOp: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float mag; uniform float uPx; varying float vM; void main(){ vM=mag; vec4 p=projectionMatrix*viewMatrix*vec4(cameraPosition+(modelMatrix*vec4(position,0.)).xyz*1000.,1.); gl_Position=p.xyww; gl_PointSize=uPx*(1.+mag*2.5); }`,
    fragmentShader: `uniform float uOp; varying float vM; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(.85,.9,1.)*(.35+vM*2.), smoothstep(.5,.1,d)*uOp); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = -3; p.userData.noPick = true; return p;
}
function makeSunGlow() {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending, uniforms: { uDir: { value: new THREE.Vector3() }, uOp: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `uniform vec3 uDir; uniform float uPx; void main(){ vec4 p=projectionMatrix*viewMatrix*vec4(cameraPosition+uDir*1000.,1.); gl_Position=p.xyww; gl_PointSize=220.*uPx; }`,
    fragmentShader: `uniform float uOp; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=exp(-d*d*28.)*2.5+exp(-d*5.)*.35; gl_FragColor=vec4(vec3(1.,.93,.8)*a*uOp,1.); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = -2; p.userData.noPick = true; return p;
}

/* ---------- 大气层（从太空看到的蓝边与晨昏色） ---------- */
const RA = R * 1.12;
function makeAtmosphere(GU) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uSun: GU.uSun, uOp: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uOp; varying vec3 vW;
      void main(){
        vec3 o=cameraPosition, v=normalize(vW-o);
        float b=dot(o,v), c=dot(o,o)-${(RA * RA).toFixed(1)}, D=b*b-c; if(D<0.) discard;
        float sD=sqrt(D), t0=max(-b-sD,0.), t1=-b+sD;
        float cp=dot(o,o)-${(R * R).toFixed(1)}, Dp=b*b-cp; bool hit=false;
        if(Dp>0.){ float tp=-b-sqrt(Dp); if(tp>0.){ t1=min(t1,tp); hit=true; } }
        if(t1<=t0) discard;
        // 沿视线取 8 个样点积分：密度随高度指数衰减，每个样点按自己那里的日照着色
        vec3 S=normalize(uSun); float dt=(t1-t0)/8., od=0.; vec3 sc=vec3(0.);
        for(int i=0;i<8;i++){
          vec3 p=o+v*(t0+dt*(float(i)+.5)); float r=length(p);
          float rho=exp(-(r-${R.toFixed(1)})/${(R * 0.028).toFixed(1)});
          float sl=dot(p/r,S); float lit=smoothstep(-.18,.2,sl);
          vec3 col=mix(vec3(1.,.42,.18), vec3(.32,.58,1.), smoothstep(-.02,.3,sl));
          sc+=col*rho*lit*dt; od+=rho*dt;
        }
        vec3 cAvg=sc/max(od,1e-3);
        float tau=od/${(R * 0.42).toFixed(1)};
        vec3 L=cAvg*(1.-exp(-tau))*(1.+pow(max(dot(v,S),0.),6.)*1.5);
        gl_FragColor=vec4(L*uOp*(hit?.85:1.3),1.);
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(RA, 96, 48), mat); m.frustumCulled = false; m.renderOrder = 5; m.userData.noPick = true; return m;
}

/* ---------- 云层（从高空看的整球云，跟随天气系统） ---------- */
const NC = 8;
function makeClouds(GU) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uSun: GU.uSun, uTime: GU.uTime, uOp: { value: 0 }, uCell: { value: Array.from({ length: NC }, () => new THREE.Vector4()) } },
    vertexShader: `varying vec3 vN; void main(){ vN=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uSun; uniform float uTime,uOp; uniform vec4 uCell[${NC}]; varying vec3 vN; ${NOISE}
      float fb(vec3 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*n3(p); p=p*2.07+3.1; a*=.5; } return s; }
      void main(){
        vec3 n=normalize(vN);
        float cov=.32;
        for(int i=0;i<${NC};i++){ vec4 c=uCell[i]; if(c.w<=0.) continue; float k=smoothstep(c.w,c.w*.45,acos(clamp(dot(n,c.xyz),-1.,1.))); cov=mix(cov,.95,k*.9); }
        float ang=uTime*.002; vec3 q=vec3(n.x*cos(ang)-n.z*sin(ang), n.y, n.x*sin(ang)+n.z*cos(ang));
        float f=fb(q*7.+vec3(0.,0.,uTime*.003))*.7+fb(q*23.)*.3;
        float a=smoothstep(1.-cov*.8-.12,1.05-cov*.35,f+cov*.25);
        float sl=dot(n,normalize(uSun)); float lit=smoothstep(-.12,.25,sl);
        vec3 col=mix(vec3(.06,.07,.11), mix(vec3(1.,.62,.42), vec3(1.), smoothstep(.0,.35,sl)), lit);
        gl_FragColor=vec4(col, a*.88*uOp*mix(.35,1.,lit));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(R + 700, 160, 80), mat); m.renderOrder = 4; m.userData.noPick = true; return m;
}

/* ---------- 海面：以相机脚下为中心的极坐标网格，在着色器里精确贴到海平面球面上 ---------- */
function makeOcean(GU) {
  const NR = 180, NA = 256, s = [], a = [], idx = [];
  for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) { s.push(i / NR); a.push(j / NA * Math.PI * 2); }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const k = i * (NA + 1) + j; idx.push(k, k + NA + 1, k + 1, k + 1, k + NA + 1, k + NA + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(s.length * 3), 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1)); g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 1)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: GU.uTime, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uDeep: { value: new THREE.Color(0x1d4250) },
      uFog: { value: new THREE.Color() }, uFogD: { value: 0.001 }, uRain: { value: 0 },
      uUp: { value: new THREE.Vector3(0, 1, 0) }, uE: { value: new THREE.Vector3(1, 0, 0) }, uN: { value: new THREE.Vector3(0, 0, 1) }, uTh: { value: 0.1 }, uSunW: GU.uSun
    },
    vertexShader: `attribute float aS, aA; uniform vec3 uUp,uE,uN; uniform float uTh; varying vec3 vW;
      void main(){ float th=uTh*pow(aS,2.2); vec3 d=uUp*cos(th)+(uE*cos(aA)+uN*sin(aA))*sin(th); vW=d*${R.toFixed(1)}; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: `
      uniform float uTime,uFogD,uRain; uniform vec3 uSun,uSunCol,uSky,uHor,uDeep,uFog,uSunW; varying vec3 vW; ${NOISE}
      float wav(vec3 p){ float t=uTime; return n3(p*.06+vec3(t*.05,t*.03,-t*.04))*.55+n3(p*.17-vec3(t*.09,-t*.04,t*.06))*.3+n3(p*.5+vec3(t*.2,t*.13,t*.11))*.15; }
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 up=normalize(vW); vec3 T1=normalize(abs(up.y)<.95?cross(vec3(0,1,0),up):cross(vec3(1,0,0),up)); vec3 T2=cross(up,T1);
        vec3 V=normalize(cameraPosition-vW); float d=length(cameraPosition-vW);
        float amp=(1.6+uRain)*smoothstep(5000.,400.,d);
        float e=1.2, a=wav(vW), bx=wav(vW+T1*e), bz=wav(vW+T2*e);
        vec3 N=up+T1*(a-bx)*amp+T2*(a-bz)*amp;
        vec2 p=vec2(dot(vW,T1),dot(vW,T2));
        if(uRain>.01 && d<260.){
          for(int k=0;k<3;k++){ vec2 q=p*.45+float(k)*7.31; vec2 c=floor(q); vec2 f=fract(q)-.5;
            float r=h(c+float(k)*3.7); vec2 o=vec2(h(c+3.1),h(c+5.7))-.5; vec2 dd=f-o*.5;
            float ph=fract(uTime*.8+r); float dist=length(dd); float Rr=ph*.45;
            float ring=sin((dist-Rr)*55.)*smoothstep(.06,0.,abs(dist-Rr))*(1.-ph);
            vec2 g=dd/(dist+1e-3)*ring*.9*uRain*smoothstep(260.,60.,d); N+=T1*g.x+T2*g.y; } }
        N=normalize(N);
        float lit=smoothstep(-.2,.15,dot(up,normalize(uSunW)));
        float fr=pow(1.-max(dot(N,V),0.),4.); fr=clamp(.06+fr*.94,0.,1.);
        vec3 Rf=reflect(-V,N); float ry=dot(Rf,up);
        vec3 refl=mix(uHor,uSky,clamp(ry*2.,0.,1.))*mix(.05,1.,lit);
        vec3 col=mix(uDeep*(.35+.65*lit+.1), refl, fr);
        float sp=pow(max(dot(Rf,normalize(uSun)),0.),220.)*3.5 + pow(max(dot(Rf,normalize(uSun)),0.),18.)*.18;
        col+=uSunCol*sp*step(-.05,dot(up,normalize(uSun)))*(1.-uRain*.8)*smoothstep(9000.,1500.,d);
        float f=1.-exp(-pow(uFogD*d,2.)); col=mix(col,uFog,clamp(f,0.,1.));
        gl_FragColor=vec4(col, mix(.86,1.,fr));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 1; m.userData.noPick = true; return m;
}

function makeRain() {
  const N = 7000, pos = new Float32Array(N * 6), R0 = rng(77);
  for (let i = 0; i < N; i++) { const x = R0.range(-90, 90), y = R0.range(0, 120), z = R0.range(-90, 90); pos.set([x, y, z, x + 0.3, y - 2.6, z + 0.15], i * 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0.32, depthWrite: false }));
  l.frustumCulled = false; l.visible = false; l.userData.noPick = true; return l;
}

/* ================= 视觉环境 ================= */
export class Atmos {
  constructor(scene, renderer, climate) {
    this.scene = scene; this.renderer = renderer; this.climate = climate;
    this.GU = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 } };
    this.sky = makeSky(); scene.add(this.sky);
    this.stars = makeStars(); scene.add(this.stars);
    this.sunGlow = makeSunGlow(); scene.add(this.sunGlow);
    this.atmo = makeAtmosphere(this.GU); scene.add(this.atmo);
    this.clouds = makeClouds(this.GU); scene.add(this.clouds);
    this.ocean = makeOcean(this.GU); scene.add(this.ocean);
    this.rain = makeRain(); scene.add(this.rain);
    scene.fog = new THREE.FogExp2(0xcccccc, 0.0012);
    scene.background = new THREE.Color(0x000000);
    this.hemi = new THREE.HemisphereLight(0xbcd0e0, 0x5a5040, 0.6); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -760; sc.right = 760; sc.top = 760; sc.bottom = -760; sc.near = 10; sc.far = 3000;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8ea4d8, 0.22); scene.add(this.moon, this.moon.target);
    this.cols = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    this.view = new LocalEnv(climate, new THREE.Vector3(0, 0, 1));
    this.pmrem = new THREE.PMREMGenerator(renderer); this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.geometry, this.sky.material); this.envScene.add(this.envSky); this.envKey = '';
    this.mats = new Set(); this.comp = 1;
  }
  setShadowQuality(size) { this.sun.shadow.mapSize.set(size, size); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
  /** 登记场景里所有标准材质，用来统一做环境光补偿 */
  collect(root) { root.traverse(o => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) if (m.isMeshStandardMaterial) { m.userData.envBase ??= m.envMapIntensity; this.mats.add(m); } }); }
  /**
   * @param cam 相机；@param shadowAt 阴影中心（世界坐标，通常是镜头对着的地面）
   */
  update(dt, t, cam, shadowAt) {
    const C = this.climate, GU = this.GU;
    GU.uSun.value.copy(C.sun); GU.uTime.value = t;
    const camR = cam.position.length(), alt = Math.max(camR - R, 0), up = _u.copy(cam.position).normalize();
    const env = this.view.at(up).update(dt), wx = env.wx, e = env.e;
    const space = smooth(600, 4500, alt), high = smooth(2500, 14000, alt);
    palette(e, this.cols);
    const [top, hor, fogC, sunC] = this.cols;
    const grey = clamp(wx.fog * 0.55 + wx.rain * 0.5 + (wx.cloud - 0.3) * 0.3, 0, 0.85) * (1 - space);
    const g = new THREE.Color().copy(fogC).lerp(new THREE.Color(0x9aa3a6).multiplyScalar(0.25 + 0.75 * smooth(-0.2, 0.3, e)), grey * 0.8);
    top.lerp(g, grey * 0.8); hor.lerp(g, grey); fogC.copy(g);
    // 雾：随高度变薄，太空里没有
    const dens = (0.00055 + wx.fog * 0.0042 + wx.rain * 0.0012 + env.night * 0.0002) * Math.pow(1 - smooth(120, 2200, alt), 2);
    this.scene.fog.color.copy(fogC); this.scene.fog.density = dens;
    // 天穹：摆正到相机脚下的局部坐标
    const [E, N] = enu(up);
    this.sky.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(E, up, _v.crossVectors(E, up)));
    _q.copy(this.sky.quaternion).invert();
    const su = this.sky.material.uniforms;
    su.uTop.value.copy(top); su.uHor.value.copy(hor); su.uSun.value.copy(C.sun).applyQuaternion(_q); su.uSunCol.value.copy(sunC);
    su.uMoon.value.copy(C.moon).applyQuaternion(_q); su.uNight.value = env.night * (1 - grey); su.uCloud.value = wx.cloud; su.uTime.value = t;
    su.uAlpha.value = 1 - space;
    this.sky.position.copy(cam.position); this.sky.visible = space < 0.999;
    this.stars.material.uniforms.uOp.value = Math.max(space, env.night * 0.0); this.stars.visible = space > 0.001;
    this.stars.rotation.y = -(C.T - 12) / 12 * Math.PI;
    this.sunGlow.material.uniforms.uDir.value.copy(C.sun); this.sunGlow.material.uniforms.uOp.value = space; this.sunGlow.visible = space > 0.001;
    this.atmo.material.uniforms.uOp.value = smooth(900, 7000, alt); this.atmo.visible = alt > 900;
    this.atmo.material.side = camR > RA ? THREE.FrontSide : THREE.BackSide; // 在大气层外画近的那一面，免得被远裁剪面切掉
    // 云层：天气系统 → uniform
    const cells = [...C.cells, ...C.pins];
    const cu = this.clouds.material.uniforms.uCell.value;
    for (let i = 0; i < NC; i++) { const c = cells[i]; if (c && c.kind !== 'clear') cu[i].set(c.dir.x, c.dir.y, c.dir.z, c.kind === 'rain' ? c.r : c.r * 0.8); else cu[i].set(0, 1, 0, 0); }
    this.clouds.material.uniforms.uOp.value = smooth(1000, 3500, alt); this.clouds.visible = alt > 1000;
    // 光：太阳永远是太阳（背阳面由着色器补丁压暗），月光是第二盏平行光
    const sunCol = sunC.clone().lerp(new THREE.Color(1, 0.98, 0.95), high);
    this.sun.color.copy(sunCol); this.sun.intensity = 3 * (1 - grey * 0.7);
    this.moon.color.set(0x8ea4d8); this.moon.intensity = lerp(0.22, 0.45, high);
    this.moon.position.copy(C.moon).multiplyScalar(100); this.moon.target.position.set(0, 0, 0);
    // 半球光与环境反射：在相机所在处抵消晨昏因子，地面附近的亮度保持 v1 的调校
    const comp = lerp(1 / planetDayCPU(e), 1, high);
    this.hemi.color.copy(top).lerp(hor, 0.5).lerp(new THREE.Color(0x9fb4cc), high); this.hemi.groundColor.copy(fogC).multiplyScalar(0.45).lerp(new THREE.Color(0x3c3a36), high);
    this.hemi.intensity = lerp((0.2 + 0.4 * smooth(-0.06, 0.12, e) + grey * 0.3), 0.55, high) * comp;
    this.comp = comp;
    for (const m of this.mats) m.envMapIntensity = m.userData.envBase * comp;
    // 阴影：围着镜头对着的地方
    const ext = clamp(760 * Math.max(1, alt / 260), 760, 6000), sc = this.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.far = ext * 4 + 2500; sc.updateProjectionMatrix(); }
    this.sun.target.position.copy(shadowAt); this.sun.position.copy(shadowAt).addScaledVector(C.sun, ext * 2 + 1200);
    this.sun.target.updateMatrixWorld();
    // 环境贴图：时间、天气或所在地明显变化时重算
    const key = Math.round(env.hour * 6) + '|' + Math.round(grey * 8) + '|' + Math.round(wx.cloud * 4) + '|' + Math.round(up.x * 20) + ',' + Math.round(up.y * 20) + ',' + Math.round(up.z * 20);
    if (key !== this.envKey && t - (this.envT || -9) > 0.6) {
      this.envKey = key; this.envT = t;
      this.envSky.quaternion.copy(this.sky.quaternion); su.uAlpha.value = 1;
      const rt = this.pmrem.fromScene(this.envScene, 0.04, 1, 6000);
      if (this.scene.environment) this.scene.environment.dispose();
      this.scene.environment = rt.texture; su.uAlpha.value = 1 - space;
    }
    // 海面
    const ou = this.ocean.material.uniforms, th = Math.acos(clamp(R / Math.max(camR, R + 2), -1, 1));
    ou.uUp.value.copy(up); ou.uE.value.copy(E); ou.uN.value.copy(N); ou.uTh.value = Math.min(th * 1.08 + 0.004, 1.5);
    const sunUp = e > -0.02;
    ou.uSun.value.copy(sunUp ? C.sun : C.moon); ou.uSunCol.value.copy(sunUp ? sunC : new THREE.Color(0x6070a0));
    ou.uSky.value.copy(top).lerp(new THREE.Color(0x4f84c4), high); ou.uHor.value.copy(hor).lerp(new THREE.Color(0x9ab8d0), high); ou.uFog.value.copy(fogC); ou.uFogD.value = dens; ou.uRain.value = wx.rain * (1 - space);
    ou.uDeep.value.set(0x1f4a55).lerp(new THREE.Color(0x0b1622), env.night * (1 - high));
    // 雨：沿局部的上落下
    this.rain.visible = wx.rain > 0.05 && alt < 400;
    if (this.rain.visible) {
      this.rain.material.opacity = 0.34 * wx.rain;
      const off = (t * 38) % 120;
      this.rain.quaternion.setFromUnitVectors(Y, up);
      this.rain.position.copy(cam.position).addScaledVector(up, (120 - off) - 120);
    }
    return env;
  }
}
