import { M, materials } from "./materials.js";
import { PORTAL_COOLDOWN } from "./portals.js";
import { rotateMotion } from "./portal-geometry.js";
import { rayHeading, rayDirections } from "./energy.js";

export function transportParticle(w, i, contact, dx, dy) {
  if (w.portalCooldown[i] || w.elasticId[i] || !materials[w.cells[i]].movable)
    return false;
  const route = w.portals.route(
    contact,
    (i % w.width) + 0.5,
    Math.floor(i / w.width) + 0.5,
    dx,
    dy,
  );
  if (!route) return false;
  const j = w.index(Math.floor(route.x), Math.floor(route.y));
  if (j < 0 || w.cells[j]) return false;
  const vx = w.velocityX[i] || dx,
    vy = w.velocityY[i] || dy;
  w.swap(i, j);
  [w.velocityX[j], w.velocityY[j]] = rotateMotion(route, vx, vy);
  if (materials[w.cells[j]].ray) {
    const [rx, ry] = rayDirections[w.heading[j]];
    w.heading[j] = rayHeading(...rotateMotion(route, rx, ry));
  }
  w.offsetX[j] = w.offsetY[j] = 0;
  w.portalCooldown[j] = PORTAL_COOLDOWN;
  w.movedTo = j;
  return true;
}

export function transportRigid(solver, body, pose, hit) {
  const w = solver.world;
  if (
    hit.internal ||
    hit.j < 0 ||
    w.cells[hit.j] !== M.Portal ||
    w.portalCooldown[solver.locations.get(body.ids[0])]
  )
    return false;
  const route = w.portals.route(
    hit.j,
    pose.x,
    pose.y,
    pose.vx,
    pose.vy,
    body.radius + 0.6,
  );
  if (!route) return false;
  const [vx, vy] = rotateMotion(route, pose.vx, pose.vy);
  const next = {
    ...pose,
    x: route.x,
    y: route.y,
    vx,
    vy,
    angle: pose.angle + Math.atan2(route.sin, route.cos),
  };
  if (
    next.x - body.radius < 0.5 ||
    next.y - body.radius < 0.5 ||
    next.x + body.radius >= w.width - 0.5 ||
    next.y + body.radius >= w.height - 0.5
  )
    return false;
  // Reuse bounded raster reservation and collision checking, without sweeping
  // through the space between portals or recursively pushing other bodies.
  if (solver.plan(body, next, false, true)) return false;
  solver.commit(body, next);
  Object.assign(pose, next);
  for (const id of body.ids)
    w.portalCooldown[solver.locations.get(id)] = PORTAL_COOLDOWN;
  return true;
}

export function portalContact(w, x, y, vx, vy, radius = 0) {
  if (!w.portals.locations.size || !(vx || vy)) return -1;
  const speed = Math.hypot(vx, vy),
    dx = vx / speed,
    dy = vy / speed;
  for (let n = 1; n <= 3; n++) {
    const i = w.index(
      Math.floor(x + (vx * n) / 3 + dx * radius),
      Math.floor(y + (vy * n) / 3 + dy * radius),
    );
    if (i >= 0 && w.cells[i] === M.Portal) return i;
  }
  return -1;
}

const clear = (w, x, y) => {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return false;
  const m = materials[w.cells[Math.floor(y) * w.width + Math.floor(x)]];
  return !m.id || m.gas || m.category === "liquid";
};

export function transportActor(w, a) {
  if (!w.portals.locations.size || (a.portalUntil || 0) > w.tick) return false;
  const cx = a.x[2],
    cy = a.y[2];
  let contact = -1,
    vx = 0,
    vy = 0,
    radius = 1;
  for (let n = 0; n < 9; n++) {
    radius = Math.max(radius, Math.hypot(a.x[n] - cx, a.y[n] - cy) + 1.3);
    if (contact < 0) {
      const dx = a.x[n] - a.px[n] + w.gravityX * 0.12;
      const dy = a.y[n] - a.py[n] + w.gravityY * 0.12;
      contact = portalContact(w, a.x[n], a.y[n], dx, dy, n ? 0.4 : 1.2);
      if (contact >= 0) {
        vx = dx;
        vy = dy;
      }
    }
  }
  if (contact < 0) return false;
  const route = w.portals.route(contact, cx, cy, vx, vy, radius);
  if (!route) return false;
  // Validate the whole ragdoll before moving a single joint.
  for (let n = 0; n < 9; n++) {
    const [dx, dy] = rotateMotion(route, a.x[n] - cx, a.y[n] - cy);
    const x = route.x + dx,
      y = route.y + dy,
      r = n ? 0.4 : 1.2;
    if (
      !clear(w, x, y) ||
      !clear(w, x - r, y) ||
      !clear(w, x + r, y) ||
      !clear(w, x, y - r) ||
      !clear(w, x, y + r)
    )
      return false;
  }
  for (let n = 0; n < 9; n++) {
    const [dx, dy] = rotateMotion(route, a.x[n] - cx, a.y[n] - cy);
    const [px, py] = rotateMotion(route, a.px[n] - cx, a.py[n] - cy);
    a.x[n] = route.x + dx;
    a.y[n] = route.y + dy;
    a.px[n] = route.x + px;
    a.py[n] = route.y + py;
  }
  a.portalUntil = w.tick + PORTAL_COOLDOWN;
  a.grounded = false;
  a.path = [];
  a.goal = null;
  a.replan = 0;
  return true;
}

export function transportMissile(w, a, contact) {
  if ((a.portalUntil || 0) > w.tick) return false;
  const route = w.portals.route(contact, a.x, a.y, a.vx, a.vy, 2.5);
  if (!route) return false;
  for (const [dx, dy] of [
    [0, 0],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ])
    if (!clear(w, route.x + dx, route.y + dy)) return false;
  a.x = route.x;
  a.y = route.y;
  [a.vx, a.vy] = rotateMotion(route, a.vx, a.vy);
  a.angle += Math.atan2(route.sin, route.cos);
  a.portalUntil = w.tick + PORTAL_COOLDOWN;
  a.target = -1;
  return true;
}
