import {
  elasticX,
  elasticY,
  linkDelta,
  segmentHitsBrush,
  pointInTriangle,
} from "./elastic-geometry.js";
import { materials } from "./materials.js";

export const elasticFields = [
  "elasticId",
  "bond0",
  "bond1",
  "bond2",
  "bond3",
  "elasticAnchor",
  "offsetX",
  "offsetY",
  "velocityX",
  "velocityY",
];
export const elasticFloatFields = [
  "offsetX",
  "offsetY",
  "velocityX",
  "velocityY",
];
const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];
const supports = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const limit = (v, n) => Math.max(-n, Math.min(n, v));

// Permanent particle IDs make springs survive grid motion. Four outgoing links
// cover eight neighbors without storing each undirected spring twice.
export class Elasticity {
  constructor(world) {
    this.world = world;
    this.locations = new Map();
    this.nextId = 1;
    this.bonds = [world.bond0, world.bond1, world.bond2, world.bond3];
    this.indices = new Int32Array(world.length);
    this.nodeIds = new Uint32Array(world.length);
    this.forceX = new Float32Array(world.length);
    this.forceY = new Float32Array(world.length);
    this.delta = new Float64Array(2);
  }
  allocate() {
    while (this.locations.has(this.nextId))
      this.nextId = (this.nextId % 4294967295) + 1;
    const id = this.nextId;
    this.nextId = (id % 4294967295) + 1;
    return id;
  }
  add(i, connect = true) {
    const w = this.world,
      x = i % w.width,
      y = Math.floor(i / w.width);
    w.elasticId[i] = this.allocate();
    this.locations.set(w.elasticId[i], i);
    if (!connect) return;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = directions[d];
      for (const sign of [-1, 1]) {
        const j = w.index(x + dx * sign, y + dy * sign);
        if (j < 0 || j === i || w.cells[j] !== w.cells[i] || !w.elasticId[j])
          continue;
        this.bonds[d][sign > 0 ? i : j] = w.elasticId[sign > 0 ? j : i];
      }
      const [sx, sy] = supports[d],
        j = w.index(x + sx, y + sy);
      if (j >= 0 && this.support(j)) w.elasticAnchor[i] |= 1 << d;
    }
  }
  support(i) {
    const m = materials[this.world.cells[i]];
    return m.id && !m.movable && !m.elasticity && !m.gas;
  }
  rebuild(world = this.world) {
    this.world = world;
    const w = world;
    this.locations.clear();
    for (let i = 0; i < w.length; i++)
      if (materials[w.cells[i]].elasticity && w.elasticId[i])
        this.locations.set(w.elasticId[i], i);
    // Old saves contain rubber without spring metadata.
    for (let i = 0; i < w.length; i++)
      if (materials[w.cells[i]].elasticity && !w.elasticId[i]) this.add(i);
  }
  cutBrush(x, y, radius, shape) {
    if (!this.locations.size) return;
    const w = this.world,
      reach = Math.ceil(radius + 10),
      cx = Math.round(x) + 0.5,
      cy = Math.round(y) + 0.5;
    // Links cannot exceed nine cells before tearing. Query their nearby endpoints,
    // keeping small erasers independent of the size of the rest of the world.
    for (let oy = -reach; oy <= reach; oy++)
      for (let ox = -reach; ox <= reach; ox++) {
        const i = w.index(Math.round(x) + ox, Math.round(y) + oy);
        if (i < 0 || !w.elasticId[i]) continue;
        const ax = elasticX(w, i),
          ay = elasticY(w, i);
        let bx = cx,
          by = cy;
        if (w.border === "looping") {
          bx += Math.round((ax - bx) / w.width) * w.width;
          by += Math.round((ay - by) / w.height) * w.height;
        }
        const corner = this.locations.get(this.bonds[2][i]);
        if (corner !== undefined)
          for (const side of [0, 1]) {
            const adjacent = this.locations.get(this.bonds[side][i]);
            if (
              adjacent === undefined ||
              this.bonds[1 - side][adjacent] !== w.elasticId[corner]
            )
              continue;
            linkDelta(w, i, adjacent, this.delta);
            const dx = this.delta[0],
              dy = this.delta[1];
            linkDelta(w, i, corner, this.delta);
            if (
              pointInTriangle(
                bx,
                by,
                ax,
                ay,
                ax + dx,
                ay + dy,
                ax + this.delta[0],
                ay + this.delta[1],
              )
            ) {
              this.bonds[side][i] =
                this.bonds[2][i] =
                this.bonds[1 - side][adjacent] =
                  0;
            }
          }
        for (let d = 0; d < 4; d++) {
          const bonds = this.bonds[d],
            j = this.locations.get(bonds[i]);
          if (j === undefined) continue;
          linkDelta(w, i, j, this.delta);
          if (
            segmentHitsBrush(
              ax,
              ay,
              ax + this.delta[0],
              ay + this.delta[1],
              bx,
              by,
              radius + 0.5,
              shape,
            )
          )
            bonds[i] = 0;
        }
      }
  }
  measure(i) {
    const w = this.world;
    let connections = 0,
      stretch = 0,
      tension = 0;
    for (const k of this.locations.values())
      for (let d = 0; d < 4; d++) {
        const j = this.locations.get(this.bonds[d][k]);
        if (j === undefined || (k !== i && j !== i)) continue;
        connections++;
        linkDelta(w, k, j, this.delta);
        const rest = d < 2 ? 1 : Math.SQRT2,
          extension = Math.hypot(...this.delta) - rest;
        stretch = Math.max(stretch, extension / rest);
        tension = Math.max(
          tension,
          extension * materials[w.cells[k]].elasticity * 12,
        );
      }
    return { connections, stretch, tension };
  }
  step() {
    // Substeps let gravity act promptly without destabilizing stiff spring networks.
    for (let n = 0; n < 3 && this.locations.size; n++) this.substep(1 / 3);
  }
  substep(dt) {
    const w = this.world,
      { locations, indices, forceX: fx, forceY: fy } = this;
    let count = 0;
    for (const i of locations.values()) {
      indices[count++] = i;
      fx[i] = fy[i] = 0;
    }
    indices.subarray(0, count).sort();
    for (let n = 0; n < count; n++) this.nodeIds[n] = w.elasticId[indices[n]];
    for (let n = 0; n < count; n++) {
      const i = indices[n],
        m = materials[w.cells[i]],
        x = i % w.width,
        y = Math.floor(i / w.width);
      for (let d = 0; d < 4; d++) {
        const bonds = this.bonds[d],
          j = locations.get(bonds[i]);
        if (j === undefined) {
          bonds[i] = 0;
          continue;
        }
        linkDelta(w, i, j, this.delta);
        const dx = this.delta[0],
          dy = this.delta[1];
        const distance = Math.hypot(dx, dy),
          rest = d < 2 ? 1 : Math.SQRT2;
        if (distance > rest * m.tearAt) {
          bonds[i] = 0;
          continue;
        }
        if (distance < 0.001) continue;
        const relativeSpeed =
          ((w.velocityX[j] - w.velocityX[i]) * dx +
            (w.velocityY[j] - w.velocityY[i]) * dy) /
          distance;
        // Internal damping removes stretching oscillations, not shared falling momentum.
        const tension =
          ((distance - rest) * m.elasticity * 12 +
            relativeSpeed * (1 - m.damping) * 3) /
          distance;
        fx[i] += dx * tension;
        fy[i] += dy * tension;
        fx[j] -= dx * tension;
        fy[j] -= dy * tension;
      }
    }
    // All forces are computed before any grid cell moves, avoiding scan bias.
    for (let n = 0; n < count; n++) {
      const i = indices[n];
      const x = i % w.width,
        y = Math.floor(i / w.width),
        m = materials[w.cells[i]];
      for (let d = 0; d < 4; d++)
        if (w.elasticAnchor[i] & (1 << d)) {
          const [dx, dy] = supports[d],
            j = w.index(x + dx, y + dy);
          if (j < 0 || !this.support(j)) w.elasticAnchor[i] &= ~(1 << d);
        }
      if (w.elasticAnchor[i]) {
        w.velocityX[i] = w.velocityY[i] = w.offsetX[i] = w.offsetY[i] = 0;
        fx[i] = fy[i] = 0;
        continue;
      }
      const pressureX =
          w.fields.sample((x >> 2) - 1, y >> 2) -
          w.fields.sample((x >> 2) + 1, y >> 2),
        pressureY =
          w.fields.sample(x >> 2, (y >> 2) - 1) -
          w.fields.sample(x >> 2, (y >> 2) + 1);
      let liquidDensity = 0,
        liquidNeighbors = 0;
      for (const [dx, dy] of supports) {
        const j = w.index(x + dx, y + dy);
        if (j >= 0 && materials[w.cells[j]].category === "liquid") {
          liquidDensity += materials[w.cells[j]].density;
          liquidNeighbors++;
        }
      }
      const gravity =
        0.12 *
        (liquidNeighbors ? 1 - liquidDensity / liquidNeighbors / m.density : 1);
      w.velocityX[i] = limit(
        (w.velocityX[i] + (fx[i] + pressureX * 0.015) * dt) * 0.999,
        0.95,
      );
      w.velocityY[i] = limit(
        (w.velocityY[i] + (fy[i] + gravity + pressureY * 0.015) * dt) * 0.999,
        0.95,
      );
      // Force buffers can become predicted offsets once all spring forces exist.
      fx[i] = w.offsetX[i] + w.velocityX[i] * dt;
      fy[i] = w.offsetY[i] + w.velocityY[i] * dt;
    }
    // Move each leading edge first. An entire connected body can then translate
    // without its own occupied cells becoming artificial walls or losing momentum.
    for (const horizontal of [true, false]) {
      const offsets = horizontal ? fx : fy;
      for (const positive of [true, false])
        for (let n = 0; n < count; n++) {
          const order = positive ? count - 1 - n : n,
            offset = offsets[indices[order]];
          if (offset >= 0 !== positive) continue;
          const i = locations.get(this.nodeIds[order]);
          if (i !== undefined) this.moveAxis(i, offset, horizontal);
        }
    }
  }

  moveAxis(i, offset, horizontal) {
    const w = this.world,
      shift = Math.round(offset),
      offsets = horizontal ? w.offsetX : w.offsetY,
      velocity = horizontal ? w.velocityX : w.velocityY;
    if (!shift) {
      offsets[i] = offset;
      return i;
    }
    const j = w.index(
      (i % w.width) + (horizontal ? shift : 0),
      Math.floor(i / w.width) + (horizontal ? 0 : shift),
    );
    if (j < 0 && w.border === "void") {
      w.set(i, 0);
      return -1;
    }
    const target = j >= 0 ? materials[w.cells[j]] : null;
    if (
      j >= 0 &&
      j !== i &&
      (!target.id || target.gas || target.category === "liquid")
    ) {
      w.swap(i, j);
      offsets[j] = offset - shift;
      return j;
    }
    offsets[i] = limit(offset, 0.49);
    velocity[i] *= -0.18;
    if (!horizontal) w.velocityX[i] *= 0.8;
    return i;
  }
}
