// SHADOWLINE — make.fun entrypoint (Node 22, standard library only).
// The game itself is plain static files under game/; this program hands it
// in. It copies game/ and screenshots/ from beside this file into the output
// directory and writes dossier.json with buildDossier from the kit's
// vendored library (vendor/makefun-game.ts). Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
const shots = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'));
if (shots.length < 3) throw new Error('expected 3-4 screenshots, found ' + shots.length);

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(
  'SHADOWLINE dossier written to ' + out +
  ' (' + statSync(join(out, 'dossier.json')).size + ' bytes, ' +
  shots.length + ' screenshots)',
);
