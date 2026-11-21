// Canvas drawing: the museum floor, raycast vision cones, the HUD and
// every screen. Nothing here touches game state — it only reads it, so a
// staged screenshot and a live frame draw the same way.
import { TILE, VIEW_H, VIEW_W, VISION_HALF_ANGLE, VISION_RANGE } from './config.js';

const FLOOR_A = '#232742';
const FLOOR_B = '#1f2338';
const DARK_FLOOR = '#12142a';
const WALL = '#454b6e';
const WALL_TOP = '#5d6494';
const BUSH = '#1d4d2b';
const BUSH_LEAF = '#2a6b3d';
const GOLD = '#ffd76a';
const EXIT_OPEN = '#37d67a';
const EXIT_SHUT = '#7a4a4a';

function castRay(w, x, y, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let t = 0;
  while (t < VISION_RANGE) {
    t += 0.1;
    const nx = x + dx * t;
    const ny = y + dy * t;
    if (w.grid[Math.floor(ny)] === undefined || w.grid[Math.floor(ny)][Math.floor(nx)] === '#') return t;
    if (nx < 0 || ny < 0 || nx >= w.cols || ny >= w.rows) return t;
  }
  return VISION_RANGE;
}

function coneColor(state) {
  if (state === 'alert') return 'rgba(224, 57, 57, 0.30)';
  if (state === 'suspicious' || state === 'search') return 'rgba(232, 138, 60, 0.24)';
  return 'rgba(232, 201, 90, 0.20)';
}

function drawCone(ctx, w, guard) {
  const rays = 26;
  ctx.beginPath();
  ctx.moveTo(guard.x * TILE, guard.y * TILE);
  for (let i = 0; i <= rays; i++) {
    const a = guard.dir - VISION_HALF_ANGLE + (2 * VISION_HALF_ANGLE * i) / rays;
    const d = castRay(w, guard.x, guard.y, a);
    ctx.lineTo((guard.x + Math.cos(a) * d) * TILE, (guard.y + Math.sin(a) * d) * TILE);
  }
  ctx.closePath();
  ctx.fillStyle = coneColor(guard.state);
  ctx.fill();
}

function drawWorld(ctx, w) {
  // Floor.
  for (let y = 0; y < w.rows; y++) {
    for (let x = 0; x < w.cols; x++) {
      const t = w.grid[y][x];
      if (t === '#') {
        ctx.fillStyle = WALL;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.fillStyle = WALL_TOP;
        ctx.fillRect(x * TILE, y * TILE, TILE, 4);
      } else if (t === ',') {
        ctx.fillStyle = DARK_FLOOR;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      } else if (t === 'B') {
        ctx.fillStyle = BUSH;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.fillStyle = BUSH_LEAF;
        ctx.beginPath();
        ctx.arc(x * TILE + 10, y * TILE + 12, 7, 0, Math.PI * 2);
        ctx.arc(x * TILE + 22, y * TILE + 20, 8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(x * TILE, y * TILE, TILE, 1);
      }
    }
  }

  // Exit door.
  const ex = w.exit.x * TILE;
  const ey = w.exit.y * TILE;
  ctx.fillStyle = w.exitOpen ? EXIT_OPEN : EXIT_SHUT;
  ctx.fillRect(ex - 13, ey - 13, 26, 26);
  ctx.fillStyle = '#0c0f1e';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(w.exitOpen ? 'EXIT' : 'LOCK', ex, ey);

  // Relics: gold diamonds, gently pulsing.
  for (const relic of w.relics) {
    if (relic.taken) continue;
    const rx = relic.x * TILE;
    const ry = relic.y * TILE;
    const pulse = 0.75 + 0.25 * Math.sin(w.totalTime * 3 + relic.x);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(rx, ry - 10);
    ctx.lineTo(rx + 8, ry);
    ctx.lineTo(rx, ry + 10);
    ctx.lineTo(rx - 8, ry);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a6a1d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Thrown coins, mid-flight ring.
  for (const fx of w.coinFx) {
    const fxX = fx.x * TILE;
    const fxY = fx.y * TILE;
    ctx.strokeStyle = 'rgba(255, 215, 106, ' + Math.max(0, fx.ttl) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fxX, fxY, 6 + (1.2 - fx.ttl) * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(fxX, fxY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Guards: cone first, then the body, so the body sits on top.
  for (const guard of w.guards) drawCone(ctx, w, guard);
  for (const guard of w.guards) {
    const gx = guard.x * TILE;
    const gy = guard.y * TILE;
    const body = guard.state === 'alert' ? '#d64541' : guard.state === 'patrol' ? '#8a93b8' : '#e08a3c';
    ctx.fillStyle = '#10122a';
    ctx.beginPath();
    ctx.arc(gx, gy, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(gx, gy, 10, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = '#10122a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(guard.dir) * 14, gy + Math.sin(guard.dir) * 14);
    ctx.stroke();
    // State mark.
    if (guard.state === 'alert') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('!', gx, gy - 17);
    } else if (guard.state === 'suspicious' || guard.state === 'search') {
      ctx.fillStyle = '#ffd76a';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('?', gx, gy - 17);
    }
  }

  // Player: a hooded figure, cloak pointing where it moves.
  const px = w.player.x * TILE;
  const py = w.player.y * TILE;
  const dir = w.player.dir;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(dir);
  ctx.fillStyle = '#e8e8f2';
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-9, -10);
  ctx.lineTo(-9, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2b2f4a';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(4, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx, w) {
  ctx.fillStyle = 'rgba(8, 10, 24, 0.82)';
  ctx.fillRect(0, 0, VIEW_W, 30);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8e8f2';
  ctx.font = 'bold 14px monospace';
  const got = w.relics.filter((r) => r.taken).length;
  ctx.fillText('SHADOWLINE  ·  ' + w.level.name, 12, 16);
  ctx.fillText('RELICS ' + got + '/' + w.relics.length, 300, 16);
  ctx.fillText('COINS ' + w.coins, 430, 16);
  ctx.fillText('SCORE ' + w.score, 530, 16);
  const mins = Math.floor(w.levelTime / 60);
  const secs = Math.floor(w.levelTime % 60);
  ctx.fillText('TIME ' + mins + ':' + String(secs).padStart(2, '0'), 680, 16);
  // Detection bar.
  const bx = 800;
  ctx.fillStyle = '#33395e';
  ctx.fillRect(bx, 9, 200, 12);
  const det = Math.max(0, Math.min(100, w.detection));
  ctx.fillStyle = det >= 70 ? '#d64541' : det >= 30 ? '#e08a3c' : '#ffd76a';
  ctx.fillRect(bx, 9, 200 * (det / 100), 12);
  ctx.fillStyle = '#e8e8f2';
  ctx.fillText(w.alarmUp ? 'ALARM ' + Math.round(det) : 'SEEN ' + Math.round(det), 1010, 16);
  if (w.exitOpen) {
    ctx.fillStyle = EXIT_OPEN;
    ctx.fillText('EXIT OPEN', 1140, 16);
  }
}

function panel(ctx, title, lines, accent) {
  ctx.fillStyle = 'rgba(6, 8, 20, 0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accent || '#e8e8f2';
  ctx.font = 'bold 52px monospace';
  ctx.fillText(title, VIEW_W / 2, 120);
  ctx.fillStyle = '#c9cde4';
  ctx.font = '19px monospace';
  lines.forEach((line, i) => {
    ctx.fillText(line, VIEW_W / 2, 190 + i * 32);
  });
}

export function render(ctx, w, screen, summary) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawWorld(ctx, w);
  drawHud(ctx, w);
  if (screen === 'title') {
    panel(ctx, 'SHADOWLINE', [
      'a night job at the Meridian Museum',
      '',
      'Lift every relic. Reach the exit. Never be seen.',
      'WASD move  ·  SHIFT run (loud)  ·  CLICK / Q throw a coin',
      'Bushes and dark floor hide you. Guards hunt what they see.',
      '',
      'Press SPACE to begin the job',
    ], '#ffd76a');
  } else if (screen === 'paused') {
    panel(ctx, 'PAUSED', ['The museum waits. The guards do not.', '', 'Press P to keep sneaking'], '#e8e8f2');
  } else if (screen === 'caught') {
    panel(ctx, 'CAUGHT', [
      'A guard closed in under the lights. The job is over.',
      'Relics lifted: ' + w.relics.filter((r) => r.taken).length + ' of ' + w.relics.length,
      'Score: ' + w.score,
      '',
      'Press R to try the floor again',
    ], '#d64541');
  } else if (screen === 'clear') {
    panel(ctx, w.level.name.toUpperCase() + ' CLEAR', [
      'Every relic lifted. The exit swings open.',
      'Score: ' + w.score,
      '',
      'The next floor is waiting…',
    ], '#37d67a');
  } else if (screen === 'win') {
    const s = summary || { score: w.score, rank: w.rank || 'GHOST', time: w.totalTime };
    panel(ctx, 'THE JOB IS DONE', [
      'All three floors cleared. The Meridian Museum is lighter by',
      'fourteen relics, and nobody saw a thing.',
      '',
      'Rank: ' + s.rank + '    Score: ' + s.score,
      'Time: ' + Math.round(s.time || 0) + 's    Alarms: ' + (s.alarms || 0),
      '',
      'Press R to run the job again',
    ], '#ffd76a');
  }
}
