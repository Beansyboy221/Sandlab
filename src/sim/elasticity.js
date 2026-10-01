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
    this.forceX = new Float32Array(world.length);
    this.forceY = new Float32Array(world.length);
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
  step() {
    const w = this.world,
      { locations, indices, forceX: fx, forceY: fy } = this;
    let count = 0;
    for (const i of locations.values()) {
      indices[count++] = i;
      fx[i] = fy[i] = 0;
    }
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
        let dx = (j % w.width) + w.offsetX[j] - x - w.offsetX[i],
          dy = Math.floor(j / w.width) + w.offsetY[j] - y - w.offsetY[i];
        if (w.border === "looping") {
          dx -= Math.round(dx / w.width) * w.width;
          dy -= Math.round(dy / w.height) * w.height;
        }
        const distance = Math.hypot(dx, dy),
          rest = d < 2 ? 1 : Math.SQRT2;
        if (distance > rest * m.tearAt) {
          bonds[i] = 0;
          continue;
        }
        if (distance < 0.001) continue;
        const tension = limit((distance - rest) * m.elasticity, 0.8) / distance;
        fx[i] += dx * tension;
        fy[i] += dy * tension;
        fx[j] -= dx * tension;
        fy[j] -= dy * tension;
      }
    }
    // All forces are computed before any grid cell moves, avoiding scan bias.
    for (let n = 0; n < count; n++) {
      let i = indices[w.tick % 2 ? count - 1 - n : n];
      const id = w.elasticId[i];
      // Another node may have displaced this one through a liquid swap.
      i = locations.get(id) ?? i;
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
        continue;
      }
      const pressureX =
          w.fields.sample((x >> 2) - 1, y >> 2) -
          w.fields.sample((x >> 2) + 1, y >> 2),
        pressureY =
          w.fields.sample(x >> 2, (y >> 2) - 1) -
          w.fields.sample(x >> 2, (y >> 2) + 1);
      w.velocityX[i] = limit(
        (w.velocityX[i] + fx[i] + pressureX * 0.015) * m.damping,
        0.45,
      );
      w.velocityY[i] = limit(
        (w.velocityY[i] + fy[i] + 0.012 + pressureY * 0.015) * m.damping,
        0.45,
      );
      const ox = w.offsetX[i] + w.velocityX[i],
        oy = w.offsetY[i] + w.velocityY[i],
        dx = Math.round(ox),
        dy = Math.round(oy),
        j = w.index(x + dx, y + dy);
      if (dx || dy) {
        if (j < 0 && w.border === "void") {
          w.set(i, 0);
          continue;
        }
        if (j >= 0 && j !== i && w.canMove(i, j, dy)) {
          w.swap(i, j);
          i = j;
          w.offsetX[i] = ox - dx;
          w.offsetY[i] = oy - dy;
        } else {
          w.offsetX[i] = limit(ox, 0.49);
          w.offsetY[i] = limit(oy, 0.49);
          if (dx) w.velocityX[i] *= -0.18;
          if (dy) {
            w.velocityY[i] *= -0.18;
            w.velocityX[i] *= 0.8;
          }
        }
      } else {
        w.offsetX[i] = ox;
        w.offsetY[i] = oy;
      }
    }
  }
}
