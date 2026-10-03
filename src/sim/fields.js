import { Airflow } from "./airflow.js";
import { materials } from "./materials.js";
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
    this.gradientStamp = new Uint32Array(length);
    this.gradientEpoch = 0;
    this.airflow = new Airflow(this.width, this.height);
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
      this.gradientX[i] = this.sample(fx - 1, fy) - this.sample(fx + 1, fy);
      this.gradientY[i] = this.sample(fx, fy - 1) - this.sample(fx, fy + 1);
      this.gradientStamp[i] = this.gradientEpoch;
    }
    return i;
  }
  add(x, y, value) {
    if (
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
    if (
      !Number.isFinite(amount) ||
      x < 0 ||
      y < 0 ||
      x >= this.width * 4 ||
      y >= this.height * 4
    )
      return;
    const i = this.index(x, y),
      before = this.temperature[i];
    this.temperature[i] = Math.max(-273, Math.min(6000, before + amount));
    this.add(x, y, (this.temperature[i] - before) * 0.025);
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
    const fi = this.index(x, y),
      m = materials[world.cells[i]],
      heat =
        (world.temp[i] - this.temperature[fi]) *
        (m.heatSource ? 0.08 : m.gas ? 0.015 : 0.003);
    if (!m.heatSource)
      world.temp[i] = Math.max(-273, Math.min(6000, world.temp[i] - heat));
    // One tile contains sixteen air cells; heat is retained locally and diffuses.
    this.temperature[fi] = Math.max(
      -273,
      Math.min(6000, this.temperature[fi] + heat / 16),
    );
    this.add(x, y, heat * 0.0005);
  }
  update(world) {
    if (this.lastBorder !== this.border) {
      this.obstaclesDirty = true;
      this.lastBorder = this.border;
    }
    if (world) this.rebuildBarriers(world);
    this.airflow.step(this, world);
    const {
      width: w,
      height: h,
      pressure: p,
      next: n,
      temperature: t,
      nextTemperature: nt,
    } = this;
    const loop = this.border === "looping",
      solid = this.border === "solid";
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x,
          left = x ? i - 1 : loop ? i + w - 1 : -1,
          right = x < w - 1 ? i + 1 : loop ? i - x : -1,
          up = y ? i - w : loop ? i + (h - 1) * w : -1,
          down = y < h - 1 ? i + w : loop ? x : -1;
        let pressureFlux = 0,
          heatFlux = 0,
          divergence = 0,
          heatAdvection = 0,
          incoming = 0;
        // No per-cell arrays or closures in the diffusion loop.
        for (let direction = 0; direction < 4; direction++) {
          const j =
              direction === 0
                ? left
                : direction === 1
                  ? right
                  : direction === 2
                    ? up
                    : down,
            permeability =
              j < 0
                ? solid
                  ? 0
                  : 1
                : direction === 0
                  ? this.horizontal[j]
                  : direction === 1
                    ? this.horizontal[i]
                    : direction === 2
                      ? this.vertical[j]
                      : this.vertical[i];
          const flow =
            direction === 0
              ? -(left < 0
                  ? this.airflow.west[y]
                  : this.airflow.velocityX[left])
              : direction === 1
                ? this.airflow.velocityX[i]
                : direction === 2
                  ? -(up < 0
                      ? this.airflow.north[x]
                      : this.airflow.velocityY[up])
                  : this.airflow.velocityY[i];
          divergence += flow;
          if (flow < 0) {
            incoming += -flow / 4;
            heatAdvection +=
              (-flow / 4) * ((j < 0 ? this.ambientTemperature : t[j]) - t[i]);
          }
          pressureFlux += ((j < 0 ? 0 : p[j]) - p[i]) * permeability;
          heatFlux +=
            ((j < 0 ? this.ambientTemperature : t[j]) - t[i]) * permeability;
        }
        n[i] = Math.max(
          -80,
          Math.min(
            80,
            (p[i] + pressureFlux * 0.025 - divergence * 0.55) * 0.999,
          ),
        );
        nt[i] = Math.max(
          -273,
          Math.min(
            6000,
            t[i] +
              heatFlux * 0.03 +
              heatAdvection * Math.min(0.5, 0.75 / (incoming || 1)),
          ),
        );
      }
    this.pressure = n;
    this.next = p;
    this.temperature = nt;
    this.nextTemperature = t;
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
