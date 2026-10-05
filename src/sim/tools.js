import { materials } from "./materials.js";
import { brushFootprint, inBrushCircle } from "../brush-geometry.js";
import { blowBrush } from "./air-brush.js";
export { blowBrush } from "./air-brush.js";
export const toolGroups = [
  { name: "Create", tools: ["paint", "fill", "recolor", "erase"] },
  { name: "Arrange", tools: ["select", "grab"] },
  {
    name: "Environment",
    tools: ["warm", "cool", "wind", "pressure", "vacuum"],
  },
  { name: "Inspect & Guide", tools: ["inspect", "eyedropper", "guide"] },
];
export const brushTools = [
  ["paint", "Draw", "brush"],
  ["fill", "Fill", "bucket"],
  ["recolor", "Color", "palette"],
  ["erase", "Erase", "eraser"],
  ["warm", "Warm", "warm"],
  ["cool", "Cool", "cool"],
  ["wind", "Blow", "wind"],
  ["grab", "Grab", "hand"],
  ["select", "Select", "select"],
  ["inspect", "Inspect", "search"],
  ["guide", "Guide", "target"],
  ["eyedropper", "Pick", "eyedropper"],
  ["pressure", "Pressure", "pressure"],
  ["vacuum", "Vacuum", "vacuum"],
];
export function moveBrush(
  w,
  x,
  y,
  radius,
  shape,
  dx,
  dy,
  solids = false,
  carried,
) {
  dx = Math.round(dx);
  dy = Math.round(dy);
  if (!dx && !dy) return;
  if (w.rigid.dirty) w.rigid.rebuild();
  const movedBodies = new Set();
  const cx = Math.round(x),
    cy = Math.round(y);
  // Traverse leading edges first so each particle moves once and packed shapes stay intact.
  const footprint = brushFootprint(radius);
  for (let ay = 0; ay < footprint.diameter; ay++)
    for (let ax = 0; ax < footprint.diameter; ax++) {
      const ox = dx > 0 ? footprint.high - ax : footprint.low + ax,
        oy = dy > 0 ? footprint.high - ay : footprint.low + ay;
      if (shape === "circle" && !inBrushCircle(footprint, ox, oy)) continue;
      const sx = cx + ox,
        sy = cy + oy,
        tx = sx + dx,
        ty = sy + dy;
      if (sx < 0 || sx >= w.width || sy < 0 || sy >= w.height) continue;
      const i = sy * w.width + sx,
        j = w.index(tx, ty),
        m = materials[w.cells[i]];
      if (m.rigid) {
        const body = w.rigid.bodyOf.get(w.elasticId[i]);
        if (body && !movedBodies.has(body)) {
          movedBodies.add(body);
          if (solids) {
            if (w.rigid.translate(body, dx, dy)) carried?.add(body);
          } else {
            const pose = w.rigid.pose(body);
            if (pose) {
              pose.vx += dx / Math.sqrt(body.mass);
              pose.vy += dy / Math.sqrt(body.mass);
              w.rigid.sync(body, pose);
            }
          }
        }
        continue;
      }
      if (
        m.id &&
        !m.static &&
        m.category !== "special" &&
        (solids || m.movable) &&
        (j < 0 ? w.border === "void" : !w.cells[j])
      ) {
        if (j < 0) w.set(i, 0);
        else w.swap(i, j);
      }
    }
}
export function applyTool(
  w,
  tool,
  x,
  y,
  radius,
  shape = "circle",
  dx = 0,
  dy = 0,
  power = 1,
) {
  if (![x, y, radius, dx, dy].every(Number.isFinite)) return;
  if (radius < 0) return;
  if (tool === "wind") {
    blowBrush(
      w,
      { x: x - dx / 2, y: y - dy / 2 },
      { x: x + dx / 2, y: y + dy / 2 },
      radius,
      shape,
      power,
    );
    return;
  }
  const footprint = brushFootprint(radius),
    centerX = Math.round(x) + 0.5 + footprint.center,
    centerY = Math.round(y) + 0.5 + footprint.center;
  if (["pressure", "vacuum"].includes(tool)) {
    w.fields.configure(w.mechanics);
    if (!w.fields.pressureEnabled) return;
    w.fields.border = w.border;
    w.fields.rebuildBarriers(w);
  }
  // Field tools act on entities during their normal integration instead of
  // receiving a second brush-only impulse.
  if (!["pressure", "vacuum"].includes(tool)) {
    w.missiles.brush(
      tool,
      centerX,
      centerY,
      footprint.diameter / 2,
      dx,
      dy,
      power,
      shape,
    );
    w.stickmen.brush(
      tool,
      centerX,
      centerY,
      footprint.diameter / 2,
      dx,
      dy,
      power,
      shape,
    );
  }
  if (tool === "erase-mobile") {
    w.elastic.world = w;
    w.elastic.cutBrush(x, y, radius, shape);
  }
  const cx = Math.round(x),
    cy = Math.round(y);
  for (let oy = footprint.low; oy <= footprint.high; oy++)
    for (let ox = footprint.low; ox <= footprint.high; ox++) {
      if (shape === "circle" && !inBrushCircle(footprint, ox, oy)) continue;
      const nx = cx + ox,
        ny = cy + oy;
      if (nx < 0 || nx >= w.width || ny < 0 || ny >= w.height) continue;
      const i = ny * w.width + nx;
      if (
        (tool === "warm" || tool === "cool") &&
        ((nx % 4 === 0 && ny % 4 === 0) || (ox === 0 && oy === 0))
      )
        w.fields.heat(nx, ny, (tool === "warm" ? 12 : -12) * power);
      if (tool === "erase-mobile") {
        if (
          w.cells[i] &&
          materials[w.cells[i]].movable &&
          !materials[w.cells[i]].rigid
        )
          w.set(i, 0);
      } else if (tool === "pressure" || tool === "vacuum") {
        if ((nx % 4 === 0 && ny % 4 === 0) || (ox === 0 && oy === 0))
          w.fields.add(nx, ny, (tool === "pressure" ? 3 : -3) * power);
      } else if (w.cells[i] && !materials[w.cells[i]].heatSource) {
        if (tool === "warm" || tool === "cool")
          w.temp[i] = Math.max(
            -250,
            Math.min(6000, w.temp[i] + (tool === "warm" ? 12 : -12) * power),
          );
      }
    }
}
export function dragBrush(
  w,
  a,
  b,
  radius,
  shape,
  solids = true,
  elapsed = 1000 / 60,
) {
  const footprint = brushFootprint(radius);
  w.missiles.brush(
    "grab",
    Math.round(a.x) + 0.5 + footprint.center,
    Math.round(a.y) + 0.5 + footprint.center,
    footprint.diameter / 2,
    b.x - a.x,
    b.y - a.y,
    1,
    shape,
  );
  w.stickmen.brush(
    "grab",
    Math.round(a.x) + 0.5 + footprint.center,
    Math.round(a.y) + 0.5 + footprint.center,
    footprint.diameter / 2,
    b.x - a.x,
    b.y - a.y,
    1,
    shape,
  );
  const dx = Math.round(b.x) - Math.round(a.x),
    dy = Math.round(b.y) - Math.round(a.y),
    steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (!steps) return;
  const carried = new Set();
  let px = Math.round(a.x),
    py = Math.round(a.y);
  for (let n = 1; n <= steps; n++) {
    const nx = Math.round(a.x + (dx * n) / steps),
      ny = Math.round(a.y + (dy * n) / steps);
    moveBrush(w, px, py, radius, shape, nx - px, ny - py, solids, carried);
    px = nx;
    py = ny;
  }
  // Carrying uses one-pixel placement steps; throw speed must come from the
  // complete timed stroke rather than its last one-pixel step.
  const gain =
    (0.3 * (1000 / 60)) /
    Math.max(4, Number.isFinite(elapsed) ? elapsed : 1000 / 60);
  for (const body of carried) {
    const p = w.rigid.pose(body);
    if (!p) continue;
    p.vx = Math.max(-2.5, Math.min(2.5, (b.x - a.x) * gain));
    p.vy = Math.max(-2.5, Math.min(2.5, (b.y - a.y) * gain));
    w.rigid.sync(body, p);
  }
}
