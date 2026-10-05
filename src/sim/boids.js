import { actorProfile } from "./creature-profiles.js";
import { breathableWater, clearHabitatPath } from "./creature-habitat.js";
const sumFields = [
  "offsetX",
  "offsetY",
  "velocityX",
  "velocityY",
  "separateX",
  "separateY",
];
const floatFields = ["x", "y", "vx", "vy", "speed", "spacing", ...sumFields];

// Whole creatures are capped at 32. Pair checks are cheaper here than a spatial
// index, and a single snapshot makes steering independent of integration order.
export class Boids {
  constructor(capacity) {
    for (const key of floatFields) this[key] = new Float32Array(capacity);
    this.kind = new Uint16Array(capacity);
    this.mode = new Uint8Array(capacity);
    this.neighbors = new Uint8Array(capacity);
  }

  update(w, bodies) {
    this.kind.fill(0);
    this.neighbors.fill(0);
    for (const key of sumFields) this[key].fill(0);
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i],
        p = actorProfile(a.material, w);
      a.flockSize = 0;
      a.flockMove = a.flockLift = 0;
      if (
        !w.mechanics.flocking ||
        !a.alive ||
        !a.bonds[0] ||
        !a.bonds[1] ||
        (p.mode !== "fly" && p.mode !== "swim")
      )
        continue;
      if (
        p.mode === "swim" &&
        (!breathableWater(w, a.x[0], a.y[0]) ||
          !breathableWater(w, a.x[2], a.y[2]))
      )
        continue;
      if (
        p.mode === "fly" &&
        (!a.bonds[2] ||
          !clearHabitatPath(w, a.x[1], a.y[1], a.x[2], a.y[2], "fly"))
      )
        continue;
      this.kind[i] = a.material;
      this.mode[i] = p.mode === "fly" ? 1 : 2;
      this.x[i] = (a.x[1] + a.x[2]) / 2;
      this.y[i] = (a.y[1] + a.y[2]) / 2;
      this.vx[i] = (a.x[1] - a.px[1] + a.x[2] - a.px[2]) / 2;
      this.vy[i] = (a.y[1] - a.py[1] + a.y[2] - a.py[2]) / 2;
      this.speed[i] = p.speed;
      this.spacing[i] = Math.max(8, p.headRadius * 12);
      if (Math.hypot(this.vx[i], this.vy[i]) < p.speed * 0.1) {
        this.vx[i] = w.gravityY * a.direction * p.speed;
        this.vy[i] = -w.gravityX * a.direction * p.speed;
      }
    }
    const range = w.mechanics.flockRange;
    for (let i = 0; i < bodies.length; i++) {
      if (!this.kind[i]) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        if (this.kind[j] !== this.kind[i]) continue;
        let dx = this.x[j] - this.x[i],
          dy = this.y[j] - this.y[i];
        if (w.border === "looping") {
          if (dx > w.width / 2) dx -= w.width;
          else if (dx < -w.width / 2) dx += w.width;
          if (dy > w.height / 2) dy -= w.height;
          else if (dy < -w.height / 2) dy += w.height;
        }
        const d2 = dx * dx + dy * dy;
        if (
          d2 > range * range ||
          !clearHabitatPath(
            w,
            this.x[i],
            this.y[i],
            this.x[i] + dx,
            this.y[i] + dy,
            this.mode[i] === 1 ? "fly" : "swim",
          )
        )
          continue;
        this.neighbors[i]++;
        this.neighbors[j]++;
        this.offsetX[i] += dx;
        this.offsetX[j] -= dx;
        this.offsetY[i] += dy;
        this.offsetY[j] -= dy;
        this.velocityX[i] += this.vx[j];
        this.velocityX[j] += this.vx[i];
        this.velocityY[i] += this.vy[j];
        this.velocityY[j] += this.vy[i];
        const spacing = this.spacing[i],
          distance = Math.sqrt(d2);
        if (distance < spacing) {
          if (d2 < 0.0001) {
            const sign = bodies[i].id < bodies[j].id ? 1 : -1;
            dx = w.gravityY * sign;
            dy = -w.gravityX * sign;
          }
          const repel = (1 - distance / spacing) / Math.max(1, d2);
          this.separateX[i] -= dx * repel;
          this.separateX[j] += dx * repel;
          this.separateY[i] -= dy * repel;
          this.separateY[j] += dy * repel;
        }
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      const count = this.neighbors[i];
      if (!this.kind[i] || !count || count + 1 < w.mechanics.flockMinimum)
        continue;
      const speed = this.speed[i];
      // Alignment retains cruising momentum. Cohesion closes loose formations;
      // inverse-distance separation takes priority near another body.
      let vx =
        (this.velocityX[i] / count) * 0.85 +
        this.vx[i] * 0.5 +
        (this.offsetX[i] / (count * range)) * speed * 1.1 +
        this.separateX[i] * this.spacing[i] * speed * 1.8;
      let vy =
        (this.velocityY[i] / count) * 0.85 +
        this.vy[i] * 0.5 +
        (this.offsetY[i] / (count * range)) * speed * 1.1 +
        this.separateY[i] * this.spacing[i] * speed * 1.8;
      const scale = Math.min(1, speed / Math.max(0.0001, Math.hypot(vx, vy)));
      vx *= scale;
      vy *= scale;
      const a = bodies[i];
      a.flockSize = count + 1;
      a.flockMove = (vx * w.gravityY - vy * w.gravityX) / speed;
      a.flockLift = vx * w.gravityX + vy * w.gravityY;
    }
  }
}
