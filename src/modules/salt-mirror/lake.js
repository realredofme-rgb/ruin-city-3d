// 镜面湖：三遍绘制，做出一块真正映出天空和湖上万物的镜子。
//
//  1. 天空倒影（renderOrder -10）：沿反射方向重算一遍星球天穹的颜色（云、太阳、月亮、星星都在），不写深度。
//  2. 镜像世界（renderOrder -9）：湖上每件东西都有一份以湖面为镜翻到水下的副本（见 kit.js 的 mirrorGeometry），
//     正常写深度，盖在天空倒影上。它们在平面坐标里翻转，再随模块一起弯到球面，所以倒影贴合星球曲率。
//  3. 盐壳与水膜（renderOrder -8）：一层带光照和阴影的盐面，按「干 / 湿」决定透出多少倒影；
//     深度测试设为总是通过并写入湖面深度，于是之后画的星球地表、湖底都挡不住倒影，而湖面以上的实物照常盖在上面。
import * as THREE from 'three';
import { R } from '../../planet/sphere.js';

const NOISE = `
float lh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float ln(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(lh(i),lh(i+vec2(1,0)),f.x),mix(lh(i+vec2(0,1)),lh(i+vec2(1,1)),f.x),f.y); }
float lf(vec2 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=a*ln(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s/.9375; }`;

/** 极坐标圆盘：中心密、外圈疏，弯到球面上依然平滑 */
function discGeometry(R0, NR = 90, NA = 220) {
  const pos = [], loc = [], idx = [];
  pos.push(0, 0, 0); loc.push(0, 0);
  for (let i = 1; i <= NR; i++) {
    const r = R0 * Math.pow(i / NR, 1.35);
    for (let j = 0; j < NA; j++) { const a = j / NA * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r; pos.push(x, 0, z); loc.push(x, z); }
  }
  for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
  for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, c = a + NA, d = b + NA;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(loc, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** 在场景里找到星球的地面天穹（Atmos.sky），共享它的 uniform */
function findSky(scene) {
  let sky = null;
  scene?.traverse(o => { const u = o.material?.uniforms; if (!sky && o.isMesh && u?.uTop && u?.uHor && u?.uCloud) sky = o; });
  return sky;
}

export function makeLake({ L, radius, scene, wet }) {
  const sky = findSky(scene), su = sky?.material.uniforms;
  const U = {
    uTop: su?.uTop || { value: new THREE.Color(0x5d8fc8) }, uHor: su?.uHor || { value: new THREE.Color(0xd2dbd9) },
    uSun: su?.uSun || { value: new THREE.Vector3(0.3, 0.8, 0.5) }, uSunCol: su?.uSunCol || { value: new THREE.Color(1, 0.95, 0.9) },
    uMoon: su?.uMoon || { value: new THREE.Vector3(0, 1, 0) }, uNight: su?.uNight || { value: 0 }, uCloud: su?.uCloud || { value: 0.4 },
    uTime: su?.uTime || { value: 0 }, uSkyInv: { value: new THREE.Matrix3() }, uWind: { value: 0.2 }, uWet: { value: 0 }, uRain: { value: 0 }
  };
  const geo = discGeometry(radius);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

  /* ---------- 1. 天空倒影 ---------- */
  const skyMat = new THREE.ShaderMaterial({
    fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `attribute vec2 aL; varying vec3 vW; varying vec2 vL;
      #include <fog_pars_vertex>
      void main(){ vW=position; vL=aL; vec4 mvPosition=viewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uTop,uHor,uSun,uSunCol,uMoon; uniform float uNight,uCloud,uTime,uWind,uRain; uniform mat3 uSkyInv;
      varying vec3 vW; varying vec2 vL;
      #include <fog_pars_fragment>
      ${NOISE}
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fb(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
      // 与星球天穹（sky.js 的 makeSky）同一套天色，d 是天穹自己的局部方向
      vec3 skyCol(vec3 d){
        float y=d.y;
        vec3 col=mix(uHor,uTop,pow(clamp(y,0.,1.),.55));
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
        return col;
      }
      void main(){
        vec3 up=normalize(vW);
        vec3 T1=normalize(abs(up.y)<.95?cross(vec3(0,1,0),up):cross(vec3(1,0,0),up)), T2=cross(up,T1);
        float d=length(cameraPosition-vW);
        // 几乎静止的水面：风大时才起一点细纹，远处抹平
        vec2 q=vL*.42+uTime*vec2(.35,.21), q2=vL*1.3-uTime*vec2(.5,.8);
        vec2 g=vec2(ln(q)-ln(q+vec2(.6,0.)), ln(q)-ln(q+vec2(0.,.6)))+.5*vec2(ln(q2)-ln(q2+vec2(.6,0.)), ln(q2)-ln(q2+vec2(0.,.6)));
        float amp=(uWind*.06+uRain*.12)*smoothstep(700.,40.,d);
        vec3 N=normalize(up+(T1*g.x+T2*g.y)*amp);
        vec3 V=normalize(cameraPosition-vW);
        vec3 Rf=reflect(-V,N);
        vec3 dl=normalize(uSkyInv*Rf); dl.y=max(dl.y,.002);
        vec3 col=skyCol(normalize(dl))*.94;
        // 升空后天穹的调色板不再代表这里的天，倒影慢慢收成深一点的天蓝，免得从太空看整片湖发白
        float alt=length(cameraPosition)-${R.toFixed(1)};
        col=mix(col, col*.42+vec3(.04,.07,.12), smoothstep(700.,4500.,alt));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  Object.assign(skyMat.uniforms, U);
  const skyMesh = new THREE.Mesh(geo, skyMat);
  skyMesh.renderOrder = -10; skyMesh.userData.noPick = true;
  skyMesh.onBeforeRender = () => {
    if (sky) { _q.copy(sky.quaternion).invert(); U.uSkyInv.value.setFromMatrix4(_m.makeRotationFromQuaternion(_q)); }
  };

  /* ---------- 3. 盐壳与水膜 ---------- */
  const cover = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    depthFunc: THREE.AlwaysDepth, depthWrite: true
  });
  cover.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uWet: U.uWet, uTime: U.uTime, uRain: U.uRain });
    sh.vertexShader = 'attribute vec2 aL;\nvarying vec2 vL;\nvarying vec3 vUpV;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = aL; vUpV = normalize(normalMatrix * normal);');
    sh.fragmentShader = 'uniform float uWet, uTime, uRain;\nvarying vec2 vL;\nvarying vec3 vUpV;\n' + NOISE + `
      vec2 hh(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
      // 盐壳的多边形裂纹：Voronoi 边界（F2 - F1）
      float cells(vec2 p, out float id){
        vec2 i=floor(p), f=fract(p); float d1=8., d2=8.; id=0.;
        for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 b=vec2(x,y), o=hh(i+b); o=.5+.38*sin(6.2831*o); vec2 r=b+o-f; float d=dot(r,r);
          if(d<d1){ d2=d1; d1=d; id=lh(i+b); } else if(d<d2) d2=d; }
        return sqrt(d2)-sqrt(d1);
      }
      ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float r=length(vL), ang=atan(vL.y,vL.x);
        float nn=(lf(vL*.0025+vec2(7.,-3.))-.5)*2.;
        float lobe=smoothstep(.3,1.,cos(ang-1.72));
        float edge=1000.+170.*nn+260.*lobe;
        float wet=smoothstep(edge+70.,edge-50.,r);
        wet=max(wet, smoothstep(.6,.68,lf(vL*.018))*smoothstep(edge+260.,edge+20.,r));   // 干湿交界的零星水洼
        wet=max(wet, uWet*smoothstep(edge+420.,edge+200.,r));                            // 下过雨，整片盐壳都积起水
        float px=length(fwidth(vL));
        float id; float e=cells(vL/5.2, id);
        float ridge=smoothstep(.13,.04,e)*smoothstep(1.6,.4,px);
        float id2; float e2=cells(vL/31.+vec2(4.1,2.7), id2);
        float big=smoothstep(.06,.0,e2)*smoothstep(9.,2.,px);
        float mott=lf(vL*.045);
        vec3 salt=vec3(.8,.79,.76)*(.9+.1*id)*(.93+.14*mott);
        salt=mix(salt, vec3(.88,.87,.84), max(ridge,big*.6));
        salt=mix(salt, vec3(.64,.58,.5), smoothstep(edge+120.,edge+380.,r)*.6);     // 近岸带一点泥色
        // 水膜：倒影的多少随视角变化（掠射时几乎是完美的镜子）；越靠岸，盐棱越多地露出水面
        float cosV=clamp(dot(normalize(vViewPosition),normalize(vUpV)),0.,1.);
        float aW=.05+.36*cosV*cosV;
        float poke=smoothstep(380.,edge,r)*.85*(1.-uWet*.7);
        float a=mix(1., max(aW, ridge*poke), wet);
        vec3 film=mix(vec3(.66,.72,.76), salt, .35);
        diffuseColor=vec4(mix(salt, film, wet*(1.-ridge*poke)), a);
      }`);
  };
  const coverMesh = new THREE.Mesh(geo, cover);
  coverMesh.renderOrder = -8; coverMesh.receiveShadow = true; coverMesh.userData.noPick = true;
  skyMesh.position.y = coverMesh.position.y = 0;
  // 都在 y = L：直接把顶点抬上去，保持单位变换，让挂载层把它们烘焙到球面
  geo.translate(0, L, 0);

  return {
    meshes: [skyMesh, coverMesh],
    update(t, env) {
      if (!su) U.uTime.value = t;
      U.uWind.value = env.wind; U.uRain.value = env.wx?.rain || 0;
      U.uWet.value = wet();
    }
  };
}
