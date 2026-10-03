// An angular depth map reuses each light's visibility across thousands of
// radiance samples. Its arc spacing is below one particle at the maximum range;
// discontinuities use exact rays, keeping thin walls and narrow gaps intact.
const RAYS = 768,
  TAU = Math.PI * 2;
const directions = new Float32Array(RAYS * 2);
for (let i = 0; i < RAYS; i++) {
  directions[i * 2] = Math.cos((i * TAU) / RAYS);
  directions[i * 2 + 1] = Math.sin((i * TAU) / RAYS);
}
export class LightShadows {
  constructor() {
    this.depth = new Float32Array(RAYS);
  }
  prepare(field, sx, sy, radius) {
    this.field = field;
    this.sx = sx;
    this.sy = sy;
    const origin = field.particleIndex(Math.floor(sx), Math.floor(sy));
    this.enabled =
      field.opaqueCount > (origin >= 0 && !field.transmission[origin] ? 1 : 0);
    if (!this.enabled) return;
    for (let n = 0; n < RAYS; n++) {
      const dx = directions[n * 2],
        dy = directions[n * 2 + 1];
      let x = Math.floor(sx),
        y = Math.floor(sy);
      const stepX = dx > 0 ? 1 : -1,
        stepY = dy > 0 ? 1 : -1;
      const deltaX = Math.abs(dx) > 1e-7 ? Math.abs(1 / dx) : Infinity;
      const deltaY = Math.abs(dy) > 1e-7 ? Math.abs(1 / dy) : Infinity;
      let nextX = Number.isFinite(deltaX)
        ? (stepX > 0 ? x + 1 - sx : sx - x) * deltaX
        : Infinity;
      let nextY = Number.isFinite(deltaY)
        ? (stepY > 0 ? y + 1 - sy : sy - y) * deltaY
        : Infinity;
      let distance = radius;
      while (Math.min(nextX, nextY) < radius) {
        const crossed = Math.min(nextX, nextY);
        if (Math.abs(nextX - nextY) < 1e-6) {
          const a = field.particleIndex(x + stepX, y),
            b = field.particleIndex(x, y + stepY);
          if (
            a >= 0 &&
            b >= 0 &&
            !field.transmission[a] &&
            !field.transmission[b]
          ) {
            distance = crossed;
            break;
          }
          x += stepX;
          y += stepY;
          nextX += deltaX;
          nextY += deltaY;
        } else if (nextX < nextY) {
          x += stepX;
          nextX += deltaX;
        } else {
          y += stepY;
          nextY += deltaY;
        }
        const i = field.particleIndex(x, y);
        if (i < 0 || !field.transmission[i]) {
          distance = crossed;
          break;
        }
      }
      this.depth[n] = distance;
    }
  }
  visibility(tx, ty, distance, cellSize) {
    const f = this.field;
    if (this.enabled) {
      const angle =
        (((Math.atan2(ty - this.sy, tx - this.sx) + TAU) % TAU) * RAYS) / TAU;
      const a = this.depth[Math.floor(angle)],
        b = this.depth[(Math.floor(angle) + 1) % RAYS];
      // Exact queries handle the first illuminated surface and angular edges.
      if (
        Math.abs(a - b) > cellSize ||
        Math.abs(distance - Math.min(a, b)) < cellSize * 1.5
      )
        return f.trace(this.sx, this.sy, tx, ty, true);
      if (distance > Math.max(a, b)) return 0;
    }
    return f.hasFilters ? f.trace(this.sx, this.sy, tx, ty, true) : 1;
  }
}
