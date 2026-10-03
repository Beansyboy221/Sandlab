import { CanvasEnvironment } from "./canvas-modes.js";
import { moveKinetic } from "./particle-kinetics.js";
import { Fragments } from "./fragments.js";
import { Circuits } from "./circuits.js";
import { Missiles } from "./missiles.js";
import { defaultMechanics } from "./mechanics-options.js";
import { Acoustics } from "./acoustics.js";
import { RigidBodies, rigidFields } from "./rigid-bodies.js";
import { Stickmen } from "./stickmen.js";
import { drawingPhase } from "./material-families.js";
import { Elasticity, elasticFields, elasticFloatFields } from "./elasticity.js";
import { moveRay, rayHeading } from "./energy.js";
import { defaultLevel } from "../level-properties.js";
import { particleStateFields } from "./particle-state.js";
import { materials, M, canonicalMaterial } from "./materials.js";
import { Fields } from "./fields.js";
import { react } from "./reactions.js";
import { moveSurfaceFlame } from "./combustion.js";

export class World {
  constructor(width = 320, height = 200, seed = 17421) {
    Object.assign(this, defaultLevel);
    this.mechanics = { ...defaultMechanics };
    this.width = width;
    this.height = height;
    this.length = width * height;
    this.seed = seed;
    this.tick = 0;
    this.gravityX = 0;
    this.gravityY = 1;
    this.cells = new Uint8Array(this.length);
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
    this.storedLiquid = new Uint8Array(this.length);
    this.storedAmount = new Uint8Array(this.length);
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
    this.sound = new Acoustics(width, height);
    this.missiles = new Missiles(this);
    this.circuits = new Circuits(this);
    this.fallDistance = new Uint8Array(this.length);
    this.particleFields.push(this.fallDistance);
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
    id = canonicalMaterial(id);
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
    this.moisture[i] = id === M.Mud ? 220 : id === M.Plant ? 80 : 0;
    this.nutrition[i] = materials[id].nutrition || 0;
    this.growth[i] = 0;
    this.storedLiquid[i] = 0;
    this.storedAmount[i] = 0;
    this.chargedAt[i] = 0;
    this.charge[i] = 0;
    this.cooldown[i] = 0;
    this.clone[i] = 0;
    this.residue[i] = 0;
    this.variant[i] = this.random() * 255;
    this.heading[i] = materials[id].ray ? this.variant[i] >> 5 : 0;
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
    this.set(i, id, ...state);
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
      "storedLiquid",
      "storedAmount",
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
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      Math.abs(x) + Math.abs(y) !== 1
    )
      return;
    if (this.gravityX === x && this.gravityY === y) return;
    this.gravityX = x;
    this.gravityY = y;
    this.motionStamp.fill(this.tick + 1);
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
    const j = this.index(x, y);
    if (j < 0) {
      if (this.border === "void") {
        this.set(i, 0);
        return true;
      }
      return false;
    }
    if (j === i || !this.canMove(i, j, vertical)) return false;
    const category = materials[this.cells[i]].category;
    const falling = category === "powder" || category === "liquid";
    this.swap(i, j);
    if (falling && vertical > 0)
      this.fallDistance[j] = Math.min(24, this.fallDistance[j] + 1);
    return true;
  }
  swap(i, j) {
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
    const a = materials[this.cells[i]],
      b = materials[this.cells[j]];
    if (!b.id) return true;
    if (
      b.static ||
      b.category === "solid" ||
      b.category === "elastic" ||
      b.category === "special" ||
      b.category === "powder"
    )
      return false;
    if (vertical > 0) return a.density > b.density + 0.08;
    if (vertical < 0) return a.density < b.density - 0.04;
    return false;
  }
  move(i, x, y) {
    const m = materials[this.cells[i]],
      cat = m.category;
    if (!m.movable || m.elasticity || m.rigid) return;
    if (m.ray) {
      moveRay(this, i, x, y, m);
      return;
    }
    if (moveKinetic(this, i, x, y)) return;
    const gas = m.gas,
      fall = gas ? (m.density > 0 ? 1 : -1) : 1,
      downX = this.gravityX,
      downY = this.gravityY,
      acrossX = downY,
      acrossY = -downX;
    const direction = this.random() < 0.5 ? -1 : 1;
    if (!this.inParticlePass) this.fields.beginForceSample();
    const fi = this.fields.forceGradient(x, y),
      gx = this.fields.gradientX[fi],
      gy = this.fields.gradientY[fi];
    this.fields.airflow.sample(this.fields, x, y);
    const windX = this.fields.airflow.x,
      windY = this.fields.airflow.y;
    const windSpeed = Math.max(Math.abs(windX), Math.abs(windY));
    // Surface contact retains weak plumes; a strong vent jet can lift them away.
    if (
      this.cells[i] === M.Fire &&
      windSpeed < 0.35 &&
      moveSurfaceFlame(this, i, x, y)
    )
      return;
    const drag = gas
      ? 1
      : cat === "powder"
        ? 0.08 / Math.sqrt(m.density)
        : 0.03;
    if (windSpeed > 0.01 && this.random() < Math.min(1, windSpeed * drag)) {
      const horizontal = Math.abs(windX) >= Math.abs(windY);
      const dx = horizontal ? Math.sign(windX) : 0,
        dy = horizontal ? 0 : Math.sign(windY);
      if (this.tryMove(i, x + dx, y + dy, dx * downX + dy * downY)) return;
    }
    if (
      !gas &&
      (Math.abs(gx) > 1 || Math.abs(gy) > 1) &&
      this.random() < 0.6 &&
      this.tryMove(
        i,
        x + Math.sign(gx),
        y + Math.sign(gy),
        Math.sign(gx) * downX + Math.sign(gy) * downY,
      )
    )
      return;
    if (
      this.cells[i] === M.Fire &&
      windSpeed >= 0.35 &&
      moveSurfaceFlame(this, i, x, y)
    )
      return;
    const nx = x + downX * fall,
      ny = y + downY * fall;
    if (this.tryMove(i, nx, ny, fall)) return;
    for (let side = 0; side < 2; side++) {
      const sign = side ? -direction : direction;
      if (this.tryMove(i, nx + acrossX * sign, ny + acrossY * sign, fall))
        return;
    }
    if (cat === "liquid" && this.fallDistance[i] > 2) {
      this.sound.emit(
        "splash",
        x,
        y,
        Math.min(0.35, this.fallDistance[i] * 0.015),
        m.density,
      );
      this.fallDistance[i] = 0;
    }
    if (cat === "powder" && this.fallDistance[i] > 1) {
      this.sound.emit(
        "grain",
        x,
        y,
        Math.min(0.6, this.fallDistance[i] * 0.015 * Math.sqrt(m.density)),
        m.density,
      );
      this.fallDistance[i] = 0;
    }
    if (cat === "liquid" || gas) {
      if (this.random() > 1 / m.viscosity) return;
      const reach = gas ? 1 : 4;
      for (let side = 0; side < 2; side++) {
        const sign = side ? -direction : direction;
        let target = -1;
        for (let d = 1; d <= reach; d++) {
          const nx = x + acrossX * sign * d,
            ny = y + acrossY * sign * d;
          const j = this.index(nx, ny);
          if (j < 0) {
            if (this.border === "void") {
              this.set(i, 0);
              return;
            }
            break;
          }
          if (!this.canMove(i, j, 0)) break;
          target = j;
        }
        if (target !== -1) {
          this.swap(i, target);
          return;
        }
      }
    }
  }
  transferHeat(i, j) {
    if (!this.cells[j]) return;
    const a = materials[this.cells[i]],
      b = materials[this.cells[j]];
    const transfer =
      (this.temp[i] - this.temp[j]) *
      Math.min(0.24, (a.conductivity + b.conductivity) * 0.25);
    this.temp[i] -= transfer;
    this.temp[j] += transfer;
  }
  step() {
    this.elastic.world = this;
    this.rigid.world = this;
    this.tick++;
    this.sound.tick = this.tick;
    this.environment.world = this;
    this.environment.update(true);
    this.fields.border = this.border;
    this.fields.update(this);
    this.fields.beginForceSample();
    this.circuits.world = this;
    this.circuits.step();
    this.inParticlePass = true;
    const w = this.width,
      h = this.height,
      reverse = this.gravityX ? (this.gravityX > 0 ? 1 : 0) : this.tick % 2;
    // Skip empty 16-cell blocks; a tick stamp prevents moved cells from updating twice.
    for (let row = 0; row < h; row++) {
      const y = this.gravityY < 0 ? row : h - 1 - row;
      for (let k = 0; k < this.chunkWidth; k++) {
        const cx = reverse ? this.chunkWidth - 1 - k : k;
        if (!this.chunks[(y >> 4) * this.chunkWidth + cx]) continue;
        const start = cx * 16,
          end = Math.min(w, start + 16);
        for (let offset = 0; offset < end - start; offset++) {
          const x = reverse ? end - 1 - offset : start + offset,
            i = y * w + x;
          if (!this.cells[i] || this.updated[i] === this.tick) continue;
          this.updated[i] = this.tick;
          if ((i + this.tick) % 3 === 0) {
            const right = this.index(x + 1, y),
              below = this.index(x, y + 1);
            if (right >= 0) this.transferHeat(i, right);
            if (below >= 0) this.transferHeat(i, below);
            if (materials[this.cells[i]].rigid)
              for (let d = 0; d < 2; d++) {
                const j = this.rigid.locations.get(this["bond" + d][i]);
                // Cardinal rest links remain physical neighbors after rotation.
                // Grid-adjacent pairs already exchange heat through the normal pass.
                if (
                  j !== undefined &&
                  Math.abs((i % w) - (j % w)) +
                    Math.abs(Math.floor(i / w) - Math.floor(j / w)) !==
                    1
                )
                  this.transferHeat(i, j);
              }
            this.fields.exchange(this, i, x, y);
          }
          react(this, i, x, y);
          if (this.cells[i] === M.Fan) {
            for (let d = 2; d < 15; d++) {
              const nx = x + d;
              const j = this.index(nx, y),
                next = this.index(nx + 1, y);
              if (j < 0) break;
              if (this.fields.blocks(this.cells[j])) break;
              this.fields.airflow.impulse(this.fields, nx, y, 1, 0, 0.4);
              if (j >= 0 && materials[this.cells[j]].rigid)
                this.velocityX[j] += 0.08;
              if (
                this.cells[j] &&
                materials[this.cells[j]].movable &&
                !materials[this.cells[j]].rigid
              ) {
                if (next < 0 && this.border === "void") this.set(j, 0);
                else if (next >= 0 && !this.cells[next]) this.swap(j, next);
              }
            }
          } else if (this.cells[i]) {
            // Only movement sleeps. Heat and chemistry continue in settled chunks.
            const chunk = (y >> 4) * this.chunkWidth + cx,
              air = this.fields.index(x, y);
            if (
              this.environment.kinetic ||
              materials[this.cells[i]].ray ||
              this.tick + 1 - this.motionStamp[chunk] < 30 ||
              this.tick % 8 === 0 ||
              Math.abs(this.fields.pressure[air]) > 1 ||
              Math.abs(this.fields.airflow.velocityX[air]) > 0.1 ||
              Math.abs(this.fields.airflow.velocityY[air]) > 0.1
            )
              this.move(i, x, y);
          }
        }
      }
    }
    this.inParticlePass = false;
    this.rigid.step();
    this.elastic.step();
    this.stickmen.world = this;
    this.stickmen.step();
    this.missiles.world = this;
    this.missiles.step();
    this.fragments.world = this;
    this.fragments.step();
    this.sound.step(this);
  }
  explode(x, y, radius, product = 0) {
    this.fields.add(x, y, radius * 2);
    this.sound.emit("explosion", x, y, Math.min(1.5, radius * 0.15), radius);
    const r2 = radius * radius;
    const loop = this.border === "looping",
      left = loop ? -Math.min(radius, Math.floor(this.width / 2)) : -radius,
      right = loop ? Math.min(radius, Math.ceil(this.width / 2) - 1) : radius,
      top = loop ? -Math.min(radius, Math.floor(this.height / 2)) : -radius,
      bottom = loop ? Math.min(radius, Math.ceil(this.height / 2) - 1) : radius;
    for (let dy = top; dy <= bottom; dy++)
      for (let dx = left; dx <= right; dx++) {
        const nx = x + dx,
          ny = y + dy,
          d2 = dx * dx + dy * dy;
        const i = this.index(nx, ny);
        if (i < 0 || d2 > r2) continue;
        const m = materials[this.cells[i]];
        if (m.static || m.category === "special" || m.resistance === 1)
          continue;
        if (m.explosive && d2 > 1) {
          this.temp[i] = Math.max(this.temp[i], m.ignite + 100);
          continue;
        }
        if (
          !m.id ||
          !["solid", "elastic"].includes(m.category) ||
          this.random() > (m.resistance || 0.6)
        ) {
          this.transform(i, M.Fire, 850, 15 + this.random() * 30);
          if (product) this.residue[i] = product;
        } else this.temp[i] += 500 * (1 - d2 / r2);
      }
    const center = this.index(x, y);
    if (this.transform(center, M.Fire, 1100, 50) && product)
      this.residue[center] = product;
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
      this.stickmen.brush("erase", x + 0.5, y + 0.5, radius, 0, 0, 1, shape);
      this.missiles.brush("erase", x + 0.5, y + 0.5, radius, 0, 0, 1, shape);
    }
    if (!id && this.elastic.locations.size) {
      this.elastic.world = this;
      this.elastic.cutBrush(x, y, radius, shape);
    }
    if (id === M.Lightning || materials[id].directed) radius = 0;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (shape === "circle" && dx * dx + dy * dy > radius * radius) continue;
        const nx = Math.round(x) + dx,
          ny = Math.round(y) + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        const i = ny * this.width + nx;
        if (
          !id ||
          replace ||
          !this.cells[i] ||
          (id === M.Lightning && this.cells[i] === M.Lightning && this.clone[i])
        ) {
          this.set(i, id, temperature);
          if (materials[id].directed)
            this.heading[i] = rayHeading(directionX, directionY);
        }
      }
  }
}
