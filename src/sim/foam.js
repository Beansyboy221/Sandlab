import { M } from "./materials.js";

// A liquid reaction cell traps a finite volume of gas. Its budget travels with
// the foam through movement/saves; children never reproduce themselves.
export function reactFoam(w, i, x, y) {
  if (w.cells[i] !== M["Carbon dioxide foam"]) return false;
  const burst = w.clone[i];
  if (burst && w.tick % 3 === 0) {
    for (const [across, down] of vents) {
      const j = w.relativeIndex(x, y, across, down);
      if (j < 0 || w.cells[j]) continue;
      if (across && down) {
        const side = w.relativeIndex(x, y, across, 0),
          above = w.relativeIndex(x, y, 0, down);
        if (
          side < 0 ||
          above < 0 ||
          w.fields.blocks(w.cells[side]) ||
          w.fields.blocks(w.cells[above])
        )
          continue;
      }
      w.transform(j, M["Carbon dioxide foam"], w.temp[i]);
      w.residue[j] = M["Carbon dioxide"];
      w.clone[i]--;
      w.fields.add(x, y, 0.65);
      break;
    }
  }
  const pressure = Math.abs(w.fields.pressure[w.fields.index(x, y)]);
  if (
    !w.life[i] ||
    --w.life[i] === 0 ||
    w.temp[i] > 90 ||
    w.temp[i] < -5 ||
    pressure > 25
  ) {
    w.transform(i, w.residue[i] || M["Carbon dioxide"], w.temp[i]);
    w.fields.add(x, y, -0.15);
  }
  return true;
}
const vents = [
  [0, -1],
  [-1, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
];
