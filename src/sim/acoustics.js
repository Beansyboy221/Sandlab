import { stepAcousticField } from "./solvers/acoustics.js";
import { AcousticListener } from "./acoustic-listener.js";
import {
  AIR_DAMPING,
  absorption,
  dispersion,
  transmission,
} from "./acoustic-properties.js";
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
  "slosh",
  "swoosh",
];
export class Acoustics {
  constructor(width, height, world = null) {
    this.world = world;
    this.width = Math.ceil(width / 4);
    this.height = Math.ceil(height / 4);
    const length = this.width * this.height;
    this.wave = new Float32Array(length);
    this.previous = new Float32Array(length);
    this.next = new Float32Array(length);
    this.damping = new Float32Array(length).fill(AIR_DAMPING);
    this.dispersion = new Float32Array(length);
    this.horizontal = new Float32Array(length).fill(1);
    this.vertical = new Float32Array(length).fill(1);
    this.tilesWide = Math.ceil(width / 16);
    this.tilesHigh = Math.ceil(height / 16);
    this.last = new Int32Array(
      this.tilesWide * this.tilesHigh * soundKinds.length,
    ).fill(-1000);
    this.events = [];
    this.active = false;
    this.tick = 0;
    this.emitted = 0;
    this.lastEmission = -1000;
    this.revision = 1;
    this.listener = new AcousticListener(this);
  }
  clear() {
    this.wave.fill(0);
    this.previous.fill(0);
    this.next.fill(0);
    this.events.length = 0;
    this.last.fill(-1000);
    this.active = false;
    this.emitted = 0;
    this.lastEmission = -1000;
    this.absorptionTick = -1000;
    this.revision++;
  }
  emit(
    kind,
    x,
    y,
    strength = 0.2,
    mass = 1,
    material = undefined,
    effects = null,
  ) {
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
    if (
      this.tick - this.last[tile] <
      (kind === "slosh" || kind === "swoosh" ? 12 : 4)
    )
      return;
    this.last[tile] = this.tick;
    strength = Math.min(1.5, strength);
    mass = Math.max(0.1, Math.min(100, mass));
    const i = (y >> 2) * this.width + (x >> 2);
    this.wave[i] = Math.min(4, this.wave[i] + strength);
    this.previous[i] = Math.max(-4, this.previous[i] - strength * 0.5);
    this.active = true;
    this.emitted++;
    this.lastEmission = this.tick;
    const id =
      material ??
      this.world?.cells[Math.floor(y) * this.world.width + Math.floor(x)] ??
      0;
    const event = {
      kind,
      x,
      y,
      strength,
      mass,
      material: id,
      tick: this.tick,
      ...effects,
    };
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
    this.revision++;
    this.absorptionTick = w.tick;
    for (let fy = 0; fy < this.height; fy++)
      for (let fx = 0; fx < this.width; fx++) {
        let loss = 0,
          scatter = 0,
          count = 0;
        for (let dy = 0; dy < 4; dy++)
          for (let dx = 0; dx < 4; dx++) {
            const x = fx * 4 + dx,
              y = fy * 4 + dy;
            if (x < w.width && y < w.height) {
              const id = w.cells[y * w.width + x];
              loss += absorption[id];
              scatter += dispersion[id];
              count++;
            }
          }
        const tile = fy * this.width + fx;
        this.dispersion[tile] = scatter / Math.max(1, count);
        this.horizontal[tile] = this.faceTransmission(w, fx, fy, true);
        this.vertical[tile] = this.faceTransmission(w, fx, fy, false);
        this.damping[fy * this.width + fx] = Math.max(
          0.4,
          AIR_DAMPING - loss / Math.max(1, count),
        );
      }
  }
  faceTransmission(w, fx, fy, horizontal) {
    let sum = 0;
    for (let lane = 0; lane < 4; lane++) {
      let open = 1;
      for (let d = 0; d <= 4; d++) {
        const x = fx * 4 + (horizontal ? 2 + d : lane),
          y = fy * 4 + (horizontal ? lane : 2 + d),
          i = w.index(x, y);
        if (i >= 0) open = Math.min(open, transmission[w.cells[i]]);
      }
      sum += open;
    }
    return sum * 0.25;
  }
  step(w) {
    stepAcousticField(this, w);
  }
}
