import { M, materials } from "./materials.js";
import { elasticX, elasticY, linkDelta } from "./elastic-geometry.js";
const delta = new Float64Array(2);
function colorKey(colors, i, brightness = 0) {
  const offset = i * 3;
  return (
    ((Math.min(255, colors[offset] + brightness) >> 4) << 8) |
    ((Math.min(255, colors[offset + 1] + brightness) >> 4) << 4) |
    (Math.min(255, colors[offset + 2] + brightness) >> 4)
  );
}
const cssColor = (key) =>
  `rgb(${(key >> 8) * 16 + 8},${((key >> 4) & 15) * 16 + 8},${(key & 15) * 16 + 8})`;
function pathFor(groups, key) {
  if (!groups.has(key)) groups.set(key, new Path2D());
  return groups.get(key);
}
function copies(w, x, y, dx, dy, paint) {
  paint(0, 0);
  if (w.border !== "looping") return;
  const sx = x + dx < 0 ? w.width : x + dx > w.width ? -w.width : 0,
    sy = y + dy < 0 ? w.height : y + dy > w.height ? -w.height : 0;
  if (sx) paint(sx, 0);
  if (sy) paint(0, sy);
  if (sx && sy) paint(sx, sy);
}
function triangle(path, w, i, j, k) {
  const x = elasticX(w, i),
    y = elasticY(w, i);
  linkDelta(w, i, j, delta);
  const jx = delta[0],
    jy = delta[1];
  linkDelta(w, i, k, delta);
  const kx = delta[0],
    ky = delta[1],
    max = materials[w.cells[i]].tearAt;
  if (
    Math.hypot(jx, jy) > max ||
    Math.hypot(kx, ky) > max * Math.SQRT2 ||
    Math.hypot(kx - jx, ky - jy) > max
  )
    return;
  copies(
    w,
    x,
    y,
    Math.abs(jx) > Math.abs(kx) ? jx : kx,
    Math.abs(jy) > Math.abs(ky) ? jy : ky,
    (sx, sy) => {
      path.moveTo(x + sx, y + sy);
      path.lineTo(x + jx + sx, y + jy + sy);
      path.lineTo(x + kx + sx, y + ky + sy);
      path.closePath();
    },
  );
}
// Local membrane faces and batched links/joints are drawn at display resolution;
// powder pixels never stand in for elastic nodes.
export function drawElasticBodies(ctx, w, viewport, colors) {
  const { locations, bonds } = w.elastic;
  if (!locations.size) return;
  const links = new Map(),
    joints = new Map();
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    viewport.x,
    viewport.y,
    w.width * viewport.scale,
    w.height * viewport.scale,
  );
  ctx.clip();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.scale, viewport.scale);
  for (const i of locations.values()) {
    const m = materials[w.cells[i]],
      x = elasticX(w, i),
      y = elasticY(w, i),
      color = colorKey(colors, i);
    const corner = locations.get(bonds[2][i]),
      right = locations.get(bonds[0][i]),
      below = locations.get(bonds[1][i]);
    // Intact, compact interior nodes are already covered by membrane faces.
    // Avoid thousands of overlapping round strokes on dense elastic bodies.
    const interior =
      i % w.width > 0 &&
      i >= w.width &&
      right === i + 1 &&
      below === i + w.width &&
      corner === i + w.width + 1 &&
      bonds[0][i - 1] === w.elasticId[i] &&
      bonds[1][i - w.width] === w.elasticId[i] &&
      bonds[2][i - w.width - 1] === w.elasticId[i] &&
      bonds[1][right] === w.elasticId[corner] &&
      bonds[0][below] === w.elasticId[corner];
    if (!interior) {
      const joint = pathFor(joints, color);
      joint.moveTo(x + 0.53, y);
      joint.arc(x, y, 0.53, 0, Math.PI * 2);
    }
    for (let d = 0; d < 4; d++) {
      const j = locations.get(bonds[d][i]);
      if (j === undefined) continue;
      linkDelta(w, i, j, delta);
      const dx = delta[0],
        dy = delta[1],
        rest = d < 2 ? 1 : Math.SQRT2,
        stretch = Math.hypot(dx, dy) / rest;
      if (stretch > m.tearAt || (interior && stretch < 1.15)) continue;
      const thickness = Math.max(
          3,
          Math.min(9, Math.round(8 / Math.sqrt(Math.max(1, stretch)))),
        ),
        highlight = Math.min(24, Math.max(0, stretch - 1) * 12),
        linkColor = colorKey(colors, i, highlight),
        path = pathFor(links, linkColor * 16 + thickness);
      copies(w, x, y, dx, dy, (sx, sy) => {
        path.moveTo(x + sx, y + sy);
        path.lineTo(x + dx + sx, y + dy + sy);
      });
    }
    if (corner !== undefined) {
      // Small local face paths avoid expensive rasterization of one giant mesh
      // path. A cut cannot be covered by a face whose edge no longer exists.
      const upper =
          right !== undefined && bonds[1][right] === w.elasticId[corner],
        lower = below !== undefined && bonds[0][below] === w.elasticId[corner];
      if (upper || lower) {
        ctx.beginPath();
        if (upper) triangle(ctx, w, i, right, corner);
        if (lower) triangle(ctx, w, i, below, corner);
        ctx.fillStyle = cssColor(color);
        ctx.fill();
      }
    }
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [key, path] of links) {
    ctx.strokeStyle = cssColor(Math.floor(key / 16));
    ctx.lineWidth = (key % 16) / 8;
    ctx.stroke(path);
  }
  for (const [color, path] of joints) {
    ctx.fillStyle = cssColor(color);
    ctx.fill(path);
  }
  ctx.restore();
}
export function drawBubbles(ctx, w) {
  ctx.beginPath();
  let count = 0;
  for (let i = 0; i < w.length && count < 3000; i++)
    if (w.cells[i] === M.Bubble) {
      const x = (i % w.width) + 0.5,
        y = Math.floor(i / w.width) + 0.5,
        r = 0.65 + (w.variant[i] / 255) * 0.6;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      count++;
    }
  if (count) {
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = "#e1f5ff";
    ctx.stroke();
  }
}
