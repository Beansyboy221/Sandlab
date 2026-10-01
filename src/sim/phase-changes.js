import { M, materials } from "./materials.js";
export function changePhase(w, i, x, y, m) {
  const temperature = w.temp[i];
  if (m.dry !== undefined && temperature > m.dry) {
    // The dissolved/wet particle separates into vapor and dry material only when
    // vapor has space to escape; sealed vessels retain their contents.
    let vent = -1;
    if (y > 0 && !w.cells[i - w.width]) vent = i - w.width;
    else if (x > 0 && !w.cells[i - 1]) vent = i - 1;
    else if (x < w.width - 1 && !w.cells[i + 1]) vent = i + 1;
    else if (y < w.height - 1 && !w.cells[i + w.width]) vent = i + w.width;
    if (vent >= 0) {
      w.set(i, m.dryTo, temperature);
      w.set(vent, M.Steam, Math.max(120, temperature));
      w.fields.add(x, y, 1.5);
      return true;
    }
  }
  let target;
  if (m.bake !== undefined && temperature > m.bake) target = m.bakeTo;
  else if (m.melt !== undefined && temperature > m.melt) target = m.meltTo;
  else if (m.boil !== undefined && temperature > m.boil) {
    target = m.boilTo;
    w.fields.add(x, y, 1.5);
  } else if (m.freeze !== undefined && temperature < m.freeze)
    target = m.freezeTo;
  else if (m.condense !== undefined && temperature < m.condense)
    target = m.condenseTo;
  if (target === undefined) return false;
  const nutrition = w.nutrition[i],
    frozenLiquid = w.residue[i];
  // Ice retains dissolved material through freezing, using its otherwise unused residue slot.
  if (
    m.id === M.Ice &&
    target === M.Water &&
    materials[frozenLiquid]?.waterLike
  )
    target = frozenLiquid;
  if (target === M.Water && nutrition) target = M["Nutrient water"];
  w.set(i, target, temperature);
  w.nutrition[i] = nutrition;
  if (target === M.Ice && m.waterLike && m.id !== M.Water) w.residue[i] = m.id;
  return true;
}
