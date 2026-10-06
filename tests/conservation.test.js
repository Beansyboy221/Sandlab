import { reframeWorld } from "../src/viewport-navigation.js";
import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { cellMass } from "../src/sim/mechanical-mass.js";
import { thermalCapacity } from "../src/sim/thermal-capacity.js";
import { energize, PULSE_ENERGY } from "../src/sim/electrical-energy.js";
import { conductCharge } from "../src/sim/solvers/electrodynamics.js";
import { exchangeWithAir } from "../src/sim/solvers/thermodynamics.js";
import { transferHeat } from "../src/sim/solvers/thermodynamics.js";
import { scaleRatio } from "../src/sim/world-units.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { airStress } from "../src/sim/body-stress.js";

const close = (a, b, tolerance = 1e-5) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b}`);
test("physical scale ratios choose readable SI units", () => {
  assert.equal(scaleRatio(0.125), "1:12.5 cm");
  assert.equal(scaleRatio(1), "1:1 m");
  assert.equal(scaleRatio(1000), "1:1 km");
  assert.equal(scaleRatio(1e-9), "1:1 nm");
});
test("a passive conductor loop spends one finite pulse without reheating forever", () => {
  const w = new World(48, 48),
    ids = [];
  for (let y = 10; y <= 30; y++)
    for (let x = 10; x <= 30; x++) {
      if (x !== 10 && x !== 30 && y !== 10 && y !== 30) continue;
      const i = y * w.width + x;
      w.set(i, M.Copper);
      ids.push(i);
    }
  w.rigid.rebuild();
  energize(w, ids[0]);
  let visits = 0;
  for (let tick = 1; tick <= 1000; tick++) {
    w.tick = tick;
    for (const i of ids) {
      if (w.cooldown[i]) w.cooldown[i]--;
      if (!w.charge[i] || w.chargedAt[i] === tick) continue;
      if (w.charge[i] === 6) visits++;
      conductCharge(
        w,
        i,
        i % w.width,
        Math.floor(i / w.width),
        materials[w.cells[i]],
      );
    }
  }
  assert.ok(visits >= 40, `pulse reached only ${visits} conductors`);
  assert.ok(visits < 1000, `${visits} repeated visits`);
  assert.ok(ids.every((i) => !w.charge[i] && !w.electricalEnergy[i]));
  const heat = ids.reduce(
    (sum, i) => sum + (w.temp[i] - 20) * thermalCapacity(w, i),
    0,
  );
  close(heat, PULSE_ENERGY, 0.005);
  assert.ok(ids.every((i) => w.temp[i] < 21));
});
test("finite electrical budgets travel with particles and survive saved games", () => {
  const w = new World(32, 32),
    i = 200;
  w.set(i, M.Copper);
  energize(w, i, 2.5);
  w.electricalSupply[i] = 123;
  w.swap(i, i + 1);
  assert.equal(w.electricalEnergy[i + 1], 2.5);
  assert.equal(w.electricalSupply[i + 1], 123);
  const loaded = new World();
  restore(loaded, unpack(pack(snapshot(w))));
  assert.deepEqual(snapshot(loaded), snapshot(w));
  const bad = snapshot(w);
  bad.arrays.electricalEnergy[i + 1] = -1;
  assert.throws(() => restore(loaded, bad));
});
test("heat exchange conserves energy for unequal density, represented amount and capacity", () => {
  const w = new World(32, 32),
    i = 200,
    j = 201;
  w.set(i, M.Steel, 800);
  w.set(j, M.Water, 20);
  w.quantity[i] = 0.3;
  w.quantity[j] = 2;
  const energy = () =>
    thermalCapacity(w, i) * w.temp[i] + thermalCapacity(w, j) * w.temp[j];
  const before = energy();
  for (let n = 0; n < 100; n++) transferHeat(w, i, j);
  close(energy(), before, 0.001);
  assert.ok(w.temp[i] < 800 && w.temp[j] > 20);
  assert.ok(w.temp[i] >= w.temp[j]);
});
test("phase and fracture state changes retain represented mass", () => {
  for (const [from, to] of [
    ["Water", "Steam"],
    ["Ice", "Water"],
    ["Steel", "Molten Steel"],
    ["Wood", "Sawdust"],
    ["Brick", "Brick Fragments"],
  ]) {
    const w = new World(32, 32),
      i = 200;
    w.set(i, M[from]);
    w.quantity[i] = 0.7;
    const before = cellMass(w, i);
    assert.ok(w.transform(i, M[to], w.temp[i]));
    close(cellMass(w, i), before);
    const loaded = new World();
    restore(loaded, unpack(pack(snapshot(w))));
    close(cellMass(loaded, i), before);
  }
});
test("air fracture uses measured surface load, not free-fall velocity", () => {
  const w = new World(64, 64);
  for (let x = 10; x < 45; x++) w.set(20 * w.width + x, M.Brick);
  w.rigid.rebuild();
  const body = w.rigid.bodies[0];
  w.tick = (16 - (body.ids[0] % 16)) % 16;
  w.rigid.work.airStressSamples = 0;
  w.fields.windEnabled = false;
  airStress(w.rigid, body, { ...w.rigid.pose(body), vx: 100, vy: 100 });
  assert.equal(w.rigid.impactDamage.size, 0);
  const old = w.fields.surfaceForce;
  w.fields.surfaceForce = () => {
    w.fields.surfaceStress = 80;
    w.fields.dragX = w.fields.dragY = 0;
  };
  airStress(w.rigid, body, { vx: 0, vy: 0 });
  w.fields.surfaceForce = old;
  assert.ok(w.rigid.impactDamage.size > 0);
});

test("a localized jet bends brittle glass while uniform co-moving air does not", () => {
  const w = new World(80, 64);
  for (let x = 10; x < 70; x++) w.set(20 * w.width + x, M.Glass);
  w.rigid.rebuild();
  const body = w.rigid.bodies[0];
  const p = w.rigid.pose(body);
  w.tick = (16 - (body.ids[0] % 16)) % 16;
  // Target the deterministic exposed-face sample, with a strong cross-flow.
  const i = w.rigid.locations.get(
    body.edges[(w.tick * 17) % body.edges.length],
  );
  const old = w.fields.airflow.sample;
  w.fields.airflow.sample = function () {
    this.x = 0;
    this.y = 3;
  };
  let dragX = 0,
    dragY = 0;
  for (const id of body.edges) {
    const j = w.rigid.locations.get(id);
    w.fields.surfaceForce(w, j, 0, 0);
    dragX += w.fields.dragX;
    dragY += w.fields.dragY;
  }
  body.dragX = dragX;
  body.dragY = dragY;
  w.rigid.work.airStressSamples = 0;
  airStress(w.rigid, body, p);
  assert.equal(
    w.rigid.impactDamage.size,
    0,
    "uniform air load is shared acceleration",
  );
  // Only one end sees the jet: now its load differs from the body's mean.
  w.fields.airflow.sample = function (fields, x) {
    this.x = 0;
    this.y = Math.abs(x - (i % w.width)) <= 1 ? 3 : 0;
  };
  dragX = dragY = 0;
  for (const id of body.edges) {
    w.fields.surfaceForce(w, w.rigid.locations.get(id), 0, 0);
    dragX += w.fields.dragX;
    dragY += w.fields.dragY;
  }
  body.dragX = dragX;
  body.dragY = dragY;
  airStress(w.rigid, body, p);
  assert.ok(
    w.rigid.impactDamage.size > 0,
    "differential aerodynamic stress bends the span",
  );
  w.fields.airflow.sample = old;
});

test("particle/air heat exchange preserves the combined thermal budget", () => {
  const w = new World(32, 32),
    i = 200;
  w.set(i, M.Steel, 800);
  w.quantity[i] = 3;
  const x = i % w.width,
    y = Math.floor(i / w.width),
    fi = w.fields.index(x, y);
  const energy = () =>
    thermalCapacity(w, i) * w.temp[i] + 16 * w.fields.temperature[fi];
  const before = energy();
  for (let n = 0; n < 100; n++) exchangeWithAir(w.fields, w, i, x, y);
  close(energy(), before, 0.1);
});

test("mutually touching cut elastic pieces cannot become airborne supports", () => {
  const w = new World(80, 240);
  for (let y = 15; y < 35; y++)
    for (let x = 20; x < 50; x++) {
      w.set(y * w.width + x, M.Jelly, 20, 0, false);
    }
  for (let n = 0; n < 100; n++) w.elastic.step();
  const ids = [...w.elastic.locations.values()];
  assert.equal(ids.length, 600);
  const y =
    ids.reduce((sum, i) => sum + Math.floor(i / w.width) + w.offsetY[i], 0) /
    ids.length;
  assert.ok(y > 95, `unsupported pieces stopped at ${y}`);
  assert.ok(ids.every((i) => w.velocityY[i] > 0.5));
});

test("zoom transports electrical budgets without resurrecting spent cached pulses", () => {
  for (const cacheMB of [0, 16]) {
    const w = new World(32, 32),
      i = 16 * w.width + 16;
    w.set(i, M.Copper);
    energize(w, i);
    const sum = () => w.electricalEnergy.reduce((a, b) => a + b, 0);
    reframeWorld(w, { pitch: 0.25, cacheMB });
    close(sum(), PULSE_ENERGY);
    reframeWorld(w, { pitch: 0.125, cacheMB });
    close(sum(), PULSE_ENERGY);
    reframeWorld(w, { pitch: 0.25, cacheMB });
    w.electricalEnergy.fill(0);
    w.charge.fill(0);
    reframeWorld(w, { pitch: 0.125, cacheMB });
    assert.equal(sum(), 0);
    assert.ok(w.charge.every((v) => v === 0));
  }
});
