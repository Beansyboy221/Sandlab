import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials, canonicalMaterial } from "../src/sim/materials.js";
import { paletteMaterials } from "../src/sim/material-families.js";
import { weather } from "../src/sim/weather.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";

function cloudBox(temperature = 15, gravity = [0, 1]) {
  const w = new World(32, 40);
  w.gravityX = gravity[0];
  w.gravityY = gravity[1];
  for (let y = 8; y <= 14; y++)
    for (let x = 8; x <= 15; x++) w.set(y * w.width + x, M.Cloud, temperature);
  return w;
}
function advanceWeather(w, i, ticks = 600) {
  for (let n = 0; n < ticks && w.cells[i] === M.Cloud; n++) {
    w.tick = n;
    weather(w, i, i % w.width, Math.floor(i / w.width));
  }
}
test("renamed materials retain save IDs, deprecated sources migrate, and powders have distinct properties", () => {
  assert.equal(M.Fuel, 23);
  assert.equal(M["Metal Dust"], 19);
  assert.equal(M.Kerosene, M.Fuel);
  assert.equal(M["Steel Powder"], M["Metal Dust"]);
  assert.equal(M["Wood Chips"], M.Sawdust);
  assert.equal(canonicalMaterial(96), M.Sawdust);
  assert.ok(materials.some((m) => m.name === "Storm" && m.retired));
  const names = new Set(paletteMaterials.map((m) => m.name));
  for (const name of ["Fuel", "Steel", "Wood", "Glue", "Cloud"])
    assert.ok(names.has(name), name);
  for (const name of [
    "Kerosene",
    "Steel Powder",
    "Wood Chips",
    "Storm",
    "Liquid Glue",
  ])
    assert.ok(!names.has(name), name);
  assert.equal(materials[M.Sawdust].density, materials[M.Wood].density);
  assert.ok(materials[M.Sawdust].porosity > materials[M.Sand].porosity);
  assert.ok(materials[M.Sawdust].burn < materials[M.Wood].burn);
  const w = new World(20, 20),
    data = snapshot(w);
  data.arrays.cells[0] = 96;
  data.arrays.cells[1] = materials.find((m) => m.name === "Storm").id;
  restore(w, data);
  assert.equal(w.cells[0], M.Sawdust);
  assert.equal(w.cells[1], M.Cloud);
});
test("rain and snow require dense cool cloud edges and conserve condensate pixels", () => {
  for (const [temperature, result] of [
    [15, M.Water],
    [-15, M.Snow],
  ]) {
    const w = cloudBox(temperature),
      i = 14 * 32 + 11,
      before = w.count;
    advanceWeather(w, i);
    assert.equal(w.cells[i], result);
    assert.equal(w.count, before);
    assert.equal(w.cells[i + 32], 0);
    assert.ok(w.fields.pressure[w.fields.index(11, 14)] < 0);
  }
  const thin = new World(32, 40);
  thin.set(14 * 32 + 11, M.Cloud, 10);
  advanceWeather(thin, 14 * 32 + 11, 1600);
  assert.equal(thin.cells[14 * 32 + 11], M.Cloud);
  const warm = cloudBox(45);
  advanceWeather(warm, 14 * 32 + 11, 1600);
  assert.equal(warm.cells[14 * 32 + 11], M.Cloud);
  const interior = cloudBox();
  advanceWeather(interior, 11 * 32 + 11, 1000);
  assert.equal(interior.cells[11 * 32 + 11], M.Cloud);
});
test("clouds require mixed frozen/liquid condensate and updrafts for electrical storms", () => {
  for (const [mixed, updraft, expectStrike] of [
    [true, 0.3, true],
    [true, 0, false],
    [false, 0.3, false],
  ]) {
    const w = cloudBox(5),
      i = 11 * 32 + 11;
    if (mixed)
      for (let y = 8; y <= 10; y++)
        for (let x = 8; x <= 15; x++) w.temp[y * 32 + x] = -15;
    w.fields.airflow.velocityY.fill(-updraft);
    w.fields.airflow.north.fill(-updraft);
    advanceWeather(w, i, 640);
    assert.equal(w.lastStrikeTick >= 0, expectStrike);
    assert.equal(w.cells.includes(M.Lightning), expectStrike);
  }
});
test("precipitation and storm direction follow rotated gravity and charge persists through saves", () => {
  const w = cloudBox(15, [1, 0]),
    i = 11 * 32 + 15;
  advanceWeather(w, i);
  assert.equal(w.cells[i], M.Water);
  assert.equal(w.cells[i + 1], 0);
  const cloud = cloudBox(5);
  cloud.growth[11 * 32 + 11] = 77;
  cloud.moisture[11 * 32 + 11] = 45;
  const loaded = new World(32, 40);
  restore(loaded, unpack(pack(snapshot(cloud))));
  assert.deepEqual(snapshot(loaded), snapshot(cloud));
  for (let n = 0; n < 32; n++) {
    cloud.step();
    loaded.step();
  }
  assert.deepEqual(snapshot(loaded), snapshot(cloud));
});
test("Glue uses elastic bonds, adheres after contact, releases when warm and melts reversibly", () => {
  const w = new World(32, 40),
    i = 10 * 32 + 10;
  w.set(i, M.Glue);
  w.set(i + 1, M.Glue);
  assert.ok(w.bond0[i]);
  assert.ok(w.elastic.locations.size === 2);
  // Add the wall after drawing to exercise new adhesive contact, not initial anchors.
  w.set(i - 1, M.Wall);
  w.elastic.step();
  assert.ok(w.elasticAnchor[i]);
  w.temp[i] = 65;
  w.elastic.step();
  assert.equal(w.elasticAnchor[i], 0);
  w.temp[i] = 100;
  w.step();
  assert.ok(w.cells.includes(M["Liquid Glue"]));
  const liquid = w.cells.indexOf(M["Liquid Glue"]);
  w.temp[liquid] = 20;
  w.step();
  assert.ok(w.cells.includes(M.Glue));
  const loaded = new World(32, 40);
  restore(loaded, unpack(pack(snapshot(w))));
  assert.deepEqual(snapshot(loaded), snapshot(w));
});
