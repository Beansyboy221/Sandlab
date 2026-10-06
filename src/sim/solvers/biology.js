import { materials } from "../materials.js";
import { consumeWater } from "../absorption.js";
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const biologyLimits = Object.freeze({
  birthsPerTick: 32,
  neighborsPerCell: 4,
});
function birthAvailable(w) {
  if (w.floraBudgetTick !== w.tick) {
    w.floraBudgetTick = w.tick;
    w.floraBirths = 0;
  }
  return w.floraBirths < biologyLimits.birthsPerTick;
}
function spawn(w, i, id, temperature, life) {
  if (!birthAvailable(w) || !w.transform(i, id, temperature, life))
    return false;
  w.floraBirths++;
  return true;
}
// Bounded, headless light estimate; never read the renderer's radiance cache.
function illuminated(w, x, y, p, registry) {
  if ((w.environment?.light ?? w.ambientLight ?? 1) >= p.minimumLight)
    return true;
  for (const [dx, dy] of directions) {
    const j = w.index(x + dx, y + dy);
    if (
      j >= 0 &&
      (registry[w.cells[j]].lightEmission || registry[w.cells[j]].glow || 0) >=
        p.minimumLight
    )
      return true;
  }
  return false;
}
export function solveBiology(
  w,
  i,
  x,
  y,
  m = materials[w.cells[i]],
  registry = materials,
) {
  const p = m.biology;
  if (!p) return;
  if (w.temp[i] > p.lethalMaximum || w.temp[i] < p.lethalMinimum) {
    w.transform(i, p.deathTo, w.temp[i]);
    return;
  }
  if (p.mode === "infect") {
    if (!w.life[i] || --w.life[i] === 0) {
      w.transform(i, w.residue[i] ? p.spentTo : p.deathTo, w.temp[i]);
      return;
    }
    if ((w.tick + i) % p.interval || !birthAvailable(w)) return;
    if (w.residue[i] && ++w.growth[i] < p.incubation) return;
    for (const [dx, dy] of directions) {
      const j = w.index(x + dx, y + dy);
      if (
        j < 0 ||
        !registry[w.cells[j]].biologicalHost ||
        w.temp[j] > p.lethalMaximum
      )
        continue;
      const tissue = w.cells[j];
      if (!spawn(w, j, p.growthTo, w.temp[j], registry[p.growthTo].lifetime))
        continue;
      w.residue[j] = tissue;
      if (!w.residue[i]) w.transform(i, p.deathTo, w.temp[i]);
      else if (++w.moisture[i] >= p.replicationLimit)
        w.transform(i, p.spentTo, w.temp[i]);
      else w.growth[i] = 0;
      return;
    }
    return;
  }
  if (p.mode === "colonize") {
    if (
      (w.tick + i) % p.interval ||
      !birthAvailable(w) ||
      w.temp[i] < p.minTemperature ||
      w.temp[i] > p.maxTemperature
    )
      return;
    if (w.moisture[i] < p.hydrationMaximum)
      consumeWater(w, i, registry, p.hydrationYield);
    if (w.moisture[i] < p.hydrationMinimum) return;
    for (const [dx, dy] of directions) {
      const j = w.index(x + dx, y + dy);
      if (j < 0 || !registry[w.cells[j]].decomposable) continue;
      const hydration = w.moisture[i] >> 1,
        nutrients = w.nutrition[i] >> 1;
      if (!spawn(w, j, p.growthTo, w.temp[j])) continue;
      w.moisture[i] -= hydration + p.waterCost;
      w.moisture[j] = hydration;
      w.nutrition[i] -= nutrients;
      w.nutrition[j] = Math.min(255, nutrients + p.decompositionNutrition);
      return;
    }
    return;
  }
  const moisture = w.moisture,
    nutrition = w.nutrition,
    above = w.relativeIndex(x, y, 0, -1),
    below = w.relativeIndex(x, y, 0, 1);
  if (p.mode !== "reservoir" && moisture[i] < p.hydrationMaximum)
    consumeWater(w, i, registry, p.hydrationYield);
  if ((i + w.tick) % p.interval === 0) {
    const light =
      p.photosynthesisInput !== undefined && illuminated(w, x, y, p, registry);
    for (const [dx, dy] of directions) {
      const j = w.index(x + dx, y + dy);
      if (j < 0) continue;
      const neighbor = registry[w.cells[j]];
      if (
        neighbor.nutrientValue &&
        moisture[i] >= p.hydrationMinimum &&
        nutrition[i] < p.nutrientMaximum &&
        w.random() < p.nutrientChance
      ) {
        nutrition[i] = Math.min(255, nutrition[i] + neighbor.nutrientValue);
        w.transform(j, 0);
      } else if (
        light &&
        neighbor.id === p.photosynthesisInput &&
        moisture[i] >= p.hydrationMinimum &&
        w.temp[i] >= p.minTemperature &&
        w.temp[i] <= p.maxTemperature &&
        above >= 0 &&
        !w.cells[above] &&
        w.random() < p.photosynthesisChance
      ) {
        if (w.transform(j, p.photosynthesisOutput, w.temp[j])) {
          moisture[i] -= p.photosynthesisWater;
          nutrition[i] = Math.min(
            255,
            nutrition[i] + p.photosynthesisNutrition,
          );
        }
      } else if (
        m.biologicalHost &&
        neighbor.biologicalHost &&
        nutrition[i] > nutrition[j] + 4 &&
        moisture[i]
      ) {
        const food = Math.min(
          p.nutrientDiffusion,
          255 - nutrition[j],
          (nutrition[i] - nutrition[j]) >> 2,
        );
        nutrition[i] -= food;
        nutrition[j] += food;
      }
    }
  }
  if ((i + w.tick) % p.moistureDecayInterval === 0 && moisture[i])
    moisture[i]--;
  if (w.temp[i] < p.minTemperature || w.temp[i] > p.maxTemperature) return;
  if (p.mode === "seed" && below >= 0) {
    if (
      registry[w.cells[below]].growthSubstrate &&
      moisture[i] > p.germinationMoisture &&
      w.random() < p.growthChance + (nutrition[i] ? p.fedBonus : 0)
    ) {
      const food = Math.min(p.substrateNutrition, nutrition[below]),
        carried = nutrition[i],
        hydration = moisture[i];
      if (!spawn(w, i, p.growthTo, w.temp[i])) return;
      nutrition[below] -= food;
      nutrition[i] = Math.min(255, carried + food);
      moisture[i] = hydration - p.waterCost;
    }
  } else if (
    p.mode === "shoot" &&
    moisture[i] >= p.hydrationMinimum &&
    w.growth[i] < p.growthLimit &&
    above >= 0 &&
    birthAvailable(w) &&
    w.random() < p.growthChance + (nutrition[i] ? p.fedBonus : 0)
  ) {
    const dx = w.random() < p.uprightBias ? 0 : w.random() < 0.5 ? -1 : 1,
      j = w.relativeIndex(x, y, dx, -1);
    if (j < 0 || w.cells[j]) return;
    const share = (moisture[i] - p.waterCost) >> 1,
      depth = w.growth[i] + 1,
      remaining = Math.max(0, nutrition[i] - p.nutrientCost),
      food = remaining >> 1;
    if (!spawn(w, j, p.growthTo, w.temp[j])) return;
    moisture[i] -= share + p.waterCost;
    nutrition[i] = remaining - food;
    nutrition[j] = food;
    moisture[j] = share;
    w.growth[j] = depth;
  }
}
