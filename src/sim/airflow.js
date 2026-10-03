const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const MAX_AIR_SPEED = 3;
export const airflowFields = ["velocityX", "velocityY", "west", "north"];
// Velocities live on tile faces. A closed face has zero flux; a narrow opening
// carries proportionally less volume, while its open lane can still form a jet.
export class Airflow {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.velocityX = new Float32Array(width * height);
    this.velocityY = new Float32Array(width * height);
    this.nextX = new Float32Array(width * height);
    this.nextY = new Float32Array(width * height);
    this.west = new Float32Array(height);
    this.north = new Float32Array(width);
    this.x = this.y = 0;
  }
  step(f, world) {
    const w = this.width,
      h = this.height,
      p = f.pressure,
      t = f.temperature,
      vx = this.velocityX,
      vy = this.velocityY;
    const loop = f.border === "looping",
      solid = f.border === "solid",
      gx = world?.gravityX || 0,
      gy = world?.gravityY ?? 1;
    const speed = world?.mechanics.windStrength || 0,
      direction = world?.mechanics.windDirection || "right";
    const across =
        direction === "right" ? speed : direction === "left" ? -speed : 0,
      down = direction === "down" ? speed : direction === "up" ? -speed : 0;
    const windX = gy * across + gx * down,
      windY = -gx * across + gy * down;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x,
          left = x ? i - 1 : loop ? i + w - 1 : -1,
          right = x < w - 1 ? i + 1 : loop ? i - x : -1,
          up = y ? i - w : loop ? i + (h - 1) * w : -1,
          below = y < h - 1 ? i + w : loop ? x : -1;
        let diffuseX = 0,
          diffuseY = 0;
        for (let d = 0; d < 4; d++) {
          const j = d === 0 ? left : d === 1 ? right : d === 2 ? up : below;
          if (j < 0) continue;
          const open =
            d === 0
              ? f.horizontal[j]
              : d === 1
                ? f.horizontal[i]
                : d === 2
                  ? f.vertical[j]
                  : f.vertical[i];
          diffuseX += (vx[j] - vx[i]) * open;
          diffuseY += (vy[j] - vy[i]) * open;
        }
        const horizontal = right < 0 ? (solid ? 0 : 1) : f.horizontal[i],
          vertical = below < 0 ? (solid ? 0 : 1) : f.vertical[i];
        const heatX = clamp(
          (t[i] + (right < 0 ? f.ambientTemperature : t[right])) * 0.5 -
            f.ambientTemperature,
          -300,
          300,
        );
        const heatY = clamp(
          (t[i] + (below < 0 ? f.ambientTemperature : t[below])) * 0.5 -
            f.ambientTemperature,
          -300,
          300,
        );
        this.nextX[i] = clamp(
          vx[i] * 0.985 +
            ((p[i] - (right < 0 ? 0 : p[right])) * 0.12 - gx * heatX * 0.0001) *
              horizontal +
            diffuseX * 0.03 +
            (speed ? (windX - vx[i]) * 0.025 * horizontal : 0),
          -MAX_AIR_SPEED * horizontal,
          MAX_AIR_SPEED * horizontal,
        );
        this.nextY[i] = clamp(
          vy[i] * 0.985 +
            ((p[i] - (below < 0 ? 0 : p[below])) * 0.12 - gy * heatY * 0.0001) *
              vertical +
            diffuseY * 0.03 +
            (speed ? (windY - vy[i]) * 0.025 * vertical : 0),
          -MAX_AIR_SPEED * vertical,
          MAX_AIR_SPEED * vertical,
        );
        if (x === 0)
          this.west[y] = loop
            ? 0
            : solid
              ? 0
              : clamp(
                  this.west[y] * 0.985 -
                    p[i] * 0.12 +
                    (speed ? (windX - this.west[y]) * 0.025 : 0),
                  -MAX_AIR_SPEED,
                  MAX_AIR_SPEED,
                );
        if (y === 0)
          this.north[x] = loop
            ? 0
            : solid
              ? 0
              : clamp(
                  this.north[x] * 0.985 -
                    p[i] * 0.12 +
                    (speed ? (windY - this.north[x]) * 0.025 : 0),
                  -MAX_AIR_SPEED,
                  MAX_AIR_SPEED,
                );
      }
    this.velocityX = this.nextX;
    this.nextX = vx;
    this.velocityY = this.nextY;
    this.nextY = vy;
  }
  sample(f, x, y) {
    const fx = Math.min(this.width - 1, Math.max(0, Math.floor(x / 4))),
      fy = Math.min(this.height - 1, Math.max(0, Math.floor(y / 4))),
      i = fy * this.width + fx;
    const left = fx ? i - 1 : f.border === "looping" ? i + this.width - 1 : -1,
      up = fy
        ? i - this.width
        : f.border === "looping"
          ? i + (this.height - 1) * this.width
          : -1;
    const a = clamp((x - fx * 4 + 0.5) / 4, 0, 1),
      b = clamp((y - fy * 4 + 0.5) / 4, 0, 1);
    const lx = left < 0 ? this.west[fy] : this.velocityX[left],
      uy = up < 0 ? this.north[fx] : this.velocityY[up];
    this.x = lx * (1 - a) + this.velocityX[i] * a;
    this.y = uy * (1 - b) + this.velocityY[i] * b;
    return i;
  }
  impulse(f, x, y, dx, dy, power = 1) {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      !Number.isFinite(power) ||
      x < 0 ||
      y < 0 ||
      x >= this.width * 4 ||
      y >= this.height * 4
    )
      return;
    const i = f.index(x, y),
      length = Math.hypot(dx, dy) || 1;
    this.velocityX[i] = clamp(
      this.velocityX[i] + (dx / length) * 0.25 * power,
      -MAX_AIR_SPEED,
      MAX_AIR_SPEED,
    );
    this.velocityY[i] = clamp(
      this.velocityY[i] + (dy / length) * 0.25 * power,
      -MAX_AIR_SPEED,
      MAX_AIR_SPEED,
    );
  }
  clear() {
    for (const key of airflowFields) this[key].fill(0);
    this.nextX.fill(0);
    this.nextY.fill(0);
    this.x = this.y = 0;
  }
}
