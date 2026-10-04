// An angular depth map reuses each light's visibility across thousands of
// radiance samples. Discontinuities use exact particle rays, keeping thin walls
// and narrow gaps intact without retracing every smooth sample.
const RAYS = 768,
  TAU = Math.PI * 2;
const directions = new Float32Array(RAYS * 2);
for (let i = 0; i < RAYS; i++) {
  directions[i * 2] = Math.cos((i * TAU) / RAYS);
  directions[i * 2 + 1] = Math.sin((i * TAU) / RAYS);
}
export class LightShadows {
  constructor() {
    this.scratchDepth = this.depth = new Float32Array(RAYS);
    this.scratchAttenuation = this.attenuation = new Float32Array(0);
    this.entries = [];
    this.cacheBytes = 0;
    this.cacheLimit = 8 * 1024 * 1024;
  }
  prepare(field, sx, sy, radius, slot = 0) {
    this.field = field;
    this.sx = sx;
    this.sy = sy;
    const origin = field.particleIndex(Math.floor(sx), Math.floor(sy));
    this.enabled =
      field.opaqueCount > (origin >= 0 && !field.transmission[origin] ? 1 : 0);
    this.filtered = field.hasFilters;
    this.raySteps = this.exactQueries = this.samples = 0;
    this.cacheHit = false;
    this.entry = null;
    if (!this.enabled && !this.filtered) return;
    const range = Math.ceil(radius / 8) * 8;
    this.binSize = field.cellSize;
    const bins = Math.ceil(range / this.binSize) + 2;
    let entry = this.entries[slot];
    if (!entry) {
      const bytes =
        (RAYS + field.length + (this.filtered ? RAYS * bins : 0)) * 4;
      if (this.cacheBytes + bytes <= this.cacheLimit) {
        entry = this.entries[slot] = {
          depth: new Float32Array(RAYS),
          attenuation: new Float32Array(0),
          visibility: new Float32Array(field.length),
          bytes: RAYS * 4 + field.length * 4,
        };
        this.cacheBytes += entry.bytes;
      }
    }
    const needed = this.filtered ? RAYS * bins * 4 : 0;
    if (
      entry &&
      this.cacheBytes + Math.max(0, needed - entry.attenuation.byteLength) >
        this.cacheLimit
    ) {
      this.cacheBytes -= entry.bytes + entry.attenuation.byteLength;
      this.entries[slot] = null;
      entry = null;
    }
    this.entry = entry || null;
    if (!entry) {
      this.depth = this.scratchDepth;
      this.attenuation = this.scratchAttenuation;
    }
    if (
      entry &&
      entry.revision === field.opticalRevision &&
      entry.x === sx &&
      entry.y === sy &&
      entry.radius === range &&
      entry.looping === field.looping &&
      entry.filtered === this.filtered
    ) {
      this.depth = entry.depth;
      this.attenuation = entry.attenuation;
      this.stride = bins;
      this.cacheHit = true;
      return;
    }
    if (entry) {
      this.depth = entry.depth;
      this.attenuation = entry.attenuation;
      entry.visibility.fill(-1);
      Object.assign(entry, {
        revision: field.opticalRevision,
        x: sx,
        y: sy,
        radius: range,
        looping: field.looping,
        filtered: this.filtered,
      });
    }
    radius = range;
    // The same angular rays carry cumulative transmission through smoke/glass.
    // Previously every radiance sample traced the entire filtered path again:
    // moving fire made that source × sample × distance cost recur every update.
    this.stride = bins;
    if (this.filtered && this.attenuation.length < RAYS * this.stride) {
      const nextBytes = RAYS * this.stride * 4;
      if (entry) this.cacheBytes += nextBytes - entry.attenuation.byteLength;
      this.attenuation = new Float32Array(RAYS * this.stride);
      if (entry) entry.attenuation = this.attenuation;
      else this.scratchAttenuation = this.attenuation;
    }
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
      let distance = radius,
        visible = 1,
        bin = 0;
      const offset = n * this.stride;
      while (Math.min(nextX, nextY) < radius) {
        // Empty 8×8 regions can be crossed in one step. At their boundary the
        // normal DDA still tests the exact pixel and corner; thin walls survive.
        if (
          !field.looping &&
          x >= 0 &&
          y >= 0 &&
          x < field.worldWidth &&
          y < field.worldHeight &&
          !field.opticalBlocks[(y >> 3) * field.opticalColumns + (x >> 3)]
        ) {
          const bx =
              stepX > 0
                ? Math.min(field.worldWidth, (x >> 3) * 8 + 8)
                : (x >> 3) * 8,
            by =
              stepY > 0
                ? Math.min(field.worldHeight, (y >> 3) * 8 + 8)
                : (y >> 3) * 8,
            exitX = dx ? (bx - sx) / dx : Infinity,
            exitY = dy ? (by - sy) / dy : Infinity,
            jump = Math.min(exitX, exitY);
          if (jump >= radius) break;
          x = Math.floor(sx + dx * (jump - 1e-6));
          y = Math.floor(sy + dy * (jump - 1e-6));
          nextX = Number.isFinite(deltaX)
            ? (stepX > 0 ? x + 1 - sx : sx - x) * deltaX
            : Infinity;
          nextY = Number.isFinite(deltaY)
            ? (stepY > 0 ? y + 1 - sy : sy - y) * deltaY
            : Infinity;
        }
        const crossed = Math.min(nextX, nextY);
        this.raySteps++;
        if (this.filtered)
          while (bin * this.binSize <= crossed)
            this.attenuation[offset + bin++] = visible;
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
        if (this.filtered) {
          visible *= field.transmission[i];
          if (visible < 0.01) {
            visible = 0;
            break;
          }
        }
      }
      this.depth[n] = distance;
      if (this.filtered)
        while (bin < this.stride) this.attenuation[offset + bin++] = visible;
    }
  }
  visibility(tx, ty, distance, cellSize, sample = -1) {
    const cache = sample >= 0 ? this.entry?.visibility : null;
    if (cache && cache[sample] >= 0) return cache[sample];
    const visible = this.sample(tx, ty, distance, cellSize);
    if (cache) cache[sample] = visible;
    return visible;
  }
  sample(tx, ty, distance, cellSize) {
    const f = this.field;
    this.samples++;
    if (!this.enabled && !this.filtered) return 1;
    const angle =
      (((Math.atan2(ty - this.sy, tx - this.sx) + TAU) % TAU) * RAYS) / TAU;
    const ray = Math.floor(angle),
      next = (ray + 1) % RAYS;
    if (this.enabled) {
      const a = this.depth[ray],
        b = this.depth[next];
      // Exact queries handle the first illuminated surface and angular edges.
      if (
        Math.abs(a - b) > cellSize ||
        Math.abs(distance - Math.min(a, b)) < cellSize * 1.5
      )
        return this.exact(tx, ty);
      if (distance > Math.max(a, b)) return 0;
    }
    if (!this.filtered) return 1;
    // Exclude the destination particle, just as exact visibility does. Nearby
    // samples and sharp filter boundaries keep exact queries; diffuse plumes
    // interpolate the cached transport instead of retracing long paths.
    if (distance < cellSize * 1.5) return this.exact(tx, ty);
    const d = Math.max(
        0,
        Math.min(this.stride - 2, (distance - 0.5) / this.binSize),
      ),
      lo = Math.floor(d),
      fraction = d - lo,
      a = ray * this.stride + lo,
      b = next * this.stride + lo,
      av =
        this.attenuation[a] * (1 - fraction) +
        this.attenuation[a + 1] * fraction,
      bv =
        this.attenuation[b] * (1 - fraction) +
        this.attenuation[b + 1] * fraction;
    if (Math.abs(av - bv) > 0.2) return this.exact(tx, ty);
    return av + (bv - av) * (angle - ray);
  }
  exact(tx, ty) {
    this.exactQueries++;
    return this.field.trace(this.sx, this.sy, tx, ty, true);
  }
}
