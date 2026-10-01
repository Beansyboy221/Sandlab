import { particleStateFields } from "./particle-state.js";
import { materials, M } from "./materials.js";
import { Fields } from "./fields.js";
import { react } from "./reactions.js";
import { moveSurfaceFlame } from "./combustion.js";

export class World {
  constructor(width = 320, height = 200, seed = 17421) {
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
  eachNeighbor(x, y, fn) {
    const i = y * this.width + x;
    if (x > 0) fn(i - 1);
    if (x < this.width - 1) fn(i + 1);
    if (y > 0) fn(i - this.width);
    if (y < this.height - 1) fn(i + this.width);
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
      cat = m.category,
      w = this.width,
      h = this.height;
    if (!m.movable) return;
    const gas = m.gas,
      dy = gas ? (m.density > 0 ? 1 : -1) : 1;
    const direction = this.random() < 0.5 ? -1 : 1;
    const field = this.fields.index(x, y),
      fw = this.fields.width,
      p = this.fields.pressure;
    const gx =
      (field % fw > 0 ? p[field - 1] : 0) -
      (field % fw < fw - 1 ? p[field + 1] : 0);
    const gy =
      (field >= fw ? p[field - fw] : 0) -
      (field < p.length - fw ? p[field + fw] : 0);
    if ((Math.abs(gx) > 1 || Math.abs(gy) > 1) && this.random() < 0.6) {
      const nx = x + Math.sign(gx),
        ny = y + Math.sign(gy);
      if (
        nx >= 0 &&
        nx < w &&
        ny >= 0 &&
        ny < h &&
        this.canMove(i, ny * w + nx, Math.sign(gy))
      ) {
        this.swap(i, ny * w + nx);
        return;
      }
    }
    if (this.cells[i] === M.Fire && moveSurfaceFlame(this, i, x, y)) return;
    const ny = y + dy;
    if (ny >= 0 && ny < h) {
      let j = ny * w + x;
      if (this.canMove(i, j, dy)) {
        this.swap(i, j);
        return;
      }
      for (let side = 0; side < 2; side++) {
        const nx = x + (side ? -direction : direction);
        j = ny * w + nx;
        if (nx >= 0 && nx < w && this.canMove(i, j, dy)) {
          this.swap(i, j);
          return;
        }
      }
    }
    if (cat === "liquid" || gas) {
      if (this.random() > 1 / m.viscosity) return;
      const reach = gas ? 1 : 4;
      for (let side = 0; side < 2; side++) {
        const sign = side ? -direction : direction;
        let target = -1;
        for (let d = 1; d <= reach; d++) {
          const nx = x + sign * d;
          if (nx < 0 || nx >= w) break;
          const j = y * w + nx;
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
            if (x < w - 1) this.transferHeat(i, i + 1);
            if (y < h - 1) this.transferHeat(i, i + w);
            if (materials[this.cells[i]].category !== "special")
              this.temp[i] += (20 - this.temp[i]) * 0.0008;
          }
          react(this, i, x, y);
          if (this.cells[i] === M.Fan) {
            for (let d = 2; d < 15; d++) {
              const nx = x + d;
              if (nx >= w - 1) break;
              const j = y * w + nx;
              if (
                this.cells[j] &&
                !["solid", "special"].includes(
                  materials[this.cells[j]].category,
                ) &&
                !this.cells[j + 1]
              )
                this.swap(j, j + 1);
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
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx,
          ny = y + dy,
          d2 = dx * dx + dy * dy;
        if (
          nx < 0 ||
          nx >= this.width ||
          ny < 0 ||
          ny >= this.height ||
          d2 > r2
        )
          continue;
        const i = ny * this.width + nx,
          m = materials[this.cells[i]];
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
    this.set(y * this.width + x, M.Fire, 1100, 50);
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
