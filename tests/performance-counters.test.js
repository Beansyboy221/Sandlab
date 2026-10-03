import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceCounters } from "../src/performance-counters.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { snapshot } from "../src/persistence.js";
test("disabled profiling reads no clock; enabled stages accumulate without per-sample allocations", () => {
  let now = 0,
    calls = 0;
  const p = new PerformanceCounters(["one", "two"], () => {
    calls++;
    return now;
  });
  p.begin();
  p.mark(0);
  assert.equal(calls, 0);
  p.enabled = true;
  p.begin();
  now = 2;
  p.mark(0);
  now = 5;
  p.mark(1);
  assert.deepEqual([...p.times], [2, 3]);
  assert.match(p.describe(), /two: 3.00 ms/);
  p.begin();
  assert.deepEqual([...p.times], [0, 0]);
});
test("profiling preserves seeded simulation state and is omitted from saves", () => {
  const a = new World(32, 32),
    b = new World(32, 32);
  for (const w of [a, b]) {
    w.set(10 * 32 + 10, M.Sand);
    w.set(11 * 32 + 10, M.Water);
    w.set(20 * 32 + 12, M.Wood);
  }
  b.profile.enabled = true;
  for (let n = 0; n < 50; n++) {
    a.step();
    b.step();
  }
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.ok([...b.profile.times].every((v) => v >= 0 && Number.isFinite(v)));
  assert.ok(b.profile.times.some((v) => v > 0));
});
