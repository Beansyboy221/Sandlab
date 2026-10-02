import { predatoryMotion } from "./predation.js";
import { materials, M } from "./materials.js";
import { blocked } from "./stickman-body.js";
import { actorProfile } from "./creature-profiles.js";
export function breathableWater(w, x, y) {
  const i = w.index(Math.floor(x), Math.floor(y));
  return (
    i >= 0 &&
    (w.cells[i] === M.Water || w.cells[i] === M.Brine) &&
    w.temp[i] < 45
  );
}
// Steering uses the same gravity-relative axes as walking and phone rotation.
// Looking ahead turns creatures away from walls, cliffs, hot cells and acid.
export function creatureMotion(w, a) {
  const p = actorProfile(a.material),
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
