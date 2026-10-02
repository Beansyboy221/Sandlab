import test from "node:test";
import assert from "node:assert/strict";
import { draggedCanvasSize } from "../src/canvas-resize-handles.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { resizeLevel } from "../src/level.js";
test("each edge and corner anchors the opposite sides and rounds to whole cells", () => {
  for (const [direction, dx, dy, width, height, x, y] of [
    ["e", 20, 40, 120, 80, 0, 0],
    ["w", 20, 40, 80, 80, 20, 0],
    ["n", 20, 10, 100, 70, 0, 10],
    ["s", 20, 10, 100, 90, 0, 0],
    ["nw", -20, -10, 120, 90, -20, -10],
    ["ne", 20, 10, 120, 70, 0, 10],
    ["sw", 20, 10, 80, 90, 20, 0],
    ["se", 20, 10, 120, 90, 0, 0],
  ])
    assert.deepEqual(draggedCanvasSize(100, 80, direction, dx, dy), {
      width,
      height,
      x,
      y,
    });
  assert.equal(draggedCanvasSize(100, 80, "e", 1.4, 0).width, 101);
});
test("desktop dragging observes dimension and area limits and can preserve aspect ratio", () => {
  for (const d of ["e", "w", "s", "n", "ne", "nw", "se", "sw"]) {
    const r = draggedCanvasSize(400, 400, d, 10000, 10000);
    assert.ok(
      r.width >= 8 &&
        r.height >= 8 &&
        r.width <= 512 &&
        r.height <= 512 &&
        r.width * r.height <= 200000,
    );
  }
  assert.deepEqual(draggedCanvasSize(100, 50, "se", 40, 5, true), {
    width: 140,
    height: 70,
    x: 0,
    y: 0,
  });
});
test("left/top handle changes crop or expand the chosen edges and preserve elastic particle state", () => {
  const w = new World(32, 32);
  w.set(10 * 32 + 10, M.Rope);
  w.set(10 * 32 + 11, M.Rope);
  w.set(2 * 32 + 2, M.Stone);
  const r = draggedCanvasSize(32, 32, "nw", 5, 4),
    cropped = resizeLevel(
      w,
      { name: w.name, border: w.border, background: w.background, ...r },
      r.x,
      r.y,
    );
  assert.equal(cropped.count, 2);
  assert.equal(cropped.cells[6 * 27 + 5], M.Rope);
  assert.equal(cropped.elastic.locations.size, 2);
  const e = draggedCanvasSize(32, 32, "nw", -5, -4),
    expanded = resizeLevel(
      w,
      { name: w.name, border: w.border, background: w.background, ...e },
      e.x,
      e.y,
    );
  assert.equal(expanded.count, 3);
  assert.equal(expanded.cells[14 * 37 + 15], M.Rope);
  assert.equal(expanded.elastic.locations.size, 2);
});
