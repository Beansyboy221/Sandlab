import { materials } from "./materials.js";
const clamp = (v) => Math.max(-2.5, Math.min(2.5, v));
// Existing particle offsets and velocities carry subpixel momentum, including
// debris. The ordinary cellular movement remains the default sandbox behavior.
export function moveKinetic(w, i, x, y) {
  const mode = w.environment.kinetic,
    m = materials[w.cells[i]];
  if (
    !mode &&
    ((!m.fragment && !w.portalCooldown[i]) ||
      Math.max(Math.abs(w.velocityX[i]), Math.abs(w.velocityY[i])) < 0.05)
  )
    return false;
  if (mode) {
    w.environment.sample(x, y);
    w.fields.airflow.sample(w.fields, x, y);
    const buoyancy = m.gas ? (m.density > 0 ? 0.15 : -0.15) : 1,
      drag = m.gas ? 0.08 : m.category === "liquid" ? 0.02 : 0.005;
    w.velocityX[i] = clamp(
      w.velocityX[i] +
        w.environment.x * 0.16 * buoyancy +
        (w.fields.airflow.x - w.velocityX[i]) * drag,
    );
    w.velocityY[i] = clamp(
      w.velocityY[i] +
        w.environment.y * 0.16 * buoyancy +
        (w.fields.airflow.y - w.velocityY[i]) * drag,
    );
  } else {
    w.velocityX[i] *= 0.94;
    w.velocityY[i] *= 0.94;
    if (w.portalCooldown[i] && !m.gas) {
      w.velocityX[i] = clamp(w.velocityX[i] + w.gravityX * 0.12);
      w.velocityY[i] = clamp(w.velocityY[i] + w.gravityY * 0.12);
    }
  }
  w.offsetX[i] += w.velocityX[i];
  w.offsetY[i] += w.velocityY[i];
  let moved = false;
  for (let axis = 0; axis < 2; axis++) {
    const offset = axis ? "offsetY" : "offsetX",
      velocity = axis ? "velocityY" : "velocityX";
    for (let n = 0; n < 3 && Math.abs(w[offset][i]) >= 0.5; n++) {
      const sign = Math.sign(w[offset][i]),
        nx = x + (axis ? 0 : sign),
        ny = y + (axis ? sign : 0),
        j = w.index(nx, ny);
      w.environment.sample(x, y);
      const falling = sign * (axis ? w.environment.y : w.environment.x);
      if (w.tryMove(i, nx, ny, falling)) {
        if (j < 0) return true;
        if (w.movedTo !== j) return true;
        i = w.movedTo;
        x = i % w.width;
        y = Math.floor(i / w.width);
        w[offset][i] -= sign;
        moved = true;
      } else {
        w[offset][i] = 0;
        w[velocity][i] *= -0.05;
        break;
      }
    }
  }
  if (
    mode &&
    !moved &&
    Math.hypot(w.velocityX[i], w.velocityY[i]) < 0.08 &&
    w.tick % 4 === 0 &&
    m.category === "liquid"
  ) {
    w.environment.sample(x, y);
    const gx = Math.sign(w.environment.x),
      gy = Math.sign(w.environment.y),
      s = w.random() < 0.5 ? -1 : 1;
    w.tryMove(i, x + (gy || 1) * s, y - gx * s, 0);
  }
  return mode || moved;
}
