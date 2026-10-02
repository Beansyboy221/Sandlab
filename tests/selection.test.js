import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { particleStateFields } from "../src/sim/particle-state.js";
import {
  copyRegion,
  pasteRegion,
  selectionRect,
  Selection,
} from "../src/selection.js";
import { snapshot, restore } from "../src/persistence.js";
const at = (w, x, y) => y * w.width + x;
test("selection rectangles include both endpoints, reverse drag, and clip to the world", () => {
  const w = new World(20, 20);
  assert.deepEqual(selectionRect(w, { x: 9.8, y: 7.2 }, { x: 3.4, y: 2.1 }), {
    x: 3,
    y: 2,
    width: 7,
    height: 6,
  });
  assert.deepEqual(selectionRect(w, { x: -50, y: -10 }, { x: 90, y: 99 }), {
    x: 0,
    y: 0,
    width: 20,
    height: 20,
  });
  assert.deepEqual(selectionRect(w, { x: 8, y: 8 }), {
    x: 8,
    y: 8,
    width: 1,
    height: 1,
  });
});
test("copy and paste preserve complete independent particle state including sponge contents", () => {
  const w = new World(24, 24),
    i = at(w, 3, 3);
  w.set(i, M.Sponge, 83, 12);
  w.storedAmount[i] = 19;
  w.storedLiquid[i] = M.Brine;
  w.cooldown[i] = 8;
  w.set(i + 1, M.Clone);
  w.clone[i + 1] = M.Water;
  const copied = copyRegion(w, { x: 3, y: 3, width: 2, height: 1 });
  w.temp[i] = 40;
  w.storedAmount[i] = 1;
  assert.equal(copied.arrays.temp[0], 83);
  assert.equal(copied.arrays.storedAmount[0], 19);
  assert.equal(pasteRegion(w, copied, 12, 12), 2);
  for (const field of particleStateFields)
    assert.equal(w[field][at(w, 12, 12)], copied.arrays[field][0], field);
  assert.equal(w.clone[at(w, 13, 12)], M.Water);
  const restored = new World(24, 24);
  restore(restored, snapshot(w));
  assert.deepEqual(snapshot(restored), snapshot(w));
});
test("paste defaults to empty cells, replaces on request, and leaves transparent holes untouched", () => {
  const w = new World(20, 20);
  w.set(at(w, 2, 2), M.Sand);
  w.set(at(w, 4, 2), M.Fire, 650, 30);
  const clip = copyRegion(w, { x: 2, y: 2, width: 3, height: 1 });
  w.set(at(w, 8, 8), M.Steel);
  w.set(at(w, 9, 8), M.Stone);
  assert.equal(pasteRegion(w, clip, 8, 8), 1);
  assert.equal(w.cells[at(w, 8, 8)], M.Steel);
  assert.equal(w.cells[at(w, 9, 8)], M.Stone);
  assert.equal(pasteRegion(w, clip, 8, 8, true), 2);
  assert.equal(w.cells[at(w, 8, 8)], M.Sand);
  assert.equal(w.cells[at(w, 9, 8)], M.Stone);
  assert.equal(w.life[at(w, 10, 8)], clip.arrays.life[2]);
  assert.equal(w.count, w.cells.filter(Boolean).length);
  assert.equal(
    w.count,
    w.chunks.reduce((a, b) => a + b, 0),
  );
});
test("overlapping copies use the captured state and clipped pastes never wrap rows", () => {
  const w = new World(20, 20);
  for (let x = 2; x < 5; x++) w.set(at(w, x, 3), M.Wood, 100 + x);
  const clip = copyRegion(w, { x: 2, y: 3, width: 3, height: 1 });
  pasteRegion(w, clip, 3, 3, true);
  assert.deepEqual(
    Array.from(w.temp.slice(at(w, 3, 3), at(w, 6, 3))),
    [102, 103, 104],
  );
  w.clear();
  assert.equal(pasteRegion(w, clip, 19, 19), 1);
  assert.equal(w.count, 1);
  w.clear();
  assert.equal(pasteRegion(w, clip, -2, 5), 1);
  assert.equal(w.cells[at(w, 0, 5)], M.Wood);
  assert.equal(w.cells[at(w, 19, 4)], 0);
});
test("selection and cancellation do not mutate the world or add undo entries; placing does", () => {
  const w = new World(20, 20);
  w.set(at(w, 2, 2), M.Wood);
  const before = snapshot(w);
  let mutations = 0;
  const s = new Selection(
    w,
    () => {},
    () => mutations++,
  );
  s.begin({ x: 1, y: 1 });
  s.move({ x: 3, y: 3 });
  s.end();
  assert.ok(s.copy());
  assert.deepEqual(snapshot(w), before);
  assert.equal(mutations, 0);
  s.arm();
  s.move({ x: 10, y: 10 });
  s.cancel();
  assert.equal(mutations, 0);
  s.arm();
  s.begin({ x: 10, y: 10 });
  s.end();
  assert.equal(mutations, 1);
  assert.equal(w.cells[at(w, 10, 10)], M.Wood);
  assert.equal(w.count, 2);
});
test("copied electrical stamps follow the destination clock and absent stamps stay zero", () => {
  const w = new World(20, 20);
  w.tick = 80;
  const i = at(w, 2, 2);
  w.set(i, M.Steel);
  w.charge[i] = 5;
  w.chargedAt[i] = 79;
  const clip = copyRegion(w, { x: 2, y: 2, width: 2, height: 1 });
  w.tick = 100;
  pasteRegion(w, clip, 8, 8);
  assert.equal(w.chargedAt[at(w, 8, 8)], 99);
  assert.equal(w.chargedAt[at(w, 9, 8)], 0);
});
test("circle strokes accumulate, interpolate gaps, clip, and erase only the selection", () => {
  const w = new World(40, 30);
  for (let x = 2; x < 35; x++) w.set(at(w, x, 10), M.Steel);
  const before = snapshot(w);
  let mutations = 0;
  const s = new Selection(
    w,
    () => {},
    () => mutations++,
  );
  s.begin({ x: 3.5, y: 10.5 }, "circle", 2);
  s.move({ x: 30.5, y: 10.5 });
  s.end();
  for (let x = 3; x <= 30; x++) assert.equal(s.mask.data[at(w, x, 10)], 1);
  assert.equal(s.mask.data[at(w, 15, 13)], 0);
  const count = s.mask.count;
  s.begin({ x: 15.5, y: 10.5 }, "circle", 1, true);
  s.end();
  assert.equal(s.mask.count, count - 5);
  assert.equal(s.mask.data[at(w, 15, 10)], 0);
  assert.equal(s.mask.data[at(w, 15, 12)], 1);
  s.begin({ x: -0.5, y: -0.5 }, "circle", 4);
  s.end();
  assert.equal(s.mask.data[0], 1);
  assert.equal(s.mask.data[at(w, 39, 29)], 0);
  assert.equal(
    s.mask.count,
    s.mask.data.reduce((a, b) => a + b, 0),
  );
  assert.deepEqual(snapshot(w), before);
  assert.equal(mutations, 0);
});
test("circle erasing refines rectangles and masked copy preserves gaps even when replacing", () => {
  const w = new World(30, 30),
    s = new Selection(w);
  for (let y = 3; y <= 9; y++)
    for (let x = 3; x <= 9; x++) w.set(at(w, x, y), M.Wood);
  s.begin({ x: 3, y: 3 });
  s.move({ x: 9, y: 9 });
  s.end();
  assert.equal(s.mask.count, 49);
  s.begin({ x: 6, y: 6 }, "circle", 1, true);
  s.end();
  assert.equal(s.mask.count, 44);
  s.copy();
  assert.equal(s.clipboard.mask[3 * 7 + 3], 0);
  assert.equal(s.clipboard.arrays.cells[3 * 7 + 3], 0);
  w.set(at(w, 18, 18), M.Glass);
  assert.equal(pasteRegion(w, s.clipboard, 15, 15, true), 44);
  assert.equal(w.cells[at(w, 18, 18)], M.Glass);
  assert.equal(w.cells[at(w, 15, 15)], M.Wood);
  s.arm();
  s.begin({ x: 18, y: 18 });
  s.end();
  assert.equal(s.mask.count, 44);
  assert.equal(s.mask.data[at(w, 18, 18)], 0);
});
test("erasing tightens selection bounds and disables copying an empty selection", () => {
  const w = new World(30, 30),
    s = new Selection(w);
  s.begin({ x: 3, y: 3 }, "circle", 1);
  s.end();
  s.begin({ x: 20, y: 20 }, "circle", 2);
  s.end();
  s.begin({ x: 3, y: 3 }, "circle", 2, true);
  s.end();
  assert.deepEqual(s.box, { x: 18, y: 18, width: 5, height: 5 });
  s.begin({ x: 20, y: 20 }, "circle", 4, true);
  s.end();
  assert.equal(s.box, null);
  assert.equal(s.mask.count, 0);
  assert.equal(s.copy(), false);
});
test("selection reset keeps clipboard and allocates a fresh mask after importing different dimensions", () => {
  const w = new World(30, 30),
    s = new Selection(w);
  w.set(at(w, 5, 5), M.Water);
  s.begin({ x: 4, y: 4 });
  s.move({ x: 6, y: 6 });
  s.end();
  s.copy();
  const clip = s.clipboard;
  Object.assign(w, new World(50, 20));
  s.clear();
  assert.equal(s.mask.data.length, 1000);
  assert.equal(s.box, null);
  assert.equal(s.clipboard, clip);
  s.begin({ x: 49, y: 19 }, "circle", 3);
  s.end();
  assert.equal(s.mask.data[999], 1);
  assert.equal(s.mask.data[49], 0);
});
test("dragging from an empty selected cell previews and moves full particle state with one undo entry", () => {
  const w = new World(30, 30);
  w.set(at(w, 5, 5), M.Sponge, 83, 42);
  w.storedLiquid[at(w, 5, 5)] = M.Oil;
  w.storedAmount[at(w, 5, 5)] = 19;
  const original = snapshot(w);
  let history = [];
  const s = new Selection(
    w,
    () => {},
    () => history.push(snapshot(w)),
  );
  s.begin({ x: 4, y: 4 });
  s.move({ x: 7, y: 7 });
  s.end();
  s.copy();
  const clipboard = s.clipboard,
    captured = copyRegion(w, s.box, s.mask.data);
  s.begin({ x: 6.5, y: 6.5 }, "circle", 2);
  assert.ok(s.dragging);
  s.move({ x: 14.5, y: 15.5 });
  assert.deepEqual(s.preview, { x: 12, y: 13, width: 4, height: 4 });
  assert.deepEqual(snapshot(w), original);
  assert.equal(history.length, 0);
  s.end();
  assert.equal(history.length, 1);
  assert.deepEqual(history[0], original);
  assert.equal(w.count, 1);
  assert.equal(w.cells[at(w, 5, 5)], 0);
  for (const name of particleStateFields)
    assert.equal(w[name][at(w, 13, 14)], captured.arrays[name][5], name);
  assert.deepEqual(s.box, { x: 12, y: 13, width: 4, height: 4 });
  assert.equal(s.mask.count, 16);
  assert.equal(s.clipboard, clipboard);
  restore(w, history[0]);
  assert.deepEqual(snapshot(w), original);
});
test("overlapping selection moves preserve holes, exclude particles in holes, and keep occupancy accurate", () => {
  const w = new World(30, 30),
    s = new Selection(w);
  for (let x = 3; x <= 9; x++) w.set(at(w, x, 5), M.Wood, 100 + x);
  s.begin({ x: 3, y: 4 });
  s.move({ x: 9, y: 6 });
  s.end();
  s.begin({ x: 6, y: 5 }, "circle", 1, true);
  s.end();
  const count = w.count;
  s.begin({ x: 3, y: 4 });
  s.move({ x: 3, y: 6 });
  s.end();
  assert.equal(w.cells[at(w, 3, 7)], M.Wood);
  assert.equal(w.temp[at(w, 3, 7)], 103);
  assert.equal(w.cells[at(w, 3, 5)], 0);
  assert.equal(w.cells[at(w, 6, 5)], M.Wood);
  assert.equal(w.cells[at(w, 6, 7)], 0);
  assert.equal(s.mask.data[at(w, 6, 7)], 0);
  assert.equal(w.count, count);
  assert.equal(w.count, w.cells.filter(Boolean).length);
  assert.equal(
    w.count,
    w.chunks.reduce((a, b) => a + b, 0),
  );
  // A one-cell shift overlaps the old source and must retain every selected value.
  s.clear();
  w.clear();
  for (let x = 2; x <= 4; x++) w.set(at(w, x, 3), M.Steel, 100 + x);
  s.begin({ x: 2, y: 3 });
  s.move({ x: 4, y: 3 });
  s.end();
  s.begin({ x: 3, y: 3 });
  s.move({ x: 4, y: 3 });
  s.end();
  assert.deepEqual(
    Array.from(w.temp.slice(at(w, 3, 3), at(w, 6, 3))),
    [102, 103, 104],
  );
  assert.equal(w.cells[at(w, 2, 3)], 0);
  assert.equal(w.count, 3);
});
test("moves reject collisions atomically, support explicit replacement, and clamp to boundaries", () => {
  const w = new World(20, 20);
  let blocked = 0,
    mutations = 0;
  const s = new Selection(
    w,
    () => {},
    () => mutations++,
    () => blocked++,
  );
  w.set(at(w, 2, 2), M.Wood);
  w.set(at(w, 3, 2), M.Sponge);
  w.set(at(w, 10, 10), M.Glass);
  s.begin({ x: 2, y: 2 });
  s.move({ x: 3, y: 3 });
  s.end();
  const before = snapshot(w),
    box = { ...s.box };
  s.begin({ x: 2, y: 2 });
  s.move({ x: 10, y: 10 });
  assert.equal(s.moveBlocked, true);
  s.end();
  assert.deepEqual(snapshot(w), before);
  assert.deepEqual(s.box, box);
  assert.equal(blocked, 1);
  assert.equal(mutations, 0);
  s.replace = true;
  s.begin({ x: 2, y: 2 });
  s.move({ x: 10, y: 10 });
  s.end();
  assert.equal(w.cells[at(w, 10, 10)], M.Wood);
  assert.equal(w.count, 2);
  assert.equal(mutations, 1);
  s.begin({ x: 10, y: 10 });
  s.move({ x: 100, y: 100 });
  s.end();
  assert.deepEqual(s.box, { x: 18, y: 18, width: 2, height: 2 });
  assert.equal(w.count, 2);
  assert.equal(w.cells[at(w, 19, 18)], M.Sponge);
});
test("cancel, click without dragging, and deselect keep particles and clipboard unchanged", () => {
  const w = new World(20, 20);
  w.set(at(w, 4, 4), M.Fire, 800, 15);
  let mutations = 0;
  const s = new Selection(
    w,
    () => {},
    () => mutations++,
  );
  s.begin({ x: 3, y: 3 });
  s.move({ x: 5, y: 5 });
  s.end();
  s.copy();
  const clip = s.clipboard,
    before = snapshot(w);
  s.begin({ x: 4, y: 4 });
  s.end();
  assert.equal(mutations, 0);
  s.begin({ x: 3, y: 3 });
  s.move({ x: 10, y: 10 });
  s.cancel();
  assert.deepEqual(s.box, { x: 3, y: 3, width: 3, height: 3 });
  assert.deepEqual(snapshot(w), before);
  s.clear();
  assert.equal(s.box, null);
  assert.equal(s.mask.count, 0);
  assert.equal(s.dragging, null);
  assert.equal(s.clipboard, clip);
  assert.deepEqual(snapshot(w), before);
  assert.equal(mutations, 0);
});
test("erasing or Shift-refining inside an existing selection never starts a move", () => {
  const w = new World(30, 30),
    s = new Selection(w);
  s.begin({ x: 5, y: 5 }, "circle", 3);
  s.end();
  s.begin({ x: 5, y: 5 }, "circle", 1, true);
  assert.equal(s.dragging, null);
  s.end();
  s.begin({ x: 5, y: 7 }, "circle", 4, false, true);
  assert.equal(s.dragging, null);
  s.end();
  assert.equal(s.mask.data[at(w, 5, 5)], 1);
  assert.equal(w.count, 0);
});
test("moving an empty selected area changes only the mask and creates no world undo entry", () => {
  const w = new World(20, 20);
  let mutations = 0;
  const s = new Selection(
    w,
    () => {},
    () => mutations++,
  );
  const before = snapshot(w);
  s.begin({ x: 1, y: 1 });
  s.move({ x: 3, y: 3 });
  s.end();
  s.begin({ x: 2, y: 2 });
  s.move({ x: 10, y: 10 });
  s.end();
  assert.deepEqual(s.box, { x: 9, y: 9, width: 3, height: 3 });
  assert.deepEqual(snapshot(w), before);
  assert.equal(mutations, 0);
});
