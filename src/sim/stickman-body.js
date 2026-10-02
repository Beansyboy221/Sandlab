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

function collide(w, a, n, x, y) {
  let nx = a.x[n],
    ny = a.y[n];
  const steps = Math.max(1, Math.ceil(Math.hypot(x - nx, y - ny) * 2));
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
    grounded = a.grounded;
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
  // Internal pose motors exchange momentum with the hips; dead or disconnected
  // limbs have no motors and remain freely simulated ragdoll bodies.
  if (a.alive && a.bonds[0] && a.bonds[1]) {
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
  a.health = Math.max(0, a.health);
  if (!a.health || !a.bonds[0] || !a.bonds[1]) a.alive = false;
}
