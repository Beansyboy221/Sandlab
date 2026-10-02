import { materials, M } from "./materials.js";
import { clearSight } from "./predation.js";
export const MAX_MISSILES = 32;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const surfaces = Uint8Array.from(materials, (m) =>
  Number(m.id && !m.gas && !m.actor && !m.projectile),
);
const air = Uint8Array.from(materials, (m) => Number(!m.id || m.gas));
export class Missiles {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.nextId = 1;
    this.targets = new Int32Array(world.length);
    this.targetCount = 0;
    this.scanTick = -100;
    this.heatThreshold = 0;
  }
  spawn(x, y, dx = 1, dy = 0) {
    const w = this.world;
    if (
      ![x, y, dx, dy].every(Number.isFinite) ||
      x < 2 ||
      y < 2 ||
      x >= w.width - 2 ||
      y >= w.height - 2 ||
      this.items.length >= MAX_MISSILES
    )
      return false;
    const i = w.index(Math.floor(x), Math.floor(y));
    if (w.cells[i] && !materials[w.cells[i]].gas) return false;
    if (this.items.some((a) => Math.hypot(a.x - x, a.y - y) < 5)) return false;
    const angle = Math.atan2(dy, dx || (!dy ? 1 : 0));
    this.items.push({
      id: this.nextId++,
      material: M["Heat-Seeking Missile"],
      x,
      y,
      angle,
      vx: Math.cos(angle) * 0.65,
      vy: Math.sin(angle) * 0.65,
      life: 480,
      temperature: 20,
      target: -1,
    });
    return true;
  }
  clear() {
    this.items.length = 0;
    this.targetCount = 0;
    this.scanTick = -100;
  }
  scan() {
    const w = this.world;
    if (
      w.tick - this.scanTick < 10 &&
      this.heatThreshold === w.mechanics.missileHeat
    )
      return;
    this.scanTick = w.tick;
    this.heatThreshold = w.mechanics.missileHeat;
    this.targetCount = 0;
    for (let i = 0; i < w.length; i++) {
      if (w.temp[i] < this.heatThreshold || !surfaces[w.cells[i]]) continue;
      const x = i % w.width,
        y = Math.floor(i / w.width);
      const left = w.index(x - 1, y),
        right = w.index(x + 1, y),
        up = w.index(x, y - 1),
        down = w.index(x, y + 1);
      if (
        (left >= 0 && air[w.cells[left]]) ||
        (right >= 0 && air[w.cells[right]]) ||
        (up >= 0 && air[w.cells[up]]) ||
        (down >= 0 && air[w.cells[down]])
      )
        this.targets[this.targetCount++] = i;
    }
  }
  nearest(a) {
    const w = this.world;
    let best = -1,
      distance = w.mechanics.missileRange ** 2;
    for (let n = 0; n < this.targetCount; n++) {
      const i = this.targets[n];
      if (!surfaces[w.cells[i]] || w.temp[i] < w.mechanics.missileHeat)
        continue;
      const dx = (i % w.width) + 0.5 - a.x,
        dy = Math.floor(i / w.width) + 0.5 - a.y,
        d = dx * dx + dy * dy;
      if (d < distance || (d === distance && i < best)) {
        best = i;
        distance = d;
      }
    }
    return best;
  }
  detonate(a) {
    if (a.remove) return;
    a.remove = true;
    const w = this.world;
    w.explode(
      clamp(Math.floor(a.x), 0, w.width - 1),
      clamp(Math.floor(a.y), 0, w.height - 1),
      w.mechanics.missileBlast,
    );
    for (const body of w.stickmen.bodies)
      if (
        Math.hypot(body.x[2] - a.x, body.y[2] - a.y) <
          w.mechanics.missileBlast + 3 &&
        clearSight(w, a.x, a.y, body.x[2], body.y[2])
      ) {
        body.health = Math.max(0, body.health - 60);
        if (!body.health) body.alive = false;
      }
  }
  step() {
    if (!this.items.length) return;
    const w = this.world;
    if (w.mechanics.missileHoming) this.scan();
    for (const a of this.items) {
      if (w.border === "looping") {
        a.x = ((a.x % w.width) + w.width) % w.width;
        a.y = ((a.y % w.height) + w.height) % w.height;
      } else if (a.x < 0 || a.y < 0 || a.x >= w.width || a.y >= w.height) {
        if (w.border === "solid") this.detonate(a);
        else a.remove = true;
        continue;
      }
      if (--a.life <= 0) {
        a.remove = true;
        continue;
      }
      if (a.temperature > 300) {
        this.detonate(a);
        continue;
      }
      a.target = w.mechanics.missileHoming ? this.nearest(a) : -1;
      if (a.target >= 0) {
        const desired = Math.atan2(
          Math.floor(a.target / w.width) + 0.5 - a.y,
          (a.target % w.width) + 0.5 - a.x,
        );
        const turn = Math.atan2(
          Math.sin(desired - a.angle),
          Math.cos(desired - a.angle),
        );
        a.angle += clamp(turn, -0.065, 0.065);
      }
      const f = w.fields.forceGradient(a.x, a.y),
        speed = w.mechanics.missileSpeed;
      a.vx =
        a.vx * 0.8 +
        Math.cos(a.angle) * speed * 0.2 +
        clamp(w.fields.gradientX[f], -3, 3) * 0.015;
      a.vy =
        a.vy * 0.8 +
        Math.sin(a.angle) * speed * 0.2 +
        clamp(w.fields.gradientY[f], -3, 3) * 0.015;
      if (a.temperature < -60) {
        a.vx *= 0.94;
        a.vy *= 0.94;
        a.vx += w.gravityX * 0.06;
        a.vy += w.gravityY * 0.06;
      }
      const steps = Math.max(1, Math.ceil(Math.hypot(a.vx, a.vy) * 3));
      for (let s = 0; s < steps; s++) {
        a.x += a.vx / steps;
        a.y += a.vy / steps;
        if (w.border === "looping") {
          a.x = (a.x + w.width) % w.width;
          a.y = (a.y + w.height) % w.height;
        }
        const i = w.index(Math.floor(a.x), Math.floor(a.y));
        if (i < 0) {
          if (w.border === "solid") this.detonate(a);
          else a.remove = true;
          break;
        }
        const nose = w.index(
          Math.floor(a.x + Math.cos(a.angle) * 2),
          Math.floor(a.y + Math.sin(a.angle) * 2),
        );
        if (surfaces[w.cells[i]] || (nose >= 0 && surfaces[w.cells[nose]])) {
          this.detonate(a);
          break;
        }
        const actor = w.stickmen.hit(a.x, a.y, 0.5);
        if (actor) {
          this.detonate(a);
          break;
        }
      }
      if (a.remove) continue;
      a.temperature +=
        (w.fields.temperature[w.fields.index(a.x, a.y)] - a.temperature) * 0.01;
      if ((w.tick + a.id) % 4 === 0) {
        const x = a.x - Math.cos(a.angle) * 3,
          y = a.y - Math.sin(a.angle) * 3,
          j = w.index(Math.floor(x), Math.floor(y));
        if (j >= 0 && !w.cells[j]) w.set(j, M.Smoke, 100, 30);
      }
    }
    this.items = this.items.filter((a) => !a.remove);
  }
  hit(x, y, radius = 2) {
    return this.items.find((a) => Math.hypot(a.x - x, a.y - y) < radius + 1.3);
  }
  brush(tool, x, y, radius, dx = 0, dy = 0, power = 1, shape = "circle") {
    for (const a of this.items) {
      const inside =
        shape === "square"
          ? Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) <= radius + 1
          : Math.hypot(a.x - x, a.y - y) <= radius + 1;
      if (!inside) continue;
      if (tool === "erase" || tool === "erase-mobile") a.remove = true;
      else if (tool === "grab") {
        a.x += dx;
        a.y += dy;
      } else if (tool === "fan") {
        a.vx += dx * 0.05 * power;
        a.vy += dy * 0.05 * power;
      } else if (tool === "warm" || tool === "cool")
        a.temperature = clamp(
          a.temperature + (tool === "warm" ? 12 : -12) * power,
          -250,
          6000,
        );
    }
    this.items = this.items.filter((a) => !a.remove);
  }
  snapshot() {
    return this.items.map(
      ({ id, material, x, y, angle, vx, vy, life, temperature }) => ({
        id,
        material,
        x,
        y,
        angle,
        vx,
        vy,
        life,
        temperature,
      }),
    );
  }
  restore(data = []) {
    this.items = data.map((a) => ({
      ...Object.fromEntries(
        [
          "id",
          "material",
          "x",
          "y",
          "angle",
          "vx",
          "vy",
          "life",
          "temperature",
        ].map((key) => [key, a[key]]),
      ),
      target: -1,
    }));
    this.nextId = Math.max(0, ...this.items.map((a) => a.id)) + 1;
    this.scanTick = -100;
  }
}
export function validateMissiles(data) {
  if (data === undefined) return;
  if (!Array.isArray(data) || data.length > MAX_MISSILES)
    throw Error("Invalid missile count.");
  const ids = new Set();
  for (const a of data) {
    if (
      !a ||
      !Number.isSafeInteger(a.id) ||
      a.id < 1 ||
      a.id > 1000000 ||
      ids.has(a.id) ||
      a.material !== M["Heat-Seeking Missile"] ||
      !Number.isInteger(a.life) ||
      a.life < 1 ||
      a.life > 480 ||
      ![a.x, a.y, a.angle, a.vx, a.vy, a.temperature].every(Number.isFinite) ||
      Math.abs(a.x) > 2048 ||
      Math.abs(a.y) > 2048 ||
      Math.abs(a.angle) > 10000 ||
      Math.abs(a.vx) > 20 ||
      Math.abs(a.vy) > 20 ||
      a.temperature < -250 ||
      a.temperature > 6000
    )
      throw Error("Invalid missile state.");
    ids.add(a.id);
  }
}
