import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { links } from "../src/sim/stickman-body.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { resizeLevel } from "../src/level.js";
import { EditHistory } from "../src/history.js";
const tick = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
function floor() {
  const w = new World(120, 80);
  for (let y = 60; y < 80; y++)
    for (let x = 0; x < 120; x++) w.set(y * w.width + x, M.Wall);
  return w;
}
test("player bodies settle, walk, jump, and retain safe joints", () => {
  const w = floor();
  assert.ok(w.stickmen.spawn(30, 55, M.Player));
  const a = w.stickmen.player;
  assert.equal(w.stickmen.spawn(80, 55, M.Player), false);
  tick(w, 100);
  assert.ok(a.grounded && a.alive);
  assert.ok(a.y[0] < a.y[2] - 6);
  const x = a.x[2];
  w.stickmen.controls.move = 1;
  tick(w, 45);
  assert.ok(a.x[2] > x + 6 && a.x[2] < x + 13);
  w.stickmen.controls.move = 0;
  const y = a.y[2];
  w.stickmen.controls.jump = true;
  tick(w, 10);
  assert.ok(a.y[2] < y - 6);
  assert.ok(a.bonds.every(Boolean));
  assert.ok(a.x.every(Number.isFinite));
});
test("A* finds supported walks, jump edges, and avoids impassable walls", () => {
  const w = floor(),
    planner = w.stickmen.planner;
  const route = planner.find({ x: 20, y: 59 }, { x: 100, y: 59 });
  assert.ok(route.length > 10);
  assert.ok(Math.abs(route.at(-1).x - 100) < 4);
  for (let y = 0; y < 60; y++)
    for (let x = 55; x < 58; x++) w.set(y * w.width + x, M.Wall);
  const blocked = planner.find({ x: 20, y: 59 }, { x: 100, y: 59 });
  assert.ok(blocked.every((p) => p.x < 55));
  for (let y = 0; y < 60; y++)
    for (let x = 55; x < 58; x++) w.set(y * w.width + x, 0);
  for (let y = 60; y < 80; y++)
    for (let x = 53; x < 56; x++) w.set(y * w.width + x, 0);
  const gap = planner.find({ x: 20, y: 59 }, { x: 100, y: 59 });
  assert.ok(gap.some((p) => p.jump));
  assert.ok(gap.at(-1).x > 90);
});
test("AI actually approaches a player using its route", () => {
  const w = floor();
  w.stickmen.spawn(20, 55, M.Stickman);
  w.stickmen.spawn(85, 55, M.Player);
  const a = w.stickmen.bodies[0];
  tick(w, 200);
  assert.ok(a.x[2] > 40);
  assert.ok(a.alive);
  assert.ok(a.goal && a.path.length);
});
test("cut limbs remain physical, corpses keep falling, and fire consumes finite fuel", () => {
  const w = floor();
  w.stickmen.spawn(30, 30, M.Stickman);
  const a = w.stickmen.bodies[0];
  const [u, v] = links[2];
  w.stickmen.brush("erase", (a.x[u] + a.x[v]) / 2, (a.y[u] + a.y[v]) / 2, 0.1);
  assert.equal(a.bonds[2], 0);
  const hand = a.y[3];
  tick(w, 10);
  assert.ok(a.y[3] > hand);
  a.heat.fill(400);
  tick(w, 150);
  assert.equal(a.alive, false);
  assert.ok(a.fuel.some((v) => v < 25));
  assert.ok(a.bonds.some((v) => !v));
  assert.ok(
    w.cells.some((id) => id === M.Smoke || id === M.Fire || id === M.CO2),
  );
});
test("characters preserve body state through saves, undo, resize, and reject unsafe imports", () => {
  const w = floor();
  const h = new EditHistory(w);
  h.remember("empty");
  w.stickmen.spawn(30, 55, M.Player);
  tick(w, 10);
  const before = snapshot(w),
    data = unpack(pack(before));
  restore(w, data);
  assert.deepEqual(w.stickmen.snapshot(), before.stickmen);
  assert.equal(h.undo("player"), "empty");
  assert.equal(w.stickmen.bodies.length, 0);
  h.redo("empty");
  assert.equal(w.stickmen.bodies.length, 1);
  const r = resizeLevel(
    w,
    {
      name: "Resize",
      width: 110,
      height: 80,
      border: "solid",
      background: "#102030",
    },
    10,
    0,
  );
  assert.ok(
    Math.abs(r.stickmen.bodies[0].x[2] - w.stickmen.bodies[0].x[2] + 10) <
      0.001,
  );
  const corrupt = structuredClone(data);
  corrupt.stickmen[0].x[0] = NaN;
  assert.throws(() => restore(w, corrupt));
  assert.equal(w.stickmen.bodies.length, 1);
  const tooMany = { ...data, stickmen: Array(33).fill(data.stickmen[0]) };
  assert.throws(() => unpack(tooMany));
});
test("rotated gravity, void exits, actor cap, and tools stay finite", () => {
  const w = new World(120, 80);
  w.setGravity(1, 0);
  for (let y = 0; y < 80; y++)
    for (let x = 100; x < 120; x++) w.set(y * w.width + x, M.Wall);
  assert.ok(w.stickmen.spawn(90, 40, M.Player));
  tick(w, 150);
  const a = w.stickmen.player;
  assert.ok(a && a.grounded);
  assert.ok(a.x[0] < a.x[2]);
  const heat = a.heat[0];
  w.stickmen.brush("warm", a.x[0], a.y[0], 3);
  assert.ok(a.heat[0] > heat);
  w.stickmen.brush("cool", a.x[0], a.y[0], 3);
  assert.ok(a.heat[0] <= heat + 0.001);
  w.border = "void";
  for (let n = 0; n < 9; n++) {
    a.x[n] = -25;
    a.px[n] = -25;
  }
  tick(w, 1);
  assert.equal(w.stickmen.bodies.length, 0);
});
