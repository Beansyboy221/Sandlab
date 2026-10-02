// Compact bidirectional adjacency over permanent IDs. A rotated wire remains
// connected even when unique raster cells are no longer immediate neighbors.
export class BodyConnections {
  constructor(solver) {
    this.solver = solver;
    this.slots = new Map();
    this.dirty = true;
    this.counts = new Uint32Array(0);
    this.offsets = new Uint32Array(0);
    this.cursor = new Uint32Array(0);
    this.neighbors = new Uint32Array(0);
  }
  rebuild() {
    const { world: w, locations } = this.solver,
      count = locations.size;
    if (this.counts.length < count) {
      let capacity = 16;
      while (capacity < count) capacity *= 2;
      this.counts = new Uint32Array(capacity);
      this.offsets = new Uint32Array(capacity + 1);
      this.cursor = new Uint32Array(capacity);
    }
    this.counts.fill(0, 0, count);
    this.slots.clear();
    let slot = 0;
    for (const id of locations.keys()) this.slots.set(id, slot++);
    for (const [id, i] of locations)
      for (let d = 0; d < 4; d++) {
        const target = w["bond" + d][i],
          other = this.slots.get(target);
        if (other === undefined) continue;
        this.counts[this.slots.get(id)]++;
        this.counts[other]++;
      }
    this.offsets[0] = 0;
    for (let n = 0; n < count; n++)
      this.offsets[n + 1] = this.offsets[n] + this.counts[n];
    const total = this.offsets[count];
    if (this.neighbors.length < total) {
      let capacity = 16;
      while (capacity < total) capacity *= 2;
      this.neighbors = new Uint32Array(capacity);
    }
    this.dirty = false;
    this.cursor.set(this.offsets.subarray(0, count));
    for (const [id, i] of locations)
      for (let d = 0; d < 4; d++) {
        const target = w["bond" + d][i],
          other = this.slots.get(target);
        if (other === undefined) continue;
        this.neighbors[this.cursor[this.slots.get(id)]++] = target;
        this.neighbors[this.cursor[other]++] = id;
      }
  }
  each(i, fn) {
    const solver = this.solver;
    if (solver.dirty) solver.rebuild();
    if (this.dirty) this.rebuild();
    const slot = this.slots.get(solver.world.elasticId[i]);
    if (slot === undefined) return;
    for (let n = this.offsets[slot]; n < this.offsets[slot + 1]; n++) {
      const j = solver.locations.get(this.neighbors[n]);
      if (j !== undefined) fn(j);
    }
  }
}
