import { materials } from "./materials.js";

const gap = (v, lo, hi) => Math.max(lo - v, 0, v - hi);
const axisDistance = (v, lo, hi, size, loop) =>
  loop
    ? Math.min(gap(v, lo, hi), gap(v - size, lo, hi), gap(v + size, lo, hi))
    : gap(v, lo, hi);
export const wrappedDelta = (delta, size, loop) =>
  loop ? delta - Math.round(delta / size) * size : delta;
// Guidance reads one shared laser snapshot after particle motion. Aiming is a
// transient input: exports contain missiles, but never an old user's cursor.
export class LaserGuidance {
  constructor(world) {
    this.world = world;
    this.count = 0;
    this.binSize = 16;
    this.binWidth = Math.ceil(world.width / this.binSize);
    this.binHeight = Math.ceil(world.height / this.binSize);
    this.heads = new Int32Array(this.binWidth * this.binHeight);
    this.next = new Int32Array(world.length);
    this.visited = new Uint32Array(this.heads.length);
    this.epoch = 0;
    this.cursor = null;
    this.x = this.y = 0;
  }
  setCursor(point) {
    const w = this.world;
    this.cursor =
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < w.width &&
      point.y < w.height
        ? { x: point.x, y: point.y }
        : null;
  }
  capture() {
    this.count = 0;
    this.heads.fill(-1);
    const w = this.world;
    for (let i = 0; i < w.length; i++)
      if (materials[w.cells[i]].ray === "laser" && w.life[i] > 0) {
        this.count++;
        const bin =
          Math.floor((i % w.width) / this.binSize) +
          Math.floor(Math.floor(i / w.width) / this.binSize) * this.binWidth;
        this.next[i] = this.heads[bin];
        this.heads[bin] = i;
      }
  }
  visible(a, dx, dy) {
    const w = this.world,
      steps = Math.ceil(Math.hypot(dx, dy));
    for (let n = 1; n < steps; n++) {
      const i = w.index(
        Math.floor(a.x + (dx * n) / steps),
        Math.floor(a.y + (dy * n) / steps),
      );
      if (i < 0) return false;
      const m = materials[w.cells[i]];
      if (m.occludesLight && !m.ray) return false;
    }
    return true;
  }
  visitBin(a, bx, by) {
    const w = this.world,
      loop = w.border === "looping";
    if (loop) {
      bx = ((bx % this.binWidth) + this.binWidth) % this.binWidth;
      by = ((by % this.binHeight) + this.binHeight) % this.binHeight;
    } else if (bx < 0 || by < 0 || bx >= this.binWidth || by >= this.binHeight)
      return;
    const bin = by * this.binWidth + bx;
    if (this.visited[bin] === this.epoch) return;
    this.visited[bin] = this.epoch;
    const dx = axisDistance(
        a.x,
        bx * this.binSize,
        Math.min(w.width, (bx + 1) * this.binSize),
        w.width,
        loop,
      ),
      dy = axisDistance(
        a.y,
        by * this.binSize,
        Math.min(w.height, (by + 1) * this.binSize),
        w.height,
        loop,
      );
    if (dx * dx + dy * dy > this.distance) return;
    for (let i = this.heads[bin]; i >= 0; i = this.next[i]) {
      if (materials[w.cells[i]].ray !== "laser" || !w.life[i]) continue;
      const dx = wrappedDelta((i % w.width) + 0.5 - a.x, w.width, loop),
        dy = wrappedDelta(Math.floor(i / w.width) + 0.5 - a.y, w.height, loop),
        d = dx * dx + dy * dy;
      if (
        (d < this.distance ||
          (d === this.distance && (this.best < 0 || i < this.best))) &&
        this.visible(a, dx, dy)
      ) {
        this.best = i;
        this.distance = d;
        this.x = a.x + dx;
        this.y = a.y + dy;
      }
    }
  }
  nearest(a) {
    this.best = -1;
    this.distance = this.world.mechanics.missileRange ** 2;
    this.epoch = (this.epoch + 1) >>> 0 || 1;
    if (this.epoch === 1) this.visited.fill(0);
    const bx = Math.floor(a.x / this.binSize),
      by = Math.floor(a.y / this.binSize),
      limit = Math.min(
        Math.max(this.binWidth, this.binHeight),
        Math.ceil(this.world.mechanics.missileRange / this.binSize) + 2,
      );
    // Nearby bins first. Two extra bins conservatively account for partial edge
    // tiles when a looping world is not a multiple of the bin width.
    for (let ring = 0; ring <= limit; ring++) {
      if (ring > 2 && ((ring - 2) * this.binSize) ** 2 > this.distance) break;
      if (!ring) this.visitBin(a, bx, by);
      else {
        for (let x = bx - ring; x <= bx + ring; x++) {
          this.visitBin(a, x, by - ring);
          this.visitBin(a, x, by + ring);
        }
        for (let y = by - ring + 1; y < by + ring; y++) {
          this.visitBin(a, bx - ring, y);
          this.visitBin(a, bx + ring, y);
        }
      }
    }
    return this.best;
  }
  target(a) {
    a.target = this.nearest(a);
    a.targetKind = a.target >= 0 ? "laser" : "none";
    if (a.target < 0 && this.cursor) {
      const w = this.world,
        loop = w.border === "looping";
      const dx = wrappedDelta(this.cursor.x - a.x, w.width, loop),
        dy = wrappedDelta(this.cursor.y - a.y, w.height, loop);
      // A launch tap is not a target on the missile's own body.
      if (dx * dx + dy * dy > 16) {
        this.x = a.x + dx;
        this.y = a.y + dy;
        a.targetKind = "cursor";
      }
    }
    if (a.targetKind !== "none") {
      a.targetX = this.x;
      a.targetY = this.y;
    }
    return a.targetKind !== "none";
  }
  clear() {
    this.cursor = null;
    this.count = 0;
  }
}
