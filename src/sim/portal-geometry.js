const normals = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function exitFace(portals, shape) {
  if (shape.facing !== 7) return shape.facing / 2;
  const w = portals.world;
  if (shape.normalTick === w.tick) return shape.normal;
  const axis = shape.bottom - shape.top > shape.right - shape.left ? 0 : 1;
  let best = axis,
    score = -Infinity;
  for (const face of [axis, axis + 2]) {
    const [nx, ny] = normals[face],
      cells = shape.faces[face];
    // Sample a bounded number of opening cells, once per portal per tick.
    let open = -(nx * w.gravityX + ny * w.gravityY) * 0.01;
    for (
      let n = 0;
      n < cells.length;
      n += Math.max(1, Math.ceil(cells.length / 16))
    ) {
      const i = cells[n];
      if (i < 0) continue;
      const j = w.index((i % w.width) + nx, Math.floor(i / w.width) + ny);
      if (j >= 0 && !w.cells[j]) open++;
    }
    if (open > score) {
      score = open;
      best = face;
    }
  }
  shape.normalTick = w.tick;
  return (shape.normal = best);
}

export function portalRoute(portals, i, x, y, vx, vy, clearance) {
  const w = portals.world,
    source = portals.shapes.get(w.portalId[i]);
  const target = source && portals.shapes.get(source.link);
  if (!target || !source.link || !(vx || vy)) return null;
  let face;
  if (source.facing !== 7) face = source.facing / 2;
  else {
    const axis =
      source.bottom - source.top > source.right - source.left ? 0 : 1;
    face = axis + ((axis ? vy : vx) > 0 ? 2 : 0);
  }
  const [sx, sy] = normals[face];
  if (vx * sx + vy * sy >= -0.00001) return null;
  const out = exitFace(portals, target),
    [nx, ny] = normals[out];
  // A proper rotation maps inward entry motion to outward exit motion.
  // Angular momentum and the handedness of bodies remain intact.
  const cos = -sx * nx - sy * ny,
    sin = sy * nx - sx * ny;
  const tangent = nx
    ? cos * (y - source.y) + sin * (x - source.x)
    : cos * (x - source.x) - sin * (y - source.y);
  const inputSpan = sx
    ? source.bottom - source.top + 1
    : source.right - source.left + 1;
  const outputSpan = nx
    ? target.bottom - target.top + 1
    : target.right - target.left + 1;
  if (
    clearance > 0.5 &&
    (clearance * 2 > inputSpan + 1 || clearance * 2 > outputSpan + 1)
  )
    return null;
  const coordinate =
    (nx ? target.y : target.x) + (tangent * outputSpan) / inputSpan;
  const cells = target.faces[out],
    start = nx ? target.top : target.left;
  const n = clamp(Math.floor(coordinate) - start, 0, cells.length - 1),
    cell = cells[n];
  if (cell < 0) return null;
  const bx = (cell % w.width) + 0.5,
    by = Math.floor(cell / w.width) + 0.5;
  // Never search through a wall at the exit. The immediately outside cell
  // must be open even when a larger object needs extra clearance.
  const opening = w.index(Math.floor(bx + nx), Math.floor(by + ny));
  if (opening < 0 || w.cells[opening]) return null;
  for (let step = 2; step <= Math.floor(clearance + 0.51); step++) {
    const j = w.index(Math.floor(bx + nx * step), Math.floor(by + ny * step));
    if (j < 0 || w.cells[j]) return null;
  }
  return {
    x: bx + nx * (clearance + 0.51),
    y: by + ny * (clearance + 0.51),
    cos,
    sin,
    nx,
    ny,
    source,
    target,
  };
}

export function rotateMotion(route, x, y) {
  return [route.cos * x - route.sin * y, route.sin * x + route.cos * y];
}
