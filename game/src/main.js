// SHADOWLINE — boot and the one loop.
// Input is read every frame, the world advances in fixed 1/60 s steps, and
// the renderer paints what is there. The game moves between screens:
// title, level intro, play, paused, caught, level clear and win.
// ?seed=N fixes the run. ?shot=start|play|alert|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, SCREEN_CAUGHT, SCREEN_INTRO, SCREEN_LEVEL_CLEAR, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, STEP } from './config.js';
import { LEVELS } from './levels.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM, EVENT_ARTIFACT, EVENT_CAUGHT, EVENT_COIN, EVENT_LEVEL_CLEAR, EVENT_SUSPICIOUS, stepWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);

function makeWorld(levelIndex, score) {
  return createWorld(createRandom(seed + levelIndex * 7919), LEVELS[levelIndex], score);
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const { world, screen } = stageShot(name, makeWorld);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, screen, { best: readBest() });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let levelIndex = 0;
  let world = makeWorld(0, 0);
  let totalScore = 0;
  let totalTime = 0;
  let totalSpotted = 0;
  let everAlertedRun = false;
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startLevel(index, score) {
    levelIndex = index;
    world = makeWorld(index, score);
    accumulator = 0;
    screen = SCREEN_INTRO;
    announce(`${LEVELS[index].name}. ${LEVELS[index].brief}`);
  }

  function startGame() {
    totalScore = 0;
    totalTime = 0;
    totalSpotted = 0;
    everAlertedRun = false;
    audio.unlock();
    startLevel(0, 0);
  }

  function endRunToTitle() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    world = makeWorld(0, 0);
    screen = SCREEN_TITLE;
    announce('Shadowline. Press Space or click to start.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_CAUGHT || screen === SCREEN_PAUSED)) {
      startLevel(levelIndex, totalScore);
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_INTRO) {
        screen = SCREEN_PLAY;
        announce('Playing. Stay unseen.');
      } else if (screen === SCREEN_LEVEL_CLEAR) {
        if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1, world.state.score);
        else endRunToTitle();
      } else if (screen === SCREEN_CAUGHT) endRunToTitle();
      else if (screen === SCREEN_WIN) endRunToTitle();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
  }

  function handleThrow() {
    const click = input.takeThrow();
    if (!click || screen !== SCREEN_PLAY) return;
    if (world.state.coins <= 0) return;
    const tile = renderer.pixelToTile(click.px, click.py, world.state);
    const dx = tile.x + 0.5 - world.state.player.x;
    const dy = tile.y + 0.5 - world.state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6 || dist < 0.5) return;
    const tx = world.state.player.x + (dx / dist) * Math.min(dist, 6);
    const ty = world.state.player.y + (dy / dist) * Math.min(dist, 6);
    world.state.pendingThrow = { x: Math.floor(tx), y: Math.floor(ty) };
  }

  function step() {
    const dir = input.direction();
    const throwAt = world.state.pendingThrow || null;
    world.state.pendingThrow = null;
    const events = stepWorld(world, STEP, {
      x: dir.x,
      y: dir.y,
      sneak: input.sneak(),
      run: input.run(),
      throwAt,
    });
    stepCount += 1;
    if (stepCount % 20 === 0 && (dir.x !== 0 || dir.y !== 0)) audio.footstep(input.sneak());
    if (events & EVENT_ARTIFACT) audio.pickup();
    if (events & EVENT_COIN) audio.coin();
    if (events & EVENT_SUSPICIOUS) audio.suspicious();
    if (events & EVENT_ALARM) {
      audio.alarm();
      announce('Alarm! Every guard is coming.');
    }
    if (events & EVENT_CAUGHT) {
      audio.caught();
      screen = SCREEN_CAUGHT;
      announce(`Caught. Score ${world.state.score}.`);
    } else if (events & EVENT_LEVEL_CLEAR) {
      audio.clear();
      totalScore = world.state.score;
      totalTime += world.state.time;
      totalSpotted += world.state.timesSuspicious;
      everAlertedRun = everAlertedRun || world.state.everAlerted;
      if (levelIndex + 1 < LEVELS.length) {
        screen = SCREEN_LEVEL_CLEAR;
        announce(`${LEVELS[levelIndex].name} cleared.`);
      } else {
        world.state.everAlerted = everAlertedRun;
        world.state.timesSuspicious = totalSpotted;
        world.state.runTime = totalTime;
        screen = SCREEN_WIN;
        if (world.state.score > best) {
          best = world.state.score;
          saveBest(best);
        }
        announce(`The Meridian job is done. Score ${world.state.score}.`);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleThrow();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        stepWorld(world, STEP, { x: 0, y: 0, sneak: false, run: false });
        accumulator -= STEP;
        if (accumulator < STEP) break;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { best });
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Shadowline. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
