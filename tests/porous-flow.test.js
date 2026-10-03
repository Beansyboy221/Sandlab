import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { poreExchange } from "../src/sim/porous-flow.js";
import { fracture } from "../src/sim/body-collisions.js";
import { snapshot, restore } from "../src/persistence.js";
import { cellProperties } from "../src/inspector.js";

const run = (w, n) => {
  for (let t = 0; t < n; t++) w.step();
};
const packed = (grain = M.Sand, liquid = M.Water) => {
  const w = new World(24, 24);
  w.mechanics.windSimulation = false;
  w.mechanics.temperatureSimulation = false;
  for (let y = 4; y < 24; y++)
    for (let x = 0; x < 24; x++) w.set(y * 24 + x, y < 16 ? grain : liquid);
  return w;
};
const crossed = (w) =>
  w.cells.slice(0, 16 * 24).reduce((n, id) => n + (id === M.Water), 0);

test("packed sand releases water gradually without teleporting or losing mass", () => {
  const w = packed();
  const initial = w.count;
  run(w, 12);
  assert.ok(crossed(w) > 0 && crossed(w) < 30, crossed(w));
  const before = crossed(w);
  run(w, 108);
  assert.ok(crossed(w) > before);
  assert.equal(w.count, initial);
  assert.equal(
    w.cells.reduce((n, id) => n + (id === M.Water), 0),
    192,
  );
  assert.equal(
    w.chunks.reduce((a, b) => a + b, 0),
    initial,
  );
});

test("dense liquids remain beneath lighter grains; fine packed clay strongly retains oil", () => {
  const dense = packed(M.Sand, M.Mercury);
  run(dense, 100);
  assert.equal(dense.cells.slice(0, 16 * 24).includes(M.Mercury), false);
  const fine = packed(M.Clay, M.Oil);
  run(fine, 100);
  assert.ok(
    fine.cells.slice(0, 16 * 24).reduce((n, id) => n + (id === M.Oil), 0) < 5,
  );
});

test("a nearer side outlet wins, but flow takes one neighboring step and preserves particle state", () => {
  const w = new World(16, 16);
  for (let i = 0; i < w.length; i++) w.set(i, M.Wall);
  const i = 7 * 16 + 7;
  w.set(i, M.Water, 43);
  w.pigment[i] = 0xff123456;
  w.nutrition[i] = 6;
  for (const j of [6 * 16 + 7, 5 * 16 + 7, 7 * 16 + 8]) w.set(j, M.Sand);
  w.set(4 * 16 + 7, 0);
  w.set(7 * 16 + 9, 0);
  w.tick = 1;
  w.random = () => 0;
  assert.equal(w.porousFlow.seep(w, i, 7, 7), true);
  assert.equal(w.cells[7 * 16 + 8], M.Water);
  assert.equal(w.cells[7 * 16 + 9], 0);
  assert.equal(w.temp[7 * 16 + 8], 43);
  assert.equal(w.pigment[7 * 16 + 8], 0xff123456);
  assert.equal(w.nutrition[7 * 16 + 8], 6);
  assert.equal(w.cells[i], M.Sand);
});

test("percolation obeys porosity, viscosity and local pressure without unbounded searches", () => {
  const w = packed(),
    i = 16 * 24 + 12,
    j = i - 24;
  w.random = () => 0.03;
  assert.equal(poreExchange(w, i, j), true);
  const old = materials[M.Water].viscosity;
  try {
    materials[M.Water].viscosity = 8;
    assert.equal(poreExchange(w, i, j), false);
  } finally {
    materials[M.Water].viscosity = old;
  }
  w.random = () => 0.04;
  assert.equal(poreExchange(w, i, j), false);
  w.fields.pressure.fill(10);
  assert.equal(poreExchange(w, i, j), true);
  w.fields.pressure.fill(0);
  const permeability = materials[M.Sand].permeability;
  try {
    materials[M.Sand].permeability = 0;
    w.random = () => 0;
    assert.equal(poreExchange(w, i, j), false);
  } finally {
    materials[M.Sand].permeability = permeability;
  }
  w.tick = 4;
  const visits = w.porousFlow.visits;
  w.porousFlow.seep(w, i, 12, 16);
  assert.ok(w.porousFlow.visits - visits <= 24);
});

test("seeping follows all four gravity axes and still works after resizing restore", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(20, 20);
    w.setGravity(gx, gy);
    const i = 10 * 20 + 10,
      j = (10 - gy) * 20 + 10 - gx;
    w.set(i, M.Water);
    w.set(j, M.Sand);
    w.random = () => 0;
    w.tick = 1;
    assert.ok(w.porousFlow.seep(w, i, 10, 10));
    assert.equal(w.cells[j], M.Water);
  }
  const w = new World(8, 8),
    saved = packed();
  restore(w, snapshot(saved));
  run(w, 12);
  assert.ok(crossed(w) > 0);
  assert.equal(w.porousFlow.visited.length, w.length);
});

test("physical material properties are finite, inspected, and brittleness scales impact damage", () => {
  for (const m of materials) {
    assert.ok(Number.isFinite(m.density), m.name);
    for (const property of ["porosity", "permeability", "brittleness"])
      assert.ok(
        Number.isFinite(m[property]) && m[property] >= 0 && m[property] <= 1,
        m.name + property,
      );
  }
  const w = new World(16, 16);
  w.set(100, M.Steel);
  w.set(101, M.Glass);
  w.set(102, M.Wall);
  fracture(w.rigid, 100, 0.1);
  fracture(w.rigid, 101, 0.1);
  fracture(w.rigid, 102, 10000);
  assert.ok(w.damage[101] > w.damage[100]);
  assert.equal(w.cells[102], M.Wall);
  const labels = cellProperties(w, { x: 4, y: 6 }).rows.map(([label]) => label);
  for (const label of ["Density", "Porosity", "Permeability", "Brittleness"])
    assert.ok(labels.includes(label));
});
