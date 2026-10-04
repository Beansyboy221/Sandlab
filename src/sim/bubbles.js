import { M, materials } from "./materials.js";

export function reactBubbles(w, i, x, y) {
  if (w.cells[i] === M.Bubble) {
    const pressure = Math.abs(w.fields.pressure[w.fields.index(x, y)]);
    if (
      w.temp[i] > 90 ||
      w.temp[i] < -5 ||
      pressure > 7 ||
      !w.life[i] ||
      --w.life[i] === 0
    ) {
      w.transform(i, 0);
      return true;
    }
    let liquid = false;
    w.eachNeighbor(x, y, (j) => {
      if (materials[w.cells[j]].category === "liquid") liquid = true;
    });
    // A gas pocket keeps its film underwater; exposed foam drains faster.
    if (!liquid) w.life[i] = Math.max(0, w.life[i] - 4);
    return true;
  }
  if (
    w.cells[i] === M.Water &&
    w.dissolvedId[i] === M.Soap &&
    w.tick % 6 === 0
  ) {
    const pressure = Math.abs(w.fields.pressure[w.fields.index(x, y)]);
    if ((pressure > 0.6 || w.temp[i] > 65) && w.random() < 0.06) {
      // Replace a liquid cell rather than creating unlimited free particles.
      const j = w.relativeIndex(x, y, 0, -1);
      if (j >= 0 && !w.cells[j] && w.life[i] === 0) {
        w.transform(j, M.Bubble, Math.min(85, w.temp[i]));
        w.life[i] = 60;
      }
    }
  }
  if (w.cells[i] === M.Water && w.life[i]) w.life[i]--;
  return false;
}
