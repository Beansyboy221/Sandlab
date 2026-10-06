import { materials } from "./materials.js";
import { blocked } from "./stickman-body.js";

export function breathableWater(w, x, y) {
  const i = w.index(Math.floor(x), Math.floor(y));
  return i >= 0 && materials[w.cells[i]].aqueous && w.temp[i] < 45;
}

export function clearHabitatPath(w, ax, ay, bx, by, mode) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let n = 0; n <= steps; n++) {
    const x = ax + ((bx - ax) * n) / steps,
      y = ay + ((by - ay) * n) / steps;
    const i = w.index(Math.floor(x), Math.floor(y));
    if (i < 0 || blocked(w, x, y)) return false;
    if (mode === "swim") {
      if (!breathableWater(w, x, y)) return false;
    } else if (
      materials[w.cells[i]].category === "liquid" ||
      materials[w.cells[i]].acidic ||
      w.temp[i] > 65
    )
      return false;
  }
  return true;
}
