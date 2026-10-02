import { materials, M } from "./materials.js";
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
function contactOccupancy(solver, owner, material, i) {
  const w = solver.world;
  if (i < 0) return Number(w.border === "solid" && material === M.Wall);
  return owner
    ? Number(solver.bodyOf.get(w.elasticId[i]) === owner)
    : Number(w.cells[i] === material);
}
// Estimate the contour normal rather than treating each stair on a slope as a
// vertical wall. Sparse/ambiguous contacts retain their swept axis normal.
function contactNormal(solver, body, hit, dx, dy) {
  const w = solver.world,
    i = hit.i,
    j = hit.j;
  const horizontal = w.index(
    Math.floor((i % w.width) + 0.5 + w.offsetX[i]) + Math.sign(dx),
    Math.floor(Math.floor(i / w.width) + 0.5 + w.offsetY[i]),
  );
  const vertical = w.index(
    Math.floor((i % w.width) + 0.5 + w.offsetX[i]),
    Math.floor(Math.floor(i / w.width) + 0.5 + w.offsetY[i]) + Math.sign(dy),
  );
  const blockedX = dx && !solver.passable(horizontal, body);
  const blockedY = dy && !solver.passable(vertical, body);
  const normalX =
    hit.axis !== undefined
      ? hit.axis === 0
      : (blockedX && !blockedY) || (!blockedY && Math.abs(dx) > Math.abs(dy));
  let nx = normalX ? (hit.sign ?? Math.sign(dx)) : 0,
    ny = normalX ? 0 : (hit.sign ?? Math.sign(dy));
  if (hit.count > 1 && hit.maxY - hit.minY < 0.001 && dy)
    return { nx: 0, ny: Math.sign(dy) };
  if (hit.count > 1 && hit.maxX - hit.minX < 0.001 && dx)
    return { nx: Math.sign(dx), ny: 0 };
  if (j >= 0) {
    const x = j % w.width,
      y = Math.floor(j / w.width),
      owner = solver.bodyOf.get(w.elasticId[j]),
      material = w.cells[j];
    let sx = 0,
      sy = 0;
    for (let offset = -1; offset <= 1; offset++) {
      const weight = offset === 0 ? 2 : 1;
      sx +=
        weight *
        (contactOccupancy(solver, owner, material, w.index(x + 1, y + offset)) -
          contactOccupancy(
            solver,
            owner,
            material,
            w.index(x - 1, y + offset),
          ));
      sy +=
        weight *
        (contactOccupancy(solver, owner, material, w.index(x + offset, y + 1)) -
          contactOccupancy(
            solver,
            owner,
            material,
            w.index(x + offset, y - 1),
          ));
    }
    const length = Math.hypot(sx, sy);
    // Reject the back of a thin obstacle, or a corner pointing away from impact.
    if (length && sx * nx + sy * ny > 0) {
      nx = sx / length;
      ny = sy / length;
    }
  }
  return { nx, ny };
}
export function collide(solver, body, p, hit, dx, dy, effects = true) {
  if (hit.internal || hit.i < 0 || !Math.hypot(dx, dy)) return;
  const w = solver.world,
    i = hit.i,
    j = hit.j;
  const { nx, ny } = contactNormal(solver, body, hit, dx, dy);
  const tx = -ny,
    ty = nx;
  let cx = hit.x ?? (i % w.width) + 0.5 + w.offsetX[i];
  let cy = hit.y ?? Math.floor(i / w.width) + 0.5 + w.offsetY[i];
  let supportLow = 0,
    supportHigh = 0;
  if (hit.count) {
    // The center of pressure can lie anywhere along a flat support. Projecting
    // the center of mass there keeps balanced shelves stable without freezing spin.
    const low =
      (tx > 0 ? hit.minX : hit.maxX) * tx +
      (ty > 0 ? hit.minY : hit.maxY) * ty -
      0.5;
    const high =
      (tx > 0 ? hit.maxX : hit.minX) * tx +
      (ty > 0 ? hit.maxY : hit.minY) * ty +
      0.5;
    supportLow = low;
    supportHigh = high;
    const shift =
      Math.max(low, Math.min(high, p.x * tx + p.y * ty)) - (cx * tx + cy * ty);
    cx += shift * tx;
    cy += shift * ty;
  }
  const rx = cx - p.x,
    ry = cy - p.y;
  const other = j >= 0 ? solver.bodyOf.get(w.elasticId[j]) : null;
  const op = other && other !== body ? solver.pose(other) : null;
  let ox = op ? cx - op.x : 0,
    oy = op ? cy - op.y : 0;
  if (op && w.border === "looping") {
    ox -= Math.round(ox / w.width) * w.width;
    oy -= Math.round(oy / w.height) * w.height;
  }
  const lever = rx * ny - ry * nx,
    otherLever = ox * ny - oy * nx;
  const closing =
    (p.vx - p.omega * ry - (op ? op.vx - op.omega * oy : 0)) * nx +
    (p.vy + p.omega * rx - (op ? op.vy + op.omega * ox : 0)) * ny;
  if (closing <= 0) return;
  const inverse =
    1 / body.mass +
    (lever * lever) / body.inertia +
    (op ? 1 / other.mass + (otherLever * otherLever) / other.inertia : 0);
  const surface = j >= 0 ? materials[w.cells[j]] : materials[M.Wall];
  const restitution =
    closing > 0.5
      ? Math.min(
          body.restitution,
          op ? other.restitution : (surface.restitution ?? 0.05),
        )
      : 0;
  const impulse = (closing * (1 + restitution)) / inverse;
  p.vx -= (impulse * nx) / body.mass;
  p.vy -= (impulse * ny) / body.mass;
  p.omega -= (impulse * lever) / body.inertia;
  if (op) {
    op.vx += (impulse * nx) / other.mass;
    op.vy += (impulse * ny) / other.mass;
    op.omega += (impulse * otherLever) / other.inertia;
  }
  // Coulomb friction transfers slipping motion into spin. Its energy is bounded
  // by the normal impulse, so round bodies roll while blocks can settle or slide.
  const tangentLever = rx * ty - ry * tx,
    otherTangentLever = ox * ty - oy * tx;
  const slip =
    (p.vx - p.omega * ry - (op ? op.vx - op.omega * oy : 0)) * tx +
    (p.vy + p.omega * rx - (op ? op.vy + op.omega * ox : 0)) * ty;
  const tangentInverse =
    1 / body.mass +
    (tangentLever * tangentLever) / body.inertia +
    (op
      ? 1 / other.mass + (otherTangentLever * otherTangentLever) / other.inertia
      : 0);
  const friction = Math.sqrt(
    body.friction * (op ? other.friction : (surface.friction ?? 0.4)),
  );
  const tangentImpulse = clamp(slip / tangentInverse, friction * impulse);
  p.vx -= (tangentImpulse * tx) / body.mass;
  p.vy -= (tangentImpulse * ty) / body.mass;
  p.omega -= (tangentImpulse * tangentLever) / body.inertia;
  if (op) {
    op.vx += (tangentImpulse * tx) / other.mass;
    op.vy += (tangentImpulse * ty) / other.mass;
    op.omega += (tangentImpulse * otherTangentLever) / other.inertia;
  }
  if (
    hit.count > 1 &&
    (hit.maxY - hit.minY < 0.001 || hit.maxX - hit.minX < 0.001)
  ) {
    // A broad flat support distributes its normal force. Shift its center of
    // pressure to resist pitching from friction, bounded by the actual support
    // span. An overhanging beam or round body's narrow contact can still topple.
    const position = cx * tx + cy * ty;
    const inverseInertia = 1 / body.inertia + (op ? 1 / other.inertia : 0);
    const desired = -(p.omega - (op?.omega || 0)) / (impulse * inverseInertia);
    const shift = Math.max(
      supportLow - position,
      Math.min(supportHigh - position, desired),
    );
    p.omega += (impulse * shift) / body.inertia;
    if (op) op.omega -= (impulse * shift) / other.inertia;
  }
  if (op) solver.sync(other, op);
  if (!effects) return;
  // Resting contact never accumulates damage. Only energetic, closing impacts
  // fracture brittle surfaces; heavier bodies transfer more energy.
  if (closing > 0.4)
    w.sound.emit(
      "impact",
      cx,
      cy,
      Math.min(1.2, closing * Math.sqrt(body.mass) * 0.04),
      body.mass,
    );
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
