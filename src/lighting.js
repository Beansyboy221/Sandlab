import { materials, M } from "./sim/materials.js";
export const LIGHT_CELL = 4;
const MAX_SOURCES = 96;
const hues = materials.map((m) => {
  const rgb = [1, 3, 5].map((p) => parseInt(m.color.slice(p, p + 2), 16));
  const brightest = Math.max(...rgb, 1);
  return rgb.map((v) => v / brightest);
});
const transparency = materials.map((m) =>
  !m.id || m.gas
    ? m.id === M.Smoke
      ? 0.97
      : 1
    : m.id === M.Glass
      ? 0.88
      : m.category === "liquid" && m.id !== M.Mercury && m.id !== M.Lava
        ? m.waterLike
          ? 0.97
          : 0.88
        : 0,
);
export function emissionStrength(m, temperature, life, charge) {
  return Math.max(
    m.circuit === "lamp" && !life ? 0 : m.lightEmission || 0,
    m.id === M.Fire
      ? 1
      : m.id === M.Lightning
        ? 1.6
        : m.id === M.Spark
          ? 1.1
          : 0,
    m.circuit === "lamp" && !life ? 0 : m.glow || 0,
    m.burn && life ? 0.65 : 0,
    charge ? 0.9 : 0,
    Math.min(1.3, Math.max(0, (temperature - 500) / 1000)),
  );
}
// Optical transport is independent of the simulation timestep. Four-pixel tiles
// bound shadow work; any opaque cell blocks a tile so thin walls cannot leak.
export class Lighting {
  resize(w) {
    this.width = Math.ceil(w.width / LIGHT_CELL);
    this.height = Math.ceil(w.height / LIGHT_CELL);
    this.length = this.width * this.height;
    this.direct = new Float32Array(this.length * 3);
    this.reflected = new Float32Array(this.length * 3);
    this.scratch = new Float32Array(this.length * 3);
    this.light = new Float32Array(this.length * 3);
    this.opacity = new Float32Array(this.length);
    this.surface = new Float32Array(this.length * 3);
    this.emit = new Float32Array(this.length);
    this.exposed = new Uint8Array(this.length);
    this.origins = new Uint32Array(this.length);
    this.emitColor = new Float32Array(this.length * 3);
    this.groups = new Float32Array(this.length * 7);
    this.sources = new Float32Array(MAX_SOURCES * 7);
    this.worldWidth = w.width;
    this.worldHeight = w.height;
  }
  index(x, y) {
    if (this.looping) {
      x = (x + this.width) % this.width;
      y = (y + this.height) % this.height;
    }
    return x < 0 || y < 0 || x >= this.width || y >= this.height
      ? -1
      : y * this.width + x;
  }
  addEmitter(x, y, strength, r, g, b, exposed = true) {
    const i = this.index(
      Math.floor(x / LIGHT_CELL),
      Math.floor(y / LIGHT_CELL),
    );
    if (i < 0) return;
    if (exposed) this.exposed[i] = 1;
    if (strength <= this.emit[i]) return;
    this.emit[i] = strength;
    this.emitColor[i * 3] = r;
    this.emitColor[i * 3 + 1] = g;
    this.emitColor[i * 3 + 2] = b;
  }
  gather(w) {
    this.opacity.fill(0);
    this.surface.fill(0);
    this.emit.fill(0);
    this.exposed.fill(0);
    for (let i = 0; i < w.length; i++) {
      const id = w.cells[i];
      if (!id) continue;
      const m = materials[id],
        x = i % w.width,
        y = Math.floor(i / w.width);
      const t =
        Math.floor(y / LIGHT_CELL) * this.width + Math.floor(x / LIGHT_CELL);
      const opaque = 1 - transparency[id];
      this.opacity[t] = Math.min(
        1,
        this.opacity[t] + (opaque === 1 ? 1 : opaque / LIGHT_CELL),
      );
      if (opaque === 1) {
        // Pigment changes reflected color without changing the underlying matter.
        const paint = w.pigment[i],
          a = (paint >>> 24) / 255;
        for (let c = 0; c < 3; c++) {
          const painted = (paint >>> (16 - c * 8)) & 255;
          this.surface[t * 3 + c] = hues[id][c] * (1 - a) + (painted / 255) * a;
        }
      }
      const energy = emissionStrength(m, w.temp[i], w.life[i], w.charge[i]);
      if (energy) {
        const thermal =
          w.temp[i] > 500 && !m.lightEmission && !m.gas && !w.charge[i];
        this.addEmitter(
          x,
          y,
          energy,
          thermal ? 1 : hues[id][0],
          thermal ? 0.45 : hues[id][1],
          thermal ? 0.17 : hues[id][2],
          m.gas || exposedCell(w, x, y),
        );
      }
    }
    for (const a of w.stickmen.bodies) {
      const heat = Math.max(...a.heat);
      if (heat > 500)
        this.addEmitter(
          a.x[1],
          a.y[1],
          Math.min(1, (heat - 500) / 800),
          1,
          0.45,
          0.17,
        );
    }
    for (const a of w.missiles.items)
      this.addEmitter(a.x, a.y, 0.5, 1, 0.6, 0.24);
    // Dense fire/lava pools merge spatially rather than dropping arbitrary lights.
    // Every emitting tile still lights itself; distant lighting uses <=96 sources.
    let size = 4,
      count;
    do {
      this.groups.fill(0);
      const columns = Math.ceil(this.width / size);
      count = 0;
      for (let i = 0; i < this.length; i++) {
        const e = this.emit[i];
        if (!e || !this.exposed[i]) continue;
        const x = i % this.width,
          y = Math.floor(i / this.width);
        const o = (Math.floor(y / size) * columns + Math.floor(x / size)) * 7;
        if (!this.groups[o]) count++;
        this.groups[o] += e;
        this.groups[o + 1] += (x + 0.5) * e;
        this.groups[o + 2] += (y + 0.5) * e;
        for (let c = 0; c < 3; c++)
          this.groups[o + 3 + c] += this.emitColor[i * 3 + c] * e;
        if (e >= this.groups[o + 6]) {
          this.groups[o + 6] = e;
          this.origins[o / 7] = i;
        }
      }
      size *= 2;
    } while (count > MAX_SOURCES);
    this.sourceCount = 0;
    for (let o = 0; o < this.groups.length; o += 7) {
      const sum = this.groups[o];
      if (!sum) continue;
      const n = this.sourceCount++ * 7;
      this.sources[n] = this.groups[o + 1] / sum;
      this.sources[n + 1] = this.groups[o + 2] / sum;
      const center = this.index(
        Math.floor(this.sources[n]),
        Math.floor(this.sources[n + 1]),
      );
      // A merged centroid must not teleport light inside a wall or lava pool.
      // Fall back to a real exposed emitter when the weighted center is buried.
      if (center < 0 || !this.exposed[center]) {
        const origin = this.origins[o / 7];
        this.sources[n] = (origin % this.width) + 0.5;
        this.sources[n + 1] = Math.floor(origin / this.width) + 0.5;
      }
      for (let c = 0; c < 3; c++)
        this.sources[n + 2 + c] = this.groups[o + 3 + c] / sum;
      this.sources[n + 5] = Math.min(
        2.2,
        this.groups[o + 6] * (1 + Math.min(0.6, sum / 12)),
      );
      this.sources[n + 6] = 14 + Math.min(10, Math.sqrt(sum));
    }
  }
  visibility(sx, sy, tx, ty) {
    let x = Math.floor(sx),
      y = Math.floor(sy);
    const endX = Math.floor(tx),
      endY = Math.floor(ty);
    const dx = Math.abs(endX - x),
      dy = Math.abs(endY - y);
    const stepX = x < endX ? 1 : -1,
      stepY = y < endY ? 1 : -1;
    let error = dx - dy,
      visible = 1;
    while (x !== endX || y !== endY) {
      const twice = error * 2,
        oldX = x,
        oldY = y;
      if (twice > -dy) {
        error -= dy;
        x += stepX;
      }
      if (twice < dx) {
        error += dx;
        y += stepY;
      }
      if (x !== oldX && y !== oldY) {
        const a = this.index(x, oldY),
          b = this.index(oldX, y);
        if (a >= 0 && b >= 0 && this.opacity[a] === 1 && this.opacity[b] === 1)
          return 0;
      }
      // The first opaque surface receives light; cells beyond it do not.
      if (x === endX && y === endY) break;
      const i = this.index(x, y);
      if (i < 0) return 0;
      visible *= 1 - this.opacity[i];
      if (visible < 0.01) return 0;
    }
    return visible;
  }
  illuminate() {
    this.direct.fill(0);
    for (let n = 0; n < this.sourceCount; n++) {
      const o = n * 7,
        sx = this.sources[o],
        sy = this.sources[o + 1];
      const radius = this.sources[o + 6],
        power = this.sources[o + 5];
      const left = this.looping ? 0 : Math.max(0, Math.floor(sx - radius));
      const right = this.looping
        ? this.width - 1
        : Math.min(this.width - 1, Math.ceil(sx + radius));
      const top = this.looping ? 0 : Math.max(0, Math.floor(sy - radius));
      const bottom = this.looping
        ? this.height - 1
        : Math.min(this.height - 1, Math.ceil(sy + radius));
      for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++) {
          let dx = x + 0.5 - sx,
            dy = y + 0.5 - sy;
          if (this.looping) {
            dx -= Math.round(dx / this.width) * this.width;
            dy -= Math.round(dy / this.height) * this.height;
          }
          const d2 = dx * dx + dy * dy;
          if (d2 >= radius * radius) continue;
          const radial = 1 - Math.sqrt(d2) / radius;
          const energy =
            ((power * radial * radial) / (1 + d2 * 0.045)) *
            this.visibility(sx, sy, sx + dx, sy + dy);
          const target = (y * this.width + x) * 3;
          for (let c = 0; c < 3; c++)
            this.direct[target + c] += energy * this.sources[o + 2 + c];
        }
    }
    for (let i = 0; i < this.length; i++)
      for (let c = 0; c < 3; c++) {
        this.direct[i * 3 + c] = Math.min(
          3,
          Math.max(
            this.direct[i * 3 + c],
            this.emit[i] * this.emitColor[i * 3 + c],
          ),
        );
      }
  }
  bounce(amount) {
    this.reflected.fill(0);
    if (!amount) return;
    let reflecting = false;
    for (let i = 0; i < this.length; i++) {
      if (
        this.opacity[i] < 1 ||
        !(
          this.direct[i * 3] ||
          this.direct[i * 3 + 1] ||
          this.direct[i * 3 + 2]
        )
      )
        continue;
      const x = i % this.width,
        y = Math.floor(i / this.width);
      for (const [dx, dy] of neighbors) {
        const j = this.index(x + dx, y + dy);
        if (j < 0 || this.opacity[j] === 1) continue;
        // Reflection returns into the incident hemisphere. Sending a lit wall's
        // radiance into its dark back face would transmit light through it.
        if (!(
          this.direct[j * 3] ||
          this.direct[j * 3 + 1] ||
          this.direct[j * 3 + 2]
        ))
          continue;
        reflecting = true;
        for (let c = 0; c < 3; c++)
          this.reflected[j * 3 + c] = Math.max(
            this.reflected[j * 3 + c],
            this.direct[i * 3 + c] * this.surface[i * 3 + c] * amount,
          );
      }
    }
    if (!reflecting) return;
    // One faint surface bounce diffuses a short distance, never through solids.
    // Max transport and attenuation keep reflected energy below incident energy.
    for (let pass = 0; pass < 4; pass++) {
      this.scratch.fill(0);
      for (let i = 0; i < this.length; i++) {
        if (this.opacity[i] === 1) continue;
        const x = i % this.width,
          y = Math.floor(i / this.width);
        for (let c = 0; c < 3; c++)
          this.scratch[i * 3 + c] = this.reflected[i * 3 + c];
        for (const [dx, dy] of neighbors) {
          const j = this.index(x + dx, y + dy);
          if (j < 0 || this.opacity[j] === 1) continue;
          for (let c = 0; c < 3; c++)
            this.scratch[i * 3 + c] = Math.max(
              this.scratch[i * 3 + c],
              this.reflected[j * 3 + c] * 0.62 * (1 - this.opacity[i]),
            );
        }
      }
      [this.reflected, this.scratch] = [this.scratch, this.reflected];
    }
  }
  update(w, bounces = 0.1) {
    if (this.worldWidth !== w.width || this.worldHeight !== w.height)
      this.resize(w);
    this.looping = w.border === "looping";
    this.gather(w);
    if (!this.sourceCount) {
      this.direct.fill(0);
      this.reflected.fill(0);
      for (let i = 0; i < this.length; i++)
        for (let c = 0; c < 3; c++)
          this.light[i * 3 + c] = this.emit[i] * this.emitColor[i * 3 + c];
      return;
    }
    this.illuminate();
    this.bounce(Math.max(0, Math.min(0.25, bounces)));
    for (let i = 0; i < this.light.length; i++)
      this.light[i] = Math.min(3, this.direct[i] + this.reflected[i]);
  }
}
const neighbors = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function exposedCell(w, x, y) {
  for (let n = 0; n < neighbors.length; n++) {
    const j = w.index(x + neighbors[n][0], y + neighbors[n][1]);
    if (j < 0 || transparency[w.cells[j]] > 0) return true;
  }
  return false;
}
