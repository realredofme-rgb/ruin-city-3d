// 入口：渲染器、后期、主循环与界面
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Environment, makeTerrain, makeMotes } from './world.js';
import { buildCity, makeMaterials, ruinMask, U } from './city.js';
import { Picker } from './interact.js';
import { Ambience } from './audio.js';
import { buildLife } from './life.js';
import { CameraRig, TOURS } from './camera.js';

const $ = s => document.querySelector(s);
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const status = (t, p) => { $('#loadMsg').textContent = t; $('#bar i').style.width = Math.round(p * 100) + '%'; };

async function start() {
  const canvas = $('#stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 12000);

  status('正在铺设山海…', 0.1); await frame();
  const env = new Environment(scene, renderer);
  const terrain = makeTerrain(ruinMask); scene.add(terrain);
  status('正在堆叠断裂的高楼…', 0.3); await frame();
  const M = makeMaterials();
  const city = buildCity(scene, M);
  status('正在唤醒电车与飞艇…', 0.75); await frame();
  const life = buildLife(scene, city);
  const motes = makeMotes(); scene.add(motes);
  const rig = new CameraRig(camera, canvas, city, life);
  env.wetMats = [terrain.material, M.tower, M.plain, M.house, M.metal];
  M.house.userData.wetK = 0.6;
  const audio = new Ambience();
  const picker = new Picker({ camera, dom: canvas, scene, city, life, rig, env, onRide: (kind, obj) => { rig.startRide(kind, obj); caption('搭乘中', '点右上角「自由视角」回到俯瞰'); } });
  let shake = 0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.86);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  /* ---------- 画质 ---------- */
  const Q = { low: { pr: 0.8, sh: 1024, bloom: false }, medium: { pr: 1.25, sh: 2048, bloom: true }, high: { pr: 2, sh: 4096, bloom: true } };
  let quality = matchMedia('(max-width: 760px)').matches ? 'low' : 'medium';
  function applyQuality(q) {
    quality = q; const c = Q[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio, c.pr)); env.setShadowQuality(c.sh); bloom.enabled = c.bloom;
    resize(); setOn('#quality', q);
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
    camera.aspect = w / h; camera.fov = w < h ? 68 : 55; camera.updateProjectionMatrix();
    motes.material.uniforms.uPx.value = renderer.getPixelRatio(); life.dust.material.uniforms.uPx.value = renderer.getPixelRatio();
  }
  addEventListener('resize', resize);

  /* ---------- 状态 ---------- */
  const S = { rate: 1, speed: 1, paused: false };
  env.setWeather('clear'); env.hour = 17.1;

  /* ---------- 界面 ---------- */
  function setOn(sel, v) { document.querySelectorAll(sel + ' [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); }
  $('#tours').innerHTML = TOURS.map(t => `<button class="tour" type="button" data-tour="${t.id}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('');
  document.querySelectorAll('#tours .tour').forEach(b => b.onclick = () => {
    const t = TOURS.find(x => x.id === b.dataset.tour);
    env.hour = t.hour; env.setWeather(t.weather); setOn('#weather', t.weather); rig.startTour(t);
    caption(t.name, t.desc);
    document.querySelectorAll('#tours .tour').forEach(x => x.classList.toggle('on', x === b));
    if (innerWidth < 760) togglePanel(false);
  });
  const slider = $('#time');
  slider.oninput = () => { env.hour = +slider.value; };
  document.querySelectorAll('#presets [data-h]').forEach(b => b.onclick = () => { env.hour = +b.dataset.h; });
  document.querySelectorAll('#rate [data-v]').forEach(b => b.onclick = () => { S.rate = +b.dataset.v; setOn('#rate', b.dataset.v); });
  document.querySelectorAll('#weather [data-v]').forEach(b => b.onclick = () => { env.setWeather(b.dataset.v); setOn('#weather', b.dataset.v); });
  document.querySelectorAll('#quality [data-v]').forEach(b => b.onclick = () => applyQuality(b.dataset.v));
  $('#bHome').onclick = () => { rig.home(); caption('全景', '拖动旋转，滚轮或双指缩放，右键平移'); };
  $('#bWalk').onclick = () => { rig.startWalk(); caption('街道漫游', matchMedia('(pointer: coarse)').matches ? '左下摇杆移动，拖动屏幕转头' : 'WASD 移动，Shift 奔跑，拖动鼠标转头'); if (innerWidth < 760) togglePanel(false); };
  document.querySelectorAll('#rides [data-ride]').forEach(b => b.onclick = () => { rig.startRide(b.dataset.ride); caption('搭乘' + b.textContent, '点「自由视角」回到俯瞰'); if (innerWidth < 760) togglePanel(false); });
  $('#bPause').onclick = () => { S.paused = !S.paused; $('#bPause').textContent = S.paused ? '继续' : '暂停'; $('#bPause').classList.toggle('on', S.paused); };
  function togglePanel(open) { const p = $('#panel'); p.hidden = open === undefined ? !p.hidden : !open; $('#tPanel').setAttribute('aria-pressed', String(!p.hidden)); }
  $('#tPanel').onclick = () => togglePanel();
  $('#tBare').onclick = () => { document.body.classList.toggle('bare'); };
  $('#tSound').onclick = () => {
    const on = !audio.on; on ? audio.start() : audio.stop();
    $('#tSound').setAttribute('aria-pressed', String(on)); $('#tSound').textContent = on ? '声音：开' : '声音：关';
  };
  if (innerWidth < 760) togglePanel(false);
  rig.onModeChange = m => {
    $('#modeName').textContent = { orbit: '自由视角', tour: '风景巡游', ride: '搭乘中', walk: '街道漫游' }[m];
    $('#bExit').hidden = m === 'orbit';
    document.body.classList.toggle('walking', m === 'walk');
    if (m !== 'tour') document.querySelectorAll('#tours .tour').forEach(x => x.classList.remove('on'));
  };
  rig.onModeChange('orbit');
  $('#bExit').onclick = () => { if (rig.mode === 'walk' || rig.mode === 'ride') rig.home(); else rig.toOrbit(); };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('bare');
    if (e.key === 'Escape' && rig.mode !== 'orbit') $('#bExit').click();
  });
  let capTimer = 0;
  function caption(t, d) { $('#capT').textContent = t; $('#capD').textContent = d; const c = $('#caption'); c.classList.add('show'); clearTimeout(capTimer); capTimer = setTimeout(() => c.classList.remove('show'), 6000); }
  // 触屏摇杆
  {
    const joy = $('#joy'), knob = joy.querySelector('i'); let id = null;
    const set = e => { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } rig.walk.joy = [x, y]; knob.style.transform = `translate(${x * 34}px,${y * 34}px)`; };
    joy.addEventListener('pointerdown', e => { id = e.pointerId; joy.setPointerCapture(id); set(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; rig.walk.joy = [0, 0]; knob.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }

  const WX = { clear: '晴', cloudy: '多云', fog: '雾', rain: '雨' };
  function hud() {
    const h = Math.floor(env.hour), m = Math.floor((env.hour - h) * 60);
    $('#clock').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    $('#wx').textContent = WX[env.weather] + (env.night > 0.6 ? ' · 夜' : env.hour < 12 ? ' · 上午' : ' · 下午');
    if (document.activeElement !== slider) slider.value = env.hour.toFixed(2);
  }

  applyQuality(quality); setOn('#rate', 1); setOn('#weather', 'clear');
  status('完成', 1);
  const clock = new THREE.Clock(); let t = 0, hudT = 0;
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!S.paused) { t += dt; env.hour = (env.hour + dt * S.rate / 60 + 24) % 24; }
    env.update(dt, t, camera);
    city.update(t, env);
    U.uWind.value = env.wind;
    life.update(S.paused ? 0 : dt, t, env, S.speed, camera);
    for (const e of life.events) {
      audio.event(e);
      if (e.type === 'impact') { const d = e.pos.distanceTo(camera.position); if (d < 90) shake = Math.max(shake, (1 - d / 90) * e.power * 1.2); }
    }
    life.events.length = 0;
    motes.material.uniforms.uTime.value = t; motes.material.uniforms.uNight.value = env.night;
    rig.update(dt);
    if (shake > 0.01) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= Math.exp(-dt * 5); }
    picker.update(); audio.update(dt, camera, env, { lighthouse: city.lighthouse });
    env.sun.target.position.set(camera.position.x * 0.5 - 40, 0, camera.position.z * 0.5 - 60); env.sun.target.updateMatrixWorld();
    composer.render();
    if ((hudT += dt) > 0.25) { hudT = 0; hud(); }
    requestAnimationFrame(loop);
  }
  loop();
  $('#loader').classList.add('hide');
  caption('雾港残响', '拖动旋转，滚轮缩放；点击建筑、电车、飞艇可以查看详情');
  window.__city = { renderer, scene, camera, env, rig, TOURS };
}

start().catch(e => { const el = $('#err'); el.hidden = false; el.textContent = '启动失败：' + (e.stack || e.message || e); });
