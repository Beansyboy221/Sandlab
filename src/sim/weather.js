import { M, materials } from "./materials.js";
export function strike(w, x, y) {
  // Trace once per tick; painted lightning cannot multiply into an unbounded storm.
  if (w.lastStrikeTick === w.tick) return;
  w.lastStrikeTick = w.tick;
  const loop = w.border === "looping";
  // A looping bolt traces at most one world height, including any wrapped rows.
  for (let step = 0; step < w.height; step++) {
    const row = loop ? (y + step) % w.height : y + step;
    if (row >= w.height) break;
    let direction = 0,
      best = Infinity;
    for (let dx = -8; dx <= 8; dx++)
      for (let dy = 1; dy <= 8; dy++) {
        const i = w.index(x + dx, row + dy);
        if (i < 0) continue;
        if (materials[w.cells[i]].conductive && Math.abs(dx) + dy < best) {
          best = Math.abs(dx) + dy;
          direction = Math.sign(dx);
        }
      }
    const previous = x;
    const next =
      x +
      (best < Infinity
        ? direction
        : w.random() < 0.3
          ? w.random() < 0.5
            ? -1
            : 1
          : 0);
    x = loop
      ? (next + w.width) % w.width
      : Math.max(0, Math.min(w.width - 1, next));
    // Connect the two cells of a bend without drawing across a wrapped seam.
    for (let bend = 0; bend < (previous === x ? 1 : 2); bend++) {
      const nx = bend ? x : previous,
        i = row * w.width + nx,
        id = w.cells[i],
        m = materials[id];
      if (
        id &&
        id !== M.Lightning &&
        m.category !== "gas" &&
        m.category !== "energy"
      ) {
        w.temp[i] = Math.max(w.temp[i], m.ignite ? m.ignite + 180 : 850);
        if (m.conductive) {
          w.charge[i] = 6;
          w.cooldown[i] = 18;
          w.chargedAt[i] = w.tick;
        }
        w.fields.add(nx, row, 4);
        return;
      }
      w.set(i, M.Lightning, 1800, 6 + Math.floor(w.random() * 6));
      w.clone[i] = 1;
    }
  }
}
export function weather(w, i, x, y) {
  const id = w.cells[i],
    below = w.index(x, y + 1);
  if (id === M.Lightning) {
    if (!w.clone[i]) strike(w, x, y);
    if (w.cells[i] === M.Lightning && (!w.life[i] || --w.life[i] === 0))
      w.set(i, 0);
  } else if (id === M.Storm) {
    if (!w.life[i]) w.life[i] = 240 + Math.floor(w.random() * 180);
    if (--w.life[i] === 0) strike(w, x, y + 1);
    if (below >= 0 && !w.cells[below] && w.random() < 0.04)
      w.set(below, M.Cloud);
  } else {
    if (!w.life[i] || --w.life[i] === 0) {
      w.set(i, 0);
      return;
    }
    if (below >= 0 && !w.cells[below] && w.random() < 0.008) {
      w.set(below, M.Water);
      w.life[i] = Math.max(1, w.life[i] - 25);
    }
  }
}
