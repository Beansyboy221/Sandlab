import { CELL_METERS } from "./world-units.js";
import { conducts } from "./oxidation.js";
export const PULSE_ENERGY = 6;
export const MAX_ELECTRICAL_ENERGY = 1e6;
export const pulseAmount = (world, i) =>
  Math.min(
    MAX_ELECTRICAL_ENERGY,
    PULSE_ENERGY *
      (world.metersPerPixel / CELL_METERS) ** 2 *
      world.quantity[i],
  );

// External sources supply energy. Passive conductors may only transport it.
export function energize(world, i, energy = pulseAmount(world, i)) {
  if (i < 0 || !conducts(world, i) || world.cooldown[i] || !(energy > 0))
    return false;
  world.charge[i] = 6;
  world.cooldown[i] = 18;
  world.chargedAt[i] = world.tick;
  world.electricalEnergy[i] = Math.min(MAX_ELECTRICAL_ENERGY, energy);
  world.wake(i);
  return true;
}

export const receptive = (world, i) =>
  conducts(world, i) &&
  (!world.cooldown[i] ||
    (world.charge[i] === 6 && world.chargedAt[i] === world.tick));
// Fronts arriving in the same tick coalesce instead of losing their energy at
// another branch's cooldown. Never re-trigger a wave that has already advanced.
export function deliverCharge(world, i, energy) {
  if (world.charge[i] === 6 && world.chargedAt[i] === world.tick) {
    world.electricalEnergy[i] += energy;
    return;
  }
  energize(world, i, energy);
}
