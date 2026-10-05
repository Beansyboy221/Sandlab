import { predatoryMotion } from "./predation.js";
import { materials } from "./materials.js";
import { blocked } from "./stickman-body.js";
import { actorProfile } from "./creature-profiles.js";
import { breathableWater, clearHabitatPath } from "./creature-habitat.js";
export { breathableWater } from "./creature-habitat.js";

const turns = [
  [1, 0],
  [0.5, 0.8660254],
  [0.5, -0.8660254],
  [0, 1],
  [0, -1],
  [-1, 0],
];
function flockMotion(w, a, p) {
  a.behavior = p.mode === "fly" ? "Flocking" : "Schooling";
  const vx = w.gravityY * a.flockMove * p.speed + w.gravityX * a.flockLift;
  const vy = -w.gravityX * a.flockMove * p.speed + w.gravityY * a.flockLift;
  const look = 7 / Math.max(0.001, Math.hypot(vx, vy));
  for (const [cos, sin] of turns) {
    const x = vx * cos - vy * sin,
      y = vx * sin + vy * cos;
    if (
      !clearHabitatPath(
        w,
        a.x[2],
        a.y[2],
        a.x[2] + x * look,
        a.y[2] + y * look,
        p.mode,
      ) ||
      !clearHabitatPath(
        w,
        a.x[0],
        a.y[0],
        a.x[0] + x * look,
        a.y[0] + y * look,
        p.mode,
      )
    )
      continue;
    const move = (x * w.gravityY - y * w.gravityX) / p.speed;
    if (Math.abs(move) > 0.08) a.direction = Math.sign(move);
    return { move, lift: x * w.gravityX + y * w.gravityY };
  }
  return { move: 0, lift: 0 };
}
// Steering uses the same gravity-relative axes as walking and phone rotation.
// Looking ahead turns creatures away from walls, cliffs, hot cells and acid.
export function creatureMotion(w, a) {
  const p = actorProfile(a.material, w),
    gx = w.gravityX,
    gy = w.gravityY;
  const social = predatoryMotion(w, a);
  const x = a.x[2],
    y = a.y[2],
    sign = a.direction;
  const aheadX = x + gy * sign * 7,
    aheadY = y - gx * sign * 7;
  const i = w.index(Math.floor(aheadX), Math.floor(aheadY));
  let turn = false;
  if (
    blocked(w, aheadX, aheadY) ||
    i < 0 ||
    (i >= 0 && (w.temp[i] > 65 || materials[w.cells[i]].acidic))
  )
    turn = true;
  if (p.mode === "swim") {
    a.submerged =
      breathableWater(w, a.x[0], a.y[0]) && breathableWater(w, x, y);
    if (!a.submerged) return { move: 0, lift: 0 };
    if (a.flockSize && !social) return flockMotion(w, a, p);
    if (turn || !breathableWater(w, aheadX, aheadY)) a.direction *= -1;
    const up = breathableWater(w, x - gx * 4, y - gy * 4),
      down = breathableWater(w, x + gx * 4, y + gy * 4);
    const vertical = !up
      ? 0.07
      : !down
        ? -0.07
        : Math.sin((w.tick + a.id * 37) / 100) * 0.045;
    return {
      move: a.direction * (social ? Math.abs(social.move) : 1),
      lift: up && down && social ? social.lift : vertical,
    };
  }
  if (p.mode === "fly" && a.flockSize && !social) return flockMotion(w, a, p);
  if (turn) a.direction *= -1;
  if (p.mode === "fly") {
    const center = (w.width * gx) / 2 + (w.height * gy) / 2;
    const height = x * gx + y * gy;
    const target = center * 0.65 + Math.sin((w.tick + a.id * 29) / 130) * 5;
    const above = blocked(w, x - gx * 7, y - gy * 7);
    return {
      move: a.direction * (social ? Math.abs(social.move) : 1),
      lift: social?.threat
        ? -0.14
        : above
          ? 0.12
          : Math.max(-0.14, Math.min(0.14, (target - height) * 0.025)),
    };
  }
  const safeGround = blocked(w, aheadX + gx * 8, aheadY + gy * 8);
  if (a.grounded && !safeGround && !turn) a.direction *= -1;
  return {
    move: a.direction * (social ? Math.abs(social.move) : 1),
    jump:
      p.mode === "hop" &&
      a.grounded &&
      !a.cooldown &&
      ((w.tick + a.id * 11) % 55 === 0 || social?.threat),
  };
}
