import {
  canDissolve,
  addDissolved,
  retainsMixture,
  releaseDissolved,
} from "./mixtures.js";
import { releaseForChange } from "./absorption.js";
import { addOxide } from "./oxidation.js";
import { compileContactReactions } from "./reaction-registry.js";
import { materials } from "./materials.js";
const contacts = compileContactReactions(materials);
// Count each registered unordered reactant pair once, independent of direction.
export const interactionCount = contacts.reduce(
  (count, row, a) =>
    count +
    (row ? row.reduce((n, rule, b) => n + Number(!!rule && b > a), 0) : 0),
  0,
);
export const contactParticipants = Uint8Array.from(materials, (m) =>
  Number(!!contacts[m.id]),
);
function contact(w, i, j, row, x, y) {
  const rule = row[w.cells[j]];
  if (
    !rule ||
    materials[w.cells[i]].static ||
    materials[w.cells[j]].static ||
    Math.max(w.temp[i], w.temp[j]) < (rule.minimumTemperature ?? -273) ||
    Math.max(w.temp[i], w.temp[j]) > (rule.maximumTemperature ?? 6000) ||
    (rule.chance < 1 && w.random() >= rule.chance)
  )
    return false;
  const forward = w.cells[i] === rule.a;
  if (rule.dissolvedProduct) {
    const host = forward ? i : j;
    if (
      w.dissolvedAmount[host] >= 4 ||
      (w.dissolvedId[host] && w.dissolvedId[host] !== rule.dissolvedProduct)
    )
      return false;
  }
  if (rule.oxide) {
    const coating = forward ? j : i,
      reagent = forward ? i : j;
    if (rule.oxide < 0 && !w.oxidationLevel[coating]) return false;
    addOxide(w, coating, rule.oxide);
    w.transform(reagent, rule.resultA, w.temp[reagent]);
    w.fields.add(x, y, rule.resultA ? 0 : -0.2);
    return true;
  }
  if (rule.dissolve) {
    const host = forward ? i : j,
      source = forward ? j : i;
    if (!canDissolve(w, host, rule.dissolve)) return false;
    const temperature = (w.temp[host] + w.temp[source]) * 0.5;
    if (!w.transform(source, 0)) return false;
    addDissolved(w, host, rule.dissolve);
    w.temp[host] = temperature;
    return true;
  }

  const targetI = forward ? rule.resultA : rule.resultB,
    targetJ = forward ? rule.resultB : rule.resultA;
  if (
    (w.dissolvedAmount[i] &&
      !retainsMixture(targetI) &&
      !releaseDissolved(w, i)) ||
    (w.dissolvedAmount[j] &&
      !retainsMixture(targetJ) &&
      !releaseDissolved(w, j))
  )
    return false;
  if (
    !releaseForChange(w, i, forward ? rule.resultA : rule.resultB) ||
    !releaseForChange(w, j, forward ? rule.resultB : rule.resultA)
  )
    return false;
  if (rule.dissolveNutrition) {
    const water = forward ? i : j,
      fertilizer = forward ? j : i;
    w.nutrition[water] = Math.min(
      255,
      w.nutrition[water] + (w.nutrition[fertilizer] || 96),
    );
    w.transform(fertilizer, 0);
    return true;
  }
  const temperature = Math.min(
    6000,
    (w.temp[i] + w.temp[j]) * 0.5 + (rule.heat || 0),
  );
  w.transform(i, forward ? rule.resultA : rule.resultB, temperature);
  w.transform(j, forward ? rule.resultB : rule.resultA, temperature);
  if (rule.dissolvedProduct) {
    const host = forward ? i : j;
    w.dissolvedId[host] = rule.dissolvedProduct;
    w.dissolvedAmount[host]++;
  }
  const reactantGases =
    Number(materials[rule.a].category === "gas") +
    Number(materials[rule.b].category === "gas");
  const productGases =
    Number(materials[rule.resultA].category === "gas") +
    Number(materials[rule.resultB].category === "gas");
  const pressure =
    (rule.pressure ?? (productGases - reactantGases) * 0.8) +
    (rule.heat || 0) * 0.002;
  if (productGases !== reactantGases || rule.heat)
    w.sound.emit(
      "fizz",
      x,
      y,
      Math.min(1.2, 0.08 + Math.abs(pressure) * 0.07),
      materials[rule.a].density,
      rule.a,
      { pressure, heat: rule.heat || 0, gas: productGases - reactantGases },
    );
  // Gas production expands the local atmosphere; gas absorption reduces it.
  // Heat-driven pressure uses the same field, instead of an explosion-only rule.
  w.fields.add(
    x,
    y,
    (rule.pressure ?? (productGases - reactantGases) * 0.8) +
      (rule.heat || 0) * 0.002,
  );
  return true;
}
export function reactContact(w, i, x, y, registry = contacts) {
  const row = registry[w.cells[i]];
  if (!row) return false;
  const left = w.index(x - 1, y),
    right = w.index(x + 1, y),
    above = w.index(x, y - 1),
    below = w.index(x, y + 1);
  return (
    (left >= 0 && contact(w, i, left, row, x, y)) ||
    (right >= 0 && contact(w, i, right, row, x, y)) ||
    (above >= 0 && contact(w, i, above, row, x, y)) ||
    (below >= 0 && contact(w, i, below, row, x, y))
  );
}
export function oxidize(w, i, x, y, material) {
  // Surface oxidation requires moisture AND air. Salt accelerates the same rule.
  let wet = false,
    oxygen = false,
    salty = false;
  w.eachNeighbor(x, y, (j) => {
    const id = w.cells[j];
    if (materials[id].waterLike) wet = true;
    if (materials[id].oxidizer) oxygen = true;
    if (
      materials[id].oxidationCatalyst ||
      materials[w.dissolvedId[j]].oxidationCatalyst
    )
      salty = true;
  });
  const passivation =
    material.oxidizeTo === undefined
      ? 1 - (w.oxidationLevel[i] / 255) * 0.9
      : 1;
  if (
    wet &&
    oxygen &&
    w.random() <
      material.oxidationRate *
        material.surfaceArea *
        (salty ? 4 : 1) *
        passivation
  )
    addOxide(w, i, 16);
}
export function etch(w, i, x, y, acid) {
  if (w.dissolvedAmount[i] >= 4) return;
  for (let d = 0; d < 4; d++) {
    const j = w.relativeIndex(
      x,
      y,
      d === 0 ? -1 : d === 1 ? 1 : 0,
      d === 2 ? -1 : d === 3 ? 1 : 0,
    );
    if (j < 0) continue;
    const target = materials[w.cells[j]],
      product = target.fragmentTo ?? target.id;
    const susceptibility = acid.acidity
      ? target.acidSolubility
      : target.alkaliSolubility;
    const rate = acid.acidity
      ? acid.acidity * susceptibility * 0.025
      : acid.alkalinity * susceptibility * 0.06;
    if (
      !susceptibility ||
      target.static ||
      target.acidProduct !== undefined ||
      (w.dissolvedId[i] && w.dissolvedId[i] !== product) ||
      w.random() >= rate
    )
      continue;
    if (
      !releaseForChange(w, i, acid.neutralizedTo) ||
      !releaseForChange(w, j, 0)
    )
      return;
    const temperature = (w.temp[i] + w.temp[j]) * 0.5;
    if (!w.transform(j, 0)) return;
    w.transform(i, acid.neutralizedTo, temperature);
    w.dissolvedId[i] = product;
    w.dissolvedAmount[i]++;
    return;
  }
}
