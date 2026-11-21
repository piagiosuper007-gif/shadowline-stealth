// SHADOWLINE — keyboard and mouse.
// WASD or arrows to move, hold Shift to sneak, hold X to run loud. Click a
// tile to throw a coin there. Space or Enter confirms on menus, P pauses,
// R restarts the level, M mutes.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let throwAt = null; // a click, in canvas pixels, waiting to be read

  function keyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    keys.add(event.key.toLowerCase());
    if (event.key === ' ' || event.key === 'Enter') actions |= ACTION_CONFIRM;
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key === 'r' || event.key === 'R') actions |= ACTION_RESTART;
    if (event.key === 'm' || event.key === 'M') actions |= ACTION_MUTE;
  }
  function keyUp(event) {
    keys.delete(event.key.toLowerCase());
  }
  function pointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    throwAt = { px: event.clientX - rect.left, py: event.clientY - rect.top };
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointerdown', pointerDown);

  return {
    // Movement vector for this frame, in screen space (y down).
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      return { x, y };
    },
    sneak() {
      return keys.has('shift');
    },
    run() {
      return keys.has('x');
    },
    // One-shot actions since the last call; cleared on read.
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    // A click waiting to become a coin throw, in canvas pixels.
    takeThrow() {
      const out = throwAt;
      throwAt = null;
      return out;
    },
  };
}
