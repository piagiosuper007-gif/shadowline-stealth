// The three museum floors. Each map is 15 rows of 40 tiles:
//   '#' wall            '.' floor
//   ',' dark floor      'B' bush (deep cover)
//   'P' player start    'R' relic
//   'E' exit (opens once every relic is lifted)
// Guard patrols are waypoint lists in tile coordinates; every straight leg
// between two waypoints must be free of walls, so a guard never has to
// path around a corner mid-patrol.
export const LEVELS = [
  {
    name: 'Atrium',
    sub: 'Level 1 — 3 relics, 2 guards',
    coins: 3,
    par: 150,
    patrols: [
      [[10, 3], [28, 3]],
      [[6, 6], [34, 6]],
    ],
    map: [
      '########################################',
      '#.....................................E#',
      '#..R...........,,,,,.........B.........#',
      '#............,,,,,,,..................#',
      '#....####......,,,,,......####.........#',
      '#....####................####......R..#',
      '#......................................#',
      '#..B...........,,,,,,,,,........B......#',
      '#..............,,,,,,,,,...............#',
      '#....####..............................#',
      '#....####....R..............####.......#',
      '#......................................#',
      '#..,,,,,...............B...............#',
      '#.P....,,,,,...........................#',
      '########################################',
    ],
  },
  {
    name: 'Gallery',
    sub: 'Level 2 — 5 relics, 3 guards',
    coins: 3,
    par: 210,
    patrols: [
      [[8, 4], [30, 4]],
      [[6, 8], [32, 8]],
      [[20, 2], [20, 12]],
    ],
    map: [
      '########################################',
      '#.....................................E#',
      '#.R.....#####..........#####.........R.#',
      '#.......#####...........#####..........#',
      '#..,,,,,.......B..............,,,,,...#',
      '#..,,,,,........................,,,,,.#',
      '#.......####..........####.............#',
      '#.......####..........####....R........#',
      '#......................................#',
      '#..B...........,,,,,,,.......####......#',
      '#..............,,,,,,,.......####...R..#',
      '#.......####..........................#',
      '#.......####....R..........B...........#',
      '#.P....................................#',
      '########################################',
    ],
  },
  {
    name: 'Vault',
    sub: 'Level 3 — 6 relics, 4 guards',
    coins: 3,
    par: 270,
    patrols: [
      [[8, 5], [30, 5]],
      [[6, 8], [32, 8]],
      [[24, 4], [24, 11]],
      [[8, 12], [30, 12]],
    ],
    map: [
      '########################################',
      '#..R...........#####..........R.......E#',
      '#.............#####...................#',
      '#..####...B...........,,,,,....####...#',
      '#..####.............R,,,,,....####...#',
      '#......................................#',
      '#.....,,,,,......####......B...........#',
      '#.....,,,,,......####................R.#',
      '#......................................#',
      '#..B.......####...........,,,,,....###.#',
      '#.........####...........,,,,,....###.#',
      '#......R..............................#',
      '#.............B..............R........#',
      '#.P....................................#',
      '########################################',
    ],
  },
];

// Parse one level definition into a grid. Rows shorter than the widest row
// are padded with wall on the right; the parser throws if the player,
// a relic or the exit cannot be reached on foot, so a bad map fails loudly
// at boot instead of shipping an unwinnable floor.
export function parseLevel(def) {
  const rows = def.map.length;
  const cols = Math.max(...def.map.map((row) => row.length));
  const grid = [];
  let playerStart = null;
  const relics = [];
  let exit = null;
  for (let y = 0; y < rows; y++) {
    const row = def.map[y].padEnd(cols, '#');
    const cells = [];
    for (let x = 0; x < cols; x++) {
      const ch = row[x];
      if (ch === 'P') {
        playerStart = { x: x + 0.5, y: y + 0.5 };
        cells.push('.');
      } else if (ch === 'R') {
        relics.push({ x: x + 0.5, y: y + 0.5, taken: false });
        cells.push('.');
      } else if (ch === 'E') {
        exit = { x: x + 0.5, y: y + 0.5 };
        cells.push('.');
      } else {
        cells.push(ch);
      }
    }
    grid.push(cells);
  }
  if (!playerStart) throw new Error('level ' + def.name + ' has no player start');
  if (!exit) throw new Error('level ' + def.name + ' has no exit');
  if (relics.length === 0) throw new Error('level ' + def.name + ' has no relics');
  // Breadth-first reachability from the player start over walkable tiles.
  const seen = new Set();
  const queue = [[Math.floor(playerStart.x), Math.floor(playerStart.y)]];
  seen.add(queue[0][0] + ',' + queue[0][1]);
  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (seen.has(key) || grid[ny][nx] === '#') continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  for (const relic of relics) {
    const key = Math.floor(relic.x) + ',' + Math.floor(relic.y);
    if (!seen.has(key)) throw new Error('level ' + def.name + ' relic at ' + key + ' unreachable');
  }
  const exitKey = Math.floor(exit.x) + ',' + Math.floor(exit.y);
  if (!seen.has(exitKey)) throw new Error('level ' + def.name + ' exit unreachable');
  // Every patrol leg must be a straight wall-free line.
  for (const patrol of def.patrols) {
    for (let i = 0; i < patrol.length; i++) {
      const [x0, y0] = patrol[i];
      const [x1, y1] = patrol[(i + 1) % patrol.length];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= steps; s++) {
        const tx = Math.round(x0 + ((x1 - x0) * s) / steps);
        const ty = Math.round(y0 + ((y1 - y0) * s) / steps);
        if (grid[ty][tx] === '#') {
          throw new Error('level ' + def.name + ' patrol leg crosses a wall at ' + tx + ',' + ty);
        }
      }
    }
  }
  return {
    name: def.name,
    sub: def.sub,
    cols,
    rows,
    grid,
    playerStart,
    relics,
    exit,
    patrols: def.patrols,
    coins: def.coins,
    par: def.par,
  };
}
