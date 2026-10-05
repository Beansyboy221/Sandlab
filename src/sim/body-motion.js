import { airStress } from "./body-stress.js";
import { collisionLimits } from "./collision-limits.js";
import { materials, M } from "./materials.js";
import { collide, fracture } from "./body-collisions.js";
import { transportRigid } from "./portal-transport.js";
const clamp = (v, max) => Math.max(-max, Math.min(max, v));
const neighbors = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
function rollAtContact(solver, body, p, dt, gravity) {
  const w = solver.world;
  const next = {
    ...p,
    x: p.x + p.vx * dt,
    y: p.y + p.vy * dt,
    angle: p.angle + p.omega * dt,
  };
  const hit = solver.plan(body, next);
  if (hit) {
    if (
      hit.internal ||
      hit.i < 0 ||
      hit.others?.length ||
      hit.depth > Math.abs(p.omega * dt) * body.radius + 1e-5
    )
      return false;
    // Project a rotating corner out of the contact face. Pure raster rejection
    // would block spin forever on the tiny steps of a round, painted outline.
    const correction = hit.depth + 2e-6;
    if (hit.axis === 0) next.x -= hit.sign * correction;
    else next.y -= hit.sign * correction;
    w.environment.sample(p.x, p.y);
    const potential = Math.max(
      0,
      -body.mass *
        gravity *
        ((next.x - p.x - p.vx * dt) * w.environment.x +
          (next.y - p.y - p.vy * dt) * w.environment.y),
    );
    const kinetic =
      0.5 *
      (body.mass * (p.vx * p.vx + p.vy * p.vy) +
        body.inertia * p.omega * p.omega);
    if (potential >= kinetic || solver.plan(body, next)) return false;
    // Climbing a polygon corner consumes kinetic energy rather than adding a
    // free lift. Gravity remains responsible for accelerating a rolling slope.
    const loss = Math.sqrt(1 - potential / kinetic);
    next.vx *= loss;
    next.vy *= loss;
    next.omega *= loss;
  }
  solver.commit(body, next, false);
  Object.assign(p, next);
  return true;
}

export function stepBodies(solver) {
  const w = solver.world;
  if (solver.dirty) solver.rebuild();
  solver.collidedBodies.clear();
  solver.impactDamage.clear();
  for (const key of Object.keys(solver.work)) solver.work[key] = 0;
  for (const body of solver.bodies) {
    body.plans = 0;
    body.motion = solver.pose(body);
  }
  solver.solving = true;
  // Vacate the leading bodies first, as the particle grid already does for
  // powders. Drawing order must not turn a moving lower body into a false wall.
  solver.bodies.sort((a, b) => {
    const depthA = a.motion
      ? a.motion.x * w.gravityX + a.motion.y * w.gravityY
      : -Infinity;
    const depthB = b.motion
      ? b.motion.x * w.gravityX + b.motion.y * w.gravityY
      : -Infinity;
    return depthB - depthA || a.ids[0] - b.ids[0];
  });
  w.fields.beginForceSample();
  for (const body of solver.bodies) {
    const p = body.motion;
    if (!p) continue;
    let liquid = 0,
      contacts = 0,
      pressureX = 0,
      pressureY = 0,
      pressureTorque = 0,
      rooted = false;
    for (const id of body.edges) {
      const i = solver.locations.get(id);
      // An earlier body can cut this body during the same tick. Surviving nodes
      // keep their cached motion; topology is rebuilt outside the active contact pass.
      if (i === undefined) continue;
      const x = i % w.width,
        y = Math.floor(i / w.width);
      w.fields.surfaceForce(w, i);
      pressureX += w.fields.forceX;
      pressureY += w.fields.forceY;
      pressureTorque +=
        (x + w.offsetX[i] - p.x) * w.fields.forceY -
        (y + w.offsetY[i] - p.y) * w.fields.forceX;
      const m = materials[w.cells[i]],
        strength = m.compressiveStrength * (1.4 - m.brittleness);
      if (
        m.brittleness &&
        w.fields.surfaceStress > strength &&
        (w.tick + i) % 3 === 0 &&
        w.fields.stressWrites < 128
      ) {
        w.fields.stressWrites++;
        solver.queueFracture(i, (w.fields.surfaceStress - strength) * 0.03);
      }
      for (const [dx, dy] of neighbors) {
        const j = w.index(x + dx, y + dy);
        if (j < 0 || solver.bodyOf.get(w.elasticId[j]) === body) continue;
        contacts++;
        if (materials[w.cells[j]].category === "liquid")
          liquid += materials[w.cells[j]].density;
        if (m.rooted && (w.cells[j] === M.Dirt || w.cells[j] === M.Mud))
          rooted = true;
      }
    }
    if (rooted) {
      p.vx = p.vy = p.omega = 0;
      continue;
    }
    airStress(solver, body, p);
    const buoyancy = contacts
        ? liquid / contacts / (body.mass / body.volume)
        : 0,
      gravity = 0.16 * (1 - buoyancy),
      drag = liquid ? 0.96 : 0.999;
    w.environment.sample(p.x, p.y);
    const localX = w.environment.x,
      localY = w.environment.y;
    p.vx = clamp(
      (p.vx + gravity * localX + (pressureX * 0.012) / body.mass) * drag,
      2.5,
    );
    p.vy = clamp(
      (p.vy + gravity * localY + (pressureY * 0.012) / body.mass) * drag,
      2.5,
    );
    p.omega = clamp(
      (p.omega + (pressureTorque * 0.012) / body.inertia) * 0.995,
      Math.min(0.25, 1.5 / Math.max(1, body.radius)),
    );
    const steps = Math.max(
        1,
        Math.min(
          collisionLimits.substeps,
          Math.ceil(
            (Math.hypot(p.vx, p.vy) + Math.abs(p.omega) * body.radius) / 0.4,
          ),
        ),
      ),
      dt = 1 / steps;
    for (let n = 0; n < steps; n++) {
      const next = {
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          angle: p.angle + p.omega * dt,
        },
        hit = solver.plan(body, next);
      if (!hit) {
        solver.commit(body, next, false);
        Object.assign(p, next);
      } else {
        if (transportRigid(solver, body, p, hit)) break;
        if (!hit.internal && hit.i >= 0) solver.collidedBodies.add(body.ids[0]);
        let yielded = false;
        for (let c = 0; c <= (hit.others?.length || 0); c++) {
          const contact = c ? hit.others[c - 1] : hit;
          yielded =
            collide(
              solver,
              body,
              p,
              contact,
              p.vx - p.omega * ((contact.y ?? p.y) - p.y),
              p.vy + p.omega * ((contact.x ?? p.x) - p.x),
            ) === true;
          if (yielded || solver.dirty) break;
        }
        if (yielded) {
          const advance = {
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            angle: p.angle + p.omega * dt,
          };
          if (!solver.plan(body, advance)) {
            solver.commit(body, advance, false);
            Object.assign(p, advance);
          }
          if (solver.dirty) break;
          continue;
        }
        if (solver.dirty) break;
        if (
          Math.abs(p.omega) > 1e-5 &&
          rollAtContact(solver, body, p, dt, gravity)
        )
          continue;
        // Tangential motion and rotation remain live at contact, allowing a
        // supported beam to topple instead of becoming an immobile pile.
        for (const axis of ["x", "y", "angle"]) {
          const amount =
            (axis === "x" ? p.vx : axis === "y" ? p.vy : p.omega) * dt;
          if (Math.abs(amount) < 0.00001) continue;
          const slide = { ...p, [axis]: p[axis] + amount };
          if (!solver.plan(body, slide)) {
            solver.commit(body, slide, false);
            Object.assign(p, slide);
          }
        }
      }
    }
  }
  stabilizeSupports(solver);
  // Every body's motion is read once and written once, irrespective of the
  // number of neighbors. Impulses update the cached poses during all passes.
  for (const body of solver.bodies)
    if (body.motion) solver.sync(body, body.motion);
  if (solver.impactDamage.size) {
    if (solver.connections.dirty) solver.connections.rebuild();
    for (const [id, energy] of solver.impactDamage) {
      const i = solver.locations.get(id);
      if (i !== undefined) fracture(solver, i, energy);
    }
  }
  solver.solving = false;
}

function stabilizeSupports(solver) {
  // Void exits can remove topology mid-pass. Rebuild once next tick, after
  // flushing the surviving cached velocities, rather than restarting contacts.
  if (solver.dirty || solver.bodies.length < 2) return;
  const w = solver.world,
    contacts = [];
  for (const body of solver.bodies) {
    if (!solver.collidedBodies.has(body.ids[0])) continue;
    const p = solver.motionPose(body);
    if (!p) continue;
    w.environment.sample(p.x, p.y);
    const hit = solver.plan(
      body,
      {
        ...p,
        x: p.x + w.environment.x * 0.05 + p.vx * 0.01,
        y: p.y + w.environment.y * 0.05 + p.vy * 0.01,
      },
      true,
    );
    if (hit && !hit.internal && hit.i >= 0) contacts.push({ body, hit });
  }
  // Sequential impulse relaxation transmits weight through stacks. These passes
  // change velocity only; geometry, chemistry and damage already advanced once.
  for (let pass = 0; pass < collisionLimits.supportPasses; pass++)
    for (const { body, hit } of contacts) {
      const p = solver.motionPose(body);
      if (!p) continue;
      for (let c = 0; c <= (hit.others?.length || 0); c++) {
        const contact = c ? hit.others[c - 1] : hit;
        collide(
          solver,
          body,
          p,
          contact,
          p.vx - p.omega * (contact.y - p.y),
          p.vy + p.omega * (contact.x - p.x),
          false,
        );
      }
    }
}
