import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { presets, loadPreset } from "../src/presets.js";
import { painter } from "../src/presets/painter.js";
const run = (w, n) => {
  for (let k = 0; k < n; k++) w.step();
};
const count = (w, id) => w.cells.filter((v) => v === id).length;
for (const [width, height] of [
  [320, 200],
  [200, 300],
])
  test(`every preset stays valid at ${width} × ${height}`, () => {
    for (const preset of presets) {
      const w = new World(width, height);
      loadPreset(w, preset.id);
      run(w, 120);
      assert.equal(w.count, w.cells.filter(Boolean).length, preset.id);
      assert.equal(
        w.count,
        w.chunks.reduce((a, b) => a + b, 0),
        preset.id,
      );
      assert.ok(w.temp.every(Number.isFinite), preset.id);
      assert.ok(w.fields.pressure.every(Number.isFinite), preset.id);
      if (preset.id === "blank") assert.equal(w.count, 0);
    }
  });
test("density vessel conserves liquids without leaking through its corners", () => {
  for (const [width, height] of [
    [320, 200],
    [200, 300],
  ]) {
    const w = new World(width, height);
    loadPreset(w, "chemistry");
    const initial = w.count;
    run(w, 450);
    assert.equal(w.count, initial);
    const left = Math.round(width * 0.31),
      right = left + Math.round(width * 0.38);
    for (let i = 0; i < w.length; i++)
      if ([M.Water, M.Oil, M.Mercury].includes(w.cells[i]))
        assert.ok(i % width > left && i % width < right);
  }
});
test("supported fuse ignites every TNT block, and live wire reaches its payload", () => {
  for (const id of ["explosion", "circuit"]) {
    const w = new World();
    loadPreset(w, id);
    assert.ok(count(w, M.TNT) > 0);
    run(w, 500);
    assert.equal(count(w, M.TNT), 0, id);
  }
});
test("garden grows from seeds, storm strikes its rod, foundry melts and casts metal", () => {
  const garden = new World();
  loadPreset(garden, "garden");
  run(garden, 400);
  assert.ok(count(garden, M.Plant) > 30);
  const storm = new World();
  loadPreset(storm, "storm");
  let charged = false;
  for (let n = 0; n < 160; n++) {
    storm.step();
    charged ||= storm.charge.some(Boolean);
  }
  assert.ok(charged);
  const foundry = new World();
  loadPreset(foundry, "foundry");
  run(foundry, 350);
  assert.ok(count(foundry, M["Molten steel"]) > 0);
  assert.ok(count(foundry, M.Steel) > 0);
});
test("preset painter clips rounded edges and handles zero-length lines", () => {
  const w = new World(16, 16),
    p = painter(w);
  p.put(15.8, 0, "Water");
  assert.equal(w.count, 0);
  p.line(8, 8, 8, 8, "Stone", 0);
  assert.equal(w.count, 1);
  assert.equal(w.cells[136], M.Stone);
});

test("reaction bench reacts and pottery kiln dries and fires without melting its bricks", () => {
  for (const [width, height] of [
    [320, 200],
    [200, 300],
  ]) {
    const chemistry = new World(width, height);
    loadPreset(chemistry, "reactions");
    run(chemistry, 120);
    assert.ok(count(chemistry, M["Carbon dioxide"]) > 0);
    assert.equal(count(chemistry, M.Sodium), 0);
    const pottery = new World(width, height);
    loadPreset(pottery, "pottery");
    run(pottery, 400);
    assert.ok(count(pottery, M.Brick) > 10);
    assert.equal(count(pottery, M["Wet clay"]), 0);
    assert.equal(count(pottery, M.Lava), 0);
  }
});
