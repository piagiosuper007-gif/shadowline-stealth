# SHADOWLINE

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/piagiosuper007-gif/shadowline-stealth/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/piagiosuper007-gif/shadowline-stealth/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

A night job at the Meridian Museum: a complete top-down stealth game that
runs in a desktop browser from static files, no network request. Sneak
through three levels, lift every relic, and reach the exit unseen.

Guards patrol with real vision cones — line of sight cut short by walls and
crates, a detection meter that fills faster up close and in the light, and
three states of mind: patrolling, suspicious (`?`, they come and look), and
full alarm (`!`, they all converge). Hide in the bushes, stick to the dark
floor, sneak when a guard is near, and throw a coin to pull a patrol away
from the door you need.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` through any static server. Node 22 or later for
`main.ts` (the make.fun entrypoint, which copies `game/` and `screenshots/`
to `/output` and writes `dossier.json`).

## Controls

- **WASD / arrows** — move
- **Shift** — sneak (slow, quiet, harder to spot)
- **X** — run (fast, loud)
- **Click a tile** — throw a coin there (3 per level, distracts guards)
- **P** — pause · **R** — restart the level · **M** — mute

## The job

1. **The Atrium** — 3 relics, 2 guards. Learn the cones.
2. **The Gallery** — 5 relics, 3 guards. Long sightlines, more bushes.
3. **The Vault** — 6 relics, 4 guards. No room for mistakes.

Lift every relic and the exit opens. Finish a level without ever raising
the alarm for the **GHOST** rank (+500). Sounds are synthesized live with
WebAudio — no audio files, nothing fetched.

## Screenshots

`?shot=start|play|alert|end&seed=1` stages a deterministic scene from the
real game (title, mid-sneak, alarm, the finished job) for screenshots; see
`shots.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=f68xw5ge&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
