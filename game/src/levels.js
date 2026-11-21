// SHADOWLINE — the three levels, drawn as maps.
// Legend: '#' wall (blocks sight and movement) '.' lit floor ',' dark floor
// (shadows: harder to be seen) 'B' bush (hide in it) 'C' crate (solid cover,
// blocks sight) 'A' artifact 'D' exit 'P' player start 'G' guard post.
// Every map is checked at boot: same-width rows, one P, one D, and every
// artifact, guard post and patrol waypoint reachable from P on foot.

export const LEVELS = [
  {
    name: '1 · The Atrium',
    brief: 'Three relics, two guards, one way out. Stay in the dark.',
    parSeconds: 150,
    map: [
      '##########################',
      '#P.....,,......#....A....#',
      '#......,,,,....#.........#',
      '#.CC.......B...#..C......#',
      '#..........##..#....B....#',
      '#....A.....##..#.........#',
      '#..B....C......G....A....#',
      '#.....###......#....##...#',
      '#...........B..#.....#...#',
      '#..C....B...D..#.G...#...#',
      '#.....,,,........#.......#',
      '#.....,,,,....C..#.......#',
      '##########################',
    ],
    guards: [
      { x: 16, y: 6, waypoints: [[16, 6], [16, 2], [21, 2], [21, 6]], speed: 1.5 },
      { x: 19, y: 9, waypoints: [[19, 9], [19, 11], [12, 11], [12, 9]], speed: 1.5 },
    ],
  },
  {
    name: '2 · The Gallery',
    brief: 'Long sightlines down the gallery. The bushes are your friends.',
    parSeconds: 200,
    map: [
      '############################',
      '#P......,,,......#....A....#',
      '#..C....,,,,.....#.........#',
      '#.......,,,..B..#....C.....#',
      '#..B.....##......#....B....#',
      '#....A...##..C...#.........#',
      '#........##......G....A....#',
      '#.C....B.........####......#',
      '#...........C...#....C.....#',
      '#..A.....,,,....#....B.....#',
      '#......,,,,,....#.G........#',
      '#..B....,,,......#....A....#',
      '#...........C...D.....C....#',
      '############################',
    ],
    guards: [
      { x: 19, y: 6, waypoints: [[19, 6], [24, 6], [24, 2], [19, 2]], speed: 1.6 },
      { x: 21, y: 10, waypoints: [[21, 10], [21, 12], [14, 12], [14, 10]], speed: 1.6 },
      { x: 8, y: 7, waypoints: [[8, 7], [4, 7], [4, 11], [8, 11]], speed: 1.5 },
    ],
  },
  {
    name: '3 · The Vault',
    brief: 'Four guards, six relics, no room for mistakes. Ghost it.',
    parSeconds: 260,
    map: [
      '##############################',
      '#P.....,,,.......#......A....#',
      '#......,,,,..C...#...........#',
      '#.C........B.....#.B....C....#',
      '#.....##.........#.....##....#',
      '#..A..##....C....G......A....#',
      '#......##........#.....##....#',
      '#..B.....C....B..#..C........#',
      '#..........,,,,..####....B...#',
      '#.C....A...,,,,..#....A......#',
      '#......,.........G.....C.....#',
      '#..B....,,,,.....#....B......#',
      '#....C......B....#.G.........#',
      '#..........,,,..D.....A......#',
      '##############################',
    ],
    guards: [
      { x: 20, y: 5, waypoints: [[20, 5], [25, 5], [25, 9], [20, 9]], speed: 1.7 },
      { x: 19, y: 10, waypoints: [[19, 10], [19, 13], [12, 13], [12, 10]], speed: 1.7 },
      { x: 8, y: 7, waypoints: [[8, 7], [4, 7], [4, 11], [8, 11]], speed: 1.6 },
      { x: 22, y: 12, waypoints: [[22, 12], [26, 12], [26, 5], [22, 5]], speed: 1.6 },
    ],
  },
];

// Parse one map into tiles plus the points the world needs. Throws on a
// broken map, so a bad level fails loudly at boot instead of silently in
// front of a player.
export function parseLevel(def) {
  const rows = def.map.length;
  const cols = def.map[0].length;
  for (const row of def.map) {
    if (row.length !== cols) throw new Error(`level ${def.name}: ragged row`);
  }
  const tiles = [];
  let player = null;
  let exit = null;
  const artifacts = [];
  const guardPosts = [];
  for (let y = 0; y < rows; y += 1) {
    tiles.push([]);
    for (let x = 0; x < cols; x += 1) {
      const ch = def.map[y][x];
      if (ch === '#') tiles[y].push('#');
      else if (ch === ',') tiles[y].push(',');
      else if (ch === 'B') tiles[y].push('B');
      else if (ch === 'C') tiles[y].push('C');
      else if (ch === 'A') { tiles[y].push('.'); artifacts.push({ x, y, taken: false }); }
      else if (ch === 'D') { tiles[y].push('.'); exit = { x, y }; }
      else if (ch === 'P') { tiles[y].push('.'); player = { x, y }; }
      else if (ch === 'G') { tiles[y].push('.'); guardPosts.push({ x, y }); }
      else tiles[y].push('.');
    }
  }
  if (!player) throw new Error(`level ${def.name}: no player start`);
  if (!exit) throw new Error(`level ${def.name}: no exit`);
  if (artifacts.length === 0) throw new Error(`level ${def.name}: no artifacts`);
  // Reachability: every artifact, the exit and every guard post must be
  // walkable-to from the player start (crates and walls block).
  const blocked = (x, y) => x < 0 || y < 0 || x >= cols || y >= rows || tiles[y][x] === '#' || tiles[y][x] === 'C';
  const seen = new Set([`${player.x},${player.y}`]);
  const queue = [[player.x, player.y]];
  while (queue.length) {
    const [cx, cy] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (!blocked(nx, ny) && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); }
    }
  }
  const mustReach = [...artifacts.map((a) => [a.x, a.y]), [exit.x, exit.y], ...guardPosts.map((g) => [g.x, g.y])];
  for (const [x, y] of mustReach) {
    if (!seen.has(`${x},${y}`)) throw new Error(`level ${def.name}: unreachable tile ${x},${y}`);
  }
  for (const guard of def.guards) {
    for (const [x, y] of guard.waypoints) {
      if (blocked(x, y)) throw new Error(`level ${def.name}: guard waypoint on blocked tile ${x},${y}`);
      if (!seen.has(`${x},${y}`)) throw new Error(`level ${def.name}: guard waypoint unreachable ${x},${y}`);
    }
  }
  return { ...def, rows, cols, tiles, player, exit, artifacts, guardPosts };
}
