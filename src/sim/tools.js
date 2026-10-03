import { materials, M } from "./materials.js";
export const brushTools = [
  ["paint", "Draw", "brush"],
  ["fill", "Fill", "bucket"],
  ["recolor", "Paint", "palette"],
  ["erase", "Erase", "eraser"],
  ["warm", "Warm", "warm"],
  ["cool", "Cool", "cool"],
  ["fan", "Fan", "fan"],
  ["wind", "Wind", "wind"],
  ["grab", "Grab", "hand"],
  ["select", "Select", "select"],
  ["inspect", "Inspect", "search"],
  ["eyedropper", "Copy", "eyedropper"],
  ["pressure", "Pressure", "pressure"],
  ["vacuum", "Vacuum", "vacuum"],
  ["squeeze", "Squeeze", "squeeze"],
];
export function moveBrush(w, x, y, radius, shape, dx, dy, solids = false) {
  dx = Math.round(dx);
  dy = Math.round(dy);
  if (!dx && !dy) return;
  if (w.rigid.dirty) w.rigid.rebuild();
  const movedBodies = new Set();
  const cx = Math.round(x),
    cy = Math.round(y);
  // Traverse leading edges first so each particle moves once and packed shapes stay intact.
  for (let ay = 0; ay <= radius * 2; ay++)
    for (let ax = 0; ax <= radius * 2; ax++) {
      const ox = dx > 0 ? radius - ax : ax - radius,
        oy = dy > 0 ? radius - ay : ay - radius;
      if (shape === "circle" && ox * ox + oy * oy > radius * radius) continue;
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
          if (solids) w.rigid.translate(body, dx, dy);
          else {
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
  dx = 1,
  dy = 0,
  power = 1,
) {
  if (![x, y, radius, dx, dy].every(Number.isFinite)) return;
  w.missiles.brush(tool, x, y, radius, dx, dy, power, shape);
  w.stickmen.brush(tool, x + 0.5, y + 0.5, radius, dx, dy, power, shape);
  if (tool === "fan") {
    moveBrush(w, x, y, radius, shape, Math.sign(dx), Math.sign(dy));
  }
  if (tool === "erase-mobile") {
    w.elastic.world = w;
    w.elastic.cutBrush(x, y, radius, shape);
  }
  const cx = Math.round(x),
    cy = Math.round(y);
  for (let oy = -radius; oy <= radius; oy++)
    for (let ox = -radius; ox <= radius; ox++) {
      if (shape === "circle" && ox * ox + oy * oy > radius * radius) continue;
      const nx = cx + ox,
        ny = cy + oy;
      if (nx < 0 || nx >= w.width || ny < 0 || ny >= w.height) continue;
      const i = ny * w.width + nx;
      if (
        (tool === "warm" || tool === "cool") &&
        ((nx % 4 === 0 && ny % 4 === 0) || (ox === 0 && oy === 0))
      )
        w.fields.heat(nx, ny, (tool === "warm" ? 12 : -12) * power);
      if (
        (tool === "wind" || tool === "fan") &&
        !w.fields.blocks(w.cells[i]) &&
        ((nx % 4 === 0 && ny % 4 === 0) || (ox === 0 && oy === 0))
      )
        w.fields.airflow.impulse(w.fields, nx, ny, dx, dy, power);
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
      } else if (tool === "squeeze") {
        if (w.cells[i] === M.Sponge) w.cooldown[i] = 20 * power;
      } else if (w.cells[i] && !materials[w.cells[i]].heatSource) {
        if (tool === "warm" || tool === "cool")
          w.temp[i] = Math.max(
            -250,
            Math.min(6000, w.temp[i] + (tool === "warm" ? 12 : -12) * power),
          );
      }
    }
}
export function dragBrush(w, a, b, radius, shape, solids = true) {
  w.missiles.brush(
    "grab",
    a.x + 0.5,
    a.y + 0.5,
    radius,
    b.x - a.x,
    b.y - a.y,
    1,
    shape,
  );
  w.stickmen.brush(
    "grab",
    a.x + 0.5,
    a.y + 0.5,
    radius,
    b.x - a.x,
    b.y - a.y,
    1,
    shape,
  );
  const dx = Math.round(b.x) - Math.round(a.x),
    dy = Math.round(b.y) - Math.round(a.y),
    steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (!steps) return;
  let px = Math.round(a.x),
    py = Math.round(a.y);
  for (let n = 1; n <= steps; n++) {
    const nx = Math.round(a.x + (dx * n) / steps),
      ny = Math.round(a.y + (dy * n) / steps);
    moveBrush(w, px, py, radius, shape, nx - px, ny - py, solids);
    px = nx;
    py = ny;
  }
}
