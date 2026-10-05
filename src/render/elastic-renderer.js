import { materials } from "../sim/materials.js";
import {
  elasticX,
  elasticY,
  linkDelta,
  pointInTriangle,
} from "../sim/elastic-geometry.js";
const delta = new Float64Array(2);

function paint(w, pixels, x, y, source, colors, highlight = 0) {
  const j = w.index(x, y);
  // Occupied pixels are authoritative: a skin cannot cover grains, liquid or
  // another node whose own pigment/temperature already colors this cell.
  if (j < 0 || w.cells[j]) return;
  const target = j * 4,
    color = source * 3;
  pixels[target] = colors[color] + highlight;
  pixels[target + 1] = colors[color + 1] + highlight;
  pixels[target + 2] = colors[color + 2] + highlight;
  pixels[target + 3] = 255;
}
function line(w, pixels, source, colors, ax, ay, bx, by, highlight) {
  let x = Math.floor(ax),
    y = Math.floor(ay);
  const endX = Math.floor(bx),
    endY = Math.floor(by),
    dx = Math.abs(endX - x),
    dy = -Math.abs(endY - y),
    sx = x < endX ? 1 : -1,
    sy = y < endY ? 1 : -1;
  let error = dx + dy;
  // Segment work is independent of viewport zoom and cannot grow unbounded.
  for (let step = 0; step < 64; step++) {
    paint(w, pixels, x, y, source, colors, highlight);
    if (x === endX && y === endY) break;
    const twice = error * 2;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}
function face(w, pixels, colors, i, j, k) {
  const ax = elasticX(w, i),
    ay = elasticY(w, i);
  linkDelta(w, i, j, delta);
  const bx = ax + delta[0],
    by = ay + delta[1];
  linkDelta(w, i, k, delta);
  const cx = ax + delta[0],
    cy = ay + delta[1],
    tear = materials[w.cells[i]].tearAt;
  if (
    Math.hypot(bx - ax, by - ay) > tear ||
    Math.hypot(cx - ax, cy - ay) > tear * Math.SQRT2 ||
    Math.hypot(cx - bx, cy - by) > tear
  )
    return;
  const left = Math.floor(Math.min(ax, bx, cx)),
    right = Math.floor(Math.max(ax, bx, cx)),
    top = Math.floor(Math.min(ay, by, cy)),
    bottom = Math.floor(Math.max(ay, by, cy));
  if ((right - left + 1) * (bottom - top + 1) > 256) return;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++)
      if (pointInTriangle(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy))
        paint(w, pixels, x, y, i, colors);
}
// Continuous spring geometry becomes cell-aligned color pixels. Nodes retain
// their occupied footprint; links/skins remain visible while stretching/cutting.
export function writeElasticPixels(w, pixels, colors) {
  const { locations, bonds } = w.elastic;
  for (const i of locations.values()) {
    const ax = elasticX(w, i),
      ay = elasticY(w, i),
      m = materials[w.cells[i]];
    for (let d = 0; d < 4; d++) {
      const j = locations.get(bonds[d][i]);
      if (j === undefined) continue;
      linkDelta(w, i, j, delta);
      const dx = delta[0],
        dy = delta[1],
        rest = d < 2 ? 1 : Math.SQRT2,
        stretch = Math.hypot(dx, dy) / rest;
      if (stretch > m.tearAt) continue;
      line(
        w,
        pixels,
        i,
        colors,
        ax,
        ay,
        ax + dx,
        ay + dy,
        Math.min(24, Math.max(0, stretch - 1) * 12),
      );
    }
    const right = locations.get(bonds[0][i]),
      below = locations.get(bonds[1][i]),
      corner = locations.get(bonds[2][i]);
    if (corner === undefined) continue;
    if (right !== undefined && bonds[1][right] === w.elasticId[corner])
      face(w, pixels, colors, i, right, corner);
    if (below !== undefined && bonds[0][below] === w.elasticId[corner])
      face(w, pixels, colors, i, below, corner);
  }
}
