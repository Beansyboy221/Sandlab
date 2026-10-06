import { materials } from "../materials.js";
import { effectiveViscosity } from "../mixtures.js";
import { moveKinetic } from "../particle-kinetics.js";
import { moveOpticalRay as moveRay } from "./optics.js";
import { moveSurfaceFlame } from "../combustion.js";

export function moveParticle(w, i, x, y) {
  const m = materials[w.cells[i]],
    cat = m.category;
  if (!m.movable || m.elasticity || m.rigid) return;
  if (m.ray) {
    moveRay(w, i, x, y, m);
    return;
  }
  if (moveKinetic(w, i, x, y)) return;
  const gas = m.gas,
    fall = gas ? (m.buoyancy ?? (m.density > 0 ? 1 : -1)) : 1,
    downX = w.gravityX,
    downY = w.gravityY,
    acrossX = downY,
    acrossY = -downX;
  const direction = w.random() < 0.5 ? -1 : 1;
  if (!w.inParticlePass) w.fields.beginForceSample();
  const fi = w.fields.forceGradient(x, y),
    gx = w.fields.gradientX[fi],
    gy = w.fields.gradientY[fi];
  w.fields.airflow.sample(w.fields, x, y);
  const windX = w.fields.airflow.x,
    windY = w.fields.airflow.y;
  const windSpeed = Math.max(Math.abs(windX), Math.abs(windY));
  // Surface contact retains weak plumes; a strong vent jet can lift them away.
  if (
    materials[w.cells[i]].flame &&
    windSpeed < 0.35 &&
    moveSurfaceFlame(w, i, x, y)
  )
    return;
  const drag = gas ? 1 : cat === "powder" ? 0.08 / Math.sqrt(m.density) : 0.03;
  if (windSpeed > 0.01 && w.random() < Math.min(1, windSpeed * drag)) {
    const horizontal = Math.abs(windX) >= Math.abs(windY);
    const dx = horizontal ? Math.sign(windX) : 0,
      dy = horizontal ? 0 : Math.sign(windY);
    if (w.tryMove(i, x + dx, y + dy, dx * downX + dy * downY)) return;
  }
  if (
    !gas &&
    (Math.abs(gx) > 1 || Math.abs(gy) > 1) &&
    w.random() < 0.6 &&
    w.tryMove(
      i,
      x + Math.sign(gx),
      y + Math.sign(gy),
      Math.sign(gx) * downX + Math.sign(gy) * downY,
    )
  )
    return;
  if (
    materials[w.cells[i]].flame &&
    windSpeed >= 0.35 &&
    moveSurfaceFlame(w, i, x, y)
  )
    return;
  // Suspended condensate follows airflow with slow diffusion, rather than
  // racing to the ceiling like a hot gas.
  if (gas && fall === 0 && w.random() > (m.dispersion ?? 1)) return;
  // Buoyant plumes spread while rising even when the cell directly above is
  // empty; diagonal motion used to occur only after that straight move failed.
  if (materials[w.cells[i]].flame && w.random() < 0.55 / (1 + windSpeed * 3)) {
    const side = w.index(x + acrossX * direction, y + acrossY * direction),
      up = w.index(x + downX * fall, y + downY * fall);
    const openUp = up >= 0 ? w.canMove(i, up, fall) : w.border === "void",
      openSide = side >= 0 ? w.canMove(i, side, fall) : w.border === "void";
    if (
      (openUp || openSide) &&
      w.tryMove(
        i,
        x + downX * fall + acrossX * direction,
        y + downY * fall + acrossY * direction,
        fall,
      )
    )
      return;
  }
  const nx = x + downX * fall,
    ny = y + downY * fall;
  if (w.tryMove(i, nx, ny, fall)) return;
  if (
    cat === "powder" &&
    w.storedAmount[i] &&
    materials[w.storedLiquid[i]].waterLike &&
    w.random() < (0.4 * w.storedAmount[i]) / Math.max(1, m.porosity)
  )
    return;
  for (let side = 0; side < 2; side++) {
    const sign = side ? -direction : direction;
    if (materials[w.cells[i]].flame) {
      const up = w.index(nx, ny),
        beside = w.index(x + acrossX * sign, y + acrossY * sign);
      if (
        up >= 0 &&
        beside >= 0 &&
        !w.canMove(i, up, fall) &&
        !w.canMove(i, beside, fall)
      )
        continue;
    }
    if (w.tryMove(i, nx + acrossX * sign, ny + acrossY * sign, fall)) return;
  }
  if (cat === "liquid" && w.porousFlow.seep(w, i, x, y)) return;
  if (cat === "liquid" && w.fallDistance[i] > 2) {
    w.sound.emit(
      "splash",
      x,
      y,
      Math.min(0.35, w.fallDistance[i] * 0.015),
      m.density,
    );
    w.fallDistance[i] = 0;
  }
  if (cat === "powder" && w.fallDistance[i] > 1) {
    w.sound.emit(
      "grain",
      x,
      y,
      Math.min(0.6, w.fallDistance[i] * 0.015 * Math.sqrt(m.density)),
      m.density,
    );
    w.fallDistance[i] = 0;
  }
  if (cat === "liquid" || gas) {
    if (w.random() > 1 / effectiveViscosity(w, i)) return;
    const reach = gas ? 1 : 4;
    for (let side = 0; side < 2; side++) {
      const sign = side ? -direction : direction;
      let target = -1;
      for (let d = 1; d <= reach; d++) {
        const nx = x + acrossX * sign * d,
          ny = y + acrossY * sign * d;
        const j = w.index(nx, ny);
        if (j < 0) {
          if (w.border === "void") {
            w.set(i, 0);
            return;
          }
          break;
        }
        if (materials[w.cells[j]].portal) {
          if (w.tryMove(i, nx, ny, 0)) return;
          break;
        }
        if (!w.canMove(i, j, 0)) break;
        target = j;
      }
      if (target !== -1) {
        w.swap(i, target);
        return;
      }
    }
  }
}
