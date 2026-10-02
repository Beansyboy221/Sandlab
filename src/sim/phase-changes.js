import { M, materials } from "./materials.js";
export function changePhase(w, i, x, y, m) {
  const temperature = w.temp[i];
  const dissolved = m.id === M.Water && w.nutrition[i] && temperature > m.boil;
  if (dissolved || (m.dry !== undefined && temperature > m.dry)) {
    // The dissolved/wet particle separates into vapor and dry material only when
    // vapor has space to escape; sealed vessels retain their contents.
    let vent = -1,
      open = false;
    for (const [dx, dy] of vents) {
      const j = w.relativeIndex(x, y, dx, dy);
      if (j >= 0 ? !w.cells[j] : w.border === "void") {
        vent = j;
        open = true;
        break;
      }
    }
    if (open) {
      const nutrition = w.nutrition[i];
      w.transform(i, dissolved ? M.Fertilizer : m.dryTo, temperature);
      if (dissolved) w.nutrition[i] = nutrition;
      if (vent >= 0) w.transform(vent, M.Steam, Math.max(120, temperature));
      w.fields.add(x, y, 1.5);
      w.sound.emit("boil", x, y, 0.18);
      return true;
    }
    if (dissolved) return false;
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
  if (m.category === "gas" && materials[target].category !== "gas")
    w.fields.add(x, y, -0.8);
  const nutrition = w.nutrition[i],
    frozenLiquid = w.residue[i];
  // Ice retains dissolved material through freezing, using its otherwise unused residue slot.
  if (
    m.id === M.Ice &&
    target === M.Water &&
    materials[frozenLiquid]?.waterLike
  )
    target = frozenLiquid;
  if (
    materials[target].category === "liquid" &&
    m.category !== "liquid" &&
    !m.gas
  )
    w.sound.emit("melt", x, y, 0.2, m.density);
  else if (materials[target].category === "liquid" && m.gas)
    w.sound.emit("splash", x, y, 0.08);
  else if (materials[target].gas && !m.gas) w.sound.emit("boil", x, y, 0.2);
  w.transform(i, target, temperature);
  w.nutrition[i] = nutrition;
  if (target === M.Ice && m.waterLike && m.id !== M.Water) w.residue[i] = m.id;
  return true;
}

const vents = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
