// SHADOWLINE — sound, synthesized live, no audio files.
// A tiny WebAudio synth: footsteps tick, pickups chime, the alarm stings,
// and a low room tone hums under everything. Created on the first user
// gesture (browsers demand that) and silent until then.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let humNodes = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, duration, type, volume, when = 0, slideTo = null) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      this.startHum();
    },
    startHum() {
      if (!ctx || humNodes || muted) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 55;
        gain.gain.value = 0.035;
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.07;
        lfoGain.gain.value = 0.015;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        lfo.start();
        humNodes = { osc, lfo };
      } catch {
        // Sound is garnish; a failure here never stops the game.
      }
    },
    footstep(sneaking) {
      tone(sneaking ? 140 : 90, 0.07, 'triangle', sneaking ? 0.05 : 0.11);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.16);
      tone(990, 0.18, 'sine', 0.14, 0.07);
    },
    coin() {
      tone(1250, 0.09, 'square', 0.07);
      tone(1250, 0.09, 'square', 0.06, 0.12);
    },
    suspicious() {
      tone(440, 0.16, 'sine', 0.13, 0, 520);
    },
    alarm() {
      tone(220, 0.5, 'sawtooth', 0.16, 0, 440);
      tone(330, 0.5, 'sawtooth', 0.12, 0.1, 660);
    },
    caught() {
      tone(180, 0.7, 'sawtooth', 0.18, 0, 60);
    },
    clear() {
      tone(523, 0.14, 'sine', 0.15);
      tone(659, 0.14, 'sine', 0.15, 0.1);
      tone(784, 0.3, 'sine', 0.16, 0.2);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
  };
}
