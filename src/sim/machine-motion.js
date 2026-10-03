import { materials, M } from "./materials.js";
import { portalContact, transportMissile } from "./portal-transport.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const obstacles = Uint8Array.from(materials, (m) =>
  Number(m.id && !m.gas && m.category !== "liquid"),
);
function blocked(w, x, y, gx, gy) {
  const tx = gy,
    ty = -gx;
  for (let across = -2; across <= 2; across++)
    for (let down = -1; down <= 1; down++) {
      const j = w.index(
        Math.floor(x + tx * across + gx * down),
        Math.floor(y + ty * across + gy * down),
      );
      if (j < 0 ? w.border === "solid" : obstacles[w.cells[j]]) return true;
    }
  return false;
}
export function machineFits(w, x, y) {
  return !blocked(w, x, y, w.gravityX, w.gravityY);
}
function wreck(w, a) {
  a.remove = true;
  for (let d = -2; d <= 2; d++) {
    const j = w.index(
      Math.floor(a.x + w.gravityY * d),
      Math.floor(a.y - w.gravityX * d),
    );
    if (j >= 0 && !w.cells[j]) w.set(j, d === 0 ? M.Spark : M.Rubble);
  }
  w.sound.emit("impact", a.x, a.y, 0.35);
}
// Swept footprint collisions share the bounded moving-device pool with missiles.
export function stepMachine(w, a) {
  const m = materials[a.material];
  if (!m.vehicle) return false;
  w.environment.sample(a.x, a.y);
  const gravityScale = Math.hypot(w.environment.x, w.environment.y);
  const gx = gravityScale ? w.environment.x / gravityScale : w.gravityX,
    gy = gravityScale ? w.environment.y / gravityScale : w.gravityY,
    tx = gy,
    ty = -gx;
  let direction = Math.cos(a.angle) * tx + Math.sin(a.angle) * ty >= 0 ? 1 : -1;
  const field = w.fields.index(a.x, a.y);
  a.temperature += (w.fields.temperature[field] - a.temperature) * 0.02;
  const center = w.index(Math.floor(a.x), Math.floor(a.y));
  if (center >= 0) {
    if (w.cells[center])
      a.temperature += (w.temp[center] - a.temperature) * 0.05;
    if (materials[w.cells[center]].acidic) a.health -= 1;
    if (w.cells[center] === M.Void) a.health = 0;
  }
  if (a.temperature > 180)
    a.health -= Math.min(3, (a.temperature - 180) * 0.004);
  if (a.health <= 0) {
    wreck(w, a);
    return true;
  }
  const submerged =
    center >= 0 && materials[w.cells[center]].category === "liquid";
  const motor = w.mechanics.machineMotors && a.temperature > -60 && !submerged;
  const drive = motor ? w.mechanics.machineSpeed * direction : 0;
  const tangent = a.vx * tx + a.vy * ty;
  let vertical = a.vx * gx + a.vy * gy;
  if (m.vehicle === "drone" && motor) vertical *= 0.7;
  else vertical = clamp(vertical + 0.075 * gravityScale, -3, 2.5);
  const across = tangent * 0.75 + drive * 0.25;
  const f = w.fields.forceGradient(a.x, a.y);
  a.vx =
    tx * across + gx * vertical + clamp(w.fields.gradientX[f], -3, 3) * 0.01;
  a.vy =
    ty * across + gy * vertical + clamp(w.fields.gradientY[f], -3, 3) * 0.01;
  const contact = portalContact(w, a.x, a.y, a.vx, a.vy, 2.2);
  if (contact >= 0 && transportMissile(w, a, contact)) return true;
  let impact = 0;
  const grounded = blocked(w, a.x + gx * 0.7, a.y + gy * 0.7, gx, gy);
  const steps = Math.max(1, Math.ceil(Math.hypot(a.vx, a.vy) * 3));
  for (let s = 0; s < steps; s++) {
    const vx = a.vx / steps,
      vy = a.vy / steps;
    const ax = tx * (vx * tx + vy * ty),
      ay = ty * (vx * tx + vy * ty);
    if (!blocked(w, a.x + ax, a.y + ay, gx, gy)) {
      a.x += ax;
      a.y += ay;
    } else {
      let lifted = false;
      if (m.vehicle === "rover" && grounded && motor) {
        for (let lift = 1; lift <= 2; lift++) {
          if (blocked(w, a.x - gx * lift, a.y - gy * lift, gx, gy)) break;
          if (!blocked(w, a.x + ax - gx * lift, a.y + ay - gy * lift, gx, gy)) {
            a.x += ax - gx * lift;
            a.y += ay - gy * lift;
            lifted = true;
            break;
          }
        }
      }
      if (!lifted) {
        direction = -direction;
        if (
          m.vehicle === "drone" &&
          motor &&
          !blocked(w, a.x - gx, a.y - gy, gx, gy)
        ) {
          a.x -= gx * 0.3;
          a.y -= gy * 0.3;
        }
        const acrossVelocity = a.vx * tx + a.vy * ty;
        a.vx -= tx * acrossVelocity;
        a.vy -= ty * acrossVelocity;
      }
    }
    const down = vx * gx + vy * gy;
    if (!blocked(w, a.x + gx * down, a.y + gy * down, gx, gy)) {
      a.x += gx * down;
      a.y += gy * down;
    } else {
      impact = Math.max(impact, Math.abs(vertical));
      const downVelocity = a.vx * gx + a.vy * gy;
      a.vx -= gx * downVelocity;
      a.vy -= gy * downVelocity;
    }
    if (w.border === "looping") {
      a.x = (a.x + w.width) % w.width;
      a.y = (a.y + w.height) % w.height;
    } else if (a.x < 0 || a.y < 0 || a.x >= w.width || a.y >= w.height) {
      a.remove = true;
      break;
    }
  }
  a.angle = Math.atan2(ty * direction, tx * direction);
  a.target = -1;
  if (impact > 1.5) {
    a.health -= impact * m.density * 2;
    w.sound.emit("impact", a.x, a.y, Math.min(0.8, impact * 0.2));
  }
  const actor = w.stickmen.hit(a.x, a.y, 2);
  if (actor && Math.hypot(a.vx, a.vy) > 1) {
    actor.health = Math.max(0, actor.health - m.density * 0.3);
    actor.px[2] -= a.vx * 0.3;
    actor.py[2] -= a.vy * 0.3;
    if (!actor.health) actor.alive = false;
  }
  if (a.health <= 0 && !a.remove) wreck(w, a);
  return true;
}
