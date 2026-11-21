// SHADOWLINE — everything the player sees, painted on one canvas.
// The museum at night: dark floors, warm lamp pools, teal guard cones,
// amber relics. Vision cones are raycast polygons, so a wall really does
// cut a cone short. The HUD is drawn on the canvas too, so a screenshot
// shows the whole game, exactly as played.
import { PALETTE, SCREEN_CAUGHT, SCREEN_INTRO, SCREEN_LEVEL_CLEAR, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, VISION_HALF_ANGLE, VISION_RANGE } from './config.js';
import { rankFor } from './world.js';

const HUD_H = 46;
const HINT_H = 30;

// A stable hash of a tile, for speckles that never move between frames.
function hash2(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function layout(state) {
    const w = canvas.width;
    const h = canvas.height;
    const { cols, rows } = state.level;
    const tile = Math.max(10, Math.floor(Math.min((w - 32) / cols, (h - HUD_H - HINT_H - 16) / rows)));
    const ox = Math.floor((w - tile * cols) / 2);
    const oy = HUD_H + Math.floor((h - HUD_H - HINT_H - tile * rows) / 2);
    return { w, h, tile, ox, oy };
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width * dpr));
    const h = Math.max(200, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function tileColor(tile) {
    if (tile === ',') return PALETTE.floorDark;
    return PALETTE.floor;
  }

  function drawFloor(state, lay) {
    const { tile, ox, oy } = lay;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, lay.w, lay.h);
    for (let y = 0; y < state.level.rows; y += 1) {
      for (let x = 0; x < state.level.cols; x += 1) {
        const t = state.level.tiles[y][x];
        const px = ox + x * tile;
        const py = oy + y * tile;
        if (t === '#') continue;
        ctx.fillStyle = tileColor(t);
        ctx.fillRect(px, py, tile, tile);
        // Speckles and grout: the same tile always looks the same.
        const s = hash2(x, y);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(px + Math.floor(s * (tile - 4)), py + Math.floor(hash2(y, x) * (tile - 4)), 3, 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tile - 1, tile - 1);
        if (t === ',') {
          ctx.fillStyle = 'rgba(6,8,18,0.35)';
          ctx.fillRect(px, py, tile, tile);
        }
      }
    }
    // Warm lamp pools: fixed lamps over the floor, pure decoration.
    for (let y = 0; y < state.level.rows; y += 1) {
      for (let x = 0; x < state.level.cols; x += 1) {
        if (hash2(x * 3 + 1, y * 5 + 2) > 0.93 && state.level.tiles[y][x] === '.') {
          const cx = ox + (x + 0.5) * tile;
          const cy = oy + (y + 0.5) * tile;
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, tile * 1.6);
          g.addColorStop(0, 'rgba(245,185,66,0.10)');
          g.addColorStop(1, 'rgba(245,185,66,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - tile * 1.6, cy - tile * 1.6, tile * 3.2, tile * 3.2);
        }
      }
    }
  }

  function drawCone(state, lay, guard) {
    const { tile, ox, oy } = lay;
    const gx = ox + guard.x * tile;
    const gy = oy + guard.y * tile;
    const range = VISION_RANGE * tile;
    const rays = 26;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    for (let i = 0; i <= rays; i += 1) {
      const a = guard.facing - VISION_HALF_ANGLE + (2 * VISION_HALF_ANGLE * i) / rays;
      let r = range;
      for (let d = tile * 0.3; d < range; d += tile * 0.18) {
        const tx = Math.floor((guard.x + Math.cos(a) * (d / tile)));
        const ty = Math.floor((guard.y + Math.sin(a) * (d / tile)));
        const t = tx < 0 || ty < 0 || tx >= state.level.cols || ty >= state.level.rows
          ? '#' : state.level.tiles[ty][tx];
        if (t === '#' || t === 'C') { r = d; break; }
      }
      ctx.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = guard.state === 'alert' ? PALETTE.coneAlert
      : guard.state === 'suspicious' || guard.state === 'search' ? PALETTE.coneSuspicious
      : PALETTE.cone;
    ctx.fill();
  }

  function drawProps(state, lay) {
    const { tile, ox, oy } = lay;
    for (let y = 0; y < state.level.rows; y += 1) {
      for (let x = 0; x < state.level.cols; x += 1) {
        const t = state.level.tiles[y][x];
        const px = ox + x * tile;
        const py = oy + y * tile;
        if (t === '#') {
          ctx.fillStyle = PALETTE.wall;
          ctx.fillRect(px, py, tile, tile);
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(px, py, tile, Math.max(2, tile * 0.14));
        } else if (t === 'C') {
          ctx.fillStyle = PALETTE.crate;
          ctx.fillRect(px + 1, py + 1, tile - 2, tile - 2);
          ctx.strokeStyle = PALETTE.crateTop;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 3, py + 3, tile - 6, tile - 6);
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 3);
          ctx.lineTo(px + tile - 3, py + tile - 3);
          ctx.moveTo(px + tile - 3, py + 3);
          ctx.lineTo(px + 3, py + tile - 3);
          ctx.stroke();
        } else if (t === 'B') {
          ctx.fillStyle = PALETTE.bush;
          for (const [dx, dy, r] of [[0.3, 0.35, 0.3], [0.65, 0.3, 0.32], [0.5, 0.65, 0.3]]) {
            ctx.beginPath();
            ctx.arc(px + dx * tile, py + dy * tile, r * tile, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = PALETTE.bushTop;
          ctx.beginPath();
          ctx.arc(px + 0.4 * tile, py + 0.4 * tile, 0.12 * tile, 0, Math.PI * 2);
          ctx.arc(px + 0.62 * tile, py + 0.55 * tile, 0.1 * tile, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // The exit door.
    const ex = state.level.exit;
    const exX = ox + ex.x * tile;
    const exY = oy + ex.y * tile;
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
    ctx.fillStyle = state.exitOpen ? `rgba(57,208,165,${0.5 + 0.3 * pulse})` : PALETTE.exitLocked;
    ctx.fillRect(exX + 1, exY + 1, tile - 2, tile - 2);
    ctx.strokeStyle = state.exitOpen ? PALETTE.exit : '#5a6a62';
    ctx.lineWidth = 2;
    ctx.strokeRect(exX + 2, exY + 2, tile - 4, tile - 4);
    ctx.fillStyle = state.exitOpen ? '#06281d' : '#c8d2cc';
    ctx.font = `bold ${Math.max(10, tile * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.exitOpen ? '→' : '✕', exX + tile / 2, exY + tile / 2 + 1);
    // Artifacts: amber diamonds that breathe.
    for (const a of state.artifacts) {
      if (a.taken) continue;
      const cx = ox + (a.x + 0.5) * tile;
      const cy = oy + (a.y + 0.5) * tile;
      const glow = 0.5 + 0.3 * Math.sin(state.time * 4 + a.x);
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, tile * 0.8);
      g.addColorStop(0, `rgba(245,185,66,${0.5 * glow})`);
      g.addColorStop(1, 'rgba(245,185,66,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.artifact;
      ctx.beginPath();
      ctx.moveTo(cx, cy - tile * 0.28);
      ctx.lineTo(cx + tile * 0.22, cy);
      ctx.lineTo(cx, cy + tile * 0.28);
      ctx.lineTo(cx - tile * 0.22, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.artifactGlow;
      ctx.beginPath();
      ctx.moveTo(cx, cy - tile * 0.14);
      ctx.lineTo(cx + tile * 0.1, cy);
      ctx.lineTo(cx, cy + tile * 0.14);
      ctx.lineTo(cx - tile * 0.1, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGuards(state, lay) {
    const { tile, ox, oy } = lay;
    for (const guard of state.guards) {
      drawCone(state, lay, guard);
    }
    for (const guard of state.guards) {
      const cx = ox + guard.x * tile;
      const cy = oy + guard.y * tile;
      const r = tile * 0.34;
      // Alert ring under an alarmed guard.
      if (guard.state === 'alert') {
        ctx.strokeStyle = 'rgba(255,93,93,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4 + 2 * Math.sin(state.time * 6), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = PALETTE.guard;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b1210';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(guard.facing) * r * 0.45, cy + Math.sin(guard.facing) * r * 0.45, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      // "?" while suspicious, "!" while alert, and a meter arc.
      if (guard.state === 'suspicious' || guard.state === 'search') {
        ctx.fillStyle = PALETTE.gold;
        ctx.font = `bold ${Math.max(12, tile * 0.6)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('?', cx, cy - r - 2);
      } else if (guard.state === 'alert') {
        ctx.fillStyle = PALETTE.danger;
        ctx.font = `bold ${Math.max(12, tile * 0.6)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('!', cx, cy - r - 2);
      }
      if (guard.meter > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = guard.meter >= 100 ? PALETTE.danger : guard.meter >= 35 ? PALETTE.gold : '#7dd8c0';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * guard.meter) / 100);
        ctx.stroke();
      }
    }
  }

  function drawPlayer(state, lay) {
    const { tile, ox, oy } = lay;
    const p = state.player;
    const cx = ox + p.x * tile;
    const cy = oy + p.y * tile;
    // Noise ring while moving: what the guards can hear.
    if (p.moving) {
      const radius = (p.running ? 3.8 : p.sneaking ? 0.6 : 1.6) * tile;
      ctx.strokeStyle = 'rgba(232,230,223,0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Thrown coins arc through the air.
    for (const coin of state.coinsThrown) {
      const t = Math.min(1, coin.t / coin.duration);
      const x = ox + (coin.fromX + (coin.toX - coin.fromX) * t) * tile;
      const y = oy + (coin.fromY + (coin.toY - coin.fromY) * t) * tile - Math.sin(t * Math.PI) * tile * 0.6;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, tile * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    const r = tile * (p.sneaking ? 0.28 : 0.34);
    ctx.globalAlpha = p.hidden ? 0.55 : 1;
    ctx.fillStyle = PALETTE.playerCloak;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(Math.atan2(p.dirY, p.dirX)) * r * 0.3, cy + Math.sin(Math.atan2(p.dirY, p.dirX)) * r * 0.3, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (p.hidden) {
      ctx.fillStyle = 'rgba(232,230,223,0.8)';
      ctx.font = `${Math.max(9, tile * 0.32)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('hidden', cx, cy - r - 2);
    }
  }

  function drawHud(state, lay, ui) {
    const { w, tile } = lay;
    ctx.fillStyle = 'rgba(8,10,20,0.9)';
    ctx.fillRect(0, 0, w, HUD_H);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `bold ${Math.max(12, Math.min(17, tile * 0.55))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHADOWLINE', 14, HUD_H / 2);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `${Math.max(11, Math.min(14, tile * 0.45))}px system-ui, sans-serif`;
    ctx.fillText(state.level.name, 14 + ctx.measureText('SHADOWLINE  ').width, HUD_H / 2);
    // The eye: the detection meter, centre-top.
    const eyeW = 150;
    const eyeX = (w - eyeW) / 2;
    const eyeY = HUD_H / 2;
    const d = state.detection;
    ctx.fillStyle = d >= 100 ? PALETTE.danger : d >= 35 ? PALETTE.gold : '#7dd8c0';
    ctx.beginPath();
    ctx.ellipse(eyeX + 16, eyeY, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0e1a';
    ctx.beginPath();
    ctx.arc(eyeX + 16, eyeY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(eyeX + 36, eyeY - 5, 110, 10);
    ctx.fillStyle = d >= 100 ? PALETTE.danger : d >= 35 ? PALETTE.gold : '#7dd8c0';
    ctx.fillRect(eyeX + 36, eyeY - 5, Math.round(110 * Math.min(100, d) / 100), 10);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `${Math.max(10, Math.min(13, tile * 0.4))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(state.alarm ? 'ALARM' : d >= 35 ? 'SEEN?' : 'UNSEEN', eyeX + 36, eyeY - 16);
    // Right side: loot, coins, time, score.
    const right = [
      `◆ ${state.artifactsTaken}/${state.artifacts.length}`,
      `● ${state.coins}`,
      `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`,
      `${state.score} pts`,
    ].join('   ');
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `bold ${Math.max(11, Math.min(15, tile * 0.48))}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(right, w - 14, HUD_H / 2);
    // Hint bar.
    ctx.fillStyle = 'rgba(8,10,20,0.9)';
    ctx.fillRect(0, lay.h - HINT_H, w, HINT_H);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `${Math.max(10, Math.min(13, tile * 0.4))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const hint = state.messageTimer > 0 ? state.message
      : 'WASD move · Shift sneak · X run · Click throw a coin · P pause · R restart · M mute';
    ctx.fillText(hint, w / 2, lay.h - HINT_H / 2);
    if (state.alarm) {
      ctx.fillStyle = 'rgba(255,93,93,0.12)';
      ctx.fillRect(0, 0, w, lay.h);
    }
    if (ui && ui.flash) {
      ctx.fillStyle = `rgba(255,93,93,${ui.flash})`;
      ctx.fillRect(0, 0, w, lay.h);
    }
  }

  function overlay(title, lines, accent) {
    const { w, h } = { w: canvas.width, h: canvas.height };
    ctx.fillStyle = 'rgba(8,10,20,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent || PALETTE.hud;
    ctx.font = `bold ${Math.max(28, Math.min(54, w * 0.045))}px system-ui, sans-serif`;
    ctx.fillText(title, w / 2, h * 0.3);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `${Math.max(13, Math.min(19, w * 0.016))}px system-ui, sans-serif`;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, h * 0.3 + 44 + i * 26);
    });
  }

  function drawTitle(state, ui) {
    drawFloor(state, layout(state));
    drawProps(state, layout(state));
    const { w, h } = { w: canvas.width, h: canvas.height };
    ctx.fillStyle = 'rgba(8,10,20,0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `bold ${Math.max(34, Math.min(64, w * 0.055))}px system-ui, sans-serif`;
    ctx.fillText('SHADOWLINE', w / 2, h * 0.3);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `${Math.max(14, Math.min(20, w * 0.018))}px system-ui, sans-serif`;
    ctx.fillText('a night job at the Meridian Museum', w / 2, h * 0.3 + 44);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `${Math.max(12, Math.min(17, w * 0.015))}px system-ui, sans-serif`;
    const lines = [
      'Lift every relic. Reach the exit unseen.',
      'Guards patrol with vision cones — stay out of the light,',
      'hide in the bushes, and throw a coin to pull them away.',
      '',
      'WASD move · Shift sneak · X run · Click throw a coin',
      '3 levels · best rank: GHOST',
    ];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.52 + i * 24));
    ctx.fillStyle = PALETTE.exit;
    ctx.font = `bold ${Math.max(14, Math.min(19, w * 0.017))}px system-ui, sans-serif`;
    ctx.fillText('press SPACE or click to begin', w / 2, h * 0.52 + lines.length * 24 + 18);
    if (ui && ui.best > 0) {
      ctx.fillStyle = PALETTE.hudDim;
      ctx.font = `${Math.max(12, Math.min(15, w * 0.014))}px system-ui, sans-serif`;
      ctx.fillText(`best score ${ui.best}`, w / 2, h - 24);
    }
  }

  return {
    resize,
    draw(state, screen, ui = {}) {
      resize();
      const lay = layout(state);
      if (screen === SCREEN_TITLE) {
        drawTitle(state, ui);
        return lay;
      }
      drawFloor(state, lay);
      drawProps(state, lay);
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_CAUGHT
        || screen === SCREEN_LEVEL_CLEAR || screen === SCREEN_WIN || screen === SCREEN_INTRO) {
        drawGuards(state, lay);
        drawPlayer(state, lay);
      }
      drawHud(state, lay, ui);
      if (screen === SCREEN_INTRO) {
        overlay(state.level.name, [state.level.brief, '', 'press SPACE or click to start the job'], PALETTE.gold);
      } else if (screen === SCREEN_PAUSED) {
        overlay('PAUSED', ['The museum waits.', '', 'press P to keep sneaking'], PALETTE.hud);
      } else if (screen === SCREEN_CAUGHT) {
        overlay('CAUGHT', [
          'A guard closed the last half-tile.',
          `Score ${state.score} · relics ${state.artifactsTaken}/${state.artifacts.length} · time ${Math.floor(state.time)}s`,
          '',
          'press R to run it back, or SPACE for the title screen',
        ], PALETTE.danger);
      } else if (screen === SCREEN_LEVEL_CLEAR) {
        const stats = state.clearStats || { timeBonus: 0, ghostBonus: 0, time: state.time };
        overlay('CLEAN GETAWAY', [
          `${state.level.name} cleared in ${Math.floor(stats.time)}s`,
          `time bonus +${stats.timeBonus} · ghost bonus +${stats.ghostBonus} · rank ${rankFor(state)}`,
          `Score ${state.score}`,
          '',
          'press SPACE for the next level',
        ], PALETTE.exit);
      } else if (screen === SCREEN_WIN) {
        overlay('THE MERIDIAN JOB — DONE', [
          `Every relic lifted. Final score ${state.score} · rank ${rankFor(state)}`,
          `Time ${Math.floor(state.runTime ?? state.time)}s across 3 levels · spotted ${state.timesSuspicious} times`,
          '',
          'press SPACE to play again',
        ], PALETTE.gold);
      }
      return lay;
    },
    // Canvas pixels -> tile, for turning a click into a coin throw.
    pixelToTile(px, py, state) {
      const lay = layout(state);
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.floor((px * scaleX - lay.ox) / lay.tile);
      const y = Math.floor((py * scaleY - lay.oy) / lay.tile);
      return { x, y };
    },
  };
}
