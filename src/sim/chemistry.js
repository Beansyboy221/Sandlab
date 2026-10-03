import { M, materials } from "./materials.js";
// Indexed symmetric contact rules run only for participating substances.
// Each reaction consumes its two reactants once and carries their heat forward.
const contacts = [];
function pair(a, b, resultA, resultB, options = {}) {
  const reaction = { a, b, resultA, resultB, chance: 1, ...options };
  (contacts[a] ??= [])[b] = reaction;
  (contacts[b] ??= [])[a] = reaction;
}
pair(M.Water, M.Salt, M.Brine, 0);
pair(M.Water, M.Cement, 0, M.Concrete);
pair(M.Water, M.Clay, 0, M["Wet Clay"]);
pair(M.Water, M.Fertilizer, M.Water, 0, { dissolveNutrition: true });
pair(M.Water, M.Dirt, 0, M.Mud, { chance: 0.035, hydrateSoil: true });
for (const acid of materials.filter((m) => m.acidic && !m.deprecated)) {
  pair(acid.id, M["Baking Soda"], M.Water, M["CO2"], {
    pressure: 4,
  });
  pair(acid.id, M.Lye, M.Water, M.Brine, { heat: 35 });
  pair(acid.id, M.Steel, M.Brine, M.Hydrogen, {
    chance: 0.05,
    heat: 12,
  });
  pair(acid.id, M["Steel Powder"], M.Brine, M.Hydrogen, {
    chance: 0.12,
    heat: 12,
  });
  pair(acid.id, M.Rust, M.Water, 0, { chance: 0.12 });
  pair(acid.id, M.Patina, M.Water, M.Copper, { chance: 0.06 });
}
for (const sodium of materials.filter((m) => m.reactsWithWater))
  for (const water of materials.filter((m) => m.aqueous))
    pair(sodium.id, water.id, M.Lye, M.Hydrogen, { heat: 600, pressure: 2 });
pair(M.Chlorine, M.Steel, 0, M.Rust, { chance: 0.04 });
pair(M.Chlorine, M.Copper, 0, M.Patina, { chance: 0.04 });
pair(M.Rust, M.Coal, M.Steel, M["CO2"], {
  minimumTemperature: 700,
  chance: 0.04,
  pressure: 0.5,
});
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
    Math.max(w.temp[i], w.temp[j]) < (rule.minimumTemperature || -273) ||
    (rule.chance < 1 && w.random() >= rule.chance)
  )
    return false;
  const forward = w.cells[i] === rule.a;
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
  if (rule.hydrateSoil) {
    const water = forward ? i : j,
      soil = forward ? j : i;
    const food = Math.min(255, w.nutrition[soil] + w.nutrition[water]);
    w.moisture[soil] = Math.min(255, w.moisture[soil] + 64);
    if (w.moisture[soil] > 220) w.transform(soil, M.Mud, w.temp[soil]);
    w.nutrition[soil] = food;
    w.transform(water, 0);
    return true;
  }
  const temperature = Math.min(
    6000,
    (w.temp[i] + w.temp[j]) * 0.5 + (rule.heat || 0),
  );
  w.transform(i, forward ? rule.resultA : rule.resultB, temperature);
  w.transform(j, forward ? rule.resultB : rule.resultA, temperature);
  const reactantGases =
    Number(materials[rule.a].category === "gas") +
    Number(materials[rule.b].category === "gas");
  const productGases =
    Number(materials[rule.resultA].category === "gas") +
    Number(materials[rule.resultB].category === "gas");
  if (productGases > reactantGases) w.sound.emit("fizz", x, y, 0.28);
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
export function reactContact(w, i, x, y) {
  const row = contacts[w.cells[i]];
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
    if (!id || id === M.Oxygen) oxygen = true;
    if (id === M.Brine) salty = true;
  });
  if (wet && oxygen && w.random() < material.oxidationRate * (salty ? 4 : 1))
    w.transform(i, material.oxidizeTo, w.temp[i]);
}
export function dissolveOrganic(w, i, x, y) {
  if (w.random() >= 0.06) return;
  w.eachNeighbor(x, y, (j) => {
    if (w.cells[i] === M.Lye && materials[w.cells[j]].organic) {
      w.transform(j, 0);
      w.transform(i, M.Water, w.temp[i]);
    }
  });
}
