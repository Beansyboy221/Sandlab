import { CELL_METERS } from "./world-units.js";
import { dissolvedMass } from "./mixtures.js";
import { materialTables } from "./materials.js";

// One dry solid/elastic cell has mass equal to its relative density. Each
// reservoir unit is one whole liquid pixel, not a fraction of the host volume.
// Reservoir capacity is a gameplay storage abstraction, not literal void space.
export function containedFluidMass(world, i) {
  const amount = world.storedAmount[i];
  return (
    ((amount
      ? amount * Math.max(0, materialTables.density[world.storedLiquid[i]])
      : 0) +
      dissolvedMass(world, i)) *
    (world.quantity?.[i] ?? 1) *
    ((world.metersPerPixel ?? CELL_METERS) / CELL_METERS) ** 2
  );
}
export function cellMass(world, i) {
  return dryCellMass(world, i) + containedFluidMass(world, i);
}

export function dryCellMass(world, i) {
  return (
    materialTables.density[world.cells[i]] *
    (world.quantity?.[i] ?? 1) *
    ((world.metersPerPixel ?? CELL_METERS) / CELL_METERS) ** 2
  );
}
