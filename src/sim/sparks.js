import { CELL_METERS } from "./world-units.js";
import { conducts } from "./oxidation.js";
import { materials, solverProducts } from "./materials.js";

export function emitSpark(world, i, x, y, residue = 0) {
  // Choose one free upper/side vent, without overwriting flames or other matter.
  const direction = Math.floor(world.random() * 3);
  const j = world.relativeIndex(
    x,
    y,
    direction === 0 ? -1 : direction === 1 ? 1 : 0,
    direction === 2 ? -1 : 0,
  );
  if (j < 0) return false;
  if (world.cells[j]) return false;
  world.transform(
    j,
    solverProducts.spark,
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
      conducts(world, target) &&
      !world.cooldown[target]
    ) {
      const energy = world.electricalEnergy[i] * 0.25;
      if (energy < 0.015) return;
      world.transform(gap, solverProducts.spark, 1200, 20);
      // Partition the arc's finite budget into thermal and transported energy.
      world.quantity[gap] =
        (energy * 0.5) /
        ((1200 - 20) *
          (world.metersPerPixel / CELL_METERS) ** 2 *
          materials[solverProducts.spark].specificHeat);
      world.electricalEnergy[gap] = energy * 0.5;
      world.electricalEnergy[i] -= energy;
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
