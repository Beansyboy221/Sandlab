import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { actorProfile } from "../src/sim/creature-profiles.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { loadPreset } from "../src/presets.js";
const run = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
function arena() {
  const w = new World(200, 100);
  for (let y = 80; y < 100; y++)
    for (let x = 0; x < 200; x++) w.set(y * 200 + x, M.Wall);
  return w;
}
test("human speed, braking and jump height remain proportional to body size", () => {
  const w = arena();
  w.stickmen.spawn(50, 78, M.Player);
  run(w, 100);
  const a = w.stickmen.player;
  const x = a.x[2];
  w.stickmen.controls.move = 1;
  run(w, 60);
  const distance = a.x[2] - x;
  assert.ok(
    distance > 9 && distance < 16,
    `One second of walking: ${distance} cells`,
  );
  w.stickmen.controls.move = 0;
  const stop = a.x[2];
  run(w, 30);
  assert.ok(a.x[2] - stop < 4);
  const y = a.y[2];
  w.stickmen.controls.jump = true;
  let highest = y;
  for (let n = 0; n < 60; n++) {
    w.step();
    highest = Math.min(highest, a.y[2]);
  }
  assert.ok(y - highest > 5 && y - highest < 11, `Jump height: ${y - highest}`);
  assert.ok(a.alive && a.grounded);
});
test("cats walk, rabbits hop, birds fly, and dead birds fall", () => {
  for (const name of ["Cat", "Rabbit", "Bird"]) {
    const w = arena();
    w.stickmen.spawn(50, 75, M[name]);
    run(w, 80);
    const a = w.stickmen.bodies[0],
      x = a.x[2],
      y = a.y[2];
    let low = y,
      high = y;
    for (let n = 0; n < 150; n++) {
      w.step();
      low = Math.min(low, a.y[2]);
      high = Math.max(high, a.y[2]);
    }
    assert.ok(a.alive && a.health > 95, name);
    assert.ok(a.x[2] > x + 5, name);
    assert.ok(a.x.every(Number.isFinite));
    if (name === "Cat") assert.ok(a.grounded);
    if (name === "Rabbit")
      assert.ok(high - low > 2, "Rabbit hops rather than gliding");
    if (name === "Bird") {
      assert.ok(a.y[2] < 65 && !a.grounded);
      a.alive = false;
      const before = a.y[2];
      run(w, 15);
      assert.ok(a.y[2] > before + 5);
    }
  }
});
test("fish swim in water, avoid tank sides, and cannot breathe air or oil", () => {
  const w = arena();
  for (let y = 25; y < 80; y++)
    for (let x = 1; x < 199; x++) w.set(y * 200 + x, M.Water);
  assert.ok(w.stickmen.spawn(50, 55, M.Fish));
  const a = w.stickmen.bodies[0];
  const x = a.x[2];
  run(w, 240);
  assert.ok(a.alive && a.health > 99 && a.submerged);
  assert.ok(a.x[2] > x + 5);
  assert.ok(a.y[2] > 25 && a.y[2] < 80);
  for (const liquid of [0, M.Oil]) {
    const dry = arena();
    if (liquid)
      for (let y = 20; y < 80; y++)
        for (let x = 1; x < 199; x++) dry.set(y * 200 + x, liquid);
    dry.stickmen.spawn(50, 55, M.Fish);
    run(dry, 240);
    assert.ok(dry.stickmen.bodies[0].health < 80);
    assert.ok(!dry.stickmen.bodies[0].submerged);
  }
});
test("creature anatomy survives saves, cuts, burns and all gravity orientations", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(160, 120);
    w.setGravity(gx, gy);
    loadPreset(w, "wildlife");
    assert.equal(w.stickmen.bodies.length, 4);
    run(w, 120);
    assert.ok(
      w.stickmen.bodies.every((a) => a.alive && a.x.every(Number.isFinite)),
    );
    const saved = snapshot(w);
    restore(w, unpack(pack(saved)));
    assert.deepEqual(w.stickmen.snapshot(), saved.stickmen);
  }
  const w = arena();
  w.stickmen.spawn(50, 60, M.Cat);
  const a = w.stickmen.bodies[0],
    link = actorProfile(a.material).links[3],
    u = link[0],
    v = link[1];
  w.stickmen.brush("erase", (a.x[u] + a.x[v]) / 2, (a.y[u] + a.y[v]) / 2, 0.05);
  assert.equal(a.bonds[3], 0);
  a.heat.fill(500);
  run(w, 150);
  assert.ok(!a.alive && a.fuel.some((v) => v < 30));
  const bad = snapshot(w);
  bad.stickmen[0].direction = 0;
  assert.throws(() => restore(w, bad));
});

test("A* walkers preserve momentum and cross short planned gaps", () => {
  const w = new World(120, 80);
  for (let y = 60; y < 80; y++)
    for (let x = 0; x < 120; x++)
      if (x < 53 || x >= 56) w.set(y * 120 + x, M.Wall);
  w.stickmen.spawn(25, 58, M.Stickman);
  w.stickmen.spawn(90, 58, M.Player);
  run(w, 400);
  assert.ok(w.stickmen.bodies[0].x[2] > 65 && w.stickmen.bodies[0].alive);
});
