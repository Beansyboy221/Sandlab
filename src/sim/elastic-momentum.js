import { cellMass } from "./mechanical-mass.js";
const clamp = (v, n) => Math.max(-n, Math.min(n, v));
const NONE = 4294967295;

// Springs and raster reservations must not arrest a free body's center of mass.
// Scratch data is per component and grows with active nodes, not world area.
// Contacts disable projection on their normal axis; anchors disable both axes.
export class ElasticMomentum {
  constructor(solver) {
    this.solver = solver;
    this.slots = new Map();
    this.capacity = 0;
  }
  capture(indices, ids, count, dt) {
    if (count > this.capacity) {
      let capacity = 16;
      while (capacity < count) capacity *= 2;
      for (const key of [
        "mass",
        "x",
        "y",
        "vx",
        "vy",
        "clippedX",
        "clippedY",
        "refX",
        "refY",
      ])
        this[key] = new Float64Array(capacity);
      for (const key of ["heads", "next", "nodeSlots", "grid", "ids"])
        this[key] = new Uint32Array(capacity);
      this.blocked = new Uint8Array(capacity);
      this.nodeMass = new Float64Array(capacity);
      this.capacity = capacity;
    }
    const s = this.solver,
      w = s.world;
    this.slots.clear();
    this.count = count;
    this.dt = dt;
    for (let n = 0; n < count; n++) {
      const i = indices[n],
        component = s.components[i] || ids[n];
      let slot = this.slots.get(component);
      if (slot === undefined) {
        slot = this.slots.size;
        this.slots.set(component, slot);
        for (const key of [
          "mass",
          "x",
          "y",
          "vx",
          "vy",
          "clippedX",
          "clippedY",
          "blocked",
        ])
          this[key][slot] = 0;
        this.refX[slot] = (i % w.width) + 0.5;
        this.refY[slot] = Math.floor(i / w.width) + 0.5;
        this.heads[slot] = NONE;
      }
      this.nodeSlots[n] = slot;
      this.ids[n] = ids[n];
      this.next[n] = this.heads[slot];
      this.heads[slot] = n;
      const mass = (this.nodeMass[n] = cellMass(w, i));
      this.mass[slot] += mass;
      this.x[slot] += this.coordinate(i, slot, true, true) * mass;
      this.y[slot] += this.coordinate(i, slot, false, true) * mass;
      if (w.elasticAnchor[i]) this.blocked[slot] = 3;
    }
  }
  coordinate(i, slot, horizontal, offset) {
    const w = this.solver.world,
      span = horizontal ? w.width : w.height,
      ref = (horizontal ? this.refX : this.refY)[slot];
    let value = (horizontal ? i % w.width : Math.floor(i / w.width)) + 0.5;
    if (offset) value += (horizontal ? w.offsetX : w.offsetY)[i];
    if (w.border === "looping")
      value -= Math.round((value - ref) / span) * span;
    return value;
  }
  record(n, i, vx, vy) {
    const w = this.solver.world,
      slot = this.nodeSlots[n],
      mass = this.nodeMass[n];
    this.vx[slot] += vx * mass;
    this.vy[slot] += vy * mass;
    this.clippedX[slot] += w.velocityX[i] * mass;
    this.clippedY[slot] += w.velocityY[i] * mass;
  }
  predict(indices) {
    const s = this.solver,
      w = s.world;
    for (let slot = 0; slot < this.slots.size; slot++) {
      this.vx[slot] = clamp(this.vx[slot] / this.mass[slot], 0.95);
      this.vy[slot] = clamp(this.vy[slot] / this.mass[slot], 0.95);
      this.x[slot] = this.x[slot] / this.mass[slot] + this.vx[slot] * this.dt;
      this.y[slot] = this.y[slot] / this.mass[slot] + this.vy[slot] * this.dt;
    }
    for (let n = 0; n < this.count; n++) {
      const i = indices[n],
        slot = this.nodeSlots[n];
      if (!this.blocked[slot]) {
        w.velocityX[i] += this.vx[slot] - this.clippedX[slot] / this.mass[slot];
        w.velocityY[i] += this.vy[slot] - this.clippedY[slot] / this.mass[slot];
      }
      s.forceX[i] = w.offsetX[i] + w.velocityX[i] * this.dt;
      s.forceY[i] = w.offsetY[i] + w.velocityY[i] * this.dt;
    }
  }
  contact(i, horizontal) {
    const slot = this.slots.get(this.solver.components[i]);
    if (slot !== undefined) this.blocked[slot] |= horizontal ? 1 : 2;
  }
  translate(slot, horizontal, shift) {
    const s = this.solver,
      w = s.world;
    // Plan every destination before moving anything. A constant translation is
    // a bijection; swaps place IDs at unique destinations, including loop seams.
    for (let n = this.heads[slot]; n !== NONE; n = this.next[n]) {
      const i = s.locations.get(this.ids[n]);
      if (i === undefined) return false;
      let j = i;
      for (let d = 1; d <= Math.abs(shift); d++) {
        j = w.index(
          (i % w.width) + (horizontal ? Math.sign(shift) * d : 0),
          Math.floor(i / w.width) + (horizontal ? 0 : Math.sign(shift) * d),
        );
        if (j < 0 || !s.passableReservation(j, i)) return false;
      }
      this.grid[n] = j;
    }
    for (let n = this.heads[slot]; n !== NONE; n = this.next[n]) {
      const i = s.locations.get(this.ids[n]),
        j = this.grid[n];
      if (i !== j) w.swap(i, j);
    }
    return true;
  }
  project() {
    const s = this.solver,
      w = s.world;
    for (let slot = 0; slot < this.slots.size; slot++)
      for (const horizontal of [true, false]) {
        if (this.blocked[slot] & (horizontal ? 1 : 2)) continue;
        let gridMean = 0,
          offsetSum = 0,
          live = true;
        for (let n = this.heads[slot]; n !== NONE; n = this.next[n]) {
          const i = s.locations.get(this.ids[n]);
          if (i === undefined) {
            live = false;
            break;
          }
          gridMean +=
            this.coordinate(i, slot, horizontal, false) * this.nodeMass[n];
          offsetSum +=
            (horizontal ? w.offsetX : w.offsetY)[i] * this.nodeMass[n];
        }
        if (!live) continue;
        let wanted =
          (horizontal ? this.x : this.y)[slot] - gridMean / this.mass[slot];
        if (
          Math.abs(wanted) <= 0.75 &&
          Math.abs(wanted * this.mass[slot] - offsetSum) < 1e-6
        )
          continue;
        if (Math.abs(wanted) > 0.75) {
          const shift = Math.round(wanted);
          if (!this.translate(slot, horizontal, shift)) continue;
          wanted -= shift;
        }
        const offsets = horizontal ? w.offsetX : w.offsetY;
        // Bounded water-filling restores the centroid without exceeding saved
        // offset limits. Saturated nodes share correction with unsaturated ones.
        for (let pass = 0; pass < 4; pass++) {
          let sum = pass ? 0 : offsetSum,
            movableMass = 0;
          if (pass)
            for (let n = this.heads[slot]; n !== NONE; n = this.next[n]) {
              const i = s.locations.get(this.ids[n]);
              sum += offsets[i] * this.nodeMass[n];
            }
          const remaining = wanted * this.mass[slot] - sum;
          if (Math.abs(remaining) < 1e-6) break;
          for (let n = this.heads[slot]; n !== NONE; n = this.next[n]) {
            const i = s.locations.get(this.ids[n]);
            if (remaining > 0 ? offsets[i] < 1.49 : offsets[i] > -1.49)
              movableMass += this.nodeMass[n];
          }
          if (!movableMass) break;
          const delta = remaining / movableMass;
          for (let n = this.heads[slot]; n !== NONE; n = this.next[n]) {
            const i = s.locations.get(this.ids[n]);
            if (remaining > 0 ? offsets[i] < 1.49 : offsets[i] > -1.49)
              offsets[i] = clamp(offsets[i] + delta, 1.49);
          }
        }
      }
  }
}
