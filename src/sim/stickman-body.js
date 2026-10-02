import { materials, M } from "./materials.js";

import { actorProfile, humanProfile } from "./creature-profiles.js";
export const restX = humanProfile.x;
export const restY = humanProfile.y;
export const links = humanProfile.links;
export const lengths = humanProfile.lengths;
export const bodyFields = ["x", "y", "px", "py", "heat", "fuel"];
const clamp = (v, max) => Math.max(-max, Math.min(max, v));
const heatDirections = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const motorNodes = [0, 1, 3, 4, 5, 6, 7, 8];

export function blocked(w, x, y) {
  const i = w.index(Math.floor(x), Math.floor(y));
  if (i < 0) return w.border === "solid";
  const m = materials[w.cells[i]];
  return !!m.id && !m.gas && m.category !== "liquid" && !m.actor;
}

function collide(w, a, n, x, y, maxStep = 0.5) {
  let nx = a.x[n],
    ny = a.y[n];
  const steps = Math.max(1, Math.ceil(Math.hypot(x - nx, y - ny) / maxStep));
  const dx = (x - nx) / steps,
    dy = (y - ny) / steps;
  const radius = n === 0 ? actorProfile(a.material).headRadius : 0.4;
  for (let s = 0; s < steps; s++) {
    if (
      !blocked(w, nx + dx + Math.sign(dx) * radius, ny) &&
      !blocked(w, nx + dx + Math.sign(dx) * radius, ny - radius) &&
      !blocked(w, nx + dx + Math.sign(dx) * radius, ny + radius)
    )
      nx += dx;
    else if (dx * w.gravityX > 0 && (n === 5 || n === 6)) a.grounded = true;
    if (
      !blocked(w, nx, ny + dy + Math.sign(dy) * radius) &&
      !blocked(w, nx - radius, ny + dy + Math.sign(dy) * radius) &&
      !blocked(w, nx + radius, ny + dy + Math.sign(dy) * radius)
    )
      ny += dy;
    else if (dy * w.gravityY > 0 && (n === 5 || n === 6)) a.grounded = true;
  }
  a.x[n] = nx;
  a.y[n] = ny;
}

export function integrateBody(
  w,
  a,
  drive = 0,
  jump = false,
  crouch = false,
  lift = 0,
) {
  const profile = actorProfile(a.material),
    { links, lengths, x: restX, y: restY } = profile;
  const gx = w.gravityX,
    gy = w.gravityY,
    grounded = a.grounded,
    foot5x = a.x[5],
    foot5y = a.y[5],
    foot6x = a.x[6],
    foot6y = a.y[6];
  a.grounded = false;
  a.cooldown = Math.max(0, a.cooldown - 1);
  if (a.alive && grounded && jump && !a.cooldown) {
    for (let n = 0; n < 9; n++) {
      const tangent = (a.x[n] - a.px[n]) * gy - (a.y[n] - a.py[n]) * gx;
      a.px[n] = a.x[n] - gy * tangent + gx * profile.jump;
      a.py[n] = a.y[n] + gx * tangent + gy * profile.jump;
    }
    a.cooldown = profile.mode === "hop" ? 40 : 25;
  }
  for (let n = 0; n < 9; n++) {
    let i = w.index(Math.floor(a.x[n]), Math.floor(a.y[n]));
    // Moving raster bodies can enter a joint between actor steps. Resolve that
    // penetration and transfer their momentum before the swept node collision.
    if (i >= 0 && blocked(w, a.x[n], a.y[n])) {
      const impact = Math.hypot(w.velocityX[i], w.velocityY[i]);
      a.health -= Math.max(0, impact - 0.5) * materials[w.cells[i]].density * 2;
      if (impact > 2.4)
        for (let k = 0; k < links.length; k++)
          if (links[k].includes(n)) a.bonds[k] = 0;
      let found = false;
      for (let r = 1; r <= 5 && !found; r++)
        for (const [dx, dy] of heatDirections) {
          const x = a.x[n] + dx * r,
            y = a.y[n] + dy * r;
          if (!blocked(w, x, y)) {
            a.x[n] = x;
            a.y[n] = y;
            a.px[n] = x - w.velocityX[i] * 0.6;
            a.py[n] = y - w.velocityY[i] * 0.6;
            found = true;
            break;
          }
        }
      i = w.index(Math.floor(a.x[n]), Math.floor(a.y[n]));
    }
    const liquid = i >= 0 && materials[w.cells[i]].category === "liquid";
    let vx = clamp((a.x[n] - a.px[n]) * (liquid ? 0.72 : 0.985), 3);
    let vy = clamp((a.y[n] - a.py[n]) * (liquid ? 0.72 : 0.985), 3);
    if (grounded && (n === 5 || n === 6)) {
      const tangent = (vx * gy - vy * gx) * 0.55;
      vx -= tangent * gy;
      vy += tangent * gx;
    }
    if (a.alive && a.bonds[0] && a.bonds[1]) {
      const swimming = profile.mode === "swim" && a.submerged;
      const flying = profile.mode === "fly" && !liquid;
      const steering = grounded || swimming || flying || drive;
      if (steering && (profile.mode !== "swim" || swimming)) {
        const tangent = vx * gy - vy * gx;
        const speed = profile.speed * (crouch ? 0.5 : 1);
        const force = clamp(
          drive * speed - tangent,
          profile.acceleration * (grounded || swimming || flying ? 1 : 0.3),
        );
        vx += gy * force;
        vy -= gx * force;
      }
      if (swimming || flying) {
        const vertical = vx * gx + vy * gy;
        const force =
          -(liquid ? 0.025 : 0.12) +
          clamp(lift - vertical, profile.acceleration);
        vx += gx * force;
        vy += gy * force;
      }
    }
    const contact = w.index(Math.floor(a.x[n] + vx), Math.floor(a.y[n] + vy));
    if (
      contact >= 0 &&
      materials[w.cells[contact]].rigid &&
      Math.hypot(vx, vy) > 0.2
    ) {
      const body = w.rigid.bodyOf.get(w.elasticId[contact]),
        pose = body && w.rigid.pose(body);
      if (pose) {
        pose.vx += (vx * 3) / body.mass;
        pose.vy += (vy * 3) / body.mass;
        w.rigid.sync(body, pose);
      }
    }
    const f = w.fields.index(
      Math.max(0, Math.min(w.width - 1, a.x[n])),
      Math.max(0, Math.min(w.height - 1, a.y[n])),
    );
    const px = w.fields.pressure[f];
    if (Math.abs(px) > 2) {
      vx +=
        clamp(
          w.fields.sample(a.x[n] - 2, a.y[n]) -
            w.fields.sample(a.x[n] + 2, a.y[n]),
          4,
        ) * 0.045;
      vy +=
        clamp(
          w.fields.sample(a.x[n], a.y[n] - 2) -
            w.fields.sample(a.x[n], a.y[n] + 2),
          4,
        ) * 0.045;
      a.health -= Math.max(0, Math.abs(px) - 10) * 0.05;
    }
    a.px[n] = a.x[n];
    a.py[n] = a.y[n];
    collide(
      w,
      a,
      n,
      a.x[n] + vx + gx * (liquid ? 0.025 : 0.12),
      a.y[n] + vy + gy * (liquid ? 0.025 : 0.12),
    );
    const impact =
      Math.hypot(vx, vy) - Math.hypot(a.x[n] - a.px[n], a.y[n] - a.py[n]);
    if (impact > 1.8) a.health -= (impact - 1.8) * (n === 0 ? 5 : 1);
    if (i >= 0) {
      const m = materials[w.cells[i]],
        air = w.fields.temperature[f];
      a.heat[n] +=
        ((m.id ? w.temp[i] : air) - a.heat[n]) * (m.id ? 0.07 : 0.004);
      for (const [dx, dy] of heatDirections) {
        const j = w.index(Math.floor(a.x[n]) + dx, Math.floor(a.y[n]) + dy);
        if (j >= 0 && (w.cells[j] === M.Fire || w.temp[j] > 160))
          a.heat[n] += (w.temp[j] - a.heat[n]) * 0.04;
      }
      if (m.acidic) {
        a.fuel[n] = Math.max(0, a.fuel[n] - 2);
        a.health -= 1;
      }
      if (w.charge[i]) a.health -= 2;
      if (n === 0 && liquid && profile.mode !== "swim") a.health -= 0.15;
      if (n === 0 && profile.mode === "swim" && !a.submerged) a.health -= 0.12;
    }
    if (a.heat[n] > 180 && a.fuel[n] > 0) {
      a.fuel[n] = Math.max(0, a.fuel[n] - 0.7);
      a.heat[n] = Math.max(260, a.heat[n]);
      a.health -= 0.4;
      if ((w.tick + n) % 12 === 0) {
        const j = w.index(Math.floor(a.x[n]) - gx, Math.floor(a.y[n]) - gy);
        if (j >= 0 && !w.cells[j]) w.set(j, w.tick % 24 ? M.Fire : M.Smoke);
        w.fields.add(a.x[n], a.y[n], 0.1);
      }
    } else if (a.heat[n] > 70) a.health -= (a.heat[n] - 70) * 0.0007;
  }
  // Measure external motion before pose projection. Motor corrections must not
  // masquerade as an impulse that breaks a planted foot's static contact.
  const motion5 = Math.hypot(a.x[5] - foot5x, a.y[5] - foot5y);
  const motion6 = Math.hypot(a.x[6] - foot6x, a.y[6] - foot6y);
  // Internal pose motors exchange momentum with the hips; dead or disconnected
  // limbs have no motors and remain freely simulated ragdoll bodies.
  if (a.alive && a.bonds[0] && a.bonds[1]) {
    if (grounded && drive && !jump && !a.cooldown && profile.stepHeight) {
      stepFoot(w, a, 5, drive, profile.stepHeight);
      stepFoot(w, a, 6, drive, profile.stepHeight);
    }
    if (a.grounded && profile.mode !== "swim" && profile.mode !== "fly") {
      let support = Infinity;
      for (const n of [5, 6])
        if (
          a.bonds[n === 5 ? 4 : 6] &&
          a.bonds[n === 5 ? 5 : 7] &&
          blocked(w, a.x[n] + gx * 0.8, a.y[n] + gy * 0.8)
        )
          support = Math.min(
            support,
            a.x[n] * gx +
              a.y[n] * gy -
              (restY[n] - restY[2]) * (crouch ? 0.65 : 1),
          );
      if (Number.isFinite(support)) {
        const force = clamp((support - a.x[2] * gx - a.y[2] * gy) * 0.15, 0.3);
        collide(w, a, 2, a.x[2] + gx * force, a.y[2] + gy * force);
      }
    }
    for (let n of motorNodes) {
      if ((n === 3 && !a.bonds[2]) || (n === 4 && !a.bonds[3])) continue;
      if (
        ((n === 5 || n === 7) && (!a.bonds[4] || !a.bonds[5])) ||
        ((n === 6 || n === 8) && (!a.bonds[6] || !a.bonds[7]))
      )
        continue;
      const strength = n >= 5 ? 0.3 : 0.09;
      const step =
        a.grounded && drive && (n === 5 || n === 6)
          ? Math.sin(w.tick * 0.16) * (n === 5 ? 0.6 : -0.6)
          : 0;
      const ry =
        (restY[n] - restY[2]) * (crouch ? 0.65 : 1) +
        (profile.mode === "fly" && n === 3 ? Math.sin(w.tick * 0.32) * 1.2 : 0);
      const dx =
        (a.x[2] +
          gy *
            ((restX[n] - restX[2]) *
              (profile === humanProfile ? 1 : a.direction) +
              step) +
          gx * ry -
          a.x[n]) *
        strength;
      const dy =
        (a.y[2] -
          gx *
            ((restX[n] - restX[2]) *
              (profile === humanProfile ? 1 : a.direction) +
              step) +
          gy * ry -
          a.y[n]) *
        strength;
      collide(w, a, n, a.x[n] + dx, a.y[n] + dy);
      collide(w, a, 2, a.x[2] - dx / 4, a.y[2] - dy / 4);
    }
  }
  for (let pass = 0; pass < 6; pass++)
    for (let k = 0; k < links.length; k++) {
      if (!a.bonds[k]) continue;
      const [u, v] = links[k],
        dx = a.x[v] - a.x[u],
        dy = a.y[v] - a.y[u],
        d = Math.hypot(dx, dy);
      if (d > lengths[k] * 2.4 || a.fuel[u] < 25 || a.fuel[v] < 25) {
        a.bonds[k] = 0;
        continue;
      }
      const correction = ((d - lengths[k]) / Math.max(0.001, d)) * 0.48;
      collide(w, a, u, a.x[u] + dx * correction, a.y[u] + dy * correction);
      collide(w, a, v, a.x[v] - dx * correction, a.y[v] - dy * correction);
    }
  // Pose and link projection run after integration, and can reintroduce a small
  // sideways velocity after contact friction. Resolve static foot grip last.
  if (
    a.alive &&
    a.grounded &&
    !drive &&
    !jump &&
    a.bonds[0] &&
    a.bonds[1] &&
    (profile.mode === "walk" || profile.mode === "hop")
  ) {
    // Two feet support the body's nine joints. Static contact must resist the
    // pose motors on uneven ground, rather than only the steering acceleration.
    const floor5 = footSurface(w, foot5x, foot5y);
    const floor6 = footSurface(w, foot6x, foot6y);
    const uneven =
      Number.isFinite(floor5) &&
      Number.isFinite(floor6) &&
      Math.abs(floor5 - floor6) > 0.5;
    const friction = uneven
      ? Math.max(profile.acceleration, (0.12 * 9 * 0.4) / 2)
      : profile.acceleration;
    const planted5 = gripFoot(
      w,
      a,
      5,
      foot5x,
      foot5y,
      motion5,
      friction,
      uneven,
    );
    const planted6 = gripFoot(
      w,
      a,
      6,
      foot6x,
      foot6y,
      motion6,
      friction,
      uneven,
    );
    // Transmit resting contact damping to the torso after link projection.
    // Larger external impulses still retain their momentum.
    if (uneven && (planted5 || planted6))
      for (let n = 0; n < 3; n++) {
        const tangent = (a.x[n] - a.px[n]) * gy - (a.y[n] - a.py[n]) * gx;
        if (Math.abs(tangent) <= friction) {
          a.px[n] += gy * tangent * 0.5;
          a.py[n] -= gx * tangent * 0.5;
        }
      }
  }
  a.health = Math.max(0, a.health);
  if (!a.health || !a.bonds[0] || !a.bonds[1]) a.alive = false;
}

// Lift a grounded foot onto a nearby low ledge. The space above the foot and
// the landing must both be clear; a vertical wall offers no reachable foothold.
function stepFoot(w, a, n, drive, height) {
  const first = n === 5 ? 4 : 6;
  if (!a.bonds[first] || !a.bonds[first + 1]) return;
  const gx = w.gravityX,
    gy = w.gravityY;
  const x = a.x[n],
    y = a.y[n];
  if (!blocked(w, x + gx * 0.8, y + gy * 0.8)) return;
  const tx = gy * Math.sign(drive),
    ty = -gx * Math.sign(drive);
  const aheadX = x + tx * 0.8,
    aheadY = y + ty * 0.8;
  if (!blocked(w, aheadX, aheadY)) return;
  for (let rise = 0.5; rise <= height; rise += 0.5) {
    const nx = x - gx * rise,
      ny = y - gy * rise;
    if (!clearNode(w, nx, ny)) return;
    const lx = aheadX - gx * rise,
      ly = aheadY - gy * rise;
    if (!clearNode(w, lx, ly) || !blocked(w, lx + gx * 0.9, ly + gy * 0.9))
      continue;
    // A foothold under a low roof must not pull the torso into that roof.
    for (let up = 0.5; up <= rise; up += 0.5)
      for (let joint = 0; joint < 3; joint++)
        if (
          !clearNode(
            w,
            a.x[joint] - gx * up,
            a.y[joint] - gy * up,
            joint === 0 ? actorProfile(a.material).headRadius : 0.4,
          )
        )
          return;
    collide(w, a, n, nx, ny);
    collide(w, a, n, lx, ly);
    // A pose correction is a step, not an upward launch.
    a.px[n] += a.x[n] - x;
    a.py[n] += a.y[n] - y;
    return;
  }
}

function clearNode(w, x, y, radius = 0.4) {
  return (
    !blocked(w, x - radius, y - radius) &&
    !blocked(w, x + radius, y - radius) &&
    !blocked(w, x - radius, y + radius) &&
    !blocked(w, x + radius, y + radius)
  );
}

function footSurface(w, x, y) {
  const gx = w.gravityX,
    gy = w.gravityY;
  for (let distance = 0.4; distance <= 3.4; distance += 0.5) {
    const sx = x + gx * distance,
      sy = y + gy * distance;
    if (blocked(w, sx, sy))
      return (
        Math.floor(sx) * gx + Math.floor(sy) * gy - (gx < 0 || gy < 0 ? 1 : 0)
      );
  }
  return Infinity;
}

function gripFoot(w, a, n, x, y, motion, friction, uneven) {
  const first = n === 5 ? 4 : 6;
  if (!a.bonds[first] || !a.bonds[first + 1]) return;
  const gx = w.gravityX,
    gy = w.gravityY;
  const slip = (a.x[n] - x) * gy - (a.y[n] - y) * gx;
  if ((uneven ? motion : Math.abs(slip)) > friction) return;
  const sx = uneven ? x : a.x[n],
    sy = uneven ? y : a.y[n];
  const i = w.index(Math.floor(sx + gx * 0.8), Math.floor(sy + gy * 0.8));
  if (
    !blocked(w, sx + gx * 0.8, sy + gy * 0.8) ||
    (uneven && !clearNode(w, x, y))
  )
    return;
  // A moving support or an external impulse must still be able to move a body.
  if (i >= 0 && Math.hypot(w.velocityX[i], w.velocityY[i]) > 0.001) return;
  if (!uneven) {
    collide(w, a, n, a.x[n] - gy * slip, a.y[n] + gx * slip);
    const tangent = (a.x[n] - a.px[n]) * gy - (a.y[n] - a.py[n]) * gx;
    a.px[n] += gy * tangent;
    a.py[n] -= gx * tangent;
    return true;
  }
  const vertical = (x - a.x[n]) * gx + (y - a.y[n]) * gy;
  collide(w, a, n, a.x[n] + gx * vertical, a.y[n] + gy * vertical);
  collide(w, a, n, x, y);
  // Pose projection can lift a supported foot slightly off a stair. Settle
  // that contact before zeroing its velocity, so grip doesn't flicker on/off.
  collide(w, a, n, a.x[n] + gx * 0.8, a.y[n] + gy * 0.8, 0.1);
  a.px[n] = a.x[n];
  a.py[n] = a.y[n];
  return true;
}
