// Sound, synthesized live with WebAudio — no audio files, no network.
// Everything is guarded: with no AudioContext (or before the first user
// gesture) every call is a silent no-op.
let ctx = null;
let muted = false;
let ambient = null;

export function ensureAudio() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m) {
  muted = m;
  if (ambient) ambient.gain.value = m ? 0 : 0.03;
}

export function isMuted() {
  return muted;
}

function tone(freq, dur, type, gain, slideTo) {
  if (!ctx || muted) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain || 0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch {
    // Audio is decoration; never let it break the game.
  }
}

function noiseBurst(dur, gain) {
  if (!ctx || muted) return;
  try {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain || 0.05;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  } catch {
    // Silent.
  }
}

export const sfx = {
  step() {
    noiseBurst(0.05, 0.02);
  },
  pickup() {
    tone(880, 0.12, 'sine', 0.09);
    setTimeout(() => tone(1318, 0.18, 'sine', 0.09), 70);
  },
  coin() {
    tone(2400, 0.07, 'square', 0.04, 1800);
    setTimeout(() => tone(1800, 0.1, 'square', 0.04), 90);
  },
  alarm() {
    tone(520, 0.22, 'sawtooth', 0.06, 780);
    setTimeout(() => tone(780, 0.22, 'sawtooth', 0.06, 520), 240);
  },
  caught() {
    tone(220, 0.5, 'sawtooth', 0.09, 55);
  },
  clear() {
    tone(523, 0.14, 'sine', 0.09);
    setTimeout(() => tone(659, 0.14, 'sine', 0.09), 120);
    setTimeout(() => tone(784, 0.25, 'sine', 0.09), 240);
  },
  click() {
    tone(660, 0.05, 'sine', 0.05);
  },
};

export function startAmbient() {
  if (!ctx || ambient) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    g.gain.value = muted ? 0 : 0.03;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    lfo.start();
    ambient = { osc, lfo, gain: g };
  } catch {
    ambient = null;
  }
}
