import { materials } from "./materials.js";

export const canvasModes = [
  ["normal", "Sandbox"],
  ["planet", "Planet"],
  ["wander", "Wandering Gravity"],
  ["vortex", "Whirlpool"],
  ["zero", "Zero Gravity"],
  ["solar", "Day And Night"],
];
export class CanvasEnvironment {
  constructor(world) {
    this.world = world;
    this.forceX = new Float32Array(world.fields.pressure.length);
    this.forceY = new Float32Array(this.forceX.length);
    this.x = this.y = 0;
    this.centerX = world.width * 0.5;
    this.centerY = world.height * 0.5;
    this.light = world.ambientLight;
  }
  get radial() {
    const mode = this.world.canvasMode;
    return mode === "planet" || mode === "wander" || mode === "vortex";
  }
  get kinetic() {
    const mode = this.world.canvasMode;
    return (
      mode === "planet" ||
      mode === "wander" ||
      mode === "vortex" ||
      mode === "zero" ||
      this.world.modeStrength !== 1
    );
  }
  update(advance = false) {
    const w = this.world,
      mode = w.canvasMode,
      strength = w.modeStrength;
    const phase = (w.tick / 600) * Math.PI * 2;
    this.centerX =
      w.width * 0.5 +
      (mode === "wander" || mode === "vortex"
        ? Math.sin(phase) * w.width * 0.15
        : 0);
    this.centerY =
      w.height * 0.5 +
      (mode === "wander" || mode === "vortex"
        ? Math.cos(phase * 0.7) * w.height * 0.12
        : 0);
    this.light =
      w.ambientLight *
      (mode === "solar" ? 0.04 + 0.96 * Math.max(0, Math.sin(phase)) : 1);
    if (
      mode === "solar" &&
      advance &&
      w.mechanics.temperatureSimulation !== false
    ) {
      const target = 5 + 45 * Math.max(0, Math.sin(phase)) * strength;
      w.fields.ambientTemperature = target;
      for (let i = 0; i < w.fields.temperature.length; i++)
        w.fields.temperature[i] += (target - w.fields.temperature[i]) * 0.001;
    }
    if (!this.kinetic) return;
    for (let y = 0; y < w.fields.height; y++)
      for (let x = 0; x < w.fields.width; x++) {
        const i = y * w.fields.width + x,
          dx = this.centerX - (x * 4 + 2),
          dy = this.centerY - (y * 4 + 2),
          r = Math.hypot(dx, dy) || 1;
        const g = Math.min(2, 900 / (r * r + 64)) * strength;
        this.forceX[i] =
          mode === "zero"
            ? 0
            : mode === "normal" || mode === "solar"
              ? w.gravityX * strength
              : (dx / r) * g;
        this.forceY[i] =
          mode === "zero"
            ? 0
            : mode === "normal" || mode === "solar"
              ? w.gravityY * strength
              : (dy / r) * g;
        if (advance && mode === "vortex" && w.tick % 2 === 0)
          w.fields.airflow.impulse(
            w.fields,
            x * 4,
            y * 4,
            -dy / r,
            dx / r,
            0.2 * strength,
          );
      }
  }
  sample(x, y) {
    const w = this.world;
    if (w.canvasMode === "normal" || w.canvasMode === "solar") {
      this.x = w.gravityX * w.modeStrength;
      this.y = w.gravityY * w.modeStrength;
      return;
    }
    if (w.canvasMode === "zero") {
      this.x = this.y = 0;
      return;
    }
    // Smooth point sampling avoids four-pixel plateaus and four separate
    // attractors near the core; the atmosphere retains its coarse force grid.
    const dx = this.centerX - x,
      dy = this.centerY - y,
      r2 = dx * dx + dy * dy,
      scale = r2
        ? (Math.min(2, 900 / (r2 + 64)) * w.modeStrength) / Math.sqrt(r2)
        : 0;
    this.x = dx * scale;
    this.y = dy * scale;
  }
  seed(i) {
    const w = this.world;
    const m = materials[w.cells[i]];
    if (
      w.canvasMode !== "planet" ||
      !m.id ||
      (!m.movable && !m.rigid && !m.elasticity) ||
      w.velocityX[i] ||
      w.velocityY[i]
    )
      return;
    const dx = (i % w.width) + 0.5 - w.width * 0.5,
      dy = Math.floor(i / w.width) + 0.5 - w.height * 0.5,
      r = Math.hypot(dx, dy);
    if (r < 3) return;
    const speed = Math.min(
      2,
      Math.sqrt((0.16 * 900 * w.modeStrength * r) / (r * r + 64)),
    );
    w.velocityX[i] = (-dy / r) * speed;
    w.velocityY[i] = (dx / r) * speed;
  }
}
