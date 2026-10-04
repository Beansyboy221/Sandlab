import { M, materials } from "./materials.js";
import { consumeWater } from "./absorption.js";
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const host = (id) => id === M.Plant || id === M.Fungus || id === M.Seed;
const food = (id) => id === M.Wood || id === M.Sawdust || id === M.Plant;

// Growth is staggered and globally bounded; outbreaks cannot recursively update
// newly infected cells or turn a large colony into an unbounded contact workload.
export function growMicrobe(w, i, x, y, m) {
  if (w.temp[i] > 60 || w.temp[i] < -10) {
    w.transform(i, m.flora === "fungus" ? M.Dirt : 0, w.temp[i]);
    return;
  }
  if (m.flora === "virus" && (!w.life[i] || --w.life[i] === 0)) {
    w.transform(i, w.residue[i] ? M.Sawdust : 0, w.temp[i]);
    return;
  }
  if ((w.tick + i) % 8) return;
  if (w.floraBudgetTick !== w.tick) {
    w.floraBudgetTick = w.tick;
    w.floraBirths = 0;
  }
  if (w.floraBirths >= 32) return;
  if (m.flora === "virus") {
    // A free particle infects living tissue; incubation/replication uses that
    // consumed tissue. Air, stone and metal never become replication hosts.
    if (w.residue[i] && ++w.growth[i] < 4) return;
    for (const [dx, dy] of directions) {
      const j = w.index(x + dx, y + dy);
      if (j < 0 || !host(w.cells[j]) || w.temp[j] > 60) continue;
      const tissue = w.cells[j];
      if (!w.transform(j, M.Virus, w.temp[j], 180)) continue;
      w.residue[j] = tissue;
      w.floraBirths++;
      if (!w.residue[i]) w.transform(i, 0, w.temp[i]);
      else if (++w.moisture[i] >= 3) w.transform(i, M.Sawdust, w.temp[i]);
      else w.growth[i] = 0;
      return;
    }
    return;
  }
  if (w.temp[i] < 5 || w.temp[i] > 40) return;
  if (w.moisture[i] < 160) consumeWater(w, i);
  if (w.moisture[i] < 16) return;
  // Decomposition consumes a substrate cell rather than spawning mass in air.
  for (const [dx, dy] of directions) {
    const j = w.index(x + dx, y + dy);
    if (j < 0 || !food(w.cells[j])) continue;
    const hydration = w.moisture[i] >> 1,
      nutrients = w.nutrition[i] >> 1;
    if (!w.transform(j, M.Fungus, w.temp[j])) continue;
    w.moisture[i] -= hydration + 4;
    w.moisture[j] = hydration;
    w.nutrition[i] -= nutrients;
    w.nutrition[j] = Math.min(255, nutrients + 8);
    w.floraBirths++;
    return;
  }
}
