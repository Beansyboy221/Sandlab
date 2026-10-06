import { isEntity, entityCategory } from "./entity-kinds.js";
import { materials, canonicalMaterial } from "./materials.js";

// The registry owns substance families; the palette is only a projection of them.
export const paletteBase = Uint8Array.from(materials, (m) =>
  m.paletteEntry ? m.id : m.baseMaterial,
);
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
    ...materials
      .filter(
        (state) =>
          state.baseMaterial === m.id && state.id !== m.id && !state.retired,
      )
      .map((state) => state.name),
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
