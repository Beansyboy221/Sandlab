import { brushFootprint, inBrushCircle } from "../brush-geometry.js";

// Clip before sampling: captured pointers can travel far outside a zoomed canvas.
function clipStroke(w, a, dx, dy, footprint) {
  let start = 0,
    end = 1;
  for (const [position, delta, low, high] of [
    [a.x, dx, -footprint.high - 0.5, w.width - footprint.low - 0.5],
    [a.y, dy, -footprint.high - 0.5, w.height - footprint.low - 0.5],
  ]) {
    if (!delta) {
      if (position < low || position > high) return null;
    } else {
      const t1 = (low - position) / delta,
        t2 = (high - position) / delta;
      start = Math.max(start, Math.min(t1, t2));
      end = Math.min(end, Math.max(t1, t2));
      if (end <= start) return null;
    }
  }
  return [start, end];
}

function stampAir(w, x, y, footprint, shape, dx, dy, power) {
  const f = w.fields,
    cx = Math.round(x),
    cy = Math.round(y);
  const minX = Math.max(0, cx + footprint.low),
    maxX = Math.min(w.width - 1, cx + footprint.high),
    minY = Math.max(0, cy + footprint.low),
    maxY = Math.min(w.height - 1, cy + footprint.high);
  // Each affected air tile gets one deposit, even when it contains many pixels.
  // Find an exposed brush pixel so a wall-covered tile cannot become a source.
  for (let fy = minY >> 2; fy <= maxY >> 2; fy++)
    for (let fx = minX >> 2; fx <= maxX >> 2; fx++) {
      let found = false;
      for (
        let ny = Math.max(minY, fy * 4);
        ny <= Math.min(maxY, fy * 4 + 3) && !found;
        ny++
      )
        for (
          let nx = Math.max(minX, fx * 4);
          nx <= Math.min(maxX, fx * 4 + 3);
          nx++
        ) {
          if (shape === "circle" && !inBrushCircle(footprint, nx - cx, ny - cy))
            continue;
          if (f.blocks(w.cells[ny * w.width + nx])) continue;
          f.airflow.push(f, nx, ny, dx, dy, power);
          found = true;
          break;
        }
    }
}

export function blowBrush(w, a, b, radius, shape = "circle", power = 1) {
  if (
    ![a.x, a.y, b.x, b.y, radius, power].every(Number.isFinite) ||
    radius < 0 ||
    power <= 0
  )
    return;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    distance = Math.hypot(dx, dy);
  if (!distance || !Number.isFinite(distance)) return;
  const footprint = brushFootprint(radius),
    clip = clipStroke(w, a, dx, dy, footprint);
  if (!clip) return;
  const f = w.fields;
  f.configure(w.mechanics);
  if (!f.pressureEnabled) return;
  f.border = w.border;
  f.rebuildBarriers(w);
  const [start, end] = clip,
    length = distance * (end - start),
    steps = Math.max(
      1,
      Math.ceil(length / Math.max(1, Math.min(4, footprint.diameter / 2))),
    );
  // Integrate over distance, not frames or event count. Held brushes add nothing;
  // the existing field carries and dissipates the air already set in motion.
  const impulse = ((power * length) / steps) * 0.4;
  for (let n = 0; n < steps; n++) {
    const t = start + ((end - start) * (n + 0.5)) / steps;
    stampAir(w, a.x + dx * t, a.y + dy * t, footprint, shape, dx, dy, impulse);
  }
}
