// The simulation: one step of the museum. Pure logic, no DOM — the same
// code runs in the browser and in the headless autopilot, so a staged
// screenshot and a played game can never disagree about the rules.
import {
  ALERT_AT,
  COVER_BUSH,
  COVER_DARK,
  DETECT_DECAY,
  DETECT_RATE,
  GHOST_BONUS,
  GHOST_MAX_DETECTION,
  GUARD_CHASE,
  GUARD_PATROL,
  GUARD_SUSPICIOUS,
  LEVEL_CLEAR_SCORE,
  NOISE_COIN_RADIUS,
  NOISE_RUN_RADIUS,
  PLAYER_RUN,
  PLAYER_SNEAK,
  RELIC_SCORE,
  SEARCH_TIME,
  SHADOW_BONUS,
  SHADOW_MAX_DETECTION,
  STUCK_GIVE_UP,
  SUSPICIOUS_AT,
  VISION_HALF_ANGLE,
  VISION_RANGE,
} from './config.js';
import { LEVELS, parseLevel } from './levels.js';
import { makeRng } from './random.js';

export function tileAt(w, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= w.cols || ty >= w.rows) return '#';
  return w.grid[ty][tx];
}

export function isWall(w, x, y) {
  return tileAt(w, x, y) === '#';
}

export function isWalkable(w, x, y) {
  return !isWall(w, x, y);
}

// Cover factor of the tile under a point: 1 in the open, less in the dark,
// least in a bush. Detection climbs in proportion to it.
export function coverAt(w, x, y) {
  const t = tileAt(w, x, y);
  if (t === 'B') return COVER_BUSH;
  if (t === ',') return COVER_DARK;
  return 1;
}

// Line of sight: sample the segment every 0.15 tiles; a wall sample blocks.
export function losClear(w, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.15));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(w, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// Can this guard see the player right now? Range, cone and line of sight.
export function guardSees(w, guard, px, py) {
  const dx = px - guard.x;
  const dy = py - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > VISION_RANGE) return false;
  if (dist > 0.01) {
    const ang = Math.atan2(dy, dx);
    if (angleDiff(ang, guard.dir) > VISION_HALF_ANGLE) return false;
  }
  return losClear(w, guard.x, guard.y, px, py);
}

// The set of tile keys any guard can currently see (centre in cone + LOS).
// The autopilot plans around it; the renderer can reuse it for debugging.
export function computeWatched(w) {
  const watched = new Set();
  for (const guard of w.guards) {
    const gx = Math.floor(guard.x);
    const gy = Math.floor(guard.y);
    const r = Math.ceil(VISION_RANGE);
    for (let ty = gy - r; ty <= gy + r; ty++) {
      for (let tx = gx - r; tx <= gx + r; tx++) {
        if (tx < 0 || ty < 0 || tx >= w.cols || ty >= w.rows) continue;
        if (guardSees(w, guard, tx + 0.5, ty + 0.5)) watched.add(tx + ',' + ty);
      }
    }
  }
  return watched;
}

export function rankFor(maxDetection, alarms) {
  if (maxDetection <= GHOST_MAX_DETECTION && alarms === 0) return 'GHOST';
  if (maxDetection <= SHADOW_MAX_DETECTION) return 'SHADOW';
  return 'LOUD';
}

export function createWorld(levelIndex, seed, carry) {
  const def = LEVELS[levelIndex];
  const level = parseLevel(def);
  const rng = makeRng((seed >>> 0) + levelIndex * 7919);
  const guards = level.patrols.map((patrol) => {
    const [sx, sy] = patrol[0];
    const [nx, ny] = patrol[1];
    return {
      x: sx + 0.5,
      y: sy + 0.5,
      dir: Math.atan2(ny - sy, nx - sx),
      state: 'patrol',
      patrol,
      wp: 1,
      wpDir: 1,
      wait: 0,
      lastKnown: null,
      searchT: 0,
      stuckT: 0,
      lx: sx + 0.5,
      ly: sy + 0.5,
    };
  });
  return {
    levelIndex,
    level,
    cols: level.cols,
    rows: level.rows,
    grid: level.grid,
    rng,
    player: {
      x: level.playerStart.x,
      y: level.playerStart.y,
      dir: 0,
      moving: false,
      running: false,
    },
    guards,
    relics: level.relics,
    exit: level.exit,
    exitOpen: false,
    coins: level.coins,
    coinFx: [],
    detection: 0,
    maxDetection: carry ? carry.maxDetection : 0,
    alarms: carry ? carry.alarms : 0,
    score: carry ? carry.score : 0,
    totalTime: carry ? carry.totalTime : 0,
    levelTime: 0,
    status: 'playing',
    events: [],
  };
}

function moveWithCollision(w, body, dx, dy, radius) {
  // Axis-separated: try x, then y, so a body slides along walls.
  const nx = body.x + dx;
  if (!hitsWall(w, nx, body.y, radius)) body.x = nx;
  const ny = body.y + dy;
  if (!hitsWall(w, body.x, ny, radius)) body.y = ny;
}

function hitsWall(w, x, y, radius) {
  for (const [ox, oy] of [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]) {
    if (isWall(w, x + ox, y + oy)) return true;
  }
  return false;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function guardTarget(guard) {
  if (guard.state === 'patrol') {
    const [tx, ty] = guard.patrol[guard.wp];
    return { x: tx + 0.5, y: ty + 0.5 };
  }
  return guard.lastKnown;
}

function guardSpeed(guard) {
  if (guard.state === 'alert') return GUARD_CHASE;
  if (guard.state === 'suspicious' || guard.state === 'search') return GUARD_SUSPICIOUS;
  return GUARD_PATROL;
}

// One fixed step. input: { mx, my, run, coin } where (mx,my) is a unit-ish
// move direction and coin is {x,y} in tile coordinates, or null.
export function stepWorld(w, input, dt) {
  if (w.status !== 'playing') return;
  const player = w.player;
  w.levelTime += dt;
  w.totalTime += dt;

  // --- player movement ---
  const mag = Math.hypot(input.mx || 0, input.my || 0);
  player.moving = mag > 0.01;
  player.running = !!input.run && player.moving;
  if (player.moving) {
    const speed = player.running ? PLAYER_RUN : PLAYER_SNEAK;
    const nx = (input.mx / Math.max(1, mag)) * speed * dt;
    const ny = (input.my / Math.max(1, mag)) * speed * dt;
    player.dir = Math.atan2(input.my, input.mx);
    moveWithCollision(w, player, nx, ny, 0.3);
  }

  // --- coin throw ---
  if (input.coin && w.coins > 0) {
    w.coins -= 1;
    const land = throwCoinLanding(w, player, input.coin);
    w.coinFx.push({ x: land.x, y: land.y, ttl: 1.2 });
    w.events.push('coin');
    for (const guard of w.guards) {
      if (Math.hypot(guard.x - land.x, guard.y - land.y) <= NOISE_COIN_RADIUS) {
        if (guard.state !== 'alert') guard.state = 'suspicious';
        guard.lastKnown = { x: land.x, y: land.y };
        guard.searchT = 0;
      }
    }
  }
  for (const fx of w.coinFx) fx.ttl -= dt;
  w.coinFx = w.coinFx.filter((fx) => fx.ttl > 0);

  // --- running noise ---
  if (player.running) {
    for (const guard of w.guards) {
      if (Math.hypot(guard.x - player.x, guard.y - player.y) <= NOISE_RUN_RADIUS) {
        if (guard.state === 'patrol') guard.state = 'suspicious';
        if (guard.state === 'suspicious') guard.lastKnown = { x: player.x, y: player.y };
      }
    }
  }

  // --- relics + exit ---
  for (const relic of w.relics) {
    if (!relic.taken && Math.hypot(player.x - relic.x, player.y - relic.y) < 0.6) {
      relic.taken = true;
      w.score += RELIC_SCORE;
      w.events.push('relic');
      if (w.relics.every((r) => r.taken)) {
        w.exitOpen = true;
        w.events.push('exit-open');
      }
    }
  }
  if (w.exitOpen && Math.hypot(player.x - w.exit.x, player.y - w.exit.y) < 0.6) {
    const timeBonus = Math.max(0, Math.round(w.level.par - w.levelTime));
    w.score += LEVEL_CLEAR_SCORE + timeBonus;
    w.events.push('clear');
    if (w.levelIndex >= LEVELS.length - 1) {
      w.status = 'won';
      const rank = rankFor(w.maxDetection, w.alarms);
      if (rank === 'GHOST') w.score += GHOST_BONUS;
      else if (rank === 'SHADOW') w.score += SHADOW_BONUS;
      w.rank = rank;
    } else {
      w.status = 'clear';
    }
    return;
  }

  // --- vision + detection ---
  let anyoneSees = false;
  for (const guard of w.guards) {
    if (guardSees(w, guard, player.x, player.y)) {
      anyoneSees = true;
      const cover = coverAt(w, player.x, player.y);
      w.detection += DETECT_RATE * cover * dt;
      guard.lastKnown = { x: player.x, y: player.y };
      if (w.detection >= ALERT_AT && guard.state !== 'alert') {
        guard.state = 'alert';
        guard.searchT = 0;
      } else if (w.detection >= SUSPICIOUS_AT && guard.state === 'patrol') {
        guard.state = 'suspicious';
        guard.searchT = 0;
      }
    }
  }
  if (w.detection >= ALERT_AT && !w.alarmUp) {
    w.alarmUp = true;
    w.alarms += 1;
    w.events.push('alarm');
    for (const guard of w.guards) {
      if (guard.state !== 'alert') {
        guard.state = 'alert';
        guard.lastKnown = { x: player.x, y: player.y };
      }
    }
  }
  if (!anyoneSees) {
    w.detection = Math.max(0, w.detection - DETECT_DECAY * dt);
    if (w.detection < SUSPICIOUS_AT) w.alarmUp = false;
  }
  w.detection = Math.min(100, w.detection);
  if (w.detection > w.maxDetection) w.maxDetection = w.detection;

  // --- guards ---
  for (const guard of w.guards) {
    updateGuard(w, guard, dt);
  }

  // --- caught? A guard that closes in on the player in the open ends it.
  // Bushes hide the player even up close; breaking sight and hiding is
  // always an escape, so an alarm is never a guaranteed catch.
  const hidden = tileAt(w, player.x, player.y) === 'B';
  if (!hidden) {
    for (const guard of w.guards) {
      if (guard.state !== 'patrol' && Math.hypot(guard.x - player.x, guard.y - player.y) < 0.55) {
        w.status = 'caught';
        w.events.push('caught');
        return;
      }
    }
  }
}

// A coin flies straight toward its target and stops at the first wall.
function throwCoinLanding(w, player, target) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const maxDist = Math.min(6, len);
  let t = 0.3;
  while (t < maxDist) {
    const x = player.x + ux * t;
    const y = player.y + uy * t;
    if (isWall(w, x, y)) break;
    t += 0.15;
  }
  const land = Math.max(0.3, t - 0.15);
  return { x: player.x + ux * land, y: player.y + uy * land };
}

function updateGuard(w, guard, dt) {
  // Track whether the guard is actually making progress; a guard wedged
  // against a wall while chasing gives up instead of camping it.
  const moved = Math.hypot(guard.x - guard.lx, guard.y - guard.ly);
  guard.lx = guard.x;
  guard.ly = guard.y;
  if (guard.state === 'alert' || guard.state === 'suspicious') {
    if (moved < 0.02 * dt * 60 * 0.5) guard.stuckT += dt;
    else guard.stuckT = 0;
    if (guard.stuckT > STUCK_GIVE_UP) {
      guard.stuckT = 0;
      guard.state = 'search';
      guard.searchT = SEARCH_TIME;
    }
  }

  if (guard.state === 'patrol') {
    if (guard.wait > 0) {
      guard.wait -= dt;
      if (guard.wait <= 0) {
        guard.wp += guard.wpDir;
        if (guard.wp >= guard.patrol.length) {
          guard.wp = guard.patrol.length - 2;
          guard.wpDir = -1;
        } else if (guard.wp < 0) {
          guard.wp = 1;
          guard.wpDir = 1;
        }
      }
      return;
    }
    const target = guardTarget(guard);
    const arrived = stepToward(w, guard, target, GUARD_PATROL, dt);
    if (arrived) {
      guard.wait = 1.0;
      const [nx, ny] = guard.patrol[(guard.wp + guard.wpDir + guard.patrol.length) % guard.patrol.length];
      guard.dir = Math.atan2(ny + 0.5 - guard.y, nx + 0.5 - guard.x);
    }
    return;
  }

  if (guard.state === 'suspicious' || guard.state === 'alert') {
    const target = guard.lastKnown;
    if (!target) {
      guard.state = 'search';
      guard.searchT = SEARCH_TIME;
      return;
    }
    const arrived = stepToward(w, guard, target, guardSpeed(guard), dt);
    if (arrived) {
      if (guard.state === 'alert') {
        // Lost the player at the last known spot: search the area.
        guard.state = 'search';
        guard.searchT = SEARCH_TIME;
      } else {
        guard.state = 'search';
        guard.searchT = SEARCH_TIME * 0.6;
      }
    }
    return;
  }

  // search: stand and sweep the area, then walk back to the patrol.
  if (guard.state === 'search') {
    guard.searchT -= dt;
    guard.dir += dt * 1.8;
    if (guard.searchT <= 0) {
      guard.state = 'patrol';
      // Resume at the nearest waypoint.
      let best = 0;
      let bestD = Infinity;
      guard.patrol.forEach(([px, py], i) => {
        const d = Math.hypot(px + 0.5 - guard.x, py + 0.5 - guard.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      guard.wp = best;
      guard.wpDir = 1;
      guard.wait = 0;
    }
  }
}

// Move a guard toward a point; returns true when it arrives (within 0.15).
function stepToward(w, guard, target, speed, dt) {
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.15) return true;
  const step = Math.min(d, speed * dt);
  const ox = guard.x;
  const oy = guard.y;
  moveWithCollision(w, guard, (dx / d) * step, (dy / d) * step, 0.3);
  const moved = Math.hypot(guard.x - ox, guard.y - oy);
  if (moved > 0.001) guard.dir = Math.atan2(guard.y - oy, guard.x - ox);
  return d - moved < 0.15;
}
