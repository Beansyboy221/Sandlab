import { materials } from "./materials.js";
// Brittle matter spends more impact work on cracks; ductile matter mainly
// dissipates it without severing bonds. Coefficients use gameplay energy units.
export function fractureFraction(material) {
  return (
    Math.max(0.01, material.brittleness ** 2) * (0.5 + material.brittleness)
  );
}
export function cuttingFraction(material) {
  return 0.5 + material.brittleness;
}
export function fractureWork(world, i, cutting = false) {
  const material = materials[world.cells[i]];
  return (
    Math.max(0, material.toughness - world.damage[i]) /
    (cutting ? cuttingFraction(material) : fractureFraction(material))
  );
}
