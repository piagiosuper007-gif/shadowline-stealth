// SHADOWLINE — screens and the fixed-step game loop.
// The page also serves the deterministic screenshot scenes: ?shot=start,
// ?shot=play, ?shot=alert or ?shot=end (with &seed=1) stages a scene from
// the real simulation, renders one frame and sets window.__shotReady.
import { LEVELS } from './levels.js';
import { createWorld, stepWorld } from './world.js';
import { autopilotStep } from './autopilot.js';
import { render } from './render.js';
import { createInput } from './input.js';
import { ensureAudio, isMuted, setMuted, sfx, startAmbient } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const input = createInput(canvas);

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1) || 1;

let screen = 'title';
let world = createWorld(0, seed);
let summary = null;
let carry = null;
let levelStart = { score: 0, totalTime: 0 };
let clearT = 0;
let lastStepSfx = 0;

function setStatus() {
  if (!statusEl) return;
  const got = world.relics.filter((r) => r.taken).length;
  statusEl.textContent =
    'SHADOWLINE · ' + screen + ' · ' + world.level.name +
    ' · relics ' + got + '/' + world.relics.length +
    ' · detection ' + Math.round(world.detection) +
    ' · score ' + world.score;
}

function startLevel(index) {
  world = createWorld(index, seed, carry);
  levelStart = { score: world.score, totalTime: world.totalTime };
  screen = 'play';
  clearT = 0;
}

function restartJob() {
  carry = null;
  startLevel(0);
}

function playEvents() {
  for (const ev of world.events) {
    if (ev === 'relic') sfx.pickup();
    else if (ev === 'coin') sfx.coin();
    else if (ev === 'alarm') sfx.alarm();
    else if (ev === 'caught') sfx.caught();
    else if (ev === 'clear') sfx.clear();
  }
  world.events.length = 0;
}

function tick(dt) {
  if (screen === 'title') {
    if (input.consumePress('Space') || input.consumePress('Enter')) {
      ensureAudio();
      startAmbient();
      sfx.click();
      restartJob();
    }
    return;
  }
  if (screen === 'paused') {
    if (input.consumePress('KeyP') || input.consumePress('Escape')) screen = 'play';
    if (input.consumePress('KeyR')) restartJob();
    return;
  }
  if (screen === 'caught' || screen === 'win') {
    if (input.consumePress('KeyR') || input.consumePress('Space')) restartJob();
    return;
  }
  if (screen === 'clear') {
    clearT += dt;
    if (clearT > 1.6 || input.consumePress('Space')) {
      const next = world.levelIndex + 1;
      if (next < LEVELS.length) {
        carry = {
          score: world.score,
          maxDetection: world.maxDetection,
          alarms: world.alarms,
          totalTime: world.totalTime,
        };
        startLevel(next);
      }
    }
    return;
  }
  // screen === 'play'
  if (input.consumePress('KeyP') || input.consumePress('Escape')) {
    screen = 'paused';
    return;
  }
  if (input.consumePress('KeyR')) {
    // Replay the floor: keep the job's score and time from when the floor
    // started, but keep the detection and alarms already earned.
    carry = {
      score: levelStart.score,
      maxDetection: world.maxDetection,
      alarms: world.alarms,
      totalTime: levelStart.totalTime,
    };
    startLevel(world.levelIndex);
    return;
  }
  if (input.consumePress('KeyM')) setMuted(!isMuted());
  const mv = input.moveVector();
  let coin = null;
  const click = input.consumeClick();
  if (click) {
    coin = { x: click.x / 32, y: click.y / 32 };
  } else if (input.consumePress('KeyQ')) {
    coin = input.mouseTile();
  }
  stepWorld(world, { mx: mv.mx, my: mv.my, run: input.running(), coin }, dt);
  playEvents();
  if (world.player.moving && world.totalTime - lastStepSfx > 0.45) {
    lastStepSfx = world.totalTime;
    sfx.step();
  }
  if (world.status === 'caught') screen = 'caught';
  else if (world.status === 'won') {
    summary = {
      score: world.score,
      rank: world.rank,
      time: world.totalTime,
      alarms: world.alarms,
      maxDetection: world.maxDetection,
    };
    screen = 'win';
  } else if (world.status === 'clear') {
    screen = 'clear';
    clearT = 0;
  }
}

// --- staged screenshots: render once, signal readiness, stop. ---
if (shotName) {
  const staged = stageShot(shotName, seed);
  screen = staged.screen;
  world = staged.world;
  summary = staged.summary;
  render(ctx, world, screen, summary);
  setStatus();
  window.__shotReady = true;
} else {
  // --- live game: fixed-step loop at 60 Hz. ---
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += elapsed;
    while (acc >= STEP) {
      tick(STEP);
      acc -= STEP;
    }
    render(ctx, world, screen, summary);
    setStatus();
    input.endFrame();
    requestAnimationFrame(frame);
  }
  render(ctx, world, screen, summary);
  setStatus();
  requestAnimationFrame(frame);
}
