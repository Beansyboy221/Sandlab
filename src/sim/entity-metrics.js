import { materials } from "./materials.js";
import { actorProfile } from "./creature-profiles.js";
import {
  projectileAppearance,
  machineAppearances,
} from "./entity-definitions.js";
import { CELL_METERS } from "./world-units.js";

function recipeExtent(recipe) {
  let lowX = Infinity,
    highX = -Infinity,
    lowY = Infinity,
    highY = -Infinity;
  for (const part of recipe) {
    const points =
      part.points ??
      (part.bounds
        ? [
            [part.bounds[0], part.bounds[1]],
            [part.bounds[0] + part.bounds[2], part.bounds[1] + part.bounds[3]],
          ]
        : []);
    for (const [x, y] of points) {
      lowX = Math.min(lowX, x);
      highX = Math.max(highX, x);
      lowY = Math.min(lowY, y);
      highY = Math.max(highY, y);
    }
  }
  return Math.max(highX - lowX, highY - lowY) * CELL_METERS;
}
// Geometry is compiled once. Exhaust is not part of a missile's physical size.
const sizes = Float64Array.from(materials, (m) => {
  if (m.actor) {
    const p = actorProfile(m.id);
    return (
      Math.max(
        Math.max(...p.x) - Math.min(...p.x),
        Math.max(...p.y) - Math.min(...p.y),
      ) *
        CELL_METERS +
      2 * p.headRadius * CELL_METERS
    );
  }
  if (m.projectile)
    return recipeExtent(
      machineAppearances[m.vehicle] ?? projectileAppearance.slice(0, 2),
    );
  return 0;
});
export const entitySizeMeters = (material) => sizes[material] || 0;
export const entityCanSpawn = (world, material) =>
  !sizes[material] || sizes[material] + 1e-9 >= world.metersPerPixel;
