import { hasOxidizer } from "./combustion.js";

export function reactExplosive(world, i, x, y, material) {
  const shock =
    material.pressureTrigger &&
    world.fields.pressure[world.fields.index(x, y)] > material.pressureTrigger;
  // Deflagrating powders burn first. A pressure spike can trigger their small blast.
  if (material.deflagrates && !shock) return false;
  if (!shock && world.temp[i] <= material.ignite) {
    world.life[i] = 0;
    return false;
  }
  if (material.requiresOxygen && !hasOxidizer(world, i, x, y)) return false;
  if (!shock && material.ignitionDelay) {
    if (!world.life[i]) world.life[i] = material.ignitionDelay;
    if (--world.life[i] > 0) return true;
  }
  world.explode(x, y, material.explosive);
  return true;
}
