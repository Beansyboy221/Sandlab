import { AIR_DAMPING } from "./acoustic-properties.js";
// Audible transport samples the same faces and absorption as Echolocation.
// One listener-centred shortest-path field is shared by all voices, with a
// fixed-size decrease-key heap and a capped tile budget (no search per sound).
export class AcousticListener {
  constructor(sound) {
    this.sound = sound;
    const n = sound.wave.length;
    this.cost = new Float32Array(n);
    this.heap = new Int32Array(n);
    this.position = new Int32Array(n);
  }
  prepare(w, x, y) {
    const s = this.sound,
      width = s.width,
      height = s.height;
    const cx = Math.max(0, Math.min(width - 1, Math.floor(x / 4))),
      cy = Math.max(0, Math.min(height - 1, Math.floor(y / 4))),
      origin = cy * width + cx;
    if (
      this.world === w &&
      this.origin === origin &&
      this.border === w.border &&
      this.revision === s.revision
    )
      return;
    this.world = w;
    this.origin = origin;
    this.border = w.border;
    this.revision = s.revision;
    this.x = cx;
    this.y = cy;
    this.cost.fill(Infinity);
    this.position.fill(-1);
    this.cost[origin] = 0;
    this.size = 0;
    this.push(origin);
    this.visited = 0;
    const loop = w.border === "looping",
      f = s;
    while (this.size && this.visited < 8192) {
      const i = this.pop(),
        px = i % width,
        py = Math.floor(i / width);
      this.visited++;
      for (let d = 0; d < 4; d++) {
        let nx = px + (d === 0 ? -1 : d === 1 ? 1 : 0),
          ny = py + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (loop) {
          nx = (nx + width) % width;
          ny = (ny + height) % height;
        }
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (this.position[j] === -2) continue;
        const open =
          d === 0
            ? f.horizontal[j]
            : d === 1
              ? f.horizontal[i]
              : d === 2
                ? f.vertical[j]
                : f.vertical[i];
        if (open < 0.01) continue;
        const cost =
          this.cost[i] +
          1 -
          Math.log(open) * 4 +
          Math.max(0, AIR_DAMPING - s.damping[j]) * 8;
        if (cost >= this.cost[j]) continue;
        this.cost[j] = cost;
        this.push(j);
      }
    }
  }
  push(i) {
    let k = this.position[i];
    if (k < 0) {
      k = this.size++;
      this.heap[k] = i;
    }
    while (k) {
      const parent = (k - 1) >> 1,
        j = this.heap[parent];
      if (this.cost[j] <= this.cost[i]) break;
      this.heap[k] = j;
      this.position[j] = k;
      k = parent;
    }
    this.heap[k] = i;
    this.position[i] = k;
  }
  pop() {
    const root = this.heap[0],
      last = this.heap[--this.size];
    this.position[root] = -2;
    if (!this.size) return root;
    let k = 0;
    while (k * 2 + 1 < this.size) {
      let child = k * 2 + 1;
      if (
        child + 1 < this.size &&
        this.cost[this.heap[child + 1]] < this.cost[this.heap[child]]
      )
        child++;
      const j = this.heap[child];
      if (this.cost[last] <= this.cost[j]) break;
      this.heap[k] = j;
      this.position[j] = k;
      k = child;
    }
    this.heap[k] = last;
    this.position[last] = k;
    return root;
  }
  sample(x, y) {
    const s = this.sound,
      w = this.world;
    let cx = Math.max(0, Math.min(s.width - 1, Math.floor(x / 4))),
      cy = Math.max(0, Math.min(s.height - 1, Math.floor(y / 4)));
    let dx = Math.abs(cx - this.x),
      dy = Math.abs(cy - this.y);
    if (w.border === "looping") {
      dx = Math.min(dx, s.width - dx);
      dy = Math.min(dy, s.height - dy);
    }
    const extra = this.cost[cy * s.width + cx] - dx - dy;
    const clarity = Number.isFinite(extra)
      ? Math.exp(-Math.max(0, extra) * 0.12)
      : 0;
    return {
      gain: 0.12 + 0.88 * clarity,
      cutoff: 450 + 15550 * clarity * clarity,
      clarity,
      reflections: this.reflections(cx, cy),
    };
  }
  reflections(cx, cy) {
    const s = this.sound,
      w = this.world,
      f = w.fields,
      result = [];
    // First reflections need a reachable flat face, not just a solid border.
    // Four short walks bound room queries to 128 edges per audible event.
    for (let d = 0; d < 4; d++) {
      let x = cx,
        y = cy;
      for (let step = 0; step < 32; step++) {
        const i = y * s.width + x,
          dx = d === 0 ? -1 : d === 1 ? 1 : 0,
          dy = d === 2 ? -1 : d === 3 ? 1 : 0;
        let nx = x + dx,
          ny = y + dy;
        const outside = nx < 0 || ny < 0 || nx >= s.width || ny >= s.height;
        if (outside && w.border === "looping") {
          nx = (nx + s.width) % s.width;
          ny = (ny + s.height) % s.height;
        }
        const j = outside && w.border !== "looping" ? -1 : ny * s.width + nx;
        const edge =
          j < 0
            ? w.border === "solid"
              ? 0
              : 1
            : d === 0
              ? f.horizontal[j]
              : d === 1
                ? f.horizontal[i]
                : d === 2
                  ? f.vertical[j]
                  : f.vertical[i];
        if (edge < 0.1) {
          let flat = 0;
          for (let side = -2; side <= 2; side++) {
            const xx = x + (dy ? side : 0),
              yy = y + (dx ? side : 0);
            if (xx < 0 || yy < 0 || xx >= s.width || yy >= s.height) continue;
            const k = yy * s.width + xx;
            const sx = xx + dx,
              sy = yy + dy;
            const outsideFace =
              sx < 0 || sy < 0 || sx >= s.width || sy >= s.height;
            const adjacent =
              ((sy + s.height) % s.height) * s.width +
              ((sx + s.width) % s.width);
            const e =
              outsideFace && w.border !== "looping"
                ? w.border === "solid"
                  ? 0
                  : 1
                : d === 0
                  ? f.horizontal[adjacent]
                  : d === 1
                    ? f.horizontal[k]
                    : d === 2
                      ? f.vertical[adjacent]
                      : f.vertical[k];
            if (e < 0.1) flat++;
          }
          if (flat >= 3) {
            const path =
              (step + 1) * 4 + Math.hypot(x - this.x, y - this.y) * 4;
            const surfaceLoss = Math.max(
              0,
              AIR_DAMPING -
                Math.min(s.damping[i], j < 0 ? AIR_DAMPING : s.damping[j]),
            );
            result.push({
              delay: Math.max(0.025, Math.min(0.32, path / 700)),
              gain:
                (flat / 5) *
                0.15 *
                Math.exp(-path / 180) *
                Math.max(0, 1 - surfaceLoss * 3) *
                (1 -
                  Math.max(s.dispersion[i], j < 0 ? 0 : s.dispersion[j]) * 0.7),
            });
          }
          break;
        }
        if (j < 0) break;
        x = nx;
        y = ny;
      }
    }
    result.sort((a, b) => b.gain - a.gain);
    return result.slice(0, 3);
  }
}
