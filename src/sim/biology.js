import { M } from "./materials.js";
const porous = (id) =>
  id === M.Plant || id === M.Dirt || id === M.Mud || id === M.Seed;
export function grow(w, i, x, y) {
  const id = w.cells[i],
    moisture = w.moisture,
    nutrition = w.nutrition,
    above = w.relativeIndex(x, y, 0, -1),
    below = w.relativeIndex(x, y, 0, 1);
  if ((i + w.tick) % 4 === 0)
    w.eachNeighbor(x, y, (j) => {
      if (
        (w.cells[j] === M.Water || w.cells[j] === M["Nutrient water"]) &&
        moisture[i] < 160 &&
        w.random() < 0.08
      ) {
        nutrition[i] = Math.min(255, nutrition[i] + nutrition[j]);
        moisture[i] = Math.min(255, moisture[i] + 80);
        w.transform(j, 0);
      } else if (
        w.cells[j] === M.Sponge &&
        (w.storedLiquid[j] === M.Water ||
          w.storedLiquid[j] === M.Brine ||
          w.storedLiquid[j] === M["Nutrient water"]) &&
        w.storedAmount[j] &&
        moisture[i] < 160 &&
        w.random() < 0.08
      ) {
        moisture[i] = Math.min(255, moisture[i] + 64);
        if (w.storedLiquid[j] === M["Nutrient water"])
          nutrition[i] = Math.min(255, nutrition[i] + 96);
        if (--w.storedAmount[j] === 0) w.storedLiquid[j] = 0;
      } else if (
        w.cells[j] === M.Fertilizer &&
        moisture[i] >= 32 &&
        nutrition[i] < 190 &&
        w.random() < 0.04
      ) {
        nutrition[i] += 64;
        w.transform(j, 0);
      } else if (
        id === M.Plant &&
        w.cells[j] === M["Carbon dioxide"] &&
        moisture[i] >= 32 &&
        w.temp[i] >= 5 &&
        w.temp[i] <= 45 &&
        above >= 0 &&
        !w.cells[above] &&
        w.random() < 0.06
      ) {
        w.transform(j, M.Oxygen, w.temp[j]);
        moisture[i] -= 2;
      } else if (porous(w.cells[j])) {
        if (nutrition[i] > nutrition[j] + 4 && moisture[i]) {
          const food = Math.min(6, (nutrition[i] - nutrition[j]) >> 2);
          nutrition[i] -= food;
          nutrition[j] += food;
        }
        if (moisture[i] <= moisture[j] + 4) return;
        const transfer = Math.min(12, (moisture[i] - moisture[j]) >> 2);
        moisture[i] -= transfer;
        moisture[j] += transfer;
      }
    });
  if ((i + w.tick) % 128 === 0 && moisture[i]) moisture[i]--;
  if (w.temp[i] < 5 || w.temp[i] > 45) return;
  if (id === M.Seed && below >= 0) {
    if (
      (w.cells[below] === M.Dirt || w.cells[below] === M.Mud) &&
      moisture[below] > 24 &&
      w.random() < 0.06 + (nutrition[i] ? 0.04 : 0)
    ) {
      const food = Math.min(16, nutrition[below]),
        carried = nutrition[i];
      nutrition[below] -= food;
      w.transform(i, M.Plant);
      nutrition[i] = Math.min(255, carried + food);
      moisture[i] = Math.min(80, moisture[below]);
      moisture[below] -= 24;
    }
  } else if (
    id === M.Plant &&
    moisture[i] >= 32 &&
    w.growth[i] < 22 &&
    above >= 0 &&
    w.random() < 0.05 + (nutrition[i] ? 0.04 : 0)
  ) {
    const dx = w.random() < 0.7 ? 0 : w.random() < 0.5 ? -1 : 1;
    const j = w.relativeIndex(x, y, dx, -1);
    if (j < 0) return;
    if (!w.cells[j]) {
      const share = (moisture[i] - 8) >> 1,
        depth = w.growth[i] + 1;
      moisture[i] -= share + 8;
      const remaining = Math.max(0, nutrition[i] - 4),
        food = remaining >> 1;
      nutrition[i] = remaining - food;
      w.transform(j, M.Plant);
      nutrition[j] = food;
      moisture[j] = share;
      w.growth[j] = depth;
    }
  }
}
