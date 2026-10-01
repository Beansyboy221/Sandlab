import { defaultLevel } from "../level-properties.js";
import { particleStateFields } from "./particle-state.js";
import { materials, M } from "./materials.js";
import { Fields } from "./fields.js";
import { react } from "./reactions.js";
import { moveSurfaceFlame } from "./combustion.js";

export class World {
  constructor(width = 320, height = 200, seed = 17421) {
    Object.assign(this, defaultLevel);
    this.width = width;
    this.height = height;
    this.length = width * height;
    this.seed = seed;
    this.tick = 0;
    this.cells = new Uint8Array(this.length);
    this.temp = new Float32Array(this.length);
    this.temp.fill(20);
    this.life = new Uint16Array(this.length);
    this.charge = new Uint8Array(this.length);
    this.cooldown = new Uint8Array(this.length);
    this.clone = new Uint8Array(this.length);
    this.residue = new Uint8Array(this.length);
    this.variant = new Uint8Array(this.length);
    this.updated = new Uint32Array(this.length);
    this.chargedAt = new Uint32Array(this.length);
    this.moisture = new Uint8Array(this.length);
    this.nutrition = new Uint8Array(this.length);
    this.growth = new Uint8Array(this.length);
    this.storedLiquid = new Uint8Array(this.length);
    this.storedAmount = new Uint8Array(this.length);
    this.particleFields = particleStateFields.map((name) => this[name]);
    this.chunkWidth = Math.ceil(width / 16);
    this.chunks = new Uint16Array(this.chunkWidth * Math.ceil(height / 16));
    this.motionStamp = new Uint32Array(this.chunks.length);
    this.wakeStamp = new Uint32Array(this.chunks.length);
    this.count = 0;
    this.fields = new Fields(width, height);
  }
  random() {
    let s = this.seed | 0;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }
  chunk(i) {
    return (
      (((i / this.width) | 0) >> 4) * this.chunkWidth + ((i % this.width) >> 4)
    );
  }
  set(
    i,
    id,
    temperature = materials[id].temperature,
    lifetime = materials[id].lifetime || 0,
  ) {
    if (!Number.isInteger(i) || i < 0 || i >= this.length) return;
    if (!this.cells[i] && id) {
      this.chunks[this.chunk(i)]++;
      this.count++;
    } else if (this.cells[i] && !id) {
      this.chunks[this.chunk(i)]--;
      this.count--;
    }
    this.cells[i] = id;
    this.temp[i] = temperature;
    const variation = materials[id].lifetimeVariation || 0;
    this.life[i] =
      variation && lifetime
        ? Math.max(
            1,
            Math.round(
              lifetime * (1 - variation + this.random() * variation * 2),
            ),
          )
        : lifetime;
    this.moisture[i] = id === M.Mud ? 220 : id === M.Plant ? 80 : 0;
    this.nutrition[i] = materials[id].nutrition || 0;
    this.growth[i] = 0;
    this.storedLiquid[i] = 0;
    this.storedAmount[i] = 0;
    this.chargedAt[i] = 0;
    this.charge[i] = 0;
    this.cooldown[i] = 0;
    this.clone[i] = 0;
    this.residue[i] = 0;
    this.variant[i] = this.random() * 255;
    this.updated[i] = this.tick;
    this.wake(i);
  }
  wake(i) {
    const chunk = this.chunk(i),
      stamp = this.tick + 1;
    if (this.wakeStamp[chunk] === stamp) return;
    this.wakeStamp[chunk] = stamp;
    this.motionStamp[chunk] = stamp;
    const x = chunk % this.chunkWidth;
    if (x > 0) this.motionStamp[chunk - 1] = stamp;
    if (x < this.chunkWidth - 1) this.motionStamp[chunk + 1] = stamp;
    if (chunk >= this.chunkWidth)
      this.motionStamp[chunk - this.chunkWidth] = stamp;
    if (chunk + this.chunkWidth < this.chunks.length)
      this.motionStamp[chunk + this.chunkWidth] = stamp;
    if (this.border === "looping") {
      if (x === 0) this.motionStamp[chunk + this.chunkWidth - 1] = stamp;
      if (x === this.chunkWidth - 1) this.motionStamp[chunk - x] = stamp;
      const lastRow = this.chunks.length - this.chunkWidth;
      if (chunk < this.chunkWidth) this.motionStamp[lastRow + x] = stamp;
      if (chunk >= lastRow) this.motionStamp[x] = stamp;
    }
  }
  clear() {
    for (const key of [
      "cells",
      "life",
      "charge",
      "cooldown",
      "clone",
      "residue",
      "updated",
      "chargedAt",
      "moisture",
      "nutrition",
      "growth",
      "storedLiquid",
      "storedAmount",
      "chunks",
    ])
      this[key].fill(0);
    this.temp.fill(20);
    this.fields.clear();
    this.motionStamp.fill(this.tick + 1);
    this.wakeStamp.fill(0);
    this.count = 0;
  }
  index(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height)
      return y * this.width + x;
    if (this.border !== "looping") return -1;
    return (
      (((y % this.height) + this.height) % this.height) * this.width +
      (((x % this.width) + this.width) % this.width)
    );
  }
  eachNeighbor(x, y, fn) {
    const i = y * this.width + x,
      loop = this.border === "looping";
    if (x > 0) fn(i - 1);
    else if (loop) fn(i + this.width - 1);
    if (x < this.width - 1) fn(i + 1);
    else if (loop) fn(i - this.width + 1);
    if (y > 0) fn(i - this.width);
    else if (loop) fn(i + (this.height - 1) * this.width);
    if (y < this.height - 1) fn(i + this.width);
    else if (loop) fn(x);
  }
  tryMove(i, x, y, vertical) {
    const j = this.index(x, y);
    if (j < 0) {
      if (this.border === "void") {
        this.set(i, 0);
        return true;
      }
      return false;
    }
    if (j === i || !this.canMove(i, j, vertical)) return false;
    this.swap(i, j);
    return true;
  }
  swap(i, j) {
    if (!this.cells[j]) {
      const a = this.chunk(i),
        b = this.chunk(j);
      if (a !== b) {
        this.chunks[a]--;
        this.chunks[b]++;
      }
    }
    for (let k = 0; k < this.particleFields.length; k++) {
      const field = this.particleFields[k],
        value = field[i];
      field[i] = field[j];
      field[j] = value;
    }
    this.updated[i] = this.tick;
    this.updated[j] = this.tick;
    this.wake(i);
    this.wake(j);
  }
  canMove(i, j, vertical) {
    const a = materials[this.cells[i]],
      b = materials[this.cells[j]];
    if (!b.id) return true;
    if (
      b.category === "solid" ||
      b.category === "special" ||
      b.category === "powder"
    )
      return false;
    if (vertical > 0) return a.density > b.density + 0.08;
    if (vertical < 0) return a.density < b.density - 0.04;
    return false;
  }
  move(i, x, y) {
    const m = materials[this.cells[i]],
      cat = m.category;
    if (!m.movable) return;
    const gas = m.gas,
      dy = gas ? (m.density > 0 ? 1 : -1) : 1;
    const direction = this.random() < 0.5 ? -1 : 1;
    const fx = x >> 2,
      fy = y >> 2,
      gx = this.fields.sample(fx - 1, fy) - this.fields.sample(fx + 1, fy),
      gy = this.fields.sample(fx, fy - 1) - this.fields.sample(fx, fy + 1);
    if (
      (Math.abs(gx) > 1 || Math.abs(gy) > 1) &&
      this.random() < 0.6 &&
      this.tryMove(i, x + Math.sign(gx), y + Math.sign(gy), Math.sign(gy))
    )
      return;
    if (this.cells[i] === M.Fire && moveSurfaceFlame(this, i, x, y)) return;
    const ny = y + dy;
    if (this.tryMove(i, x, ny, dy)) return;
    for (let side = 0; side < 2; side++)
      if (this.tryMove(i, x + (side ? -direction : direction), ny, dy)) return;
    if (cat === "liquid" || gas) {
      if (this.random() > 1 / m.viscosity) return;
      const reach = gas ? 1 : 4;
      for (let side = 0; side < 2; side++) {
        const sign = side ? -direction : direction;
        let target = -1;
        for (let d = 1; d <= reach; d++) {
          const nx = x + sign * d;
          const j = this.index(nx, y);
          if (j < 0) {
            if (this.border === "void") {
              this.set(i, 0);
              return;
            }
            break;
          }
          if (!this.canMove(i, j, 0)) break;
          target = j;
        }
        if (target !== -1) {
          this.swap(i, target);
          return;
        }
      }
    }
  }
  transferHeat(i, j) {
    if (!this.cells[j]) return;
    const a = materials[this.cells[i]],
      b = materials[this.cells[j]];
    const transfer =
      (this.temp[i] - this.temp[j]) *
      Math.min(0.24, (a.conductivity + b.conductivity) * 0.25);
    this.temp[i] -= transfer;
    this.temp[j] += transfer;
  }
  step() {
    this.tick++;
    this.fields.border = this.border;
    this.fields.update();
    const w = this.width,
      h = this.height,
      reverse = this.tick % 2;
    // Skip empty 16-cell blocks; a tick stamp prevents moved cells from updating twice.
    for (let y = h - 1; y >= 0; y--)
      for (let k = 0; k < this.chunkWidth; k++) {
        const cx = reverse ? this.chunkWidth - 1 - k : k;
        if (!this.chunks[(y >> 4) * this.chunkWidth + cx]) continue;
        const start = cx * 16,
          end = Math.min(w, start + 16);
        for (let offset = 0; offset < end - start; offset++) {
          const x = reverse ? end - 1 - offset : start + offset,
            i = y * w + x;
          if (!this.cells[i] || this.updated[i] === this.tick) continue;
          this.updated[i] = this.tick;
          if ((i + this.tick) % 3 === 0) {
            const right = this.index(x + 1, y),
              below = this.index(x, y + 1);
            if (right >= 0) this.transferHeat(i, right);
            if (below >= 0) this.transferHeat(i, below);
            if (materials[this.cells[i]].category !== "special")
              this.temp[i] += (20 - this.temp[i]) * 0.0008;
          }
          react(this, i, x, y);
          if (this.cells[i] === M.Fan) {
            for (let d = 2; d < 15; d++) {
              const nx = x + d;
              const j = this.index(nx, y),
                next = this.index(nx + 1, y);
              if (j < 0) break;
              if (this.cells[j] && materials[this.cells[j]].movable) {
                if (next < 0 && this.border === "void") this.set(j, 0);
                else if (next >= 0 && !this.cells[next]) this.swap(j, next);
              }
            }
          } else if (this.cells[i]) {
            // Only movement sleeps. Heat and chemistry continue in settled chunks.
            const chunk = (y >> 4) * this.chunkWidth + cx;
            if (
              this.tick + 1 - this.motionStamp[chunk] < 30 ||
              this.tick % 8 === 0 ||
              Math.abs(this.fields.pressure[this.fields.index(x, y)]) > 1
            )
              this.move(i, x, y);
          }
        }
      }
  }
  explode(x, y, radius) {
    this.fields.add(x, y, radius * 2);
    const r2 = radius * radius;
    const loop = this.border === "looping",
      left = loop ? -Math.min(radius, Math.floor(this.width / 2)) : -radius,
      right = loop ? Math.min(radius, Math.ceil(this.width / 2) - 1) : radius,
      top = loop ? -Math.min(radius, Math.floor(this.height / 2)) : -radius,
      bottom = loop ? Math.min(radius, Math.ceil(this.height / 2) - 1) : radius;
    for (let dy = top; dy <= bottom; dy++)
      for (let dx = left; dx <= right; dx++) {
        const nx = x + dx,
          ny = y + dy,
          d2 = dx * dx + dy * dy;
        const i = this.index(nx, ny);
        if (i < 0 || d2 > r2) continue;
        const m = materials[this.cells[i]];
        if (m.category === "special" || m.resistance === 1) continue;
        if (m.explosive && d2 > 1) {
          this.temp[i] = Math.max(this.temp[i], m.ignite + 100);
          continue;
        }
        if (
          !m.id ||
          m.category !== "solid" ||
          this.random() > (m.resistance || 0.6)
        )
          this.set(i, M.Fire, 850, 15 + this.random() * 30);
        else this.temp[i] += 500 * (1 - d2 / r2);
      }
    this.set(this.index(x, y), M.Fire, 1100, 50);
  }
  brush(x, y, radius, id, shape = "circle", replace = false) {
    if (![x, y, radius].every(Number.isFinite)) return;
    if (id === M.Lightning) radius = 0;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (shape === "circle" && dx * dx + dy * dy > radius * radius) continue;
        const nx = Math.round(x) + dx,
          ny = Math.round(y) + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        const i = ny * this.width + nx;
        if (!id || replace || !this.cells[i]) this.set(i, id);
      }
  }
}
