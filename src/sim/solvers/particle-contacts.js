import { materials, M } from "../materials.js";
import { effectiveDensity } from "../mixtures.js";
import { poreExchange } from "../porous-flow.js";

export function canMove(w, i, j, vertical) {
  const a = materials[w.cells[i]],
    b = materials[w.cells[j]];
  if (!b.id) return true;
  if (
    b.static ||
    b.category === "solid" ||
    b.category === "elastic" ||
    b.category === "special" ||
    b.category === "powder"
  )
    return false;
  if (vertical > 0)
    return (
      effectiveDensity(w, i) >
      effectiveDensity(w, j) + (a.gas && b.gas ? 0.00004 : 0.08)
    );
  if (vertical < 0)
    return (
      effectiveDensity(w, i) <
      effectiveDensity(w, j) - (a.gas && b.gas ? 0.00002 : 0.04)
    );
  return false;
}

export function tryMove(w, i, x, y, vertical) {
  const j = w.index(x, y);
  w.movedTo = j;
  if (j < 0) {
    if (w.border === "void") {
      w.set(i, 0);
      return true;
    }
    return false;
  }
  if (w.cells[j] === M.Portal)
    return w.teleport(i, j, x - (i % w.width), y - Math.floor(i / w.width));
  if (j === i || !w.canMove(i, j, vertical) || !poreExchange(w, i, j))
    return false;
  const category = materials[w.cells[i]].category;
  const falling = category === "powder" || category === "liquid";
  w.swap(i, j);
  if (falling && vertical > 0)
    w.fallDistance[j] = Math.min(24, w.fallDistance[j] + 1);
  if (
    category === "liquid" &&
    (j + w.tick) % 64 === 0 &&
    w.fallDistance[j] >= 2
  )
    w.sound.emit(
      "slosh",
      x,
      y,
      Math.min(0.22, 0.05 + w.fallDistance[j] * 0.007),
      materials[w.cells[j]].density,
    );
  return true;
}
