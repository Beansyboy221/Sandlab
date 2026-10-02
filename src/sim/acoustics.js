import { materials, M } from "./materials.js";
export const soundKinds = [
  "grain",
  "impact",
  "fizz",
  "melt",
  "boil",
  "explosion",
  "crackle",
  "chirp",
  "splash",
];
const absorption = Float32Array.from(materials, (m) =>
  m.id === M.Sponge
    ? 0.45
    : m.category === "powder"
      ? 0.08
      : m.category === "liquid"
        ? 0.025
        : 0.012,
);
export class Acoustics {
  constructor(width, height) {
    this.width = Math.ceil(width / 4);
    this.height = Math.ceil(height / 4);
    const length = this.width * this.height;
    this.wave = new Float32Array(length);
    this.previous = new Float32Array(length);
    this.next = new Float32Array(length);
    this.damping = new Float32Array(length).fill(0.988);
    this.tilesWide = Math.ceil(width / 16);
    this.tilesHigh = Math.ceil(height / 16);
    this.last = new Int32Array(
      this.tilesWide * this.tilesHigh * soundKinds.length,
    ).fill(-1000);
    this.events = [];
    this.active = false;
    this.tick = 0;
    this.emitted = 0;
  }
  clear() {
    this.wave.fill(0);
    this.previous.fill(0);
    this.next.fill(0);
    this.events.length = 0;
    this.last.fill(-1000);
    this.active = false;
    this.emitted = 0;
  }
  emit(kind, x, y, strength = 0.2, mass = 1) {
    const type = soundKinds.indexOf(kind);
    if (
      type < 0 ||
      ![x, y, strength, mass].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      x >= this.width * 4 ||
      y >= this.height * 4 ||
      strength <= 0
    )
      return;
    const tile =
      type * this.tilesWide * this.tilesHigh +
      (y >> 4) * this.tilesWide +
      (x >> 4);
    if (this.tick - this.last[tile] < 4) return;
    this.last[tile] = this.tick;
    strength = Math.min(1.5, strength);
    mass = Math.max(0.1, Math.min(100, mass));
    const i = (y >> 2) * this.width + (x >> 2);
    this.wave[i] = Math.min(4, this.wave[i] + strength);
    this.previous[i] = Math.max(-4, this.previous[i] - strength * 0.5);
    this.active = true;
    this.emitted++;
    const event = { kind, x, y, strength, mass, tick: this.tick };
    if (this.events.length < 64) this.events.push(event);
    else {
      let quietest = 0;
      for (let n = 1; n < 64; n++)
        if (this.events[n].strength < this.events[quietest].strength)
          quietest = n;
      if (strength > this.events[quietest].strength)
        this.events[quietest] = event;
    }
  }
  rebuildAbsorption(w) {
    for (let fy = 0; fy < this.height; fy++)
      for (let fx = 0; fx < this.width; fx++) {
        let loss = 0,
          count = 0;
        for (let dy = 0; dy < 4; dy++)
          for (let dx = 0; dx < 4; dx++) {
            const x = fx * 4 + dx,
              y = fy * 4 + dy;
            if (x < w.width && y < w.height) {
              loss += absorption[w.cells[y * w.width + x]];
              count++;
            }
          }
        this.damping[fy * this.width + fx] = 1 - loss / Math.max(1, count);
      }
  }
  step(w) {
    this.tick = w.tick;
    if (!this.active) return;
    if (w.tick % 6 === 0) this.rebuildAbsorption(w);
    const {
      width: width,
      height: height,
      wave: p,
      previous: prev,
      next: n,
    } = this;
    const f = w.fields,
      loop = w.border === "looping",
      solid = w.border === "solid";
    let peak = 0;
    // Leapfrog wave equation; closed edges use a zero normal derivative to
    // reflect waves. Void edges absorb; looping edges connect to the other side.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const left = x ? i - 1 : loop ? i + width - 1 : -1,
          right = x < width - 1 ? i + 1 : loop ? i - x : -1;
        const up = y ? i - width : loop ? i + (height - 1) * width : -1,
          down = y < height - 1 ? i + width : loop ? x : -1;
        let flux = 0;
        if (left >= 0) flux += (p[left] - p[i]) * f.horizontal[left];
        else if (!solid) flux -= p[i];
        if (right >= 0) flux += (p[right] - p[i]) * f.horizontal[i];
        else if (!solid) flux -= p[i];
        if (up >= 0) flux += (p[up] - p[i]) * f.vertical[up];
        else if (!solid) flux -= p[i];
        if (down >= 0) flux += (p[down] - p[i]) * f.vertical[i];
        else if (!solid) flux -= p[i];
        n[i] = Math.max(
          -4,
          Math.min(4, (2 * p[i] - prev[i] + flux * 0.22) * this.damping[i]),
        );
        peak = Math.max(peak, Math.abs(n[i]), Math.abs(p[i]));
      }
    this.previous = p;
    this.wave = n;
    this.next = prev;
    if (peak < 0.0001) {
      this.wave.fill(0);
      this.previous.fill(0);
      this.active = false;
    }
  }
}
