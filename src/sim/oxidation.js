import { materials } from "./materials.js";

// A thin oxide coating is state on the original conductor, not a new substance.
// Heavily corroded iron may still convert to its bulk corrosion product.
export function conducts(w, i) {
  return materials[w.cells[i]].conductive && w.oxidationLevel[i] < 224;
}
export function addOxide(w, i, amount) {
  const m = materials[w.cells[i]];
  if (!m.oxidationRate) return;
  w.oxidationLevel[i] = Math.max(
    0,
    Math.min(255, w.oxidationLevel[i] + amount),
  );
  if (w.oxidationLevel[i] === 255 && m.oxidizeTo !== undefined)
    w.transform(i, m.oxidizeTo, w.temp[i]);
}
export const oxideColors = materials.map((m) => {
  const color = m.oxidationColor || m.color;
  return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
});
