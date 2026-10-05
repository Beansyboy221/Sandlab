import { materials } from "./materials.js";
import { cellMass } from "./mechanical-mass.js";
import { collisionLimits as limits } from "./collision-limits.js";

const dx = [1, 0, -1, 0, 1, -1, -1, 1];
const dy = [0, 1, 0, -1, 1, 1, -1, -1];

// A local force chain moves grains toward a real opening. Scratch and tick-wide
// budgets are fixed; failure leaves contents untouched rather than deleting them.
export class GranularContact {
  constructor(solver) {
    this.solver = solver;
    this.cells = new Int32Array(limits.grainSearch);
    this.parents = new Int16Array(limits.grainSearch);
    this.depths = new Uint8Array(limits.grainSearch);
    this.costs = new Float64Array(limits.grainSearch);
    this.visited = new Uint32Array(solver.world.length);
    this.epoch = 0;
  }
  find(i, energy, fractureCost = 0) {
    const { world: w, work } = this.solver;
    if (i < 0 || energy <= fractureCost || work.grainMoves >= limits.grainMoves)
      return 0;
    this.epoch = (this.epoch + 1) >>> 0 || 1;
    if (this.epoch === 1) this.visited.fill(0);
    this.cells[0] = i;
    this.parents[0] = -1;
    this.depths[0] = 0;
    this.costs[0] = fractureCost;
    this.visited[i] = this.epoch;
    let count = 1;
    for (let head = 0; head < count; head++) {
      if (work.grainVisits >= limits.grainVisits) return 0;
      work.grainVisits++;
      const current = this.cells[head],
        x = current % w.width,
        y = Math.floor(current / w.width),
        m = materials[w.cells[current]],
        mass = cellMass(w, current);
      w.environment.sample(x + 0.5, y + 0.5);
      const gx = w.environment.x,
        gy = w.environment.y;
      for (let d = 0; d < 8; d++) {
        const j = w.index(x + dx[d], y + dy[d]);
        if (j < 0 || this.visited[j] === this.epoch) continue;
        const length = d < 4 ? 1 : Math.SQRT2;
        const cost =
          this.costs[head] +
          mass *
            ((0.15 + m.friction * 0.5) * length * 0.25 +
              Math.max(0, -(dx[d] * gx + dy[d] * gy)) * 0.16);
        if (cost > energy) continue;
        if (!w.cells[j]) {
          if (work.grainMoves + this.depths[head] + 1 > limits.grainMoves)
            continue;
          this.end = j;
          this.parent = head;
          return cost;
        }
        const target = materials[w.cells[j]];
        if (
          target.category !== "powder" ||
          target.rigid ||
          !target.movable ||
          this.depths[head] >= limits.grainDepth ||
          count >= limits.grainSearch
        )
          continue;
        this.visited[j] = this.epoch;
        this.cells[count] = j;
        this.parents[count] = head;
        this.depths[count] = this.depths[head] + 1;
        this.costs[count++] = cost;
      }
    }
    return 0;
  }
  move() {
    const { world: w, work } = this.solver;
    let end = this.end,
      parent = this.parent;
    if (w.cells[end]) return false;
    for (let p = parent; p >= 0; p = this.parents[p]) {
      const m = materials[w.cells[this.cells[p]]];
      if (m.category !== "powder" || m.rigid || !m.movable) return false;
    }
    while (parent >= 0) {
      const i = this.cells[parent];
      // The endpoint becomes empty after each swap; all stored state travels.
      w.tryMove(i, end % w.width, Math.floor(end / w.width), 1);
      work.grainMoves++;
      end = i;
      parent = this.parents[parent];
    }
    return true;
  }
}
