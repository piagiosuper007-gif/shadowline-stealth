// SHADOWLINE — tuning and shared constants.
// A top-down stealth game: sneak through a dark museum, lift the artifacts,
// reach the exit unseen. One file holds every number the design argues about,
// so balancing is editing here, not hunting through the world code.

export const STEP = 1 / 60;
export const BEST_KEY = 'shadowline.best';

// How the game is scored.
export const SCORE_ARTIFACT = 250;
export const SCORE_LEVEL_CLEAR = 400;
export const SCORE_GHOST_BONUS = 500;
export const SCORE_TIME_BONUS_PER_SECOND = 4;

// Movement, in tiles per second. Sneaking is slow and quiet; running is fast
// and loud; walking is the middle the player lives in.
export const SPEED_WALK = 3.4;
export const SPEED_SNEAK = 1.9;
export const SPEED_RUN = 5.2;

// Noise rings, in tiles: a guard inside the ring hears the player.
export const NOISE_WALK = 1.6;
export const NOISE_SNEAK = 0.6;
export const NOISE_RUN = 3.8;
export const NOISE_COIN = 4.5;

// Vision. A guard sees the player only inside the cone AND with a clear
// line of sight; the meter fills faster up close and in the light.
export const VISION_RANGE = 5.6;
export const VISION_HALF_ANGLE = 0.72; // radians, ~41 degrees each side
export const VISION_FILL_CLOSE = 70; // per second, under 2 tiles
export const VISION_FILL_MID = 38; // per second, 2 to 4 tiles
export const VISION_FILL_FAR = 18; // per second, beyond 4 tiles
export const VISION_DECAY = 26; // per second while unseen
export const MOD_SNEAK = 0.45;
export const MOD_BUSH = 0.2;
export const MOD_DARK = 0.6;
export const MOD_RUN = 1.45;
export const MOD_LIT = 1.25;
export const SUSPICIOUS_AT = 35; // meter: guard turns "?" and investigates
export const ALERT_AT = 100; // meter: full alarm, every guard converges

// Guard behaviour.
export const GUARD_PATROL_SPEED = 1.5;
export const GUARD_CHASE_SPEED = 3.1;
export const GUARD_SEARCH_SPEED = 1.9;
export const GUARD_PAUSE_AT_WAYPOINT = 1.1; // seconds looking around
export const GUARD_SEARCH_TIME = 4; // seconds hunting before giving up
export const CATCH_DISTANCE = 0.5; // tiles: a guard this close catches you
export const CLOSE_SPOT_DISTANCE = 1.3; // tiles: seen this close, meter races

// The coin: the player's only tool. A thrown coin pings where it lands and
// the nearest guards walk over to look. Three per level, no refills.
export const COINS_PER_LEVEL = 3;
export const COIN_THROW_RANGE = 6; // tiles from the player
export const COIN_FLIGHT_TIME = 0.45; // seconds in the air

// Screens the renderer knows.
export const SCREEN_TITLE = 'title';
export const SCREEN_INTRO = 'intro';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_LEVEL_CLEAR = 'clear';
export const SCREEN_WIN = 'win';

// Palette: a museum after closing — deep blue dark, warm lamp pools,
// teal guard cones, amber loot, red alarm.
export const PALETTE = {
  bg: '#0b0e1a',
  floor: '#1b2138',
  floorDark: '#141829',
  floorLit: '#2a2f4d',
  wall: '#3d4666',
  wallTop: '#5a648c',
  crate: '#6b5433',
  crateTop: '#8a6f45',
  bush: '#1e4d2e',
  bushTop: '#2c6b3f',
  artifact: '#f5b942',
  artifactGlow: '#ffd97a',
  exit: '#39d0a5',
  exitLocked: '#3a4a44',
  player: '#e8e6df',
  playerCloak: '#2b3a67',
  guard: '#d95f4b',
  cone: 'rgba(64, 224, 208, 0.16)',
  coneSuspicious: 'rgba(245, 185, 66, 0.22)',
  coneAlert: 'rgba(217, 95, 75, 0.28)',
  hud: '#e8e6df',
  hudDim: '#8b93b0',
  danger: '#ff5d5d',
  gold: '#f5b942',
};
