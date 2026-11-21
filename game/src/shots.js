// SHADOWLINE — the screenshot scenes behind ?shot=start|play|alert|end.
// Each one plays the real rules forward from a fresh world with a fixed
// seed, steered by a careful autopilot (breadth-first paths to the next
// relic, waiting out any guard cone that covers the next tile), so the
// frame is what a real game looks like and the same seed always gives the
// same frame. The alert scene baits in place instead, so it is spotted.
import { LEVELS } from './levels.js';
import { SCREEN_CAUGHT, SCREEN_LEVEL_CLEAR, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, STEP, VISION_HALF_ANGLE, VISION_RANGE } from './config.js';
import { EVENT_CAUGHT, EVENT_LEVEL_CLEAR, stepWorld } from './world.js';

const SAMPLE = STEP;

// Breadth-first path over walkable tiles, as tile-centre points.
function findPath(state, fromX, fromY, toX, toY) {
  const { cols, rows, tiles } = state.level;
  const blocked = (x, y) => x < 0 || y < 0 || x >= cols || y >= rows || tiles[y][x] === '#' || tiles[y][x] === 'C';
  const start = [Math.floor(fromX), Math.floor(fromY)];
  const goal = [toX, toY];
  const prev = new Map([[`${start[0]},${start[1]}`, null]]);
  const queue = [start];
  while (queue.length) {
    const [cx, cy] = queue.shift();
    if (cx === goal[0] && cy === goal[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (!blocked(nx, ny) && !prev.has(key)) {
        prev.set(key, [cx, cy]);
        queue.push([nx, ny]);
      }
    }
  }
  if (!prev.has(`${goal[0]},${goal[1]}`)) return [];
  const path = [];
  let cur = goal;
  while (cur) {
    path.unshift([cur[0] + 0.5, cur[1] + 0.5]);
    cur = prev.get(`${cur[0]},${cur[1]}`);
  }
  return path;
}

function lineOfSight(state, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const tx = Math.floor(x0 + dx * t);
    const ty = Math.floor(y0 + dy * t);
    if (tx < 0 || ty < 0 || tx >= state.level.cols || ty >= state.level.rows) return false;
    const tile = state.level.tiles[ty][tx];
    if (tile === '#' || tile === 'C') return false;
  }
  return true;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Would any guard see this point right now?
function pointSeen(state, x, y) {
  for (const guard of state.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > VISION_RANGE) continue;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), guard.facing)) > VISION_HALF_ANGLE) continue;
    if (lineOfSight(state, guard.x, guard.y, x, y)) return true;
  }
  return false;
}

function nearestGuardDistance(state) {
  let best = Infinity;
  for (const guard of state.guards) {
    best = Math.min(best, Math.hypot(guard.x - state.player.x, guard.y - state.player.y));
  }
  return best;
}

// Step toward the tile that puts the most distance between the player and
// every guard, staying in the open: the bait's kite step, for when being
// seen is the point.
function kiteStep(state) {
  const p = state.player;
  const { cols, rows, tiles } = state.level;
  const blocked = (x, y) => x < 0 || y < 0 || x >= cols || y >= rows || tiles[y][x] === '#' || tiles[y][x] === 'C';
  let best = null;
  let bestScore = -Infinity;
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (blocked(nx, ny)) continue;
    const tx = nx + 0.5;
    const ty = ny + 0.5;
    let minDist = Infinity;
    for (const guard of state.guards) minDist = Math.min(minDist, Math.hypot(guard.x - tx, guard.y - ty));
    if (minDist > bestScore) { bestScore = minDist; best = [tx, ty]; }
  }
  if (!best) return { x: 0, y: 0, sneak: false, run: false };
  return { x: best[0] - p.x, y: best[1] - p.y, sneak: false, run: false };
}

// Step toward the tile that puts the most distance between the player and
// every guard. Used when a patrol walks onto the player's tile. With run,
// the player legs it at full speed instead of walking.
function fleeStep(state, run = false) {
  const p = state.player;
  const { cols, rows, tiles } = state.level;
  const blocked = (x, y) => x < 0 || y < 0 || x >= cols || y >= rows || tiles[y][x] === '#' || tiles[y][x] === 'C';
  let best = null;
  let bestScore = -Infinity;
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (blocked(nx, ny)) continue;
    const tx = nx + 0.5;
    const ty = ny + 0.5;
    let minDist = Infinity;
    for (const guard of state.guards) minDist = Math.min(minDist, Math.hypot(guard.x - tx, guard.y - ty));
    const seen = pointSeen(state, tx, ty) ? -2 : 0;
    const score = minDist + seen;
    if (score > bestScore) { bestScore = score; best = [tx, ty]; }
  }
  if (!best) return { x: 0, y: 0, sneak: false, run: false };
  return { x: best[0] - p.x, y: best[1] - p.y, sneak: false, run };
}

// Is the straight segment between two points free of walls and crates?
// The autopilot follows waypoints blindly; after a flee shoves it off the
// path, the next waypoint can sit behind a wall, and the player would push
// against it forever. A blocked segment means: replan from where we are.
function clearSegment(state, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.3));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const tx = Math.floor(x0 + dx * t);
    const ty = Math.floor(y0 + dy * t);
    if (tx < 0 || ty < 0 || tx >= state.level.cols || ty >= state.level.rows) return false;
    const tile = state.level.tiles[ty][tx];
    if (tile === '#' || tile === 'C') return false;
  }
  return true;
}

// One autopilot step: move along the path to the next objective, waiting
// whenever the next tile is watched or a guard's meter is climbing, and
// stepping aside whenever a guard walks onto the player's tile. When the
// alarm is up, it stops being careful and runs for the objective instead:
// the chase is slower than a run, and the exit is still open.
function autopilotStep(world, path, bold, goalOverride) {
  const state = world.state;
  const p = state.player;
  const nearest = nearestGuardDistance(state);
  const alarmed = state.alarm;
  if (!alarmed) {
    // Heat check: while a guard nearby is suspicious or searching, or the
    // meter is still up, fall back to a safe distance and hold still until
    // the heat dies down. Hovering at the edge of an investigation is how
    // a run gets cornered. Distant investigations are ignored.
    const heat = state.guards.some((g) => g.state !== 'patrol'
      && Math.hypot(g.x - p.x, g.y - p.y) < 6) || state.detection > 5;
    if (heat && !bold) {
      if (nearest < 4) return fleeStep(state);
      return { x: 0, y: 0, sneak: true, run: false };
    }
    // A guard this close owns the tile: step aside, never through it. A
    // one-tile corridor past a camping guard is a wait, not a squeeze.
    // Bold mode (the alert scene) stands its ground instead: being
    // spotted is the point there.
    if (!bold && nearest < 2.0) return fleeStep(state);
  }
  if (!path.current || path.current.length === 0) {
    const target = state.artifacts.find((a) => !a.taken);
    const goal = goalOverride || (target ? [target.x, target.y] : [state.level.exit.x, state.level.exit.y]);
    path.current = findPath(state, p.x, p.y, goal[0], goal[1]);
    path.current.shift(); // the tile we already stand on
  }
  let next = path.current[0];
  if (next && !clearSegment(state, p.x, p.y, next[0], next[1])) {
    const target = state.artifacts.find((a) => !a.taken);
    const goal = goalOverride || (target ? [target.x, target.y] : [state.level.exit.x, state.level.exit.y]);
    path.current = findPath(state, p.x, p.y, goal[0], goal[1]);
    path.current.shift();
    next = path.current[0];
  }
  if (!next) return { x: 0, y: 0, sneak: false, run: false };
  const dx = next[0] - p.x;
  const dy = next[1] - p.y;
  if (Math.hypot(dx, dy) < 0.15) {
    path.current.shift();
    return { x: 0, y: 0, sneak: false, run: false };
  }
  // How close is the next tile to any guard?
  let nextGuard = Infinity;
  for (const guard of state.guards) nextGuard = Math.min(nextGuard, Math.hypot(guard.x - next[0], guard.y - next[1]));
  if (!bold && !alarmed) {
    const watched = pointSeen(state, next[0], next[1]);
    const standingWatched = pointSeen(state, p.x, p.y);
    const hot = state.detection > 45;
    if (nextGuard < 1.8 || (watched || hot) && !standingWatched) {
      // Do not wait on a patrol route: step back along the path instead.
      if (nearest < 2.6) return fleeStep(state);
      return { x: 0, y: 0, sneak: true, run: false };
    }
  }
  // Sneak whenever a guard is near; only walk in the clear. Sneaking
  // everywhere is slower, and slow means longer in the cones.
  const sneak = !alarmed && nearestGuardDistance(state) < 3.5;
  return { x: dx, y: dy, sneak, run: alarmed };
}

// Play one level with the autopilot until it clears, is caught, or the
// step budget runs out. Returns 'clear', 'caught' or 'timeout'.
function playLevel(world, { bold = false, maxSeconds = 120, stopAfterArtifacts = null } = {}) {
  const path = { current: [] };
  let taken = 0;
  for (let i = 0; i < maxSeconds / SAMPLE; i += 1) {
    const input = autopilotStep(world, path, bold);
    const events = stepWorld(world, SAMPLE, input);
    if (events & EVENT_CAUGHT) return 'caught';
    if (world.state.artifactsTaken !== taken) {
      taken = world.state.artifactsTaken;
      path.current = [];
      if (stopAfterArtifacts !== null && taken >= stopAfterArtifacts) return 'stopped';
    }
    if (events & EVENT_LEVEL_CLEAR) return 'clear';
  }
  return 'timeout';
}

// Stage the named scene. makeWorld(levelIndex, score) builds a fresh world.
export function stageShot(name, makeWorld) {
  if (name === 'play') {
    const world = makeWorld(0, 0);
    playLevel(world, { maxSeconds: 60, stopAfterArtifacts: 2 });
    return { world, screen: SCREEN_PLAY };
  }
  if (name === 'alert') {
    const world = makeWorld(1, 0);
    // Play carefully to the third relic — it sits on a guard's patrol
    // route — then stand in the open until the alarm goes up: the frame
    // catches the chase, with the "!" over the guard and ALARM on the HUD.
    playLevel(world, { maxSeconds: 120, stopAfterArtifacts: 3 });
    for (let i = 0; i < 120 / SAMPLE; i += 1) {
      if (world.state.alarm) {
        // The alarm is up: run from the nearest guard for a beat, so the
        // frame catches the chase, not the catch.
        for (let j = 0; j < 0.8 / SAMPLE; j += 1) {
          stepWorld(world, SAMPLE, fleeStep(world.state, true));
          if (world.state.caught) break;
        }
        return { world, screen: world.state.caught ? SCREEN_CAUGHT : SCREEN_PLAY };
      }
      if (world.state.caught) return { world, screen: SCREEN_CAUGHT };
      // Hold still in the open; kite away when a guard is close enough
      // to grab, so the meter — not the catch — ends the scene. Three
      // tiles of buffer: the alarm tends to fire exactly as a guard
      // closes in, and the chase after it is fast.
      const nearest = nearestGuardDistance(world.state);
      const input = nearest < 3.0 ? kiteStep(world.state) : { x: 0, y: 0, sneak: true, run: false };
      stepWorld(world, SAMPLE, input);
    }
    return { world, screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    let score = 0;
    let totalTime = 0;
    let world = null;
    for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex += 1) {
      world = makeWorld(levelIndex, score);
      const outcome = playLevel(world, { maxSeconds: 200 });
      if (outcome !== 'clear') return { world, screen: SCREEN_CAUGHT };
      score = world.state.score;
      totalTime += world.state.time;
    }
    // The win screen is drawn over the final level's world.
    world.state.runTime = totalTime;
    return { world, screen: SCREEN_WIN };
  }
  // 'start' and anything else: the title over a live, patrolling level.
  const world = makeWorld(0, 0);
  for (let i = 0; i < 5 / SAMPLE; i += 1) {
    stepWorld(world, SAMPLE, { x: 0, y: 0, sneak: false, run: false });
  }
  return { world, screen: SCREEN_TITLE };
}
