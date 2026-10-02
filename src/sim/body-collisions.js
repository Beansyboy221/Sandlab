import { materials } from "./materials.js";
import { emitSpark } from "./sparks.js";
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

export function fracture(solver, i, energy) {
  const w = solver.world;
  if (i < 0) return;
  const m = materials[w.cells[i]];
  if (!m.rigid || m.static) return;
  w.damage[i] += energy;
  if (w.damage[i] < m.toughness) return;
  if (m.breakInto !== undefined) {
    w.transform(i, m.breakInto, w.temp[i]);
    return;
  }
  const id = w.elasticId[i];
  for (const k of solver.locations.values())
    for (let d = 0; d < 4; d++)
      if (k === i || w["bond" + d][k] === id) w["bond" + d][k] = 0;
  w.damage[i] = 0;
  solver.dirty = true;
}
export function collide(solver, body, p, hit, dx, dy) {
  if (hit.internal || hit.i < 0) return;
  const w = solver.world,
    length = Math.hypot(dx, dy);
  if (!length) return;
  const i = hit.i,
    j = hit.j;
  const horizontal = w.index(
      (i % w.width) + Math.sign(dx),
      Math.floor(i / w.width),
    ),
    vertical = w.index(i % w.width, Math.floor(i / w.width) + Math.sign(dy));
  const blockedX = dx && !solver.passable(horizontal, body),
    blockedY = dy && !solver.passable(vertical, body);
  const normalX =
    (blockedX && !blockedY) || (!blockedY && Math.abs(dx) > Math.abs(dy));
  const nx = normalX ? Math.sign(dx) : 0,
    ny = normalX ? 0 : Math.sign(dy),
    rx =
      (ny && hit.count
        ? Math.max(hit.minX - 0.5, Math.min(hit.maxX + 0.5, p.x))
        : (hit.x ?? (i % w.width) + 0.5 + w.offsetX[i])) - p.x,
    ry =
      (nx && hit.count
        ? Math.max(hit.minY - 0.5, Math.min(hit.maxY + 0.5, p.y))
        : (hit.y ?? Math.floor(i / w.width) + 0.5 + w.offsetY[i])) - p.y;
  const other = j >= 0 ? solver.bodyOf.get(w.elasticId[j]) : null,
    op = other && other !== body ? solver.pose(other) : null;
  const closing =
    (p.vx - p.omega * ry - (op?.vx || 0)) * nx +
    (p.vy + p.omega * rx - (op?.vy || 0)) * ny;
  if (closing <= 0) return;
  const lever = rx * ny - ry * nx,
    inverse =
      1 / body.mass +
      (lever * lever) / body.inertia +
      (op ? 1 / other.mass : 0),
    impulse = (closing * 1.08) / inverse;
  p.vx -= (impulse * nx) / body.mass;
  p.vy -= (impulse * ny) / body.mass;
  p.omega = clamp(p.omega - (impulse * lever) / body.inertia, 0.12);
  if (hit.count > 1 && Math.abs(lever) < 0.5) {
    p.omega *= 0.7;
    if (nx) p.vy *= 0.9;
    else p.vx *= 0.9;
  }
  if (op) {
    op.vx += (impulse * nx) / other.mass;
    op.vy += (impulse * ny) / other.mass;
    solver.sync(other, op);
  }
  // Resting contact never accumulates damage. Only energetic, closing impacts
  // fracture brittle surfaces; heavier bodies transfer more energy.
  if (closing > 0.7) {
    const energy = Math.min(
      70,
      (0.5 * closing * closing) /
        inverse /
        Math.max(1, Math.sqrt(body.ids.length)),
    );
    fracture(solver, j, energy);
    fracture(solver, i, energy * 0.35);
    w.fields.add(i % w.width, Math.floor(i / w.width), energy * 0.08);
    if (materials[w.cells[i]].conductive && energy > 5)
      emitSpark(w, i, i % w.width, Math.floor(i / w.width));
  }
  // Loose grains are pushed into nearby free space, never silently deleted.
  if (j >= 0 && materials[w.cells[j]].category === "powder" && closing > 0.15) {
    for (const [sx, sy] of [
      [-ny, nx],
      [ny, -nx],
      [nx, ny],
    ]) {
      const k = w.index(
        (j % w.width) + Math.sign(sx),
        Math.floor(j / w.width) + Math.sign(sy),
      );
      if (k >= 0 && !w.cells[k]) {
        w.swap(j, k);
        break;
      }
    }
  }
}
