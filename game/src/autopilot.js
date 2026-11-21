// The autopilot: a deterministic player that clears all three levels with
// no human input. It plans with Dijkstra over the tile grid, treats tiles
// a guard can currently see as expensive (unless they are cover), waits
// while its next step is watched, dashes through when waiting stops paying,
// throws a coin to pull a stubborn guard away, and runs for cover when an
// alarm goes up. The browser game and the headless check run this same code.
import { LEVELS } from './levels.js';
import { computeWatched, createWorld, rankFor, stepWorld } from './world.js';

const DT = 1 / 30;

function tileKey(x, y) {
  return x + ',' + y;
}

// Cheapest path (Dijkstra) from one tile to another. costFn(tile) returns
// the extra cost of entering that tile; returns a list of tile coords
// [x, y], start included, or null when no route exists.
export function bfsPath(w, from, to, costFn) {
  const startKey = tileKey(from.x, from.y);
  const goalKey = tileKey(to.x, to.y);
  const dist = new Map([[startKey, 0]]);
  const prev = new Map();
  const open = [[0, from.x, from.y]];
  const seen = new Set();
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[best][0]) best = i;
    const [d, cx, cy] = open.splice(best, 1)[0];
    const key = tileKey(cx, cy);
    if (seen.has(key)) continue;
    seen.add(key);
    if (key === goalKey) {
      const path = [[cx, cy]];
      let k = key;
      while (prev.has(k)) {
        k = prev.get(k);
        const [px, py] = k.split(',').map(Number);
        path.unshift([px, py]);
      }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w.cols || ny >= w.rows) continue;
      if (w.grid[ny][nx] === '#') continue;
      const nk = tileKey(nx, ny);
      const nd = d + 1 + (costFn ? costFn(nx, ny) : 0);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, key);
        open.push([nd, nx, ny]);
      }
    }
  }
  return null;
}

// Dijkstra distances from one tile to every tile (same costs as bfsPath).
function bfsDistances(w, from, costFn) {
  const dist = new Map([[tileKey(from.x, from.y), 0]]);
  const open = [[0, from.x, from.y]];
  const seen = new Set();
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[best][0]) best = i;
    const [d, cx, cy] = open.splice(best, 1)[0];
    const key = tileKey(cx, cy);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w.cols || ny >= w.rows) continue;
      if (w.grid[ny][nx] === '#') continue;
      const nk = tileKey(nx, ny);
      const nd = d + 1 + (costFn ? costFn(nx, ny) : 0);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        open.push([nd, nx, ny]);
      }
    }
  }
  return dist;
}

function coverCost(w, x, y) {
  const t = w.grid[y][x];
  if (t === 'B' || t === ',') return -0.25;
  return 0;
}

// One autopilot decision. mem is the autopilot's memory, kept across ticks
// for one level: { waitT, coinWaitT, fleeTarget }.
export function autopilotStep(w, mem, dt) {
  const idle = { mx: 0, my: 0, run: false, coin: null };
  if (w.status !== 'playing') return idle;
  const player = w.player;
  const ptx = Math.floor(player.x);
  const pty = Math.floor(player.y);
  const watched = computeWatched(w);
  const hereWatched = watched.has(tileKey(ptx, pty));
  const costFn = (x, y) => (watched.has(tileKey(x, y)) ? 30 : 0) + coverCost(w, x, y);

  // --- alarm or a closing guard: run for the safest cover, away from
  // every guard. A suspicious guard is already walking to where it last
  // saw or heard the player, so waiting it out in the open gets the
  // player caught; only distance and cover break the hunt. ---
  const threat = w.guards.find((g) => {
    const d = Math.hypot(g.x - player.x, g.y - player.y);
    if (g.state === 'alert') return d < 7;
    return g.state !== 'patrol' && d < 4.5;
  });
  if (threat) {
    let bestTile = null;
    let bestScore = -Infinity;
    for (let y = 0; y < w.rows; y++) {
      for (let x = 0; x < w.cols; x++) {
        if (w.grid[y][x] === '#') continue;
        let minD = Infinity;
        for (const g of w.guards) minD = Math.min(minD, Math.hypot(g.x - (x + 0.5), g.y - (y + 0.5)));
        const coverBonus = w.grid[y][x] === 'B' ? 3 : w.grid[y][x] === ',' ? 1.5 : 0;
        const score = minD + coverBonus - Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y) * 0.2;
        if (score > bestScore) {
          bestScore = score;
          bestTile = [x, y];
        }
      }
    }
    if (bestTile) {
      const path = bfsPath(w, { x: ptx, y: pty }, { x: bestTile[0], y: bestTile[1] }, null);
      if (path && path.length > 1) return steer(w, path[1], true);
      return steer(w, bestTile, true);
    }
    return idle;
  }

  // --- pick a target: nearest uncollected relic, else the exit. ---
  let target = null;
  const dists = bfsDistances(w, { x: ptx, y: pty }, costFn);
  let bestD = Infinity;
  for (const relic of w.relics) {
    if (relic.taken) continue;
    const d = dists.get(tileKey(Math.floor(relic.x), Math.floor(relic.y)));
    if (d !== undefined && d < bestD) {
      bestD = d;
      target = { x: Math.floor(relic.x), y: Math.floor(relic.y) };
    }
  }
  if (!target && w.exitOpen) {
    target = { x: Math.floor(w.exit.x), y: Math.floor(w.exit.y) };
  }
  if (!target) return idle;

  const path = bfsPath(w, { x: ptx, y: pty }, target, costFn);
  if (!path || path.length < 2) return idle;
  const next = path[1];
  const nextWatched = watched.has(tileKey(next[0], next[1]));

  // --- waiting: a watched next step is not worth stepping into while the
  // patrol is about to move on. After a while, dash through instead. ---
  if (nextWatched && !hereWatched) {
    mem.waitT += dt;
    if (mem.waitT < 3.5) return idle;
    // Dash: run through the watched tile.
    mem.waitT = 0;
    return steer(w, next, true);
  }
  mem.waitT = 0;

  // --- coin lure: if the route keeps us pinned, pull the blocking guard
  // away with a coin thrown to the far side of it. ---
  if (nextWatched && w.coins > 0 && mem.coinWaitT > 6) {
    mem.coinWaitT = 0;
    const blocker = w.guards.find((g) => {
      const gx = Math.floor(g.x);
      const gy = Math.floor(g.y);
      return watched.has(tileKey(gx, gy)) && Math.hypot(g.x - player.x, g.y - player.y) < 8;
    });
    if (blocker) {
      const away = Math.atan2(blocker.y - player.y, blocker.x - player.x) + Math.PI;
      const lx = Math.max(1, Math.min(w.cols - 2, Math.round(blocker.x + Math.cos(away) * 4)));
      const ly = Math.max(1, Math.min(w.rows - 2, Math.round(blocker.y + Math.sin(away) * 4)));
      return { mx: 0, my: 0, run: false, coin: { x: lx + 0.5, y: ly + 0.5 } };
    }
  }
  if (nextWatched) mem.coinWaitT += dt;
  else mem.coinWaitT = 0;

  // Sneak through: running is loud (guards hear it from 6 tiles) and only
  // pays when dashing a watched tile after a long wait, or fleeing — both
  // handled above. In the open, quiet and steady wins.
  return steer(w, next, false);
}

// Steer toward the centre of a tile; run when told.
function steer(w, tile, run) {
  const tx = tile[0] + 0.5;
  const ty = tile[1] + 0.5;
  const dx = tx - w.player.x;
  const dy = ty - w.player.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.08) return { mx: 0, my: 0, run: false, coin: null };
  return { mx: dx / d, my: dy / d, run, coin: null };
}

// Play the whole job headlessly: returns a summary once the game is won,
// caught, or out of time. Deterministic for a fixed seed.
export function runAutopilot(seed) {
  let carry = null;
  const perLevel = [];
  for (let li = 0; li < LEVELS.length; li++) {
    const w = createWorld(li, seed, carry);
    const mem = { waitT: 0, coinWaitT: 0 };
    let ticks = 0;
    const maxTicks = 30000;
    while (w.status === 'playing' && ticks < maxTicks) {
      const input = autopilotStep(w, mem, DT);
      stepWorld(w, input, DT);
      ticks++;
    }
    perLevel.push({
      level: w.level.name,
      status: w.status,
      ticks,
      time: Math.round(w.levelTime * 10) / 10,
      relics: w.relics.filter((r) => r.taken).length + '/' + w.relics.length,
      detection: Math.round(w.maxDetection),
      score: w.score,
    });
    if (w.status === 'caught') {
      return { won: false, reason: 'caught on ' + w.level.name, score: w.score, perLevel };
    }
    if (w.status !== 'clear' && w.status !== 'won') {
      return { won: false, reason: 'timeout on ' + w.level.name, score: w.score, perLevel };
    }
    carry = { score: w.score, maxDetection: w.maxDetection, alarms: w.alarms, totalTime: w.totalTime };
    if (w.status === 'won') {
      return {
        won: true,
        score: w.score,
        rank: w.rank || rankFor(w.maxDetection, w.alarms),
        maxDetection: Math.round(w.maxDetection),
        alarms: w.alarms,
        time: Math.round(w.totalTime * 10) / 10,
        perLevel,
      };
    }
  }
  return { won: false, reason: 'ran out of levels', score: carry ? carry.score : 0, perLevel };
}
