import { collisionLimits } from "./collision-limits.js";
// Continuous rigid positions need unique grid cells for chemistry and editing.
// A local augmenting path relocates earlier reservations when simple rounding
// runs out of room. It changes occupancy, never the body's physical shape.
export class BodyRaster {
  constructor(solver) {
    this.solver = solver;
    const length = solver.world.length;
    this.targets = new Int32Array(length);
    this.seeded = new Uint32Array(length);
    this.x = new Float64Array(length);
    this.y = new Float64Array(length);
    this.reservations = new Uint32Array(length);
    this.owners = new Uint32Array(length);
    this.visited = new Uint32Array(length);
    this.parents = new Int32Array(length);
    this.queue = new Int32Array(length);
    this.epoch = 0;
    this.search = 0;
  }
  begin(pixels = this.solver.world.length) {
    this.remaining = pixels * collisionLimits.rasterVisitsPerPixel;
    this.visits = 0;
    this.limited = 0;
    this.epoch = (this.epoch + 1) >>> 0 || 1;
    if (this.epoch === 1) {
      this.reservations.fill(0);
      this.seeded.fill(0);
    }
  }
  assign(node, cell) {
    this.targets[node] = cell;
    this.reservations[cell] = this.epoch;
    this.owners[cell] = node;
  }
  seed(body, pose) {
    const s = this.solver,
      w = s.world,
      previous = s.motionPose(body);
    if (!previous) return;
    const dx = Math.round(pose.x - previous.x),
      dy = Math.round(pose.y - previous.y);
    // Reuse the previous bijection before augmenting new raster candidates.
    // Rotation cannot turn an object's own reservations into immovable supports.
    for (let n = 0; n < body.ids.length; n++) {
      const i = s.locations.get(body.ids[n]);
      this.x[n] = s.targetX[n];
      this.y[n] = s.targetY[n];
      if (i === undefined || s.targets[n] < 0) continue;
      const gx = (i % w.width) + dx,
        gy = Math.floor(i / w.width) + dy;
      const j = w.index(gx, gy);
      if (
        j < 0 ||
        !s.passable(j, body) ||
        this.reservations[j] === this.epoch ||
        Math.abs(gx + 0.5 - this.x[n]) > 1.49 ||
        Math.abs(gy + 0.5 - this.y[n]) > 1.49
      )
        continue;
      this.assign(n, j);
      this.seeded[n] = this.epoch;
    }
  }
  reserve(node, x, y, body, ideal) {
    const w = this.solver.world,
      gx = Math.floor(x),
      gy = Math.floor(y);
    this.x[node] = x;
    this.y[node] = y;
    if (ideal < 0) {
      this.targets[node] = -1;
      return true;
    }
    if (this.reservations[ideal] !== this.epoch) {
      this.assign(node, ideal);
      return true;
    }
    // Prefer the nearest free neighbor before exploring existing reservations.
    let best = -1,
      distance = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = w.index(gx + dx, gy + dy);
        if (
          k < 0 ||
          this.reservations[k] === this.epoch ||
          !this.solver.passable(k, body)
        )
          continue;
        const d = (gx + dx + 0.5 - x) ** 2 + (gy + dy + 0.5 - y) ** 2;
        if (d < distance) {
          distance = d;
          best = k;
        }
      }
    if (best >= 0) {
      this.assign(node, best);
      return true;
    }
    this.search = (this.search + 1) >>> 0 || 1;
    if (this.search === 1) this.visited.fill(0);
    this.queue[0] = node;
    this.parents[node] = -1;
    this.visited[node] = this.search;
    let head = 0,
      tail = 1;
    while (head < tail) {
      if (head >= collisionLimits.rasterSearch || this.remaining-- <= 0) {
        this.limited++;
        return false;
      }
      this.visits++;
      const current = this.queue[head++],
        cx = Math.floor(this.x[current]),
        cy = Math.floor(this.y[current]);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = w.index(cx + dx, cy + dy);
          if (k < 0 || !this.solver.passable(k, body)) continue;
          if (this.reservations[k] !== this.epoch) {
            let moving = current,
              cell = k;
            while (moving >= 0) {
              const previous = this.targets[moving];
              this.assign(moving, cell);
              cell = previous;
              moving = this.parents[moving];
            }
            return true;
          }
          const owner = this.owners[k];
          if (this.visited[owner] === this.search) continue;
          this.visited[owner] = this.search;
          this.parents[owner] = current;
          if (tail < collisionLimits.rasterSearch) this.queue[tail++] = owner;
        }
    }
    return false;
  }
}
