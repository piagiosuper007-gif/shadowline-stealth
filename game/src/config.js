// SHADOWLINE tuning: every number the game balances on lives here, so a
// single file decides how fast, how sharp-eyed and how generous it is.
export const TILE = 32;
export const VIEW_W = 1280;
export const VIEW_H = 480;
export const COLS = 40;
export const ROWS = 15;

// Movement, in tiles per second.
export const PLAYER_SNEAK = 3.1;
export const PLAYER_RUN = 5.4;
export const GUARD_PATROL = 1.9;
export const GUARD_SUSPICIOUS = 2.5;
export const GUARD_CHASE = 3.3;

// Vision: how far a guard sees, and how wide the cone is (half-angle).
export const VISION_RANGE = 6.5;
export const VISION_HALF_ANGLE = 0.62;

// Detection meter 0..100. While a guard has eyes on the player it climbs
// at DETECT_RATE per second, scaled by cover; unobserved it falls.
export const DETECT_RATE = 55;
export const DETECT_DECAY = 14;
export const COVER_BUSH = 0.12;
export const COVER_DARK = 0.45;
export const SUSPICIOUS_AT = 30;
export const ALERT_AT = 70;

// Hearing: running is heard within this radius (tiles); a coin's clink
// pulls guards from a little further.
export const NOISE_RUN_RADIUS = 6;
export const NOISE_COIN_RADIUS = 8;

// Scoring.
export const RELIC_SCORE = 250;
export const LEVEL_CLEAR_SCORE = 500;
export const GHOST_BONUS = 1000;
export const SHADOW_BONUS = 400;
export const COINS_PER_LEVEL = 3;

// A guard that cannot close on its target for this long gives up and goes
// back to searching, then to patrol — so nobody camps a wall forever.
export const STUCK_GIVE_UP = 1.6;
export const SEARCH_TIME = 4.0;

// Rank cutoffs on the highest detection reached across the whole job.
export const GHOST_MAX_DETECTION = 25;
export const SHADOW_MAX_DETECTION = 70;
