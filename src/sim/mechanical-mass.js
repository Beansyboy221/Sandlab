import { materialTables } from "./materials.js";

// One dry solid/elastic cell has mass equal to its relative density. Each
// reservoir unit is one whole liquid pixel, not a fraction of the host volume.
// Reservoir capacity is a gameplay storage abstraction, not literal void space.
export function containedFluidMass(world, i) {
  const amount = world.storedAmount[i];
  return amount
    ? amount * Math.max(0, materialTables.density[world.storedLiquid[i]])
    : 0;
}
export function cellMass(world, i) {
  return materialTables.density[world.cells[i]] + containedFluidMass(world, i);
}
