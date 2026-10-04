import { ElasticMomentum } from "./elastic-momentum.js";
import { brushFootprint } from "../brush-geometry.js";
import {
  elasticX,
  elasticY,
  linkDelta,
  segmentHitsBrush,
  pointInTriangle,
} from "./elastic-geometry.js";
import { materials, M } from "./materials.js";
import { cellMass } from "./mechanical-mass.js";
import { transportElastics } from "./portal-elastics.js";

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
    this.topologyDirty = true;
    this.bonds = [world.bond0, world.bond1, world.bond2, world.bond3];
    this.indices = new Int32Array(world.length);
    this.nodeIds = new Uint32Array(world.length);
    this.parents = new Int32Array(world.length);
    this.components = new Uint32Array(world.length);
    this.forceX = new Float32Array(world.length);
    this.forceY = new Float32Array(world.length);
    this.delta = new Float64Array(2);
    this.momentum = new ElasticMomentum(this);
  }
  allocate() {
    while (
      this.locations.has(this.nextId) ||
      this.world.rigid?.locations.has(this.nextId)
    )
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
    this.topologyDirty = true;
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
    return m.id && m.id !== M.Portal && !m.movable && !m.elasticity && !m.gas;
  }
  rebuild(world = this.world) {
    this.world = world;
    const w = world;
    this.locations.clear();
    w.rigid.world = w;
    w.rigid.locations.clear();
    w.rigid.bodyOf.clear();
    w.rigid.fresh.clear();
    w.rigid.dirty = true;
    this.topologyDirty = true;
    for (let i = 0; i < w.length; i++)
      if (materials[w.cells[i]].elasticity && w.elasticId[i])
        this.locations.set(w.elasticId[i], i);
      else if (materials[w.cells[i]].rigid && w.elasticId[i])
        w.rigid.locations.set(w.elasticId[i], i);
    // Old saves contain rubber without spring metadata.
    for (let i = 0; i < w.length; i++)
      if (materials[w.cells[i]].elasticity && !w.elasticId[i]) this.add(i);
      else if (materials[w.cells[i]].rigid && !w.elasticId[i]) w.rigid.add(i);
  }
  cutBrush(x, y, radius, shape) {
    if (!this.locations.size) return;
    this.topologyDirty = true;
    const w = this.world,
      reach = Math.ceil(radius + 12),
      cx = Math.round(x) + 0.5 + brushFootprint(radius).center,
      cy = Math.round(y) + 0.5 + brushFootprint(radius).center;
    // Links tear around nine cells; include delayed raster-placement offsets.
    // Query nearby endpoints,
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
          ) {
            w.fragments.mark(i);
            w.fragments.mark(j);
            bonds[i] = 0;
          }
        }
      }
  }
  measure(i) {
    const w = this.world;
    let connections = 0,
      stretch = 0,
      tension = 0;
    const visited =
      w.border === "looping" && (w.width < 25 || w.height < 25)
        ? new Set()
        : null;
    const x = i % w.width,
      y = Math.floor(i / w.width);
    for (let dy = -12; dy <= 12; dy++)
      for (let dx = -12; dx <= 12; dx++) {
        const k = w.index(x + dx, y + dy);
        if (k < 0 || !materials[w.cells[k]].elasticity || visited?.has(k))
          continue;
        visited?.add(k);
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
      }
    return { connections, stretch, tension };
  }
  root(i) {
    const parents = this.parents;
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  }
  step() {
    transportElastics(this);
    // Substeps let gravity act promptly without destabilizing stiff spring networks.
    for (let n = 0; n < 3 && this.locations.size; n++) this.substep(1 / 3);
  }
  substep(dt) {
    this.world.fields.beginForceSample();
    const w = this.world,
      { locations, indices, forceX: fx, forceY: fy } = this;
    let count = 0;
    for (const i of locations.values()) {
      indices[count++] = i;
      fx[i] = fy[i] = 0;
      if (this.topologyDirty) this.parents[i] = i;
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
          if (bonds[i]) {
            this.topologyDirty = true;
            w.fragments.mark(i);
          }
          bonds[i] = 0;
          continue;
        }
        linkDelta(w, i, j, this.delta);
        const dx = this.delta[0],
          dy = this.delta[1];
        const distance = Math.hypot(dx, dy),
          rest = d < 2 ? 1 : Math.SQRT2;
        if (distance > rest * m.tearAt) {
          this.topologyDirty = true;
          w.fragments.mark(i);
          w.fragments.mark(j);
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
        // Elastic coefficients were calibrated as dry-node acceleration.
        // Convert to paired forces; stored fluid adds inertia, not stiffness.
        const forceX = dx * tension * m.density,
          forceY = dy * tension * m.density;
        fx[i] += forceX;
        fy[i] += forceY;
        fx[j] -= forceX;
        fy[j] -= forceY;
      }
    }
    if (this.topologyDirty) {
      // Rebuild connectivity only after an edit or a torn link, not every solver pass.
      for (let n = 0; n < count; n++) this.parents[indices[n]] = indices[n];
      for (let n = 0; n < count; n++)
        for (const bonds of this.bonds) {
          const i = indices[n],
            j = locations.get(bonds[i]);
          if (j === undefined) continue;
          const a = this.root(i),
            b = this.root(j);
          if (a !== b) this.parents[b] = a;
        }
      for (let n = 0; n < count; n++) {
        const i = indices[n];
        this.components[i] = w.elasticId[this.root(i)];
      }
      this.topologyDirty = false;
    }
    this.momentum.capture(indices, this.nodeIds, count, dt);
    // All forces are computed before any grid cell moves, avoiding scan bias.
    for (let n = 0; n < count; n++) {
      const i = indices[n];
      const x = i % w.width,
        y = Math.floor(i / w.width),
        m = materials[w.cells[i]];
      // Adhesive contact is local, reusing anchor bits; heat or tension releases
      // the bond without creating a second graph or searching a surface.
      if (m.adhesion) {
        const sticky =
          w.temp[i] < m.soften &&
          Math.hypot(fx[i], fy[i]) < m.adhesion * cellMass(w, i) * 8;
        w.elasticAnchor[i] = 0;
        if (sticky)
          for (let d = 0; d < 4; d++) {
            const [dx, dy] = supports[d],
              j = w.index(x + dx, y + dy);
            if (j >= 0 && this.support(j)) w.elasticAnchor[i] |= 1 << d;
          }
      }
      for (let d = 0; d < 4; d++)
        if (w.elasticAnchor[i] & (1 << d)) {
          const [dx, dy] = supports[d],
            j = w.index(x + dx, y + dy);
          if (j < 0 || !this.support(j)) w.elasticAnchor[i] &= ~(1 << d);
        }
      if (w.elasticAnchor[i]) {
        this.momentum.blocked[this.momentum.nodeSlots[n]] = 3;
        w.velocityX[i] = w.velocityY[i] = w.offsetX[i] = w.offsetY[i] = 0;
        fx[i] = fy[i] = 0;
        continue;
      }
      const fi = w.fields.forceGradient(x, y),
        pressureX = w.fields.gradientX[fi],
        pressureY = w.fields.gradientY[fi];
      let liquidDensity = 0,
        liquidNeighbors = 0;
      for (const [dx, dy] of supports) {
        const j = w.index(x + dx, y + dy);
        if (j >= 0 && materials[w.cells[j]].category === "liquid") {
          liquidDensity += materials[w.cells[j]].density;
          liquidNeighbors++;
        }
      }
      const mass = cellMass(w, i),
        inverseMass = 1 / mass;
      const gravity =
        0.12 *
        (liquidNeighbors ? 1 - liquidDensity / liquidNeighbors / mass : 1);
      w.environment.sample(x, y);
      const localX = w.environment.x,
        localY = w.environment.y;
      const vx =
          (w.velocityX[i] +
            (fx[i] * inverseMass +
              gravity * localX +
              pressureX * 0.015 * m.density * inverseMass) *
              dt) *
          0.999,
        vy =
          (w.velocityY[i] +
            (fy[i] * inverseMass +
              gravity * localY +
              pressureY * 0.015 * m.density * inverseMass) *
              dt) *
          0.999;
      w.velocityX[i] = limit(vx, 0.95);
      w.velocityY[i] = limit(vy, 0.95);
      this.momentum.record(n, i, vx, vy);
    }
    this.momentum.predict(indices);
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
          if (i !== undefined) {
            const initial = indices[order],
              origin = horizontal
                ? initial % w.width
                : Math.floor(initial / w.width),
              current = horizontal ? i % w.width : Math.floor(i / w.width);
            let correction = origin - current;
            if (w.border === "looping") {
              const span = horizontal ? w.width : w.height;
              correction -= Math.round(correction / span) * span;
            }
            this.moveAxis(i, offset + correction, horizontal);
          }
        }
    }
    this.momentum.project();
  }

  passableReservation(j, i) {
    const w = this.world,
      m = materials[w.cells[j]];
    return (
      !m.id ||
      m.gas ||
      m.category === "liquid" ||
      (m.elasticity &&
        !w.elasticAnchor[j] &&
        this.components[i] === this.components[j])
    );
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
    let j = w.index(
      (i % w.width) + (horizontal ? shift : 0),
      Math.floor(i / w.width) + (horizontal ? 0 : shift),
    );
    // A delayed raster reservation can cross two cells. Test the swept path so
    // retained displacement never tunnels through a wall or a detached piece.
    if (Math.abs(shift) > 1)
      for (let d = 1; d < Math.abs(shift); d++) {
        const k = w.index(
            (i % w.width) + (horizontal ? Math.sign(shift) * d : 0),
            Math.floor(i / w.width) + (horizontal ? 0 : Math.sign(shift) * d),
          ),
          material = k >= 0 ? materials[w.cells[k]] : null;
        if (
          !material ||
          (material.id &&
            !material.gas &&
            material.category !== "liquid" &&
            (!material.elasticity ||
              !this.components[i] ||
              this.components[i] !== this.components[k]))
        ) {
          j = k;
          break;
        }
      }
    if (j < 0 && w.border === "void") {
      this.momentum.contact(i, horizontal);
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
    // The raster is a reservation, not the physical position. Exchange slots
    // within one spring component while preserving the displaced node's pose;
    // otherwise a folded mesh can deadlock on its own occupied cells in midair.
    if (target?.elasticity && !w.elasticAnchor[j]) {
      const internal =
          this.components[i] && this.components[i] === this.components[j],
        separation = horizontal
          ? Math.hypot(
              elasticX(w, i) + offset - w.offsetX[i] - elasticX(w, j),
              elasticY(w, i) - elasticY(w, j),
            )
          : Math.hypot(
              elasticX(w, i) - elasticX(w, j),
              elasticY(w, i) + offset - w.offsetY[i] - elasticY(w, j),
            );
      const displaced = offsets[j] + shift;
      if (
        (internal || separation >= 0.9) &&
        Math.abs(shift) === 1 &&
        Math.abs(displaced) <= 1.49
      ) {
        w.swap(i, j);
        offsets[j] = offset - shift;
        offsets[i] = displaced;
        return j;
      }
      if (internal) {
        offsets[i] = limit(offset, 1.49);
        return i;
      }
    }
    this.momentum.contact(i, horizontal);
    offsets[i] = limit(offset, 0.49);
    velocity[i] *= -0.18;
    if (!horizontal) w.velocityX[i] *= 0.8;
    return i;
  }
}
