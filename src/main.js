// 入口：渲染器、后期、星球与模块、主循环与界面
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { R, latOf, lonOf } from './planet/sphere.js';
import { Planet } from './planet/index.js';
import { Climate, LocalEnv, Atmos, patchLighting, WX_NAME } from './planet/sky.js';
import { GlobeRig } from './planet/rig.js';
import { Route } from './planet/route.js';
import { MODULES, ROUTE } from './modules/index.js';
import { Picker } from './modules/ruin-city/interact.js';
import { Ambience } from './modules/ruin-city/audio.js';
import { smooth, clamp } from './util.js';

const $ = s => document.querySelector(s);
const status = (t, p) => { $('#loadMsg').textContent = t; $('#bar i').style.width = Math.round(p * 100) + '%'; };
const PLANET = { name: '回声星', sub: '七块地拼成的星球' };
const NUM = '①②③④⑤⑥⑦';
const hhmm = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');

async function start() {
  patchLighting();
  const canvas = $('#stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 60000);
  scene.add(camera);
  const mobile = matchMedia('(max-width: 760px)').matches;
  let quality = new URLSearchParams(location.search).get('q') || (mobile ? 'low' : 'medium');

  const climate = new Climate();
  const atmos = new Atmos(scene, renderer, climate);
  const planet = await new Planet(scene, MODULES).build({ detail: quality === 'low' ? 80 : quality === 'high' ? 140 : 110, status });
  const city = MODULES[0], C = city.inst;
  const envs = new Map(MODULES.map(m => [m, new LocalEnv(climate, m.tile.c)]));
  const cityEnv = envs.get(city);
  const camProxy = new THREE.Object3D();
  const route = new Route(scene, planet, ROUTE);
  atmos.collect(scene);
  const rig = new GlobeRig(camera, canvas, planet);
  const audio = new Ambience();
  const flyToModule = m => {
    if (m.home) rig.lookFrom(m.frame.toWorld(...m.home.cam), m.frame.toWorld(...m.home.target));
    else rig.go({ f: m.tile.c.clone(), dist: 4600, tilt: 0.85, h: 0.6, lift: 0 });
    caption(`模块 ${m.no} · ${m.name}`, m.status === 'built' ? m.sub : '待建 · 现在是占位地貌：' + m.sub);
  };
  const picker = new Picker({
    camera, dom: canvas, scene: city.root, city: C.city, life: C.life, rig, env: cityEnv, frame: city.frame,
    onRide: (kind, obj) => { rig.startRide(kind, obj); caption('搭乘中', '点右上角「自由视角」回到俯瞰'); },
    flyTo: (p, dist) => rig.flyToPoint(city.frame.toWorld(p.x, p.y, p.z), dist),
    canPick: () => rig.mode !== 'orbit' || rig.s.dist < 3200,
    onMiss: (cx, cy) => planetPick(cx, cy)
  });
  city.mount.addRigid(picker.box);
  let shake = 0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.86);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  /* ---------- 画质 ---------- */
  const Q = { low: { pr: 0.8, sh: 1024, bloom: false }, medium: { pr: 1.25, sh: 2048, bloom: true }, high: { pr: 2, sh: 4096, bloom: true } };
  function applyQuality(q) {
    quality = q; const c = Q[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio, c.pr)); atmos.setShadowQuality(c.sh); bloom.enabled = c.bloom;
    resize(); setOn('#quality', q);
  }
  function resize() {
    const w = innerWidth, h = innerHeight, px = renderer.getPixelRatio();
    renderer.setSize(w, h, false); composer.setPixelRatio(px); composer.setSize(w, h);
    camera.aspect = w / h; camera.fov = w < h ? 68 : 55; camera.updateProjectionMatrix();
    C.setPixelRatio(px);
    for (const o of [atmos.stars, atmos.sunGlow, planet.lights]) o.material.uniforms.uPx.value = px;
  }
  addEventListener('resize', resize);

  /* ---------- 状态 ---------- */
  const S = { rate: 1, speed: 1, paused: false, outline: false };
  climate.setLocalHour(city.tile.c, 17.1);

  /* ---------- 界面 ---------- */
  function setOn(sel, v) { document.querySelectorAll(sel + ' [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); }
  const TOURS = [{ id: 'planet', planet: true, name: '环星巡游', desc: '在高空绕星球一圈，看晨昏线扫过一块块地', dur: 999 }, ...city.tours];
  $('#tours').innerHTML = TOURS.map(t => `<button class="tour" type="button" data-tour="${t.id}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('');
  document.querySelectorAll('#tours .tour').forEach(b => b.onclick = () => {
    const t = TOURS.find(x => x.id === b.dataset.tour);
    if (!t.planet) { climate.setLocalHour(city.tile.c, t.hour); climate.pin(city.tile.c, t.weather); cityEnv.at(city.tile.c, true); setOn('#weather', t.weather); }
    rig.startTour(t, city);
    caption(t.name, t.desc);
    document.querySelectorAll('#tours .tour').forEach(x => x.classList.toggle('on', x === b));
    if (innerWidth < 760) togglePanel(false);
  });
  $('#mods').innerHTML = MODULES.map(m => `<button class="mod" type="button" data-mod="${m.id}"><i>${NUM[m.no - 1]}</i><b>${m.name}</b><span>${m.status === 'built' ? '已建成' : '待建'}</span></button>`).join('');
  document.querySelectorAll('#mods .mod').forEach(b => b.onclick = () => { flyToModule(MODULES.find(m => m.id === b.dataset.mod)); if (innerWidth < 760) togglePanel(false); });
  const here = new THREE.Vector3();
  const slider = $('#time');
  slider.oninput = () => climate.setLocalHour(rig.here(here), +slider.value);
  document.querySelectorAll('#presets [data-h]').forEach(b => b.onclick = () => climate.setLocalHour(rig.here(here), +b.dataset.h));
  document.querySelectorAll('#rate [data-v]').forEach(b => b.onclick = () => { S.rate = +b.dataset.v; setOn('#rate', b.dataset.v); });
  document.querySelectorAll('#weather [data-v]').forEach(b => b.onclick = () => {
    climate.pin(rig.here(here), b.dataset.v); setOn('#weather', b.dataset.v);
    caption('天气 · ' + WX_NAME[b.dataset.v], `已经钉在「${planet.placeName(here)}」上空；别处的天气照常漂移`);
  });
  document.querySelectorAll('#quality [data-v]').forEach(b => b.onclick = () => applyQuality(b.dataset.v));
  $('#bPlanet').onclick = () => { rig.planetView(); caption(PLANET.name, '拖动转动星球，滚轮或双指推近；点地标前往各个模块'); };
  $('#bOutline').onclick = () => { S.outline = !S.outline; planet.outline.visible = S.outline; $('#bOutline').setAttribute('aria-pressed', String(S.outline)); $('#bOutline').classList.toggle('on', S.outline); };
  $('#bHome').onclick = () => flyToModule(city);
  $('#bWalk').onclick = () => { rig.startWalk(Object.assign(C, { frame: city.frame })); caption('街道漫游', matchMedia('(pointer: coarse)').matches ? '左下摇杆移动，拖动屏幕转头' : 'WASD 移动，Shift 奔跑，拖动鼠标转头'); if (innerWidth < 760) togglePanel(false); };
  document.querySelectorAll('[data-ride]').forEach(b => b.onclick = () => {
    const k = b.dataset.ride, obj = k === 'globe' ? route.ship : C.rides[k];
    rig.startRide(k, obj); caption('搭乘' + b.textContent, k === 'globe' ? '巡星号依次飞过七块地，模块上空会放慢' : '点「自由视角」回到俯瞰');
    if (innerWidth < 760) togglePanel(false);
  });
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
  $('#bExit').onclick = () => { if (rig.mode === 'walk' || rig.mode === 'ride' && rig.ride !== 'globe') flyToModule(city); else rig.toOrbit(); };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('bare');
    if (e.key === 'Escape' && rig.mode !== 'orbit') $('#bExit').click();
  });
  let capTimer = 0;
  function caption(t, d) { $('#capT').textContent = t; $('#capD').textContent = d; const c = $('#caption'); c.classList.add('show'); clearTimeout(capTimer); capTimer = setTimeout(() => c.classList.remove('show'), 6000); }
  {
    const joy = $('#joy'), knob = joy.querySelector('i'); let id = null;
    const set = e => { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } rig.walk.joy = [x, y]; knob.style.transform = `translate(${x * 34}px,${y * 34}px)`; };
    joy.addEventListener('pointerdown', e => { id = e.pointerId; joy.setPointerCapture(id); set(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; rig.walk.joy = [0, 0]; knob.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }

  /* ---------- 点星球：认出地块 ---------- */
  const ray = new THREE.Raycaster();
  function planetPick(cx, cy) {
    if (rig.mode === 'orbit' && rig.s.dist < 2200) return picker.close();
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1), camera);
    const o = ray.ray.origin, d = ray.ray.direction, b = o.dot(d), c = o.lengthSq() - R * R, D = b * b - c;
    if (D < 0) return picker.close();
    const p = o.clone().addScaledVector(d, -b - Math.sqrt(D)).normalize();
    picker.show(tileInfo(planet.tileAt(p), p));
  }
  function tileInfo(t, p) {
    const lt = climate.localHour(p), wx = WX_NAME[climate.kindAt(p)], loc = `${Math.abs(latOf(t.c)).toFixed(0)}°${latOf(t.c) < 0 ? 'S' : 'N'} · ${Math.abs(lonOf(t.c)).toFixed(0)}°${lonOf(t.c) < 0 ? 'W' : 'E'}`;
    const shape = t.pent ? '五边形地块' : '六边形地块';
    if (t.module) {
      const m = t.module;
      return { title: `模块 ${m.no} · ${m.name}`, rows: [['状态', m.status === 'built' ? '已建成' : '待建（占位地貌）'], ['地块', `${shape} #${t.id}，约 ${(t.radius / 1000).toFixed(1)} 公里宽的一半`], ['位置', loc], ['当地', `${hhmm(lt)} · ${wx}`]], note: m.note, goLabel: '前往', go: () => { picker.close(); flyToModule(m); } };
    }
    const name = planet.placeName(p);
    return { title: name, rows: [['地块', `${shape} #${t.id}`], ['位置', loc], ['当地', `${hhmm(lt)} · ${wx}`]], note: '还没有分配模块的地块，把相邻的模块连在一起。以后可以在这里放新模块。', goLabel: '飞过去看看', go: () => { picker.close(); rig.go({ f: t.c.clone(), dist: 5200, tilt: 0.7 }); } };
  }

  /* ---------- 模块地标 ---------- */
  const labels = MODULES.map(m => {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'lab' + (m.status === 'built' ? ' built' : '');
    el.innerHTML = `<i>${NUM[m.no - 1]}</i>${m.name}<span>${m.status === 'built' ? '进入' : '待建'}</span>`;
    el.onclick = () => flyToModule(m); $('#labels').append(el);
    const r = m.route; return { m, el, p: m.frame.toWorld(r.x, Math.max(r.alt, 200) + 300, r.z) };
  });
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function updateLabels() {
    const alt = camera.position.length() - R, show = rig.mode === 'orbit' && alt > 1600;
    for (const L of labels) {
      let vis = show && camera.position.distanceTo(L.p) > 3200;
      if (vis) { _w.copy(camera.position).sub(L.p).normalize(); vis = _w.dot(_v.copy(L.p).normalize()) > 0.08; }
      if (vis) { _v.copy(L.p).project(camera); vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1; }
      L.el.hidden = !vis;
      if (vis) L.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px)`;
    }
  }

  /* ---------- 抬头显示 ---------- */
  let lastPlace = '';
  function hud() {
    const h = rig.here(here), lt = climate.localHour(h), kind = climate.kindAt(h), ev = atmos.view;
    $('#clock').textContent = hhmm(lt);
    $('#wx').textContent = WX_NAME[kind] + (ev.night > 0.6 ? ' · 夜' : lt < 12 ? ' · 上午' : ' · 下午');
    if (document.activeElement !== slider) slider.value = lt.toFixed(2);
    setOn('#weather', kind);
    const alt = camera.position.length() - R, t = planet.tileAt(h);
    const place = alt > 9000 ? PLANET.name : t.module ? t.module.name : planet.placeName(h);
    if (place !== lastPlace) {
      lastPlace = place;
      $('#plate h1').textContent = place;
      $('#plate .sub').textContent = place === PLANET.name ? PLANET.sub : t.module ? `模块 ${t.module.no} · ${t.module.status === 'built' ? t.module.sub : '待建'}` : '尚未分配模块的地块';
    }
  }

  applyQuality(quality); setOn('#rate', 1);
  status('完成', 1);
  // 开场：在太空里看着城市那一面
  rig.go({ f: city.tile.c.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35), dist: R * 3.4, tilt: 0, h: 0 }, { fly: false });
  const clock = new THREE.Clock(); let t = 0, hudT = 0;
  const shadowAt = new THREE.Vector3(), fwd = new THREE.Vector3();
  const ctx = { envOf: m => envs.get(m), camOf: m => m === city ? camProxy : null, speed: 1, sun: climate.sun, cam: camera };
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!S.paused) { t += dt; climate.update(dt * S.rate / 60); }
    for (const e of envs.values()) e.update(dt);
    city.mount.localCamera(camera, camProxy);
    planet.update(S.paused ? 0 : dt, t, ctx);
    for (const e of C.life.events) {
      audio.event(e);
      if (e.type === 'impact') { const d = e.pos.distanceTo(camProxy.position); if (d < 90) shake = Math.max(shake, (1 - d / 90) * e.power * 1.2); }
    }
    C.life.events.length = 0;
    route.update(S.paused ? 0 : dt, camera);
    rig.update(dt);
    if (shake > 0.01) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= Math.exp(-dt * 5); }
    // 近、远裁剪面随高度变化：街道上要精细，太空里要看得远
    const camR = camera.position.length(), agl = camR - R - Math.max(planet.height(_v.copy(camera.position).normalize()), 0);
    camera.near = clamp(agl * 0.02, 0.4, 250); camera.far = Math.sqrt(Math.max(camR * camR - R * R, 1)) + 7000; camera.updateProjectionMatrix();
    // 阴影中心：自由视角是焦点，其它模式是前方地面
    if (rig.mode === 'orbit') rig.focusPoint(rig.s, shadowAt);
    else { camera.getWorldDirection(fwd); shadowAt.copy(camera.position).addScaledVector(fwd, 120); shadowAt.setLength(rig.surfR(_w.copy(shadowAt).normalize())); }
    atmos.update(dt, t, camera, shadowAt);
    picker.update(); updateLabels();
    city.mount.localCamera(camera, camProxy);
    audio.update(dt, camProxy, cityEnv, { lighthouse: C.city.lighthouse });
    composer.render();
    if ((hudT += dt) > 0.25) { hudT = 0; hud(); }
    requestAnimationFrame(loop);
  }
  loop();
  $('#loader').classList.add('hide');
  caption(PLANET.name, '七块地拼成的星球，城市是第一块。点地标「① 雾港残响」进入，或滚轮推近');
  window.__planet = { renderer, scene, camera, rig, planet, climate, atmos, route, MODULES, flyToModule, S };
}

start().catch(e => { const el = $('#err'); el.hidden = false; el.textContent = '启动失败：' + (e.stack || e.message || e); });
