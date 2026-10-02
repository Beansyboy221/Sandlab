import { materials } from "./materials.js";
import { actorProfile } from "./creature-profiles.js";
import { blocked } from "./stickman-body.js";
const clamp = (v) => Math.max(-1, Math.min(1, v));
export function clearSight(w, ax, ay, bx, by) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let n = 1; n < steps; n++)
    if (blocked(w, ax + ((bx - ax) * n) / steps, ay + ((by - ay) * n) / steps))
      return false;
  return true;
}
export function predatoryMotion(w, a) {
  a.behavior = "Patrolling";
  a.targetId = 0;
  a.attackCooldown = Math.max(0, (a.attackCooldown || 0) - 1);
  if (!w.mechanics.predation) return null;
  const p = actorProfile(a.material),
    own = materials[a.material].actor;
  let threat = null,
    prey = null,
    threatDistance = Infinity,
    preyDistance = Infinity;
  const range = w.mechanics.predatorRange;
  // Actor populations are capped. One bounded pair search avoids a spatial
  // index that would cost more than it saves for a few dozen whole bodies.
  for (const b of w.stickmen.bodies) {
    if (b === a || !b.alive) continue;
    const kind = materials[b.material].actor,
      other = actorProfile(b.material);
    const dangerous = other.prey?.includes(own),
      edible = p.prey?.includes(kind);
    if (!dangerous && !edible) continue;
    const d = Math.hypot(b.x[2] - a.x[2], b.y[2] - a.y[2]);
    if (d > range || (dangerous ? d >= threatDistance : d >= preyDistance))
      continue;
    if (!clearSight(w, a.x[0], a.y[0], b.x[0], b.y[0])) continue;
    if (dangerous) {
      threat = b;
      threatDistance = d;
    } else {
      prey = b;
      preyDistance = d;
    }
  }
  const target = threat || prey;
  if (!target) return null;
  a.targetId = target.id;
  a.behavior = threat ? "Fleeing" : "Hunting";
  const dx = target.x[2] - a.x[2],
    dy = target.y[2] - a.y[2];
  const across = dx * w.gravityY - dy * w.gravityX,
    down = dx * w.gravityX + dy * w.gravityY;
  const direction = (threat ? -1 : 1) * Math.sign(across || a.direction);
  a.direction = direction;
  if (prey && !threat && !a.attackCooldown) {
    let distance = Infinity;
    for (const n of [0, 1, 2])
      distance = Math.min(
        distance,
        Math.hypot(a.x[0] - prey.x[n], a.y[0] - prey.y[n]),
      );
    if (distance < 3 && clearSight(w, a.x[0], a.y[0], prey.x[1], prey.y[1])) {
      prey.health = Math.max(0, prey.health - 14);
      a.attackCooldown = 30;
      const push = direction * 0.12;
      prey.px[2] -= w.gravityY * push;
      prey.py[2] += w.gravityX * push;
      w.sound.emit(
        "impact",
        a.x[0],
        a.y[0],
        0.12,
        materials[a.material].density,
      );
      if (!prey.health) {
        prey.alive = false;
        a.health = Math.min(100, a.health + 8);
        a.targetId = 0;
      }
    }
  }
  return {
    move: direction * (threat ? 1.45 : 1.6),
    jump: !!threat && a.grounded && !a.cooldown,
    lift: (threat ? -1 : 1) * clamp(down / 20) * 0.12,
    threat: !!threat,
  };
}
