// SHADOWLINE — the simulation: movement, noise, guard senses and the win.
// The world is pure data plus one step function, so the screenshot scenes
// can play it forward from a seed and get the same frame every time.
import {
  ALERT_AT, CATCH_DISTANCE, CLOSE_SPOT_DISTANCE, COINS_PER_LEVEL,
  COIN_FLIGHT_TIME, GUARD_CHASE_SPEED,
  GUARD_PAUSE_AT_WAYPOINT, GUARD_SEARCH_SPEED, GUARD_SEARCH_TIME,
  MOD_BUSH, MOD_DARK, MOD_RUN, MOD_SNEAK, NOISE_COIN, NOISE_RUN,
  NOISE_SNEAK, NOISE_WALK, SCORE_ARTIFACT, SCORE_GHOST_BONUS,
  SCORE_LEVEL_CLEAR, SCORE_TIME_BONUS_PER_SECOND, SPEED_RUN, SPEED_SNEAK,
  SPEED_WALK, STEP, SUSPICIOUS_AT, VISION_DECAY, VISION_FILL_CLOSE,
  VISION_FILL_FAR, VISION_FILL_MID, VISION_HALF_ANGLE, VISION_RANGE,
} from './config.js';
import { parseLevel } from './levels.js';

export const EVENT_NONE = 0;
export const EVENT_ARTIFACT = 1;
export const EVENT_SUSPICIOUS = 2;
export const EVENT_ALARM = 4;
export const EVENT_CAUGHT = 8;
export const EVENT_LEVEL_CLEAR = 16;
export const EVENT_COIN = 32;

const PLAYER_RADIUS = 0.32;

// A tile blocks movement and sight ('#', 'C'); a bush hides but lets you pass.
function blocksMove(tile) { return tile === '#' || tile === 'C'; }
function blocksSight(tile) { return tile === '#' || tile === 'C'; }

export function createWorld(random, levelDef, carriedScore = 0) {
  const level = parseLevel(levelDef);
  const state = {
    level,
    random,
    time: 0,
    score: carriedScore,
    levelScore: 0,
    artifactsTaken: 0,
    coins: COINS_PER_LEVEL,
    coinsThrown: [],
    alarm: false,
    everAlerted: false,
    timesSuspicious: 0,
    caught: false,
    cleared: false,
    player: {
      x: level.player.x + 0.5,
      y: level.player.y + 0.5,
      dirX: 1,
      dirY: 0,
      moving: false,
      sneaking: false,
      running: false,
      hidden: false,
    },
    guards: level.guards.map((g) => ({
      x: g.x + 0.5,
      y: g.y + 0.5,
      waypoints: g.waypoints,
      waypointIndex: 1 % g.waypoints.length,
      speed: g.speed,
      facing: 0,
      meter: 0,
      state: 'patrol',
      pause: 0,
      searchTimer: 0,
      targetX: g.x + 0.5,
      targetY: g.y + 0.5,
      lastSeenX: g.x + 0.5,
      lastSeenY: g.y + 0.5,
      scanDir: 1,
    })),
    artifacts: level.artifacts.map((a) => ({ ...a })),
    exitOpen: false,
    detection: 0, // the highest guard meter, for the HUD eye
    noiseX: -1,
    noiseY: -1,
    noiseRadius: 0,
    noiseTimer: 0,
    message: '',
    messageTimer: 0,
  };
  // Guards start facing along their first patrol leg.
  for (const guard of state.guards) {
    const [wx, wy] = guard.waypoints[guard.waypointIndex];
    guard.facing = Math.atan2(wy + 0.5 - guard.y, wx + 0.5 - guard.x);
  }
  return { state, random };
}

function tileAt(state, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= state.level.cols || ty >= state.level.rows) return '#';
  return state.level.tiles[ty][tx];
}

function canStand(state, x, y) {
  // Circle-vs-grid: the player fits if none of the tiles its disc overlaps
  // is solid. Checking the four corners of the disc's bounding box is
  // enough at this radius.
  for (const [ox, oy] of [[-PLAYER_RADIUS, -PLAYER_RADIUS], [PLAYER_RADIUS, -PLAYER_RADIUS],
    [-PLAYER_RADIUS, PLAYER_RADIUS], [PLAYER_RADIUS, PLAYER_RADIUS]]) {
    if (blocksMove(tileAt(state, x + ox, y + oy))) return false;
  }
  return true;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function hasLineOfSight(state, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (blocksSight(tileAt(state, x0 + dx * t, y0 + dy * t))) return false;
  }
  return true;
}

function guardSeesPlayer(state, guard) {
  const p = state.player;
  const dx = p.x - guard.x;
  const dy = p.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > VISION_RANGE) return { sees: false, dist };
  const angle = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(angle, guard.facing)) > VISION_HALF_ANGLE) return { sees: false, dist };
  if (!hasLineOfSight(state, guard.x, guard.y, p.x, p.y)) return { sees: false, dist };
  // A player flat in a bush is nearly invisible past two tiles.
  const tile = tileAt(state, p.x, p.y);
  if (tile === 'B' && dist > 2) return { sees: false, dist };
  return { sees: true, dist };
}

function moveGuardToward(state, guard, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.05) {
    guard.stuck = 0;
    return true;
  }
  const stepLen = Math.min(dist, speed * dt);
  const beforeX = guard.x;
  const beforeY = guard.y;
  const nx = guard.x + (dx / dist) * stepLen;
  const ny = guard.y + (dy / dist) * stepLen;
  // Guards slide along walls instead of sticking on corners.
  if (canStand(state, nx, guard.y)) guard.x = nx;
  if (canStand(state, guard.x, ny)) guard.y = ny;
  guard.facing = Math.atan2(dy, dx);
  // A target on the far side of a wall can never be reached: after a second
  // pressed against the wall, give up and search in place instead of
  // standing there for the rest of the level.
  const moved = Math.hypot(guard.x - beforeX, guard.y - beforeY);
  if (moved < 0.001 && dist > 0.4) guard.stuck = (guard.stuck || 0) + dt;
  else guard.stuck = 0;
  if ((guard.stuck || 0) > 1.2) {
    guard.stuck = 0;
    return true;
  }
  return dist - stepLen < 0.08;
}

export function stepWorld(world, dt, input) {
  const state = world.state;
  if (state.caught || state.cleared) return EVENT_NONE;
  state.time += dt;
  let events = EVENT_NONE;
  const p = state.player;

  // --- Player movement -------------------------------------------------
  const mag = Math.hypot(input.x, input.y);
  p.moving = mag > 0.1;
  if (p.moving) {
    const nx = input.x / (mag || 1);
    const ny = input.y / (mag || 1);
    p.dirX = nx;
    p.dirY = ny;
    p.sneaking = !!input.sneak;
    p.running = !!input.run && !input.sneak;
    const speed = p.sneaking ? SPEED_SNEAK : p.running ? SPEED_RUN : SPEED_WALK;
    const tryX = p.x + nx * speed * dt;
    const tryY = p.y + ny * speed * dt;
    if (canStand(state, tryX, p.y)) p.x = tryX;
    if (canStand(state, p.x, tryY)) p.y = tryY;
  } else {
    p.sneaking = false;
    p.running = false;
  }
  p.hidden = tileAt(state, p.x, p.y) === 'B';

  // Noise: running carries, walking murmurs, sneaking barely whispers.
  const noiseRadius = !p.moving ? 0 : p.running ? NOISE_RUN : p.sneaking ? NOISE_SNEAK : NOISE_WALK;
  if (noiseRadius > 0) {
    state.noiseX = p.x;
    state.noiseY = p.y;
    state.noiseRadius = noiseRadius;
    state.noiseTimer = 0.12;
  } else if (state.noiseTimer > 0) {
    state.noiseTimer -= dt;
  }

  // --- Thrown coins -----------------------------------------------------
  if (input.throwAt && state.coins > 0) {
    state.coins -= 1;
    state.coinsThrown.push({
      fromX: p.x, fromY: p.y,
      toX: input.throwAt.x, toY: input.throwAt.y,
      t: 0, duration: COIN_FLIGHT_TIME,
    });
    events |= EVENT_COIN;
  }
  for (const coin of state.coinsThrown) coin.t += dt;
  const landed = state.coinsThrown.filter((c) => c.t >= c.duration);
  state.coinsThrown = state.coinsThrown.filter((c) => c.t < c.duration);
  for (const coin of landed) {
    for (const guard of state.guards) {
      const d = Math.hypot(guard.x - coin.toX, guard.y - coin.toY);
      if (d <= NOISE_COIN && guard.state !== 'alert') {
        guard.state = 'suspicious';
        guard.targetX = coin.toX;
        guard.targetY = coin.toY;
        guard.searchTimer = GUARD_SEARCH_TIME;
      }
    }
  }

  // --- Guards ------------------------------------------------------------
  let maxMeter = 0;
  for (const guard of state.guards) {
    const { sees, dist } = guardSeesPlayer(state, guard);
    if (sees) {
      guard.lastSeenX = p.x;
      guard.lastSeenY = p.y;
      let fill = dist < 2 ? VISION_FILL_CLOSE : dist < 4 ? VISION_FILL_MID : VISION_FILL_FAR;
      if (p.sneaking) fill *= MOD_SNEAK;
      if (p.running) fill *= MOD_RUN;
      if (p.hidden) fill *= MOD_BUSH;
      else if (tileAt(state, p.x, p.y) === ',') fill *= MOD_DARK;
      if (dist < CLOSE_SPOT_DISTANCE) fill *= 2;
      guard.meter = Math.min(ALERT_AT, guard.meter + fill * dt);
      if (guard.meter >= SUSPICIOUS_AT && guard.state === 'patrol') {
        guard.state = 'suspicious';
        guard.targetX = guard.lastSeenX;
        guard.targetY = guard.lastSeenY;
        guard.searchTimer = GUARD_SEARCH_TIME;
        state.timesSuspicious += 1;
        events |= EVENT_SUSPICIOUS;
      }
      if (guard.meter >= ALERT_AT && !state.alarm) {
        state.alarm = true;
        state.everAlerted = true;
        events |= EVENT_ALARM;
        for (const other of state.guards) {
          if (other.state !== 'alert') {
            other.state = 'alert';
            other.targetX = p.x;
            other.targetY = p.y;
          }
        }
      }
      if (state.alarm) {
        guard.state = 'alert';
        guard.targetX = p.x;
        guard.targetY = p.y;
      }
    } else {
      guard.meter = Math.max(0, guard.meter - VISION_DECAY * dt);
      if (state.alarm && guard.state === 'alert') {
        // Lost the player: hunt the last seen spot, then search.
        guard.targetX = guard.lastSeenX;
        guard.targetY = guard.lastSeenY;
      }
    }
    maxMeter = Math.max(maxMeter, guard.meter);

    // Hearing: footsteps inside the noise ring draw a look.
    if (state.noiseTimer > 0 && guard.state === 'patrol') {
      const d = Math.hypot(guard.x - state.noiseX, guard.y - state.noiseY);
      if (d <= state.noiseRadius + 0.6) {
        guard.state = 'suspicious';
        guard.targetX = state.noiseX;
        guard.targetY = state.noiseY;
        guard.searchTimer = GUARD_SEARCH_TIME;
        state.timesSuspicious += 1;
        events |= EVENT_SUSPICIOUS;
      }
    }

    // State machine.
    if (guard.state === 'patrol') {
      if (guard.pause > 0) {
        guard.pause -= dt;
        guard.facing += guard.scanDir * 0.9 * dt;
      } else {
        const [wx, wy] = guard.waypoints[guard.waypointIndex];
        const arrived = moveGuardToward(state, guard, wx + 0.5, wy + 0.5, guard.speed, dt);
        if (arrived) {
          guard.pause = GUARD_PAUSE_AT_WAYPOINT;
          guard.scanDir = state.random.next() < 0.5 ? 1 : -1;
          guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
        }
      }
    } else if (guard.state === 'suspicious' || guard.state === 'search') {
      const arrived = moveGuardToward(state, guard, guard.targetX, guard.targetY, GUARD_SEARCH_SPEED, dt);
      if (arrived) {
        guard.searchTimer -= dt;
        guard.facing += guard.scanDir * 1.4 * dt;
        if (guard.searchTimer <= 0) {
          guard.state = 'patrol';
          guard.meter = Math.min(guard.meter, SUSPICIOUS_AT - 1);
        }
      }
    } else if (guard.state === 'alert') {
      const arrived = moveGuardToward(state, guard, guard.targetX, guard.targetY, GUARD_CHASE_SPEED, dt);
      if (arrived && !sees) {
        guard.state = 'search';
        guard.searchTimer = GUARD_SEARCH_TIME;
      }
    }

    // Caught: a guard closes the last half-tile.
    if (Math.hypot(guard.x - p.x, guard.y - p.y) < CATCH_DISTANCE) {
      state.caught = true;
      events |= EVENT_CAUGHT;
    }
  }
  state.detection = maxMeter;
  if (state.alarm) state.detection = Math.max(state.detection, ALERT_AT);

  // --- Artifacts and the exit -------------------------------------------
  for (const artifact of state.artifacts) {
    if (!artifact.taken && Math.hypot(artifact.x + 0.5 - p.x, artifact.y + 0.5 - p.y) < 0.7) {
      artifact.taken = true;
      state.artifactsTaken += 1;
      state.score += SCORE_ARTIFACT;
      state.levelScore += SCORE_ARTIFACT;
      state.message = 'Relic secured.';
      state.messageTimer = 2;
      events |= EVENT_ARTIFACT;
    }
  }
  state.exitOpen = state.artifactsTaken === state.artifacts.length;
  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.exitOpen && Math.hypot(state.level.exit.x + 0.5 - p.x, state.level.exit.y + 0.5 - p.y) < 0.7) {
    state.cleared = true;
    const timeBonus = Math.max(0, Math.round((state.level.parSeconds - state.time) * SCORE_TIME_BONUS_PER_SECOND));
    const ghostBonus = state.everAlerted ? 0 : SCORE_GHOST_BONUS;
    state.score += SCORE_LEVEL_CLEAR + timeBonus + ghostBonus;
    state.levelScore += SCORE_LEVEL_CLEAR + timeBonus + ghostBonus;
    state.clearStats = { timeBonus, ghostBonus, time: state.time };
    events |= EVENT_LEVEL_CLEAR;
  }
  return events;
}

// The run's rank, read off how loud it was.
export function rankFor(state) {
  if (!state.everAlerted) return 'GHOST';
  if (state.timesSuspicious <= 2) return 'SHADOW';
  return 'LOUD';
}

export { STEP };
