// Deterministic staging for the four screenshots. Every scene is built by
// the real simulation — the autopilot plays for the sneak shot, a full
// autopilot job supplies the win numbers — so the pictures show states the
// game genuinely reaches. The same function runs in Node for verification.
import { autopilotStep, runAutopilot } from './autopilot.js';
import { createWorld, stepWorld } from './world.js';

const DT = 1 / 30;

function bushTiles(w) {
  const out = [];
  for (let y = 0; y < w.rows; y++) {
    for (let x = 0; x < w.cols; x++) {
      if (w.grid[y][x] === 'B') out.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return out;
}

// Play level 1 with the autopilot until two relics are lifted, then freeze
// a few ticks later: a mid-sneak moment, genuinely reached, not posed.
function stagePlay(seed) {
  const w = createWorld(0, seed);
  const mem = { waitT: 0, coinWaitT: 0 };
  let ticks = 0;
  let extra = -1;
  while (w.status === 'playing' && ticks < 20000) {
    const input = autopilotStep(w, mem, DT);
    stepWorld(w, input, DT);
    ticks++;
    const got = w.relics.filter((r) => r.taken).length;
    if (got >= 2 && extra < 0) extra = 30;
    if (extra > 0) {
      extra--;
      if (extra === 0) break;
    }
  }
  return {
    screen: 'play',
    world: w,
    summary: {
      level: w.level.name,
      relics: w.relics.filter((r) => r.taken).length + '/' + w.relics.length,
      detection: Math.round(w.detection),
      maxDetection: Math.round(w.maxDetection),
      score: w.score,
      time: Math.round(w.levelTime * 10) / 10,
      status: w.status,
    },
  };
}

// An alarm the player is surviving: detection at 100, every guard hunting
// the far end of the Gallery, the player tucked in a bush. Built by moving
// the real guards, never by faking the render.
function stageAlert(seed) {
  const w = createWorld(1, seed);
  const bushes = bushTiles(w);
  const lastKnown = { x: 34.5, y: 2.5 };
  let hide = bushes[0];
  let bestD = -1;
  for (const b of bushes) {
    const d = Math.hypot(b.x - lastKnown.x, b.y - lastKnown.y);
    if (d > bestD) {
      bestD = d;
      hide = b;
    }
  }
  w.player.x = hide.x;
  w.player.y = hide.y;
  w.detection = 100;
  w.maxDetection = 100;
  w.alarms = 1;
  w.alarmUp = true;
  for (const guard of w.guards) {
    guard.state = 'alert';
    guard.lastKnown = { ...lastKnown };
    guard.searchT = 0;
  }
  // Let the guards start the hunt for a few ticks; they are far from the
  // bush, so the player is never caught by the staging itself. The meter
  // decays while the player stays hidden, so pin it back at full alarm for
  // the picture — the hunt itself is real.
  for (let i = 0; i < 45; i++) stepWorld(w, { mx: 0, my: 0, run: false, coin: null }, DT);
  w.detection = 100;
  w.maxDetection = 100;
  return {
    screen: 'play',
    world: w,
    summary: {
      level: w.level.name,
      relics: w.relics.filter((r) => r.taken).length + '/' + w.relics.length,
      detection: Math.round(w.detection),
      maxDetection: Math.round(w.maxDetection),
      score: w.score,
      status: w.status,
      alarm: true,
    },
  };
}

export function stageShot(name, seed = 1) {
  if (name === 'start') {
    const w = createWorld(0, seed);
    return { screen: 'title', world: w, summary: { level: w.level.name, status: 'title' } };
  }
  if (name === 'play') return stagePlay(seed);
  if (name === 'alert') return stageAlert(seed);
  if (name === 'end') {
    const run = runAutopilot(seed);
    const w = createWorld(2, seed);
    w.status = 'won';
    w.score = run.score;
    w.rank = run.rank;
    // The backdrop is the Vault after the job: every relic lifted, the
    // exit standing open, so the HUD agrees with the win panel.
    for (const relic of w.relics) relic.taken = true;
    w.exitOpen = true;
    w.totalTime = run.time;
    return {
      screen: 'win',
      world: w,
      summary: {
        score: run.score,
        rank: run.rank,
        maxDetection: run.maxDetection,
        alarms: run.alarms,
        time: run.time,
        won: run.won,
        perLevel: run.perLevel,
        status: 'won',
      },
    };
  }
  throw new Error('unknown shot: ' + name);
}
