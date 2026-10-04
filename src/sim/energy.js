import { moveOpticalRay } from "./optical-rays.js";
import { M, materials } from "./materials.js";

export const rayDirections = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
export function rayHeading(dx, dy) {
  if (!dx && !dy) return 0;
  return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
}
function budget(w, key, limit) {
  if (w.energyBudgetTick !== w.tick) {
    w.energyBudgetTick = w.tick;
    w.energyBirths = 0;
    w.energyReactions = 0;
  }
  if (w[key] >= limit) return false;
  w[key]++;
  return true;
}
export function reactEnergy(w, i, x, y, m) {
  if (m.energyRule === "ray") {
    if (!w.life[i] || --w.life[i] === 0) w.transform(i, 0);
  } else if (m.energyRule === "gravity") {
    w.fields.add(x, y, m.force);
    if (m.absorbMatter)
      w.eachNeighbor(x, y, (j) => {
        if (materials[w.cells[j]].movable) w.transform(j, 0);
      });
  } else if (m.energyRule === "uranium") {
    if (w.random() < m.emissionChance) {
      w.temp[i] = Math.min(6000, w.temp[i] + 8);
      w.fields.heat(x, y, 0.5);
    }
  } else if (m.energyRule === "antimatter") {
    let target = -1;
    w.eachNeighbor(x, y, (j) => {
      const other = materials[w.cells[j]];
      if (
        target < 0 &&
        other.id &&
        other.id !== m.id &&
        other.category !== "special" &&
        other.category !== "energy"
      )
        target = j;
    });
    if (target >= 0 && budget(w, "energyReactions", 32)) {
      w.transform(target, 0);
      w.transform(i, 0);
      w.explode(x, y, 5);
      w.transform(i, M.Fire, 2500, 14);
    }
  }
}
export const moveRay = moveOpticalRay;
