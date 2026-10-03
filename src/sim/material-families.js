import { isEntity, entityCategory } from "./entity-kinds.js";
import { M, materials, canonicalMaterial } from "./materials.js";

// Alternate phases remain stable simulation/save IDs, but share one palette entry.
const families = {
  Water: ["Ice", "Steam", "Snow", "Cloud"],
  Glass: ["Molten Glass"],
  Wood: ["Wood Chips"],
  Rubber: ["Rubber Crumbs"],
  Jelly: ["Jelly Drops"],
  Rope: ["Rope Fibers"],
  Brick: ["Brick Rubble"],
  Stone: ["Lava", "Stone Gravel"],
  Steel: ["Molten Steel"],
  Salt: ["Molten Salt"],
  Copper: ["Molten Copper", "Copper Granules"],
  Sodium: ["Liquid Sodium"],
  Wax: ["Liquid Wax", "Wax Shavings"],
  Nitrogen: ["Liquid Nitrogen"],
};
export const paletteBase = new Uint8Array(materials.length);
for (const m of materials) paletteBase[m.id] = canonicalMaterial(m.id);
for (const [name, phases] of Object.entries(families))
  for (const phase of phases) paletteBase[M[phase]] = M[name];
export const paletteEntries = materials.filter(
  (m) => m.id && !m.deprecated && paletteBase[m.id] === m.id,
);
export const paletteMaterials = paletteEntries.filter((m) => !isEntity(m));
export const paletteEntities = paletteEntries.filter(isEntity);
export function materialSearchText(m) {
  return [
    m.name,
    m.category,
    m.paletteCategory,
    isEntity(m) ? entityCategory(m) : "",
    ...(families[m.name] || []),
  ]
    .join(" ")
    .toLowerCase();
}
// Drawing at a chosen temperature uses the same phase thresholds as the world.
// A bounded walk allows Water -> Steam or Nitrogen -> Liquid nitrogen, without
// ever running contact chemistry or spawning additional particles in the brush.
export function drawingPhase(id, temperature) {
  for (let n = 0; n < 4; n++) {
    const m = materials[id];
    let next = id;
    if (m.melt !== undefined && temperature > m.melt) next = m.meltTo;
    else if (m.boil !== undefined && temperature > m.boil) next = m.boilTo;
    else if (m.freeze !== undefined && temperature < m.freeze)
      next = m.freezeTo;
    else if (m.condense !== undefined && temperature < m.condense)
      next = m.condenseTo;
    if (next === undefined || next === id) break;
    id = next;
  }
  return id;
}
