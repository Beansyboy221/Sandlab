import { freezingPoint } from "./mixtures.js";
import { materials, solverProducts } from "./materials.js";
export function changePhase(w, i, x, y, m) {
  const temperature = w.temp[i];
  // Wet hosts vent through the shared pore model; do not manufacture another
  // water pixel when the final stored unit has already boiled away.
  if (m.dryHostTo !== undefined && temperature > 100) {
    if (w.storedAmount[i]) return false;
    return w.transform(i, m.dryHostTo, temperature);
  }
  const dissolved =
    m.nutritionResidue !== undefined && w.nutrition[i] && temperature > m.boil;
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
      w.transform(i, dissolved ? m.nutritionResidue : m.dryTo, temperature);
      if (dissolved) w.nutrition[i] = nutrition;
      if (vent >= 0)
        w.transform(
          vent,
          m.boilTo ?? solverProducts.vapor,
          Math.max(120, temperature),
        );
      w.fields.add(x, y, 1.5);
      w.sound.emit("boil", x, y, 0.18, m.density, m.id, {
        pressure: 1.5,
        gas: 1,
        heat: Math.max(0, temperature - 100),
      });
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
  } else if (
    m.freeze !== undefined &&
    temperature < (m.solvent ? freezingPoint(w, i) : m.freeze)
  )
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
    m.restoresLiquid &&
    materials[target]?.solvent &&
    materials[frozenLiquid]?.waterLike
  )
    target = frozenLiquid;
  if (
    materials[target].category === "liquid" &&
    m.category !== "liquid" &&
    !m.gas
  )
    w.sound.emit("melt", x, y, 0.2, m.density, target);
  else if (materials[target].category === "liquid" && m.gas)
    w.sound.emit("splash", x, y, 0.08, materials[target].density, target);
  else if (materials[target].gas && !m.gas)
    w.sound.emit("boil", x, y, 0.2, m.density, m.id, {
      pressure: 1.5,
      gas: 1,
      heat: Math.max(0, temperature - (m.boil || 100)),
    });
  if (!w.transform(i, target, temperature)) return false;
  w.nutrition[i] = nutrition;
  if (materials[target].restoresLiquid && m.waterLike && !m.solvent)
    w.residue[i] = m.id;
  return true;
}

const vents = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
