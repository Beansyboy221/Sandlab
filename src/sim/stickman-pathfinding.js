import { blocked } from "./stickman-body.js";
import { materials } from "./materials.js";
const CELL = 3;

// Bounded A* on standing positions, with walking, jumping and dropping edges.
// Clearance is sampled lazily, avoiding a full-world navigation rebuild per actor.
export class StickmanPathfinder {
  constructor(world) {
    this.world = world;
    this.width = Math.ceil(world.width / CELL);
    this.height = Math.ceil(world.height / CELL);
    const size = this.width * this.height;
    this.cost = new Float32Array(size);
    this.parent = new Int32Array(size);
    this.closed = new Uint8Array(size);
    this.standing = new Int8Array(size);
    this.heap = [];
  }
  point(i) {
    return {
      x: (i % this.width) * CELL + 1.5,
      y: Math.floor(i / this.width) * CELL + 1.5,
    };
  }
  clear(x, y) {
    const w = this.world,
      gx = w.gravityX,
      gy = w.gravityY;
    for (let h = 0; h <= 14; h += 2)
      for (let s = -2; s <= 2; s += 2) {
        const px = x - gx * h + gy * s,
          py = y - gy * h - gx * s;
        if (blocked(w, px, py)) return false;
        const i = w.index(Math.floor(px), Math.floor(py));
        if (i >= 0 && (w.temp[i] > 100 || materials[w.cells[i]].acidic))
          return false;
      }
    return true;
  }
  stand(i) {
    if (i < 0 || i >= this.standing.length) return false;
    if (this.standing[i]) return this.standing[i] === 1;
    const p = this.point(i),
      w = this.world;
    const valid =
      this.clear(p.x, p.y) &&
      [1, 2, 3].some((d) =>
        blocked(w, p.x + w.gravityX * d, p.y + w.gravityY * d),
      );
    this.standing[i] = valid ? 1 : -1;
    return valid;
  }
  nearest(x, y) {
    let best = -1,
      distance = Infinity;
    const cx = Math.floor(x / CELL),
      cy = Math.floor(y / CELL);
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const u = cx + dx,
          v = cy + dy;
        if (u < 0 || u >= this.width || v < 0 || v >= this.height) continue;
        const i = v * this.width + u,
          p = this.point(i),
          d = Math.hypot(p.x - x, p.y - y);
        if (d < distance && this.stand(i)) {
          best = i;
          distance = d;
        }
      }
    return best;
  }
  arc(a, b, jumping) {
    const w = this.world,
      steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let n = 1; n <= steps; n++) {
      const t = n / steps,
        lift = jumping ? 32 * t * (1 - t) : 0;
      if (
        !this.clear(
          a.x + (b.x - a.x) * t - w.gravityX * lift,
          a.y + (b.y - a.y) * t - w.gravityY * lift,
        )
      )
        return false;
    }
    return true;
  }
  push(id, score) {
    const h = this.heap;
    let i = h.length;
    h.push({ id, score });
    while (i) {
      const p = (i - 1) >> 1;
      if (h[p].score <= score) break;
      h[i] = h[p];
      i = p;
    }
    h[i] = { id, score };
  }
  pop() {
    const h = this.heap,
      first = h[0],
      last = h.pop();
    if (h.length) {
      let i = 0;
      while (i * 2 + 1 < h.length) {
        let child = i * 2 + 1;
        if (child + 1 < h.length && h[child + 1].score < h[child].score)
          child++;
        if (h[child].score >= last.score) break;
        h[i] = h[child];
        i = child;
      }
      h[i] = last;
    }
    return first.id;
  }
  find(start, goal) {
    this.standing.fill(0);
    this.cost.fill(Infinity);
    this.parent.fill(-1);
    this.closed.fill(0);
    this.heap.length = 0;
    const origin = this.nearest(start.x, start.y),
      target = this.nearest(goal.x, goal.y);
    if (origin < 0 || target < 0) return [];
    const w = this.world,
      destination = this.point(target);
    const heuristic = (i) => {
      const p = this.point(i);
      return Math.hypot(p.x - destination.x, p.y - destination.y);
    };
    this.cost[origin] = 0;
    this.push(origin, heuristic(origin));
    let best = origin,
      visits = 0;
    while (this.heap.length && visits++ < 1500) {
      const current = this.pop();
      if (this.closed[current]) continue;
      this.closed[current] = 1;
      if (heuristic(current) < heuristic(best)) best = current;
      if (current === target) {
        best = current;
        break;
      }
      const a = this.point(current);
      for (const sign of [-1, 1])
        for (let run = 1; run <= 2; run++)
          for (let rise = -1; rise <= 4; rise++) {
            if (run === 1 && Math.abs(rise) > 1) continue;
            const x = Math.floor(
              (current % this.width) +
                sign * w.gravityY * run +
                w.gravityX * rise,
            );
            const y =
              Math.floor(current / this.width) -
              sign * w.gravityX * run +
              w.gravityY * rise;
            if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
            const next = y * this.width + x;
            if (this.closed[next] || !this.stand(next)) continue;
            const b = this.point(next),
              jump = run > 1 || rise < 0;
            const cost =
              this.cost[current] +
              Math.hypot(b.x - a.x, b.y - a.y) +
              (jump ? 5 : 0);
            if (cost >= this.cost[next] || !this.arc(a, b, jump)) continue;
            this.cost[next] = cost;
            this.parent[next] = current;
            this.push(next, cost + heuristic(next));
          }
    }
    const path = [];
    for (let i = best; i >= 0; i = this.parent[i]) {
      path.push(this.point(i));
      if (i === origin) break;
    }
    path.reverse();
    for (let n = 1; n < path.length; n++) {
      const a = path[n - 1],
        b = path[n];
      b.jump =
        Math.abs((b.x - a.x) * w.gravityY - (b.y - a.y) * w.gravityX) >
          CELL * 1.5 ||
        (b.x - a.x) * w.gravityX + (b.y - a.y) * w.gravityY < -0.5;
    }
    return path;
  }
}
