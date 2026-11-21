// Keyboard and mouse. The browser loop polls this once per fixed step;
// edge-triggered keys (pause, restart, mute) are consumed, so one press
// never fires twice.
import { TILE } from './config.js';

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const down = new Set();
  const pressed = [];
  const clicks = [];
  let mouse = { x: 640, y: 240 };

  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.push(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  });
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    clicks.push({
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    });
  });

  return {
    moveVector() {
      let x = 0;
      let y = 0;
      for (const code of down) {
        const v = MOVE_KEYS[code];
        if (v) {
          x += v[0];
          y += v[1];
        }
      }
      return { mx: x, my: y };
    },
    running() {
      return down.has('ShiftLeft') || down.has('ShiftRight');
    },
    // True once per physical press; consumed on read.
    consumePress(code) {
      const i = pressed.indexOf(code);
      if (i === -1) return false;
      pressed.splice(i, 1);
      return true;
    },
    consumeClick() {
      return clicks.shift() || null;
    },
    // Mouse position in tile coordinates, for coin throws.
    mouseTile() {
      return { x: mouse.x / TILE, y: mouse.y / TILE };
    },
    endFrame() {
      pressed.length = 0;
    },
  };
}
