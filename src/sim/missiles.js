import { LaserGuidance, wrappedDelta } from "./missile-guidance.js";
import { stepMachine, machineFits } from "./machine-motion.js";
import { materials, M } from "./materials.js";
import { clearSight } from "./predation.js";
import { transportMissile } from "./portal-transport.js";
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
    this.guidance = new LaserGuidance(world);
    this.targets = new Int32Array(world.length);
    this.targetCount = 0;
    this.scanTick = -100;
    this.heatThreshold = 0;
  }
  spawn(x, y, dx = 1, dy = 0, material = M["Heat-Seeking Missile"]) {
    const w = this.world;
    if (
      !materials[material]?.projectile ||
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
    if (materials[material].vehicle && !machineFits(w, x, y)) return false;
    if (this.items.some((a) => Math.hypot(a.x - x, a.y - y) < 5)) return false;
    const angle = Math.atan2(dy, dx || (!dy ? 1 : 0));
    this.items.push({
      id: this.nextId++,
      material,
      x,
      y,
      angle,
      vx: Math.cos(angle) * 0.65,
      vy: Math.sin(angle) * 0.65,
      life: materials[material].vehicle ? 0 : 480,
      ...(materials[material].vehicle ? { health: 100 } : {}),
      temperature: 20,
      target: -1,
    });
    return true;
  }
  clear() {
    this.items.length = 0;
    this.guidance.clear();
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
    this.guidance.world = w;
    if (
      w.mechanics.missileHoming &&
      this.items.some((a) => materials[a.material].guidance === "heat")
    )
      this.scan();
    if (
      w.mechanics.laserGuidance &&
      this.items.some((a) => materials[a.material].guidance === "laser")
    )
      this.guidance.capture();
    for (const a of this.items) {
      if (w.border === "looping") {
        a.x = ((a.x % w.width) + w.width) % w.width;
        a.y = ((a.y % w.height) + w.height) % w.height;
      } else if (a.x < 0 || a.y < 0 || a.x >= w.width || a.y >= w.height) {
        if (w.border === "solid") this.detonate(a);
        else a.remove = true;
        continue;
      }
      if (stepMachine(w, a)) continue;
      if (--a.life <= 0) {
        a.remove = true;
        continue;
      }
      if (a.temperature > 300) {
        this.detonate(a);
        continue;
      }
      const mode = materials[a.material].guidance;
      a.target = -1;
      a.targetKind = "none";
      if (mode === "laser" && w.mechanics.laserGuidance)
        this.guidance.target(a);
      else if (mode === "heat" && w.mechanics.missileHoming) {
        a.target = this.nearest(a);
        if (a.target >= 0) {
          a.targetKind = "heat";
          a.targetX =
            a.x +
            wrappedDelta(
              (a.target % w.width) + 0.5 - a.x,
              w.width,
              w.border === "looping",
            );
          a.targetY =
            a.y +
            wrappedDelta(
              Math.floor(a.target / w.width) + 0.5 - a.y,
              w.height,
              w.border === "looping",
            );
        }
      }
      if (a.targetKind !== "none") {
        const desired = Math.atan2(a.targetY - a.y, a.targetX - a.x);
        const turn = Math.atan2(
          Math.sin(desired - a.angle),
          Math.cos(desired - a.angle),
        );
        a.angle += clamp(turn, -0.065, 0.065);
      }
      w.fields.forceAt(a.x, a.y, 0.015, 0.015);
      const speed = w.mechanics.missileSpeed;
      a.vx =
        a.vx * 0.8 +
        Math.cos(a.angle) * speed * 0.2 +
        clamp(w.fields.forceX, -0.08, 0.08);
      a.vy =
        a.vy * 0.8 +
        Math.sin(a.angle) * speed * 0.2 +
        clamp(w.fields.forceY, -0.08, 0.08);
      if (w.environment.kinetic) {
        w.environment.sample(a.x, a.y);
        a.vx += w.environment.x * 0.05;
        a.vy += w.environment.y * 0.05;
      }
      if (a.temperature < -60) {
        a.vx *= 0.94;
        a.vy *= 0.94;
        a.vx += w.gravityX * 0.06;
        a.vy += w.gravityY * 0.06;
      }
      if ((w.tick + a.id) % 12 === 0)
        w.sound.emit(
          "swoosh",
          a.x,
          a.y,
          Math.min(0.3, Math.hypot(a.vx, a.vy) * 0.12),
        );
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
          if (w.border === "solid" && !materials[a.material].vehicle)
            this.detonate(a);
          else a.remove = true;
          break;
        }
        const nose = w.index(
          Math.floor(a.x + Math.cos(a.angle) * 2),
          Math.floor(a.y + Math.sin(a.angle) * 2),
        );
        const portal =
          w.cells[i] === M.Portal
            ? i
            : nose >= 0 && w.cells[nose] === M.Portal
              ? nose
              : -1;
        if (portal >= 0 && transportMissile(w, a, portal)) break;
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
    if (tool === "wind") {
      this.world.fields.rebuildBarriers(this.world);
      this.world.fields.airflow.impulse(this.world.fields, x, y, dx, dy, power);
      return;
    }
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
      ({
        id,
        material,
        x,
        y,
        angle,
        vx,
        vy,
        life,
        temperature,
        health,
        portalUntil,
      }) => ({
        id,
        material,
        x,
        y,
        angle,
        vx,
        vy,
        life,
        temperature,
        portalCooldown: Math.max(0, (portalUntil || 0) - this.world.tick),
        ...(materials[material].vehicle ? { health } : {}),
      }),
    );
  }
  restore(data = []) {
    this.guidance.clear();
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
      ...(materials[a.material].vehicle ? { health: a.health } : {}),
      target: -1,
      portalUntil: this.world.tick + (a.portalCooldown || 0),
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
      !Number.isInteger(a.material) ||
      !materials[a.material]?.projectile ||
      !Number.isInteger(a.life) ||
      (a.portalCooldown !== undefined &&
        (!Number.isInteger(a.portalCooldown) ||
          a.portalCooldown < 0 ||
          a.portalCooldown > 12)) ||
      (materials[a.material]?.vehicle
        ? a.life !== 0 ||
          !Number.isFinite(a.health) ||
          a.health <= 0 ||
          a.health > 100
        : a.life < 1 || a.life > 480) ||
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
