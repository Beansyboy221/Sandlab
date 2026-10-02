import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials, canonicalMaterial } from "../src/sim/materials.js";
import { paletteMaterials } from "../src/sim/material-families.js";
import { fillRegion } from "../src/sim/fill.js";
import { react } from "../src/sim/reactions.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection-region.js";
import { resizeLevel } from "../src/level.js";
import { moveBrush } from "../src/sim/tools.js";
const at = (w, x, y) => y * w.width + x;
const run = (w, n) => {
  for (let k = 0; k < n; k++) w.step();
};
const rect = (w, x, y, ww, hh, id) => {
  for (let yy = y; yy < y + hh; yy++)
    for (let xx = x; xx < x + ww; xx++) w.set(at(w, xx, yy), id);
};
const center = (w) => {
  if (w.rigid.dirty) w.rigid.rebuild();
  return w.rigid.pose(w.rigid.bodies[0]);
};

test("fill respects four-neighbor boundaries, replacement, looping, and single history entry", () => {
  const w = new World(24, 24);
  rect(w, 5, 5, 12, 12, M.Wall);
  rect(w, 6, 6, 10, 10, 0);
  let history = 0;
  assert.equal(
    fillRegion(w, 7, 7, { material: M.Water }, () => history++),
    100,
  );
  assert.equal(history, 1);
  assert.equal(fillRegion(w, 7, 7, { material: M.Sand }), 0);
  assert.equal(fillRegion(w, 7, 7, { material: M.Sand, replace: true }), 100);
  assert.equal(fillRegion(w, 0, 0, { material: M.Sand }), 432);
  assert.equal(w.cells[at(w, 5, 5)], M.Wall);
  assert.equal(fillRegion(w, 7, 7, { erase: true }), 100);
  const loop = new World(16, 16);
  loop.border = "looping";
  rect(loop, 1, 0, 14, 16, M.Wall);
  assert.equal(fillRegion(loop, 0, 0, { material: M.Water }), 32);
  const diagonal = new World(8, 8);
  rect(diagonal, 0, 0, 8, 8, M.Wall);
  diagonal.set(0, 0);
  diagonal.set(9, 0);
  assert.equal(fillRegion(diagonal, 0, 0, { material: M.Sand }), 1);
});
test("color fill preserves material and paints only matching regions, including background", () => {
  const w = new World(16, 16);
  rect(w, 2, 2, 6, 4, M.Sand);
  rect(w, 8, 2, 3, 4, M.Wood);
  assert.equal(
    fillRegion(w, 0, 0, { layer: "foreground", color: 0xff0000 }),
    0,
  );
  assert.equal(
    fillRegion(w, 3, 3, { layer: "foreground", color: 0xff0000, opacity: 0.5 }),
    24,
  );
  assert.ok(w.pigment.filter(Boolean).every((c) => c >>> 24 === 128));
  assert.equal(w.cells[at(w, 8, 2)], M.Wood);
  assert.equal(
    fillRegion(w, 0, 0, { layer: "background", color: 0x0088ff }),
    256,
  );
  assert.equal(fillRegion(w, 3, 3, { layer: "foreground", erase: true }), 24);
  assert.equal(w.pigment.some(Boolean), false);
  assert.equal(w.count, 36);
});
test("fill handles the maximum supported world without recursion or duplicate writes", () => {
  const w = new World(400, 500);
  assert.equal(fillRegion(w, 0, 0, { material: M.Sand }), 200000);
  assert.equal(w.count, 200000);
  assert.equal(fillRegion(w, 399, 499, { material: M.Sand }), 0);
});
test("Wall is the only static material and survives every destructive system and force tool", () => {
  assert.deepEqual(
    paletteMaterials.filter((m) => m.category === "static").map((m) => m.name),
    ["Wall"],
  );
  const w = new World(32, 32),
    i = at(w, 15, 15);
  w.set(i, M.Wall);
  for (const neighbor of [
    M.Void,
    M.Acid,
    M.Antimatter,
    M["Black hole"],
    M.Plasma,
  ]) {
    w.set(i + 1, neighbor);
    w.random = () => 0;
    react(w, i + 1, 16, 15);
    w.explode(15, 15, 7);
    assert.equal(w.cells[i], M.Wall);
  }
  moveBrush(w, 15, 15, 0, "circle", 1, 0, true);
  assert.equal(w.cells[i], M.Wall);
  run(w, 100);
  assert.equal(w.cells[i], M.Wall);
  assert.equal(w.elasticId[i], 0);
  w.brush(15, 15, 0, 0);
  assert.equal(w.cells[i], 0); // Editing is still permitted.
});
test("all solids fall as connected shapes under each gravity direction, with meaningful mass", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(100, 100);
    w.setGravity(gx, gy);
    rect(w, 40, 40, 9, 4, M.Steel);
    const before = center(w);
    assert.equal(w.rigid.bodies.length, 1);
    assert.ok(Math.abs(w.rigid.bodies[0].mass - 36 * 7.8) < 0.001);
    run(w, 12);
    const after = center(w);
    assert.ok((after.x - before.x) * gx + (after.y - before.y) * gy > 10);
    assert.equal(w.count, 36);
    assert.ok(Math.abs(after.angle) < 0.00001);
    for (const body of w.rigid.bodies)
      for (const id of body.ids) {
        const i = w.rigid.locations.get(id);
        assert.ok(Math.abs(w.restX[i] - body.lx) < 5);
      }
  }
  for (const m of materials.filter((m) => m.rigid)) {
    const w = new World(16, 32);
    w.set(at(w, 8, 4), m.id);
    w.rigid.step();
    w.rigid.step();
    assert.ok(center(w).y > 4.5, m.name);
  }
});
test("cuts split rigid shapes and Grab moves whole bodies without altering their shape", () => {
  const w = new World(80, 100);
  rect(w, 20, 10, 14, 3, M.Wood);
  w.brush(27, 11, 1, 0, "square");
  w.rigid.rebuild();
  assert.equal(w.rigid.bodies.length, 2);
  const count = w.count;
  moveBrush(w, 21, 10, 0, "circle", 4, 2, true);
  assert.equal(w.count, count);
  assert.equal(w.cells[at(w, 25, 12)], M.Wood);
  run(w, 30);
  assert.equal(w.count, count);
  assert.ok(w.rigid.bodies.every((b) => w.rigid.pose(b).y > 30));
});
test("a falling beam rotates on an off-center support and retains its rest lengths", () => {
  const w = new World(100, 100);
  rect(w, 35, 35, 3, 50, M.Wall);
  rect(w, 34, 15, 22, 3, M.Steel);
  run(w, 35);
  const pose = center(w);
  assert.ok(Math.abs(pose.angle) > 0.04, JSON.stringify(pose));
  const b = w.rigid.bodies[0],
    ids = b.ids;
  const i = w.rigid.locations.get(ids[0]),
    j = w.rigid.locations.get(ids[ids.length - 1]);
  const distance = Math.hypot(
    (i % w.width) + w.offsetX[i] - (j % w.width) - w.offsetX[j],
    Math.floor(i / w.width) +
      w.offsetY[i] -
      Math.floor(j / w.width) -
      w.offsetY[j],
  );
  assert.ok(
    Math.abs(
      distance - Math.hypot(w.restX[i] - w.restX[j], w.restY[i] - w.restY[j]),
    ) < 0.001,
  );
});
test("massive impacts break glass, conserve matter, and resting contact causes no damage", () => {
  const w = new World(80, 100);
  rect(w, 0, 80, 80, 20, M.Wall);
  rect(w, 25, 77, 25, 3, M.Glass);
  rect(w, 32, 12, 10, 6, M.Steel);
  run(w, 55);
  assert.ok(
    w.cells.includes(M["Glass dust"]),
    "heavy impact should fracture glass",
  );
  assert.equal(w.cells.filter((id) => id === M.Wall).length, 1600);
  const resting = new World(48, 48);
  rect(resting, 0, 35, 48, 13, M.Wall);
  rect(resting, 15, 32, 12, 3, M.Glass);
  run(resting, 200);
  assert.equal(resting.rigid.locations.size, 36);
  assert.ok(resting.damage.every((d) => d === 0));
});
test("rigid bodies displace fluids without destroying them and obey looping and void borders", () => {
  const w = new World(64, 100);
  rect(w, 0, 60, 64, 40, M.Water);
  rect(w, 25, 20, 8, 6, M.Steel);
  const water = w.cells.filter((id) => id === M.Water).length;
  run(w, 25);
  assert.equal(w.cells.filter((id) => id === M.Water).length, water);
  assert.ok(center(w).y > 60);
  for (const border of ["looping", "void"]) {
    const b = new World(24, 24);
    b.border = border;
    rect(b, 10, 21, 3, 2, M.Stone);
    run(b, 15);
    assert.equal(b.count, border === "void" ? 0 : 6);
    assert.equal(b.rigid.locations.size, b.count);
  }
});
test("body state survives copy, resize and roundtrip saves with deterministic continuation", () => {
  const w = new World(64, 100);
  rect(w, 20, 8, 12, 4, M.Copper);
  run(w, 10);
  const data = snapshot(w),
    loaded = new World();
  restore(loaded, unpack(pack(data)));
  assert.deepEqual(snapshot(loaded), data);
  for (let n = 0; n < 12; n++) {
    w.step();
    loaded.step();
  }
  assert.deepEqual(snapshot(loaded), snapshot(w));
  const clip = copyRegion(w, { x: 15, y: 0, width: 25, height: 60 });
  pasteRegion(w, clip, 36, 0);
  w.rigid.rebuild();
  assert.equal(w.rigid.bodies.length, 2);
  const resized = resizeLevel(
    w,
    {
      name: "Bodies",
      width: 80,
      height: 120,
      border: "solid",
      background: "#111b20",
    },
    -5,
    -5,
  );
  resized.step();
  assert.equal(resized.rigid.locations.size, 96);
});
test("legacy acid IDs and absorbed acids migrate to the single Acid entry", () => {
  assert.deepEqual(
    paletteMaterials.filter((m) => m.acidic).map((m) => m.name),
    ["Acid"],
  );
  const w = new World(16, 16);
  w.set(30, M.Sponge);
  w.storedLiquid[30] = M.Acid;
  w.storedAmount[30] = 5;
  const old = snapshot(w);
  old.arrays.cells[40] = 59;
  old.arrays.cells[41] = 91;
  old.arrays.storedLiquid[30] = 59;
  old.arrays.clone[42] = 91;
  restore(w, old);
  assert.equal(w.cells[40], M.Acid);
  assert.equal(w.cells[41], M.Acid);
  assert.equal(w.storedLiquid[30], M.Acid);
  assert.equal(w.clone[42], M.Acid);
  assert.equal(canonicalMaterial(59), M.Acid);
  assert.equal(canonicalMaterial(91), M.Acid);
  for (const legacy of [20, 59, 91]) {
    const b = new World(16, 16);
    b.set(100, legacy);
    b.set(101, M["Baking soda"]);
    react(b, 100, 4, 6);
    assert.ok(b.cells.includes(M["Carbon dioxide foam"]));
  }
});

test("balanced overhangs remain stable and diagonal motion cannot escape closed supports", () => {
  const w = new World(48, 48);
  rect(w, 20, 25, 12, 2, M.Wood);
  rect(w, 23, 27, 5, 18, M.Wall);
  run(w, 160);
  const pose = center(w);
  assert.ok(Math.abs(pose.angle) < 0.001);
  assert.equal(w.rigid.locations.size, 24);
  const trapped = new World(32, 32),
    i = at(trapped, 16, 16);
  trapped.set(i, M.Steel);
  for (const j of [i - 1, i + 1, i - 32, i + 32]) trapped.set(j, M.Wall);
  trapped.velocityX[i] = 0.9;
  trapped.velocityY[i] = 0.9;
  trapped.fields.add(12, 12, 20);
  run(trapped, 120);
  assert.equal(trapped.cells[i], M.Steel);
  assert.equal(trapped.rigid.locations.size, 1);
});
test("invalid rigid identity, rest coordinates, velocities and damage cannot replace live data", () => {
  const w = new World(24, 24);
  rect(w, 10, 8, 4, 2, M.Steel);
  const before = snapshot(w);
  for (const [key, value] of [
    ["restX", Infinity],
    ["restY", 100000],
    ["damage", -1],
    ["angularVelocity", NaN],
    ["velocityX", 1e6],
  ]) {
    const bad = snapshot(w);
    bad.arrays[key][at(w, 10, 8)] = value;
    assert.throws(() => restore(w, bad));
    assert.deepEqual(snapshot(w), before);
  }
  const bad = snapshot(w);
  bad.arrays.elasticId[at(w, 11, 8)] = bad.arrays.elasticId[at(w, 10, 8)];
  assert.throws(() => restore(w, bad), /identity/);
  assert.deepEqual(snapshot(w), before);
});
