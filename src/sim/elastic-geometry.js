// Continuous positions are independent of the occupancy grid used for collisions.
export const elasticX = (w, i) => (i % w.width) + w.offsetX[i] + 0.5;
export const elasticY = (w, i) => Math.floor(i / w.width) + w.offsetY[i] + 0.5;
export function linkDelta(w, i, j, out) {
  let dx = elasticX(w, j) - elasticX(w, i),
    dy = elasticY(w, j) - elasticY(w, i);
  if (w.border === "looping") {
    dx -= Math.round(dx / w.width) * w.width;
    dy -= Math.round(dy / w.height) * w.height;
  }
  out[0] = dx;
  out[1] = dy;
  return out;
}
export function segmentHitsBrush(ax, ay, bx, by, cx, cy, radius, shape) {
  if (shape === "circle") {
    const dx = bx - ax,
      dy = by - ay,
      length2 = dx * dx + dy * dy;
    const t = length2
      ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / length2))
      : 0;
    return (ax + dx * t - cx) ** 2 + (ay + dy * t - cy) ** 2 <= radius * radius;
  }
  // Slab intersection includes a cut that passes through a link's empty midpoint.
  let start = 0,
    end = 1;
  for (let axis = 0; axis < 2; axis++) {
    const a = axis ? ay : ax,
      d = (axis ? by : bx) - a,
      center = axis ? cy : cx;
    if (Math.abs(d) < 1e-9) {
      if (a < center - radius || a > center + radius) return false;
    } else {
      const t1 = (center - radius - a) / d,
        t2 = (center + radius - a) / d;
      start = Math.max(start, Math.min(t1, t2));
      end = Math.min(end, Math.max(t1, t2));
      if (start > end) return false;
    }
  }
  return true;
}
export function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return false;
  const ab = (bx - ax) * (py - ay) - (by - ay) * (px - ax),
    bc = (cx - bx) * (py - by) - (cy - by) * (px - bx),
    ca = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  return area > 0
    ? ab >= 0 && bc >= 0 && ca >= 0
    : ab <= 0 && bc <= 0 && ca <= 0;
}
