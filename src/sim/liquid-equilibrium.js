import { effectiveViscosity } from "./mixtures.js";

const maxVisits = 128,
  maxDepth = 7;
const directionsX = [1, 0, -1, 0],
  directionsY = [0, 1, 0, -1];

// A packed liquid transmits pressure through neighboring liquid. A short chain
// shifts toward a lower free surface, one orthogonal step per cell. Its total
// gravitational potential decreases without fitting an outline or crossing walls.
export class RadialLiquidFlow {
  constructor(world) {
    this.cells = new Int32Array(maxVisits);
    this.parents = new Int16Array(maxVisits);
    this.depths = new Uint8Array(maxVisits);
    this.visited = new Uint32Array(world.length);
    this.epoch = 0;
    this.visits = this.moves = 0;
  }
  settle(w, i, x, y) {
    this.visits = this.moves = 0;
    if ((i + w.tick) % 8 || w.modeStrength <= 0) return false;
    let exposed = false;
    for (let d = 0; d < 4; d++) {
      const j = w.index(x + directionsX[d], y + directionsY[d]);
      if (j >= 0 && w.canMove(i, j, 1)) {
        exposed = true;
        break;
      }
    }
    // Interiors have no free surface to relieve; viscosity controls the flux.
    if (!exposed || w.random() >= 1 / Math.max(1, effectiveViscosity(w, i)))
      return false;
    const cx = w.environment.centerX,
      cy = w.environment.centerY,
      dx = x + 0.5 - cx,
      dy = y + 0.5 - cy,
      radius2 = dx * dx + dy * dy,
      id = w.cells[i];
    this.epoch = (this.epoch + 1) >>> 0 || 1;
    if (this.epoch === 1) this.visited.fill(0);
    this.cells[0] = i;
    this.parents[0] = -1;
    this.depths[0] = 0;
    this.visited[i] = this.epoch;
    let count = 1,
      best = -1,
      bestDrop = 0,
      parent = -1;
    const first = (w.variant[i] + w.tick) & 3;
    for (let head = 0; head < count; head++) {
      this.visits++;
      const current = this.cells[head],
        px = current % w.width,
        py = Math.floor(current / w.width);
      for (let n = 0; n < 4; n++) {
        const d = (first + n) & 3,
          j = w.index(px + directionsX[d], py + directionsY[d]);
        if (j < 0 || this.visited[j] === this.epoch) continue;
        if (w.canMove(i, j, 1)) {
          const tx = (j % w.width) + 0.5 - cx,
            ty = Math.floor(j / w.width) + 0.5 - cy,
            drop = radius2 - (tx * tx + ty * ty);
          // Squared radius ranks radial potential without a per-neighbor sqrt.
          if (drop > bestDrop) {
            best = j;
            bestDrop = drop;
            parent = head;
          }
        } else if (
          w.cells[j] === id &&
          this.depths[head] < maxDepth &&
          count < maxVisits
        ) {
          this.visited[j] = this.epoch;
          this.cells[count] = j;
          this.parents[count] = head;
          this.depths[count++] = this.depths[head] + 1;
        }
      }
    }
    if (best < 0) return false;
    // Every link must be able to displace the endpoint substance before the
    // first swap, including differently concentrated cells of the same liquid.
    for (let link = parent; link >= 0; link = this.parents[link])
      if (!w.canMove(this.cells[link], best, bestDrop)) return false;
    while (parent >= 0) {
      const current = this.cells[parent];
      if (
        !w.tryMove(
          current,
          best % w.width,
          Math.floor(best / w.width),
          bestDrop,
        )
      )
        return false;
      this.moves++;
      best = current;
      parent = this.parents[parent];
    }
    return true;
  }
}
