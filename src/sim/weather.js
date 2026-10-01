import { M, materials } from "./materials.js";
export function strike(w, x, y) {
  // Trace once per tick; painted lightning cannot multiply into an unbounded storm.
  if (w.lastStrikeTick === w.tick) return;
  w.lastStrikeTick = w.tick;
  for (let row = y; row < w.height; row++) {
    let target = x,
      best = Infinity;
    for (let dx = -8; dx <= 8; dx++)
      for (let dy = 1; dy <= 8; dy++) {
        const nx = x + dx,
          ny = row + dy;
        if (nx < 0 || nx >= w.width || ny >= w.height) continue;
        if (
          materials[w.cells[ny * w.width + nx]].conductive &&
          Math.abs(dx) + dy < best
        ) {
          best = Math.abs(dx) + dy;
          target = nx;
        }
      }
    const previous = x;
    x = Math.max(
      0,
      Math.min(
        w.width - 1,
        x +
          (best < Infinity
            ? Math.sign(target - x)
            : w.random() < 0.3
              ? w.random() < 0.5
                ? -1
                : 1
              : 0),
      ),
    );
    // Connect bends horizontally so the bolt has no diagonal gaps.
    for (let nx = Math.min(previous, x); nx <= Math.max(previous, x); nx++) {
      const i = row * w.width + nx,
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
  const id = w.cells[i];
  if (id === M.Lightning) {
    if (!w.clone[i]) strike(w, x, y);
    if (w.cells[i] === M.Lightning && (!w.life[i] || --w.life[i] === 0))
      w.set(i, 0);
  } else if (id === M.Storm) {
    if (!w.life[i]) w.life[i] = 240 + Math.floor(w.random() * 180);
    if (--w.life[i] === 0) strike(w, x, y + 1);
    if (y < w.height - 1 && !w.cells[i + w.width] && w.random() < 0.04)
      w.set(i + w.width, M.Cloud);
  } else {
    if (!w.life[i] || --w.life[i] === 0) {
      w.set(i, 0);
      return;
    }
    if (y < w.height - 1 && !w.cells[i + w.width] && w.random() < 0.008) {
      w.set(i + w.width, M.Water);
      w.life[i] = Math.max(1, w.life[i] - 25);
    }
  }
}
