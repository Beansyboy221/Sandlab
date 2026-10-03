import test from "node:test";
import assert from "node:assert/strict";
import { scene } from "./collision-benchmark.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { collisionLimits as limits } from "../src/sim/collision-limits.js";
import { snapshot, restore } from "../src/persistence.js";
test("touching solid piles read and write each body only once per tick", () => {
  for (const count of [20, 80, 200]) {
    const w = scene(count),
      pixels = w.rigid.locations.size,
      initial = w.count;
    for (let tick = 0; tick < 20; tick++) {
      w.rigid.step();
      const s = w.rigid.work,
        b = w.rigid.bodies.length;
      assert.equal(s.posePixels, pixels);
      assert.equal(s.syncPixels, pixels);
      assert.ok(s.plans <= b * limits.plans);
      assert.ok(s.scanned <= pixels * limits.plans);
      assert.ok(
        s.contacts <=
          b * limits.contacts * (limits.substeps + limits.supportPasses),
      );
      assert.equal(
        w.cells.filter(
          (id) => id === M.Wall || id === M.Steel || id === M.Copper,
        ).length,
        initial,
      );
      assert.equal(w.count, w.cells.filter(Boolean).length);
      assert.equal(w.rigid.locations.size, pixels);
    }
  }
});
test("contact manifolds are capped but every obstacle still rejects overlap", () => {
  const w = new World(160, 100);
  for (let y = 50; y < 60; y++)
    for (let x = 10; x < 150; x++) w.set(y * w.width + x, M.Steel);
  for (let x = 10; x < 150; x += 2)
    w.set(60 * w.width + x, M.Copper, 20, 0, false);
  w.rigid.rebuild();
  const body = w.rigid.bodies.find((b) => b.ids.length > 100),
    p = w.rigid.pose(body);
  const hit = w.rigid.plan(body, { ...p, y: p.y + 1, vy: 1 });
  assert.ok(hit);
  assert.ok(hit.others.length < limits.contacts);
  assert.ok(w.rigid.work.limitedContacts > 0);
  const count = w.count;
  for (let i = 0; i < 10; i++) w.rigid.step();
  assert.equal(
    w.cells.filter((id) => id === M.Steel || id === M.Copper).length,
    count,
  );
  assert.equal(w.cells.filter(Boolean).length, w.count);
});
test("adversarial raster contention has a finite search and preserves occupancy on failure", () => {
  const w = new World(200, 80),
    r = w.rigid.raster,
    body = {};
  const base = 20 * w.width + 10;
  w.rigid.passable = (k) => k >= base && k <= base + 160;
  for (const pixels of [200, 1]) {
    r.begin(pixels);
    for (let n = 0; n < 150; n++) {
      r.x[n] = 10 + n + 0.5;
      r.y[n] = 20.5;
      r.assign(n, base + n);
    }
    assert.equal(r.reserve(150, 10.5, 20.5, body, base), false);
    assert.ok(r.visits <= limits.rasterSearch);
    assert.ok(r.visits <= pixels * limits.rasterVisitsPerPixel);
    assert.equal(
      r.visits,
      Math.min(limits.rasterSearch, pixels * limits.rasterVisitsPerPixel),
    );
    assert.equal(w.count, 0);
    assert.equal(w.cells.filter(Boolean).length, 0);
  }
});
test("bounded collision steps retain deterministic save continuation", () => {
  const w = scene(35);
  for (let i = 0; i < 12; i++) w.step();
  const other = new World();
  restore(other, snapshot(w));
  Object.assign(other.mechanics, w.mechanics);
  for (let i = 0; i < 8; i++) {
    w.step();
    other.step();
  }
  const a = snapshot(other),
    b = snapshot(w);
  for (const key of Object.keys(a)) {
    if (key === "arrays")
      for (const name of Object.keys(a.arrays))
        assert.ok(
          JSON.stringify(a.arrays[name]) === JSON.stringify(b.arrays[name]),
          name,
        );
    else assert.ok(JSON.stringify(a[key]) === JSON.stringify(b[key]), key);
  }
});
