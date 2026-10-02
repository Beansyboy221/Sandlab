import { M, materials } from "./materials.js";
export function strike(w, x, y) {
  // Trace once per tick; painted lightning cannot multiply into an unbounded storm.
  if (w.lastStrikeTick === w.tick) return;
  w.lastStrikeTick = w.tick;
  const loop = w.border === "looping";
  // Follow gravity for at most one world span, including wrapped edges.
  const gx = w.gravityX,
    gy = w.gravityY,
    span = gx ? w.width : w.height;
  for (let step = 0; step < span; step++) {
    const current = w.index(x, y);
    if (current < 0) break;
    x = current % w.width;
    y = Math.floor(current / w.width);
    let direction = 0,
      best = Infinity;
    for (let dx = -8; dx <= 8; dx++)
      for (let dy = 1; dy <= 8; dy++) {
        const i = w.relativeIndex(x, y, dx, dy);
        if (i < 0) continue;
        if (materials[w.cells[i]].conductive && Math.abs(dx) + dy < best) {
          best = Math.abs(dx) + dy;
          direction = Math.sign(dx);
        }
      }
    const shift =
        best < Infinity
          ? direction
          : w.random() < 0.3
            ? w.random() < 0.5
              ? -1
              : 1
            : 0,
      previousX = x,
      previousY = y;
    let nx = x + gy * shift,
      ny = y - gx * shift;
    if (!loop) {
      if (gy) nx = Math.max(0, Math.min(w.width - 1, nx));
      else ny = Math.max(0, Math.min(w.height - 1, ny));
    }
    const next = w.index(nx, ny);
    nx = next % w.width;
    ny = Math.floor(next / w.width);
    // Connect a bend without drawing across a wrapped seam.
    for (
      let bend = 0;
      bend < (previousX === nx && previousY === ny ? 1 : 2);
      bend++
    ) {
      const bx = bend ? nx : previousX,
        by = bend ? ny : previousY,
        i = w.index(bx, by),
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
        w.fields.add(bx, by, 4);
        return;
      }
      w.set(i, M.Lightning, 1800, 6 + Math.floor(w.random() * 6));
      w.clone[i] = 1;
    }
    x = nx + gx;
    y = ny + gy;
  }
}
export function weather(w, i, x, y) {
  const id = w.cells[i],
    below = w.relativeIndex(x, y, 0, 1);
  if (id === M.Lightning) {
    if (!w.clone[i]) strike(w, x, y);
    if (w.cells[i] === M.Lightning && (!w.life[i] || --w.life[i] === 0))
      w.set(i, 0);
  } else if (id === M.Storm) {
    if (!w.life[i]) w.life[i] = 240 + Math.floor(w.random() * 180);
    if (--w.life[i] === 0) strike(w, x + w.gravityX, y + w.gravityY);
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
