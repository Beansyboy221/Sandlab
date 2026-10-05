import { Airflow } from "./airflow.js";
import { materials } from "./materials.js";
import { exchangeWithAir, depositHeat } from "./solvers/thermodynamics.js";
import { stepAtmosphere } from "./solvers/atmospherics.js";
const airBlockage = Float32Array.from(materials, (m) =>
  m.static ||
  m.category === "solid" ||
  m.category === "elastic" ||
  m.category === "special"
    ? 1 - (m.airPermeability || 0)
    : 0,
);

// Pressure, heat and air momentum share cached barriers and boundary rules.
// This is a bounded compressible gameplay solver, with pressure relative to ambient.
export class Fields {
  constructor(width, height) {
    this.border = "solid";
    this.scale = 4;
    this.width = Math.ceil(width / 4);
    this.height = Math.ceil(height / 4);
    const length = this.width * this.height;
    this.ambientTemperature = 20;
    this.ambientPressure = 1;
    this.pressure = new Float32Array(length);
    this.next = new Float32Array(length);
    this.temperature = new Float32Array(length).fill(this.ambientTemperature);
    this.nextTemperature = new Float32Array(length);
    this.horizontal = new Float32Array(length).fill(1);
    this.vertical = new Float32Array(length).fill(1);
    this.dirtyTiles = new Uint8Array(length);
    this.obstaclesDirty = true;
    this.gradientX = new Float64Array(length);
    this.gradientY = new Float64Array(length);
    this.gradientPressure = new Float32Array(length);
    this.gradientStamp = new Uint32Array(length);
    this.gradientEpoch = 0;
    this.forceX = this.forceY = this.surfaceStress = 0;
    this.stressWrites = 0;
    this.airflow = new Airflow(this.width, this.height);
    this.windEnabled = this.pressureEnabled = this.temperatureEnabled = true;
  }
  configure(mechanics) {
    this.windEnabled = this.pressureEnabled =
      mechanics?.pressureSimulation !== false;
    this.temperatureEnabled = mechanics?.temperatureSimulation !== false;
    if (!this.windEnabled) this.airflow.clear();
    if (!this.pressureEnabled) {
      this.pressure.fill(0);
      this.next.fill(0);
      this.beginForceSample();
    }
  }
  index(x, y) {
    return (y >> 2) * this.width + (x >> 2);
  }
  blocks(id) {
    return airBlockage[id];
  }
  markObstacle(i, world) {
    const x = i % world.width,
      y = Math.floor(i / world.width),
      fx = x >> 2,
      fy = y >> 2,
      tile = fy * this.width + fx;
    this.dirtyTiles[tile] = 1;
    this.dirtyTiles[fy * this.width + (fx ? fx - 1 : this.width - 1)] = 1;
    this.dirtyTiles[(fy ? fy - 1 : this.height - 1) * this.width + fx] = 1;
    // Partial tiles at wrapped borders can sample a second neighboring tile.
    if (world.border === "looping") {
      this.dirtyTiles[fy * this.width + ((fx + 1) % this.width)] = 1;
      this.dirtyTiles[((fy + 1) % this.height) * this.width + fx] = 1;
    }
  }
  sample(x, y, values = this.pressure, ambient = 0) {
    if (this.border === "looping") {
      x = ((x % this.width) + this.width) % this.width;
      y = ((y % this.height) + this.height) % this.height;
    }
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return ambient;
    return values[y * this.width + x];
  }
  // Reuse coarse gradients during a force pass. Pressure writes invalidate the
  // generation; new passes also see restored data or direct diagnostic writes.
  beginForceSample() {
    this.gradientEpoch = (this.gradientEpoch + 1) >>> 0 || 1;
    if (this.gradientEpoch === 1) this.gradientStamp.fill(0);
  }
  forceGradient(x, y) {
    const i = this.index(x, y);
    if (this.gradientStamp[i] !== this.gradientEpoch) {
      const fx = x >> 2,
        fy = y >> 2;
      const left = this.sample(fx - 1, fy),
        right = this.sample(fx + 1, fy),
        up = this.sample(fx, fy - 1),
        down = this.sample(fx, fy + 1);
      this.gradientX[i] = left - right;
      this.gradientY[i] = up - down;
      this.gradientPressure[i] = left + right + up + down;
      this.gradientStamp[i] = this.gradientEpoch;
    }
    return i;
  }
  // Pressure traction is sampled only on exposed faces, with reusable scalar
  // outputs. Interiors add no duplicate force; uniform ambient load cancels.
  surfaceForce(world, i) {
    const x = i % world.width,
      y = Math.floor(i / world.width);
    const center = this.pressure[this.index(x, y)];
    this.forceX = this.forceY = this.surfaceStress = 0;
    if (!this.pressureEnabled) return;
    for (let d = 0; d < 4; d++) {
      const dx = d === 0 ? -1 : d === 1 ? 1 : 0,
        dy = d === 2 ? -1 : d === 3 ? 1 : 0;
      const j = world.index(x + dx, y + dy);
      if (j >= 0 && this.blocks(world.cells[j]) >= 0.95) continue;
      const p = this.sample(
        Math.floor((x + dx * 4) / 4),
        Math.floor((y + dy * 4) / 4),
      );
      this.forceX -= dx * p;
      this.forceY -= dy * p;
      this.surfaceStress = Math.max(this.surfaceStress, Math.abs(p - center));
    }
  }
  // Moving actors use the same cached local pressure gradient and air velocity.
  forceAt(x, y, pressure = 0.015, drag = 0.02) {
    x = Math.max(0, Math.min(this.width * 4 - 1, x));
    y = Math.max(0, Math.min(this.height * 4 - 1, y));
    const i = this.forceGradient(x, y);
    this.airflow.sample(this, x, y);
    this.forceX = this.gradientX[i] * pressure + this.airflow.x * drag;
    this.forceY = this.gradientY[i] * pressure + this.airflow.y * drag;
    return i;
  }
  add(x, y, value) {
    if (
      !this.pressureEnabled ||
      !value ||
      !Number.isFinite(value) ||
      x < 0 ||
      y < 0 ||
      x >= this.width * 4 ||
      y >= this.height * 4
    )
      return;
    const i = this.index(x, y);
    const before = this.pressure[i];
    this.pressure[i] = Math.max(-80, Math.min(80, before + value));
    if (this.pressure[i] !== before) this.beginForceSample();
  }
  heat(x, y, amount) {
    depositHeat(this, x, y, amount);
  }
  // Cache the permeability of each shared edge. Four narrow corridors between
  // tile centers detect thin walls even when they miss a coarse-grid boundary.
  rebuildBarriers(world) {
    if (!world) return;
    for (let fy = 0; fy < this.height; fy++)
      for (let fx = 0; fx < this.width; fx++) {
        const i = fy * this.width + fx;
        if (!this.obstaclesDirty && !this.dirtyTiles[i]) continue;
        this.dirtyTiles[i] = 0;
        this.horizontal[i] = this.corridors(world, fx, fy, true);
        this.vertical[i] = this.corridors(world, fx, fy, false);
      }
    this.obstaclesDirty = false;
  }
  corridors(world, fx, fy, horizontal) {
    let total = 0;
    for (let lane = 0; lane < 4; lane++) {
      let open = 1;
      for (let d = 0; d <= 4; d++) {
        const x = fx * 4 + (horizontal ? 2 + d : lane),
          y = fy * 4 + (horizontal ? lane : 2 + d),
          j = world.index(x, y);
        // Physical outside boundaries are handled separately during diffusion.
        if (j >= 0) open = Math.min(open, 1 - this.blocks(world.cells[j]));
      }
      total += open;
    }
    return total * 0.25;
  }
  exchange(world, i, x, y) {
    exchangeWithAir(this, world, i, x, y);
  }
  update(world) {
    stepAtmosphere(this, world);
  }
  clear() {
    this.pressure.fill(0);
    this.next.fill(0);
    this.airflow.clear();
    this.temperature.fill(this.ambientTemperature);
    this.nextTemperature.fill(this.ambientTemperature);
    this.obstaclesDirty = true;
  }
}
