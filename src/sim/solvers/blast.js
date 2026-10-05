import { materials, M } from "../materials.js";

// Keep blast products, pressure, heat and sound coupled in one bounded local
// transaction; this preserves the existing gameplay blast law and seeded order.
export function explode(w, x, y, radius, product = 0) {
  if (w.viewportState) {
    const events = w.viewportState.overview.events;
    events.push({
      sequence: (events.at(-1)?.sequence ?? 0) + 1,
      tick: w.tick,
      x: w.viewOriginX + x * w.metersPerPixel,
      y: w.viewOriginY + y * w.metersPerPixel,
      radius: radius * w.metersPerPixel,
    });
    if (events.length > 32) events.shift();
  }
  w.fields.add(x, y, radius * 2);
  w.sound.emit("explosion", x, y, Math.min(1.5, radius * 0.15), radius, 0, {
    pressure: radius * 2,
    heat: 500,
  });
  const r2 = radius * radius;
  const loop = w.border === "looping",
    left = loop ? -Math.min(radius, Math.floor(w.width / 2)) : -radius,
    right = loop ? Math.min(radius, Math.ceil(w.width / 2) - 1) : radius,
    top = loop ? -Math.min(radius, Math.floor(w.height / 2)) : -radius,
    bottom = loop ? Math.min(radius, Math.ceil(w.height / 2) - 1) : radius;
  for (let dy = top; dy <= bottom; dy++)
    for (let dx = left; dx <= right; dx++) {
      const nx = x + dx,
        ny = y + dy,
        d2 = dx * dx + dy * dy;
      const i = w.index(nx, ny);
      if (i < 0 || d2 > r2) continue;
      const m = materials[w.cells[i]];
      if (m.static || m.category === "special" || m.resistance === 1) continue;
      if (m.explosive && d2 > 1) {
        w.temp[i] = Math.max(w.temp[i], m.ignite + 100);
        continue;
      }
      if (
        !m.id ||
        !["solid", "elastic"].includes(m.category) ||
        w.random() > (m.resistance || 0.6)
      ) {
        w.transform(i, M.Fire, 850, 15 + w.random() * 30);
        if (product) w.residue[i] = product;
      } else w.temp[i] += 500 * (1 - d2 / r2);
    }
  const center = w.index(x, y);
  if (w.transform(center, M.Fire, 1100, 50) && product)
    w.residue[center] = product;
}
