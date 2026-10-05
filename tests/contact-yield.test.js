import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { dragBrush } from "../src/sim/tools.js";
import { collide } from "../src/sim/body-collisions.js";
import { collisionLimits as limits } from "../src/sim/collision-limits.js";
import { fractureLimits } from "../src/sim/body-stress.js";
import { snapshot, restore } from "../src/persistence.js";

function step(w, n) {
  for (let tick = 0; tick < n; tick++) {
    w.step();
    assert.ok(w.rigid.work.grainVisits <= limits.grainVisits);
    assert.ok(w.rigid.work.grainMoves <= limits.grainMoves);
    assert.ok(w.rigid.work.impactStressSamples <= fractureLimits.impactSamples);
    assert.equal(w.count, w.cells.filter(Boolean).length);
    assert.ok(w.velocityX.every(Number.isFinite));
  }
}
import { dropScene, throwScene } from "./contact-scenes.js";
test("a dropped steel wedge yields packed ash under every gravity orientation without losing grains", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = dropScene(gx, gy),
      ash = w.cells.filter((v) => v === M.Ash).length,
      steel = w.cells.filter((v) => v === M.Steel).length;
    step(w, 120);
    let deepest = 0;
    for (let i = 0; i < w.length; i++)
      if (w.cells[i] === M.Steel) {
        const x = i % 128,
          y = Math.floor(i / 128),
          v = gx * x + gy * y + (gx < 0 || gy < 0 ? 127 : 0);
        deepest = Math.max(deepest, v);
      }
    assert.ok(
      deepest >= 77 && deepest < 105,
      JSON.stringify({ gx, gy, deepest }),
    );
    assert.equal(w.cells.filter((v) => v === M.Ash).length, ash);
    assert.equal(w.cells.filter((v) => v === M.Steel).length, steel);
  }
});
test("timed Grab throws can sever a supported wooden beam and keep steel intact", () => {
  const w = throwScene(),
    before = w.count;
  dragBrush(
    w,
    { x: 35, y: 48 },
    { x: 55, y: 48 },
    12,
    "square",
    true,
    1000 / 60,
  );
  step(w, 100);
  assert.ok(w.cells.filter((v) => v === M.Sawdust).length > 0);
  assert.ok(
    w.rigid.bodies.filter(
      (b) => w.cells[w.rigid.locations.get(b.ids[0])] === M.Wood,
    ).length >= 2,
  );
  assert.equal(w.cells.filter((v) => v === M.Steel).length, 145);
  assert.equal(w.count, before);
  const other = new World();
  restore(other, snapshot(w));
  other.environment.sample = () => {
    other.environment.x = other.environment.y = 0;
  };
  step(w, 8);
  step(other, 8);
  assert.deepEqual(snapshot(other), snapshot(w));
});
test("Grab release speed depends on timed movement rather than its placement subdivisions", () => {
  const scene = () => {
    const w = new World(96, 64);
    for (let y = 20; y < 24; y++)
      for (let x = 20; x < 28; x++) w.set(y * 96 + x, M.Steel);
    return w;
  };
  const whole = scene(),
    divided = scene(),
    slow = scene();
  dragBrush(whole, { x: 24, y: 22 }, { x: 44, y: 22 }, 6, "square", true, 100);
  for (let n = 0; n < 2; n++)
    dragBrush(
      divided,
      { x: 24 + n * 10, y: 22 },
      { x: 34 + n * 10, y: 22 },
      6,
      "square",
      true,
      50,
    );
  dragBrush(slow, { x: 24, y: 22 }, { x: 44, y: 22 }, 6, "square", true, 200);
  const speed = (w) => w.rigid.pose(w.rigid.bodies[0]).vx;
  assert.ok(Math.abs(speed(whole) - speed(divided)) < 1e-6);
  assert.ok(Math.abs(speed(whole) - 2 * speed(slow)) < 1e-6);
  assert.deepEqual(whole.cells, divided.cells);
});
test("grain force chains conserve carried state, require an opening, and have a tick-wide bound", () => {
  const w = new World(24, 24);
  for (let i = 0; i < w.length; i++) w.set(i, M.Wall);
  for (let x = 6; x < 12; x++) {
    const i = 12 * 24 + x;
    w.set(i, M.Ash);
    w.pigment[i] = 0xff987654;
    w.storedLiquid[i] = M.Water;
    w.storedAmount[i] = 1;
  }
  w.set(12 * 24 + 12, 0);
  const sum = (key) => Array.from(w[key]).reduce((a, b) => a + b, 0),
    before = [w.count, sum("pigment"), sum("storedAmount")];
  const g = w.rigid.grains,
    cost = g.find(12 * 24 + 6, 20);
  assert.ok(cost > 0 && g.move());
  assert.deepEqual([w.count, sum("pigment"), sum("storedAmount")], before);
  w.set(12 * 24 + 6, M.Wall);
  const closed = snapshot(w);
  for (let n = 0; n < 100; n++) assert.equal(g.find(12 * 24 + 7, 100), 0);
  assert.deepEqual(snapshot(w), closed);
  assert.ok(w.rigid.work.grainVisits <= limits.grainVisits);
  assert.ok(w.rigid.work.grainMoves <= limits.grainMoves);
});
test("yielding consumes impact work instead of giving a body free penetration or speed", () => {
  const w = new World(24, 24),
    i = 10 * 24 + 10,
    j = 11 * 24 + 10;
  w.set(i, M.Steel);
  w.set(j, M.Ash);
  w.rigid.rebuild();
  const r = w.rigid,
    b = r.bodies[0],
    p = r.pose(b);
  p.vy = 2;
  const before = 0.5 * b.mass * p.vy * p.vy;
  const yielded = collide(
    r,
    b,
    p,
    {
      i,
      j,
      x: 10.5,
      y: 11,
      axis: 1,
      sign: 1,
      count: 1,
      minX: 10.5,
      maxX: 10.5,
      minY: 11,
      maxY: 11,
    },
    0,
    2,
  );
  assert.equal(yielded, true);
  const after =
    0.5 *
    (b.mass * (p.vx * p.vx + p.vy * p.vy) + b.inertia * p.omega * p.omega);
  assert.ok(after < before && p.vy > 0);
  assert.equal(w.cells.filter((v) => v === M.Ash).length, 1);
  assert.equal(w.count, 2);
});
