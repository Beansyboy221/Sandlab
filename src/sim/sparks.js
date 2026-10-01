import { M, materials } from "./materials.js";

export function emitSpark(world, i, x, y, residue = 0) {
  // Choose one free upper/side vent, without overwriting flames or other matter.
  const direction = Math.floor(world.random() * 3);
  const nx = x + (direction === 0 ? -1 : direction === 1 ? 1 : 0),
    ny = y - (direction === 2 ? 1 : 0);
  const j = world.index(nx, ny);
  if (j < 0) return false;
  if (world.cells[j]) return false;
  world.set(
    j,
    M.Spark,
    Math.max(700, world.temp[i]),
    6 + Math.floor(world.random() * 8),
  );
  world.residue[j] = residue;
  return true;
}

export function arcGap(world, i, x, y) {
  // A charged conductor arcs only across a one-cell gap to a receptive conductor.
  for (const [dx, dy] of directions) {
    const nx = x + dx * 2,
      ny = y + dy * 2;
    const gap = world.index(x + dx, y + dy),
      target = world.index(nx, ny);
    if (gap < 0 || target < 0) continue;
    if (
      !world.cells[gap] &&
      materials[world.cells[target]].conductive &&
      !world.cooldown[target]
    ) {
      world.set(gap, M.Spark, 1200, 20);
      return;
    }
  }
}
const directions = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
