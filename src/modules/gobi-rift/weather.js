// 戈壁的风沙：
//   沙尘雾：给模块里所有标准材质挂一层「沙色的雾」，强度随沙暴变化（星球的雾是灰白的，沙漠里要是赭黄的）。
//   沙幕：围着镜头的一层半透明穹顶，沙暴时把天和远处的地平线都染成昏黄。
//   飞沙：镜头周围被风卷着走的沙粒和大团的沙雾。
//   流沙：从巨人的指缝、身体的裂缝里不停往下淌的细沙。
// 星球的天气只有晴、多云、雾、雨四种；在戈壁里「雾」表现为沙暴，「多云」是起风扬沙。
import * as THREE from 'three';
import { clamp, lerp, smooth, ground } from './terrain.js';

export const DUST = {
  uDustC: { value: new THREE.Color(0xc89a62) },
  uDustD: { value: 0 },
  uLift: { value: 0 }      // 夜里给模块里的东西一点点冷色的「月光」，让轮廓看得出来
};

/** 给标准材质加上沙尘雾 */
export function dust(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uDustC = DUST.uDustC; sh.uniforms.uDustD = DUST.uDustD; sh.uniforms.uLift = DUST.uLift;
    // 星球的雾是给海边城市调的（灰白、偏浓）；沙漠里空气更干净，远处偏暖。这里换成自己的雾，再叠沙尘
    sh.fragmentShader = 'uniform vec3 uDustC; uniform float uDustD, uLift;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLift * vec3(.5, .62, 1.);')
      .replace('#include <fog_fragment>', `
#ifdef USE_FOG
  { float fq = fogDensity * 0.6 * vFogDepth; float ff = 1.0 - exp( - fq * fq );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uDustC, 0.35 ), ff );
    float dq = uDustD * vFogDepth; gl_FragColor.rgb = mix( gl_FragColor.rgb, uDustC, 1.0 - exp( - dq * dq ) ); }
#endif`);
  };
  mat.customProgramCacheKey = () => 'gobiDust';
  return mat;
}

const DOT = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

/** 镜头周围的飞沙（平面坐标，挂载层在着色器里弯到球面） */
function flyingSand(N, box, big) {
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([Math.random() * box, Math.random(), Math.random() * box], i * 3); seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uGround: { value: 0 }, uTime: { value: 0 }, uS: { value: 0 }, uC: DUST.uDustC, uTex: { value: DOT }, uPx: { value: 1 }, uWind: { value: new THREE.Vector2(-1, 0.2) } },
    vertexShader: `attribute float seed; uniform vec3 uCam; uniform float uGround, uTime, uS, uPx; uniform vec2 uWind; varying float vA;
      void main(){
        float B=${box.toFixed(1)}, H=${big ? '70.' : '45.'};
        vec2 w = uWind * uTime * (${big ? '9.' : '26.'} + seed * 14.);
        vec2 q = mod(position.xz + w - uCam.xz + B * .5, B) - B * .5;
        float y = uGround + position.y * H * (.25 + seed) + sin(uTime * 1.7 + seed * 40.) * 1.5;
        vec3 p = vec3(uCam.x + q.x, y, uCam.z + q.y);
        p.xz += vec2(sin(uTime * .9 + seed * 17. + p.z * .02), cos(uTime * .7 + seed * 9. + p.x * .02)) * 4.;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float d = -mv.z, edge = smoothstep(B * .5, B * .3, length(q));
        vA = uS * edge * smoothstep(1., 6., d) * ${big ? '.16' : '.75'};
        gl_PointSize = min(uPx * ${big ? '5200.' : '90.'} / max(d, 1.), uPx * ${big ? '420.' : '10.'});
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uC * 1.12, t.a * vA); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = 3; p.userData.noPick = true;
  return p;
}

/** 从高处不停往下淌的细沙：emitters 是 [x, y, z, 落差, 粗细] */
function sandFalls(emitters) {
  const per = 160, N = emitters.length * per, pos = new Float32Array(N * 3), aux = new Float32Array(N * 3);
  emitters.forEach(([x, y, z, drop, w], k) => {
    for (let i = 0; i < per; i++) { const j = k * per + i; pos.set([x, y, z], j * 3); aux.set([Math.random(), drop, w], j * 3); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aux', new THREE.BufferAttribute(aux, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uC: DUST.uDustC, uTex: { value: DOT }, uPx: { value: 1 }, uWind: { value: 0.3 } },
    vertexShader: `attribute vec3 aux; uniform float uTime, uPx, uWind; varying float vA;
      void main(){
        float ph = fract(aux.x + uTime * (.16 + .05 * fract(aux.x * 37.)) * 24. / sqrt(aux.y));
        float fall = ph * ph * aux.y;
        float r = fract(aux.x * 91.7) - .5, r2 = fract(aux.x * 53.3) - .5;
        vec3 p = position + vec3(r * aux.z * (1. + ph * 3.) - fall * uWind * .35, -fall, r2 * aux.z * (1. + ph * 3.));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vA = smoothstep(0., .05, ph) * (1. - smoothstep(.75, 1., ph)) * .55;
        gl_PointSize = min(uPx * (aux.z * 1.6 + 1.2) * 200. / max(-mv.z, 1.) * (1. + ph * 2.), uPx * 40.);
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(mix(uC, vec3(.86,.62,.38), .6), t.a * vA); }`
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.userData.noPick = true;
  return p;
}

/** 沙幕：世界坐标里跟着镜头的穹顶（不进模块的 root，不需要弯曲） */
function veil() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    uniforms: { uC: DUST.uDustC, uS: { value: 0 }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uC, uUp; uniform float uS; varying vec3 vD;
      void main(){ float y = dot(normalize(vD), uUp); float a = uS * mix(1., .55, smoothstep(.05, .8, y));
        gl_FragColor = vec4(uC * mix(1., .85, smoothstep(0., .9, y)), clamp(a, 0., .97));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = 2; m.userData.noPick = true;
  return m;
}

export class Storm {
  constructor(root, frame, falls) {
    this.frame = frame; this.S = 0; this.gust = 0; this.cam = new THREE.Vector3(9e9, 0, 9e9); this.camW = new THREE.Vector3();
    this.small = flyingSand(9000, 360, false); this.big = flyingSand(420, 900, true);
    this.falls = sandFalls(falls);
    root.add(this.small, this.big, this.falls);
    this.veil = veil(); root.parent.add(this.veil);
    this.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));  // 星球只把像素比告诉城市模块，这里先按常用画质估一个
  }
  setPixelRatio(px) { for (const p of [this.small, this.big, this.falls]) p.material.uniforms.uPx.value = px; }
  /** camLocal：镜头在模块平面坐标里的位置 */
  update(dt, t, env, camLocal) {
    const wx = env.wx;
    if (camLocal) {
      this.cam.copy(camLocal.position); this.frame.toWorld(this.cam.x, this.cam.y, this.cam.z, this.camW);
      const g = ground(this.cam.x, this.cam.z);
      for (const p of [this.small, this.big]) { const u = p.material.uniforms; u.uCam.value.copy(this.cam); u.uGround.value = lerp(g, this.cam.y - 20, 0.35); }
      this.veil.position.copy(this.camW);
    }
    // 沙暴强度：雾 → 沙暴；多云 → 起风扬沙；晴天下午也会偶尔起一阵风
    this.gust = Math.max(0, Math.sin(t * 0.021) * Math.sin(t * 0.057 + 1)) * smooth(10, 15, env.hour) * smooth(19, 16, env.hour);
    const target = clamp(Math.max(smooth(0.3, 0.9, wx.fog), smooth(0.55, 0.95, wx.cloud) * 0.42) + this.gust * 0.12 - wx.rain * 0.8, 0, 1);
    this.S += (target - this.S) * (1 - Math.exp(-dt * 0.5));
    const S = this.S;
    // 沙色：随太阳高度，白天赭黄、黄昏橙红、夜里暗褐
    const e = env.e, day = smooth(-0.14, 0.3, e), dusk = Math.exp(-(((e - 0.05) / 0.12) ** 2));
    const C = DUST.uDustC.value;
    C.setRGB(0.11, 0.085, 0.07).lerp(_c.setRGB(0.80, 0.60, 0.38), day).lerp(_c.setRGB(0.86, 0.47, 0.25), dusk * 0.55);
    // 镜头在模块范围外、或在高空时，沙尘逐渐消失
    const r = Math.hypot(this.cam.x, this.cam.z), here = smooth(2800, 2100, r) * smooth(1600, 500, this.cam.y);
    DUST.uDustD.value = (0.00018 + S * 0.0068) * here;
    DUST.uLift.value = smooth(0.2, 0.9, env.night) * 0.07;
    const wind = 0.6 + S * 2.2;
    for (const p of [this.small, this.big]) { const u = p.material.uniforms; u.uTime.value = t; u.uS.value = clamp(S * 1.4 - 0.05, 0, 1) * here; u.uWind.value.set(-wind, 0.25 * wind); }
    this.small.visible = this.big.visible = S * here > 0.02;
    const fu = this.falls.material.uniforms; fu.uTime.value = t; fu.uWind.value = 0.3 + S * 1.5;
    this.veil.material.uniforms.uS.value = smooth(0.15, 1, S) * 0.92 * here;
    this.veil.visible = this.veil.material.uniforms.uS.value > 0.01;
    this.veil.scale.setScalar(lerp(2600, 900, S));
    this.veil.material.uniforms.uUp.value.copy(this.camW).normalize();
    return S;
  }
}
const _c = new THREE.Color();
