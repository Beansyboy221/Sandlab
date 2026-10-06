import {
  mixtureBase,
  migrateMixture,
  retainsMixture,
  releaseDissolved,
  canDissolve,
  addDissolved,
} from "./mixtures.js";
import { brushFootprint, inBrushCircle } from "../brush-geometry.js";
import {
  PerformanceCounters,
  simulationStages,
} from "../performance-counters.js";
import { releaseForChange } from "./absorption.js";
import { CanvasEnvironment } from "./canvas-modes.js";
import { PorousFlow } from "./porous-flow.js";
import { Fragments } from "./fragments.js";
import { Circuits } from "./circuits.js";
import { Missiles } from "./missiles.js";
import { defaultMechanics } from "./mechanics-options.js";
import { Acoustics } from "./acoustics.js";
import { RigidBodies, rigidFields } from "./rigid-bodies.js";
import { Stickmen } from "./stickmen.js";
import { drawingPhase } from "./material-families.js";
import { Elasticity, elasticFields, elasticFloatFields } from "./elasticity.js";
import { rayHeading } from "./energy.js";
import { defaultLevel } from "../level-properties.js";
import { particleStateFields } from "./particle-state.js";
import { materials, canonicalMaterial } from "./materials.js";
import { Fields } from "./fields.js";
import {
  moveParticle,
  canMove,
  tryMove,
  setGravity,
  explode,
} from "./solvers/physics.js";
import { transferHeat } from "./solvers/thermodynamics.js";
import { advanceSimulation } from "./solvers/pipeline.js";
import { Portals, portalFields } from "./portals.js";
import { transportParticle } from "./portal-transport.js";

export class World {
  constructor(width = 320, height = 200, seed = 17421) {
    Object.assign(this, defaultLevel);
    this.mechanics = { ...defaultMechanics };
    this.profile = new PerformanceCounters(simulationStages);
    this.width = width;
    this.height = height;
    this.length = width * height;
    this.seed = seed;
    this.tick = 0;
    this.gravityX = 0;
    this.gravityY = 1;
    this.cells = new Uint8Array(this.length);
    this.quantity = new Float32Array(this.length).fill(1);
    this.detailRef = new Uint32Array(this.length);
    this.detailX = new Int16Array(this.length);
    this.detailY = new Int16Array(this.length);
    this.viewportState = null;
    this.temp = new Float32Array(this.length);
    this.temp.fill(20);
    this.life = new Uint16Array(this.length);
    this.charge = new Uint8Array(this.length);
    this.cooldown = new Uint8Array(this.length);
    this.clone = new Uint8Array(this.length);
    this.residue = new Uint8Array(this.length);
    this.variant = new Uint8Array(this.length);
    this.heading = new Uint8Array(this.length);
    this.pigment = new Uint32Array(this.length);
    this.backgroundPaint = new Uint32Array(this.length);
    this.paintMark = new Uint32Array(this.length);
    this.backgroundMark = new Uint32Array(this.length);
    this.paintStroke = 0;
    this.updated = new Uint32Array(this.length);
    this.chargedAt = new Uint32Array(this.length);
    this.moisture = new Uint8Array(this.length);
    this.nutrition = new Uint8Array(this.length);
    this.growth = new Uint8Array(this.length);
    this.oxidationLevel = new Uint8Array(this.length);
    this.storedLiquid = new Uint8Array(this.length);
    this.storedAmount = new Uint8Array(this.length);
    this.dissolvedId = new Uint8Array(this.length);
    this.dissolvedAmount = new Uint8Array(this.length);
    // Unsaved scheduler scratch; storage itself travels in particleStateFields.
    this.poreUpdated = new Uint32Array(this.length);
    for (const key of portalFields)
      this[key] =
        key === "portalCooldown"
          ? new Uint8Array(this.length)
          : new Uint32Array(this.length);
    for (const key of elasticFields)
      this[key] = new (
        elasticFloatFields.includes(key)
          ? Float32Array
          : key === "elasticAnchor"
            ? Uint8Array
            : Uint32Array
      )(this.length);
    for (const key of rigidFields) this[key] = new Float32Array(this.length);
    this.elastic = new Elasticity(this);
    this.rigid = new RigidBodies(this);
    this.fragments = new Fragments(this);
    this.porousFlow = new PorousFlow(this);
    this.particleFields = particleStateFields
      .filter((name) => ![...elasticFields, ...rigidFields].includes(name))
      .map((name) => this[name]);
    this.particleFields.push(this.paintMark);
    this.elasticParticleFields = [...elasticFields, ...rigidFields].map(
      (name) => this[name],
    );
    this.chunkWidth = Math.ceil(width / 16);
    this.chunks = new Uint16Array(this.chunkWidth * Math.ceil(height / 16));
    this.motionStamp = new Uint32Array(this.chunks.length);
    this.wakeStamp = new Uint32Array(this.chunks.length);
    this.count = 0;
    this.energyBudgetTick = -1;
    this.energyBirths = 0;
    this.energyReactions = 0;
    this.fields = new Fields(width, height);
    this.environment = new CanvasEnvironment(this);
    this.stickmen = new Stickmen(this);
    this.sound = new Acoustics(width, height, this);
    this.missiles = new Missiles(this);
    this.circuits = new Circuits(this);
    this.fallDistance = new Uint8Array(this.length);
    this.particleFields.push(this.fallDistance);
    this.portals = new Portals(this);
  }
  rebind() {
    for (const key of [
      "portals",
      "elastic",
      "rigid",
      "fragments",
      "porousFlow",
      "environment",
      "stickmen",
      "sound",
      "missiles",
      "circuits",
    ])
      if (this[key] && "world" in this[key]) this[key].world = this;
    this.missiles.guidance.world = this;
    this.stickmen.planner.world = this;
  }
  random() {
    let s = this.seed | 0;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }
  chunk(i) {
    return (
      (((i / this.width) | 0) >> 4) * this.chunkWidth + ((i % this.width) >> 4)
    );
  }
  set(
    i,
    id,
    temperature = materials[id].temperature,
    lifetime = materials[id].lifetime || 0,
    connectElastic = true,
  ) {
    const oldId = id;
    const legacyId = canonicalMaterial(id);
    id = mixtureBase[legacyId];
    if (!Number.isInteger(i) || i < 0 || i >= this.length) return;
    if (materials[id].projectile) {
      this.missiles.world = this;
      this.missiles.spawn(
        (i % this.width) + 0.5,
        Math.floor(i / this.width) + 0.5,
        1,
        0,
        id,
      );
      return;
    }
    if (materials[id].actor) {
      this.stickmen.world = this;
      this.stickmen.spawn(
        (i % this.width) + 0.5,
        Math.floor(i / this.width) + 0.5,
        id,
      );
      return;
    }
    this.portals.remove(i);
    for (const key of portalFields) this[key][i] = 0;
    if (!this.cells[i] && id) {
      this.chunks[this.chunk(i)]++;
      this.count++;
    } else if (this.cells[i] && !id) {
      this.chunks[this.chunk(i)]--;
      this.count--;
    }
    if (this.elasticId[i]) {
      this.fragments.removal(i);
      if (this.elastic.locations.delete(this.elasticId[i]))
        this.elastic.topologyDirty = true;
      if (this.rigid.locations.has(this.elasticId[i]))
        this.rigid.remove(this.elasticId[i]);
      for (const field of this.elasticParticleFields) field[i] = 0;
    }
    this.elastic.components[i] = 0;
    this.pigment[i] = 0;
    this.paintMark[i] = 0;
    if (
      !this.fields.obstaclesDirty &&
      this.fields.blocks(this.cells[i]) !== this.fields.blocks(id)
    )
      this.fields.markObstacle(i, this);
    this.cells[i] = id;
    this.quantity[i] = 1;
    this.detailRef[i] = 0;
    this.circuits.register(i, id);
    this.temp[i] = temperature;
    const variation = materials[id].lifetimeVariation || 0;
    this.fallDistance[i] = 0;
    this.life[i] =
      variation && lifetime
        ? Math.max(
            1,
            Math.round(
              lifetime * (1 - variation + this.random() * variation * 2),
            ),
          )
        : lifetime;
    this.moisture[i] = materials[id].initialMoisture || 0;
    this.nutrition[i] = materials[id].nutrition || 0;
    this.growth[i] = 0;
    this.oxidationLevel[i] =
      oldId === 54 || materials[id].materialState === "oxide" ? 255 : 0;
    const water = materials[id].initialLiquidAmount || 0;
    this.storedLiquid[i] = water ? materials[id].initialLiquid : 0;
    this.storedAmount[i] = water;
    this.dissolvedId[i] = 0;
    this.dissolvedAmount[i] = 0;
    migrateMixture(this, i, legacyId);
    this.poreUpdated[i] = 0;
    this.chargedAt[i] = 0;
    this.charge[i] = 0;
    this.cooldown[i] = 0;
    this.clone[i] = 0;
    this.residue[i] = 0;
    this.variant[i] = this.random() * 255;
    this.heading[i] = materials[id].ray ? this.variant[i] >> 5 : 0;
    if (materials[id].portal) this.portals.add(i);
    if (materials[id].elasticity) {
      this.elastic.world = this;
      this.elastic.add(i, connectElastic);
    }
    if (materials[id].rigid) this.rigid.add(i, connectElastic);
    this.updated[i] = this.tick;
    this.environment?.seed(i);
    this.wake(i);
  }
  transform(i, id, ...state) {
    if (i < 0 || materials[this.cells[i]]?.static) return false;
    id = mixtureBase[canonicalMaterial(id)];
    const old = materials[this.cells[i]],
      next = materials[id];
    const sameSubstance =
      this.cells[i] && id && old.baseMaterial === next.baseMaterial;
    const quantity = this.quantity[i],
      detailRef = this.detailRef[i],
      detailX = this.detailX[i],
      detailY = this.detailY[i];
    const pigment = this.pigment[i],
      variant = this.variant[i],
      oxide = this.oxidationLevel[i];
    const vx = this.velocityX[i],
      vy = this.velocityY[i];
    const ox = this.offsetX[i],
      oy = this.offsetY[i];
    const charge = this.charge[i],
      cooldown = this.cooldown[i];
    if (
      this.dissolvedAmount[i] &&
      !retainsMixture(id) &&
      !releaseDissolved(this, i)
    )
      return false;
    if (this.storedAmount[i] && !releaseForChange(this, i, id)) return false;
    const amount = this.storedAmount[i],
      type = this.storedLiquid[i],
      food = this.nutrition[i],
      moisture = this.moisture[i];
    const remainingIngredient = this.dissolvedId[i],
      remainingUnits = this.dissolvedAmount[i];
    this.set(i, id, ...state);
    if (sameSubstance) {
      this.quantity[i] = quantity;
      this.detailRef[i] = detailRef;
      this.detailX[i] = detailX;
      this.detailY[i] = detailY;
    }
    this.dissolvedId[i] = remainingIngredient;
    this.dissolvedAmount[i] = remainingUnits;
    if (amount) {
      this.storedAmount[i] = amount;
      this.storedLiquid[i] = type;
      this.nutrition[i] = food;
      this.moisture[i] = moisture;
    }
    if (sameSubstance) {
      this.pigment[i] = pigment;
      this.variant[i] = variant;
      this.oxidationLevel[i] =
        next.materialState === "oxide"
          ? 255
          : old.materialState === "oxide" || next.materialState === "compound"
            ? 0
            : oxide;
      this.offsetX[i] = ox;
      this.offsetY[i] = oy;
      this.velocityX[i] = vx;
      this.velocityY[i] = vy;
      this.charge[i] = next.conductive ? charge : 0;
      this.cooldown[i] = cooldown;
    }
    return true;
  }
  wake(i) {
    const chunk = this.chunk(i),
      stamp = this.tick + 1;
    if (this.wakeStamp[chunk] === stamp) return;
    this.wakeStamp[chunk] = stamp;
    this.motionStamp[chunk] = stamp;
    const x = chunk % this.chunkWidth;
    if (x > 0) this.motionStamp[chunk - 1] = stamp;
    if (x < this.chunkWidth - 1) this.motionStamp[chunk + 1] = stamp;
    if (chunk >= this.chunkWidth)
      this.motionStamp[chunk - this.chunkWidth] = stamp;
    if (chunk + this.chunkWidth < this.chunks.length)
      this.motionStamp[chunk + this.chunkWidth] = stamp;
    if (this.border === "looping") {
      if (x === 0) this.motionStamp[chunk + this.chunkWidth - 1] = stamp;
      if (x === this.chunkWidth - 1) this.motionStamp[chunk - x] = stamp;
      const lastRow = this.chunks.length - this.chunkWidth;
      if (chunk < this.chunkWidth) this.motionStamp[lastRow + x] = stamp;
      if (chunk >= lastRow) this.motionStamp[x] = stamp;
    }
  }
  clear() {
    this.viewportState?.clear();
    this.quantity.fill(1);
    this.detailRef.fill(0);
    this.detailX.fill(0);
    this.detailY.fill(0);
    this.poreUpdated.fill(0);
    this.portals.clear();
    for (const key of portalFields) this[key].fill(0);
    this.stickmen.world = this;
    this.stickmen.restore();
    this.sound.clear();
    this.missiles.clear();
    this.circuits.locations.clear();
    this.fallDistance.fill(0);
    this.rigid.locations.clear();
    this.rigid.bodies = [];
    this.rigid.bodyOf.clear();
    this.rigid.fresh.clear();
    this.rigid.dirty = true;
    this.elastic.topologyDirty = true;
    this.elastic.locations.clear();
    this.elastic.components.fill(0);
    this.elastic.nextId = 1;
    for (const key of [...elasticFields, ...rigidFields]) this[key].fill(0);
    for (const key of [
      "cells",
      "pigment",
      "backgroundPaint",
      "paintMark",
      "backgroundMark",
      "heading",
      "life",
      "charge",
      "cooldown",
      "clone",
      "residue",
      "updated",
      "chargedAt",
      "moisture",
      "nutrition",
      "growth",
      "oxidationLevel",
      "storedLiquid",
      "storedAmount",
      "dissolvedId",
      "dissolvedAmount",
      "chunks",
    ])
      this[key].fill(0);
    this.temp.fill(20);
    this.fields.clear();
    this.motionStamp.fill(this.tick + 1);
    this.wakeStamp.fill(0);
    this.count = 0;
    this.energyBudgetTick = -1;
  }
  setGravity(x, y) {
    setGravity(this, x, y);
  }
  index(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height)
      return y * this.width + x;
    if (this.border !== "looping") return -1;
    return (
      (((y % this.height) + this.height) % this.height) * this.width +
      (((x % this.width) + this.width) % this.width)
    );
  }
  relativeIndex(x, y, across, down) {
    return this.index(
      x + this.gravityY * across + this.gravityX * down,
      y - this.gravityX * across + this.gravityY * down,
    );
  }
  eachNeighbor(x, y, fn) {
    const i = y * this.width + x,
      loop = this.border === "looping";
    if (x > 0) fn(i - 1);
    else if (loop) fn(i + this.width - 1);
    if (x < this.width - 1) fn(i + 1);
    else if (loop) fn(i - this.width + 1);
    if (y > 0) fn(i - this.width);
    else if (loop) fn(i + (this.height - 1) * this.width);
    if (y < this.height - 1) fn(i + this.width);
    else if (loop) fn(x);
  }
  tryMove(i, x, y, vertical) {
    return tryMove(this, i, x, y, vertical);
  }
  teleport(i, contact, dx, dy) {
    return transportParticle(this, i, contact, dx, dy);
  }
  swap(i, j) {
    const moving = materials[this.cells[i]];
    if (!moving.rigid && moving.id && !moving.gas)
      this.fields.airflow.displace(
        this,
        i % this.width,
        Math.floor(i / this.width),
        (j % this.width) - (i % this.width),
        Math.floor(j / this.width) - Math.floor(i / this.width),
        moving,
      );
    if (
      !this.fields.obstaclesDirty &&
      this.fields.blocks(this.cells[i]) !== this.fields.blocks(this.cells[j])
    ) {
      this.fields.markObstacle(i, this);
      this.fields.markObstacle(j, this);
    }
    if (!this.cells[j]) {
      const a = this.chunk(i),
        b = this.chunk(j);
      if (a !== b) {
        this.chunks[a]--;
        this.chunks[b]++;
      }
    }
    for (let k = 0; k < this.particleFields.length; k++) {
      const field = this.particleFields[k],
        value = field[i];
      field[i] = field[j];
      field[j] = value;
    }
    if (this.circuits.locations.has(i) || this.circuits.locations.has(j)) {
      this.circuits.register(i, this.cells[i]);
      this.circuits.register(j, this.cells[j]);
    }
    // Orbital particles and fine debris also carry subpixel motion, even
    // without a spring/rigid ID. Move their state with the particle.
    if (
      this.elasticId[i] ||
      this.elasticId[j] ||
      this.environment.kinetic ||
      this.velocityX[i] ||
      this.velocityY[i] ||
      this.velocityX[j] ||
      this.velocityY[j]
    )
      for (let k = 0; k < this.elasticParticleFields.length; k++) {
        const field = this.elasticParticleFields[k];
        const value = field[i];
        field[i] = field[j];
        field[j] = value;
      }
    const component = this.elastic.components[i];
    this.elastic.components[i] = this.elastic.components[j];
    this.elastic.components[j] = component;
    this.updated[i] = this.tick;
    this.updated[j] = this.tick;
    const first = this.elasticId[i],
      second = this.elasticId[j];
    if (first)
      (materials[this.cells[i]].rigid
        ? this.rigid
        : this.elastic
      ).locations.set(first, i);
    if (second)
      (materials[this.cells[j]].rigid
        ? this.rigid
        : this.elastic
      ).locations.set(second, j);
    this.wake(i);
    this.wake(j);
  }
  canMove(i, j, vertical) {
    return canMove(this, i, j, vertical);
  }
  move(i, x, y) {
    moveParticle(this, i, x, y);
  }
  transferHeat(i, j) {
    transferHeat(this, i, j);
  }
  step() {
    advanceSimulation(this);
  }
  explode(x, y, radius, product = 0) {
    explode(this, x, y, radius, product);
  }
  brush(
    x,
    y,
    radius,
    id,
    shape = "circle",
    replace = false,
    directionX = 1,
    directionY = 0,
    temperature = materials[id].temperature,
  ) {
    if (![x, y, radius, directionX, directionY].every(Number.isFinite)) return;
    if (radius < 0) return;
    if (!Number.isFinite(temperature)) return;
    temperature = Math.max(-250, Math.min(6000, temperature));
    id = drawingPhase(id, temperature);
    if (materials[id].projectile) {
      this.missiles.world = this;
      this.missiles.spawn(x + 0.5, y + 0.5, directionX, directionY, id);
      return;
    }
    if (materials[id].actor) {
      this.stickmen.world = this;
      this.stickmen.spawn(x + 0.5, y + 0.5, id);
      return;
    }
    if (!id) {
      const footprint = brushFootprint(radius),
        cx = Math.round(x) + 0.5 + footprint.center,
        cy = Math.round(y) + 0.5 + footprint.center;
      this.stickmen.brush(
        "erase",
        cx,
        cy,
        footprint.diameter / 2,
        0,
        0,
        1,
        shape,
      );
      this.missiles.brush(
        "erase",
        cx,
        cy,
        footprint.diameter / 2,
        0,
        0,
        1,
        shape,
      );
    }
    if (!id && this.elastic.locations.size) {
      this.elastic.world = this;
      this.elastic.cutBrush(x, y, radius, shape);
    }
    if (materials[id].discharge || materials[id].directed) radius = 0;
    const footprint = brushFootprint(radius);
    for (let dy = footprint.low; dy <= footprint.high; dy++)
      for (let dx = footprint.low; dx <= footprint.high; dx++) {
        if (shape === "circle" && !inBrushCircle(footprint, dx, dy)) continue;
        const nx = Math.round(x) + dx,
          ny = Math.round(y) + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        const i = ny * this.width + nx;
        if (canDissolve(this, i, id)) {
          addDissolved(this, i, id);
          continue;
        }
        if (
          !id ||
          replace ||
          !this.cells[i] ||
          (materials[id].discharge &&
            materials[this.cells[i]].discharge &&
            this.clone[i])
        ) {
          this.set(i, id, temperature);
          if (materials[id].directed)
            this.heading[i] = rayHeading(directionX, directionY);
        }
      }
  }
}
