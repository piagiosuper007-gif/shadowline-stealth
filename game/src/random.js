// Seeded random: mulberry32. Every deterministic part of the game — the
// autopilot's tie-breaks, the staged screenshots — draws from one of these,
// never from Math.random, so two runs with the same seed play identically.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    // Uniform float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Uniform integer in [min, max).
    int(min, max) {
      return min + Math.floor(next() * (max - min));
    },
    // One element of an array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}
