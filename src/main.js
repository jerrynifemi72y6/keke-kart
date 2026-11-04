import * as THREE from 'three';
import { buildTrack } from './track.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 90, 260);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
document.getElementById('app').appendChild(renderer.domElement);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b5b3e, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2cc, 1.5);
sun.position.set(60, 90, 40);
scene.add(sun);

// ---------- track ----------
const track = buildTrack(scene);
const { curve, samples, halfWidth } = track;

// ---------- kart factory ----------
function makeKeke(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 2.6),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 0.55;
  g.add(body);

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.85, 1.25),
    new THREE.MeshLambertMaterial({ color: 0x222831 })
  );
  cab.position.set(0, 1.32, -0.35);
  g.add(cab);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.14, 1.9),
    new THREE.MeshLambertMaterial({ color: 0xf2c14e })
  );
  roof.position.set(0, 1.85, -0.1);
  g.add(roof);

  // three wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const positions = [
    [0.85, 0.42, 1.05],
    [-0.85, 0.42, 1.05],
    [0, 0.42, -1.15],
  ];
  const wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    g.add(w);
    wheels.push(w);
  }

  // headlight
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
  );
  lamp.position.set(0, 0.7, 1.35);
  g.add(lamp);

  g.userData.wheels = wheels;
  return g;
}

// ---------- game state ----------
const N = samples.length;
const STATE = { MENU: 0, RACE: 1, DONE: 2 };
let state = STATE.MENU;
let totalLaps = 3;
let countdown = 0;
let raceTime = 0;

const player = {
  mesh: makeKeke(0xe63946),
  pos: new THREE.Vector3(),
  heading: 0,
  speed: 0,
  steer: 0,
  drift: false,
  driftCharge: 0,
  boost: 0,
  idx: 0,
  lap: 0,
  progress: 0,
  finished: false,
  place: 1,
  item: null,
  hitTimer: 0,
};
scene.add(player.mesh);

const rivalColors = [0x2a9d8f, 0x457b9d, 0xf4a261, 0x9b5de5, 0x00b4d8];
const rivals = rivalColors.map((c, i) => ({
  mesh: makeKeke(c),
  pos: new THREE.Vector3(),
  heading: 0,
  speed: 0,
  idx: 0,
  lap: 0,
  progress: 0,
  finished: false,
  place: i + 2,
  lane: (i - 2) * 2.6,
  skill: 0.9 + i * 0.022,
  hitTimer: 0,
  item: null,
}));
rivals.forEach((r) => scene.add(r.mesh));

// starting grid
function gridPos(i) {
  const back = 6 + i * 4.2;
  const t = ((-back / 300) % 1 + 1) % 1;
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  return { p, tan };
}
{
  const g0 = gridPos(0);
  player.pos.copy(g0.p);
  player.heading = Math.atan2(g0.tan.x, g0.tan.z);
  rivals.forEach((r, i) => {
    const g = gridPos(i + 1);
    const side = i % 2 === 0 ? 1 : -1;
    const nrm = new THREE.Vector3(-g.tan.z, 0, g.tan.x).multiplyScalar(side * 2.4);
    r.pos.copy(g.p).add(nrm);
    r.heading = Math.atan2(g.tan.x, g.tan.z);
  });
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.code === 'Space') { e.preventDefault(); tryDrift(); }
  if (e.key.toLowerCase() === 'e') useItem();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('keyup', (e) => { if (e.code === 'Space') endDrift(); });

let touchSteer = 0;
const steerZone = document.getElementById('steer');
const driftBtn = document.getElementById('driftBtn');
const itemBtn = document.getElementById('itemBtn');

function handleSteer(e) {
  const t = e.touches ? e.touches[0] : e;
  const rect = steerZone.getBoundingClientRect();
  const x = (t.clientX - rect.left) / rect.width;
  touchSteer = THREE.MathUtils.clamp((x - 0.5) * 2.4, -1, 1);
}
['touchstart', 'touchmove'].forEach((ev) => steerZone.addEventListener(ev, (e) => { e.preventDefault(); handleSteer(e); }, { passive: false }));
['touchend', 'touchcancel'].forEach((ev) => steerZone.addEventListener(ev, () => { touchSteer = 0; }));

driftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); tryDrift(); }, { passive: false });
driftBtn.addEventListener('touchend', (e) => { e.preventDefault(); endDrift(); }, { passive: false });
itemBtn.addEventListener('click', useItem);
document.getElementById('startBtn')?.addEventListener('click', startRace);

function tryDrift() { if (state === STATE.RACE) player.drift = true; }
function endDrift() { player.drift = false; }

// ---------- items ----------
const ITEMS = ['boost', 'splash', 'cone'];
const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const boxMat = new THREE.MeshLambertMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 });
const boxes = [];
for (let i = 0; i < 8; i++) {
  const b = new THREE.Mesh(boxGeo, boxMat.clone());
  const t = (i / 8 + 0.03) % 1;
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
  b.position.copy(p).addScaledVector(nrm, (i % 3 - 1) * 3.2);
  b.position.y = 1.1;
  b.userData.respawn = 0;
  scene.add(b);
  boxes.push(b);
}

const hazards = [];

function useItem() {
  if (state !== STATE.RACE || !player.item) return;
  const item = player.item;
  player.item = null;
  updateItemHud();
  if (item === 'boost') { player.boost = 1.6; }
  if (item === 'splash') {
    const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const origin = player.pos.clone().addScaledVector(fwd, 2);
    spawnSplash(origin);
    rivals.forEach((r) => {
      if (r.pos.distanceTo(origin) < 22) { r.speed *= 0.45; r.hitTimer = 1.2; }
    });
  }
  if (item === 'cone') {
    const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    spawnHazard(player.pos.clone().addScaledVector(fwd, -3));
  }
}

function spawnSplash(pos) {
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.7 });
  const s = new THREE.Mesh(geo, mat);
  s.position.copy(pos);
  s.position.y = 0.8;
  scene.add(s);
  const start = performance.now();
  const anim = () => {
    const k = (performance.now() - start) / 420;
    if (k >= 1) { scene.remove(s); return; }
    s.scale.setScalar(1 + k * 14);
    mat.opacity = 0.7 * (1 - k);
    requestAnimationFrame(anim);
  };
  anim();
}

function spawnHazard(pos) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.2, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7b00 })
  );
  cone.position.copy(pos);
  cone.position.y = 0.6;
  scene.add(cone);
  hazards.push(cone);
}

function updateItemHud() {
  const el = document.getElementById('itemSlot');
  el.textContent = player.item ? player.item.toUpperCase() : '—';
  el.className = player.item ? 'slot filled' : 'slot';
}

// ---------- progress helpers ----------
function nearestIndex(pos, hint) {
  // Search only a small forward-biased window so a nearby stretch of track
  // (the return leg runs close to the start straight) can't steal the lock.
  let best = hint, bestD = Infinity;
  for (let o = -10; o <= 16; o++) {
    const i = (hint + o + N) % N;
    const d = samples[i].distanceToSquared(pos);
    if (d < bestD) { bestD = d; best = i; }
  }
  // Reject a lock that jumped to a different part of the circuit
  if (Math.sqrt(bestD) > 12) return { idx: hint, dist: 0 };
  return { idx: best, dist: Math.sqrt(bestD) };
}

function aheadPoint(idx, lookahead) {
  return samples[(idx + lookahead) % N];
}

// ---------- physics ----------
const MAX_SPEED = 27;
const ACCEL = 15;
const OFFROAD_MAX = 11;

function updatePlayer(dt) {
  const steerInput = touchSteer || (keys['a'] || keys['arrowleft'] ? -1 : 0) + (keys['d'] || keys['arrowright'] ? 1 : 0);
  player.steer = THREE.MathUtils.lerp(player.steer, THREE.MathUtils.clamp(steerInput, -1, 1), 0.25);

  const { idx, dist } = nearestIndex(player.pos, player.idx);
  const prevIdx = player.idx;
  player.idx = idx;
  const offroad = dist > halfWidth * 0.95;

  // lap detection on wrap
  if (prevIdx > N * 0.85 && idx < N * 0.15) {
    player.lap++;
    if (player.lap >= totalLaps) { player.finished = true; endRace(); }
  }
  if (prevIdx < N * 0.15 && idx > N * 0.85) player.lap = Math.max(0, player.lap - 1);
  player.progress = player.lap * N + idx;

  // speed
  const cap = offroad ? OFFROAD_MAX : MAX_SPEED;
  const targetSpeed = Math.min(MAX_SPEED, cap);
  if (player.speed < targetSpeed) player.speed += ACCEL * dt * (player.boost > 0 ? 2.1 : 1);
  else player.speed -= 9 * dt;
  if (player.boost > 0) { player.speed = Math.min(player.speed + 30 * dt, MAX_SPEED * 1.45); player.boost -= dt; }
  player.speed = Math.max(0, player.speed);
  if (player.hitTimer > 0) { player.speed *= 0.965; player.hitTimer -= dt; }

  // drift
  if (player.drift && Math.abs(player.steer) > 0.25 && player.speed > 8) {
    player.driftCharge = Math.min(1, player.driftCharge + dt * 0.85);
  } else if (player.driftCharge > 0.35 && !player.drift) {
    player.boost = Math.max(player.boost, player.driftCharge * 1.5);
    player.driftCharge = 0;
  } else if (!player.drift && player.driftCharge > 0) {
    player.driftCharge = Math.max(0, player.driftCharge - dt * 2);
  }

  const speedFactor = THREE.MathUtils.clamp(player.speed / MAX_SPEED, 0.15, 1);
  const turnRate = 2.1 * speedFactor * (player.drift ? 1.35 : 1);
  player.heading += player.steer * turnRate * dt;

  const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  player.pos.addScaledVector(fwd, player.speed * dt);

  // soft wall containment
  const center = samples[idx];
  const tan = curve.getTangentAt(idx / N);
  const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
  const lateral = player.pos.clone().sub(center).dot(nrm);
  if (Math.abs(lateral) > halfWidth + 1.2) {
    const push = (Math.abs(lateral) - (halfWidth + 1.2)) * Math.sign(lateral);
    player.pos.addScaledVector(nrm, -push);
    player.speed *= 0.94;
  }

  // item pickup
  boxes.forEach((b) => {
    if (b.userData.respawn > 0) { b.userData.respawn -= dt; b.visible = false; return; }
    b.visible = true;
    b.rotation.y += dt * 1.6;
    if (b.position.distanceTo(player.pos) < 2.2 && !player.item) {
      player.item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
      b.userData.respawn = 9;
      updateItemHud();
    }
  });

  // hazards
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    if (h.position.distanceTo(player.pos) < 1.6) {
      player.speed *= 0.35;
      player.hitTimer = 0.8;
      scene.remove(h);
      hazards.splice(i, 1);
    }
  }

  // visuals
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.z = player.steer * 0.08;
  player.mesh.userData.wheels.forEach((w) => { w.rotation.x += player.speed * dt * 2; });
}

function updateRival(r, dt) {
  const { idx } = nearestIndex(r.pos, r.idx);
  const prev = r.idx;
  r.idx = idx;
  if (prev > N * 0.85 && idx < N * 0.15) r.lap++;
  r.progress = r.lap * N + idx;

  const look = 8 + Math.floor(r.speed * 0.55);
  const targetT = ((idx + look) % N) / N;
  const tp = curve.getPointAt(targetT);
  const tan = curve.getTangentAt(targetT);
  const nrm = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(r.lane * 0.5);
  tp.add(nrm);

  const toTarget = tp.clone().sub(r.pos);
  const desired = Math.atan2(toTarget.x, toTarget.z);
  let diff = ((desired - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  r.heading += THREE.MathUtils.clamp(diff, -2.4 * dt, 2.4 * dt) * 1.4;

  // rubber band relative to player
  const gap = player.progress - r.progress;
  const band = THREE.MathUtils.clamp(1 + gap * 0.0012, 0.9, 1.12);
  const target = MAX_SPEED * 0.92 * r.skill * band;
  r.speed += (target - r.speed) * Math.min(1, dt * 0.9);
  if (r.hitTimer > 0) { r.speed *= 0.97; r.hitTimer -= dt; }

  const fwd = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
  r.pos.addScaledVector(fwd, r.speed * dt);

  // keep rival on road
  const center = samples[idx];
  const t2 = curve.getTangentAt(idx / N);
  const n2 = new THREE.Vector3(-t2.z, 0, t2.x);
  const lat = r.pos.clone().sub(center).dot(n2);
  if (Math.abs(lat) > halfWidth * 0.9) {
    r.pos.addScaledVector(n2, -(lat - Math.sign(lat) * halfWidth * 0.9));
  }

  r.mesh.position.copy(r.pos);
  r.mesh.rotation.y = r.heading;
  r.mesh.userData.wheels.forEach((w) => { w.rotation.x += r.speed * dt * 2; });
}

// ---------- standings ----------
function updateStandings() {
  const all = [{ ref: player, isPlayer: true }, ...rivals.map((r) => ({ ref: r }))];
  all.sort((a, b) => b.ref.progress - a.ref.progress);
  all.forEach((o, i) => { o.ref.place = i + 1; });
}

// ---------- camera ----------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const want = player.pos.clone().addScaledVector(fwd, -9).add(new THREE.Vector3(0, 5.4, 0));
  camPos.lerp(want, 1 - Math.pow(0.001, dt));
  camera.position.copy(camPos);
  camTarget.lerp(player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), 1 - Math.pow(0.0005, dt));
  camera.lookAt(camTarget);
}

// ---------- HUD ----------
const hudLap = document.getElementById('hudLap');
const hudPlace = document.getElementById('hudPlace');
const hudSpeed = document.getElementById('hudSpeed');
const overlay = document.getElementById('overlay');
const countdownEl = document.getElementById('countdown');
const resultsEl = document.getElementById('results');

function startRace() {
  overlay.classList.add('hidden');
  state = STATE.RACE;
  countdown = 3.4;
  camPos.copy(player.pos).add(new THREE.Vector3(0, 6, -10));
}

function endRace() {
  if (state === STATE.DONE) return;
  state = STATE.DONE;
  updateStandings();
  resultsEl.classList.remove('hidden');
  resultsEl.innerHTML = `
    <h2>Race finished</h2>
    <p class="big">P${player.place}</p>
    <p>Time: ${raceTime.toFixed(1)}s</p>
    <button id="restartBtn">Race again</button>`;
  }

// ---------- loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === STATE.RACE) {
    if (countdown > 0) {
      countdown -= dt;
      const n = Math.ceil(countdown - 0.4);
      countdownEl.textContent = n > 0 ? n : 'GO!';
      countdownEl.style.opacity = countdown > 0.4 ? 1 : Math.max(0, 1 - (0.4 - countdown) * 3);
    } else {
      countdownEl.textContent = '';
      raceTime += dt;
      updatePlayer(dt);
      rivals.forEach((r) => updateRival(r, dt));
      hazards.forEach((h) => { h.rotation.y += dt * 0.6; });
      updateStandings();
      hudLap.textContent = `${Math.min(player.lap + 1, totalLaps)}/${totalLaps}`;
      hudPlace.textContent = `P${player.place}`;
      hudSpeed.textContent = `${Math.round(player.speed * 3.6)}`;
    }
    updateCamera(dt);
  } else if (state === STATE.MENU) {
    updateCamera(dt);
  }

  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
