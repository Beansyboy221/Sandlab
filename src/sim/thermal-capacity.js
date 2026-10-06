import { CELL_METERS } from "./world-units.js";
import { materials } from "./materials.js";
import { cellMass } from "./mechanical-mass.js";

// Normalized heat capacity: temperature is intensive; transferred energy is not.
// Energy packets have no positive matter density, so use their represented amount.
export function thermalCapacity(world, i) {
  const mass = cellMass(world, i);
  return Math.max(
    1e-8,
    (mass > 0
      ? mass
      : world.quantity[i] * (world.metersPerPixel / CELL_METERS) ** 2) *
      materials[world.cells[i]].specificHeat,
  );
}
export function addThermalEnergy(world, i, energy) {
  if (world.mechanics.temperatureSimulation !== false)
    world.temp[i] += energy / thermalCapacity(world, i);
}
