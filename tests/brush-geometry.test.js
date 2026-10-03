import test from "node:test";
import assert from "node:assert/strict";
import { brushRadius, brushFootprint } from "../src/brush-geometry.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { paintBrush } from "../src/sim/paint.js";
import { applyTool, moveBrush } from "../src/sim/tools.js";
import { SelectionMask } from "../src/selection-mask.js";

function bounds(w, array = w.cells) {
  let minX = w.width,
    minY = w.height,
    maxX = -1,
    maxY = -1,
    count = 0;
  for (let i = 0; i < array.length; i++)
    if (array[i]) {
      const x = i % w.width,
        y = Math.floor(i / w.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      count++;
    }
  return { width: maxX - minX + 1, height: maxY - minY + 1, count };
}
test("every circle and square size has exactly the requested pixel diameter", () => {
  const w = new World(96, 96);
  for (let size = 1; size <= 61; size++)
    for (const shape of ["circle", "square"]) {
      w.clear();
      const radius = brushRadius(size),
        footprint = brushFootprint(radius);
      w.brush(48, 48, radius, M.Wall, shape);
      const box = bounds(w);
      assert.equal(box.width, size, `${shape} ${size}`);
      assert.equal(box.height, size, `${shape} ${size}`);
      if (shape === "square") assert.equal(box.count, size * size);
      for (let y = footprint.low; y <= footprint.high; y++)
        for (let x = footprint.low; x <= footprint.high; x++) {
          const mirrored = footprint.low + footprint.high - x;
          assert.equal(
            w.cells[(48 + y) * w.width + 48 + x],
            w.cells[(48 + y) * w.width + 48 + mirrored],
          );
        }
    }
});
test("Color, selection and temperature tools share odd and even Draw footprints", () => {
  const w = new World(24, 24),
    mask = new SelectionMask(w);
  for (const size of [1, 2, 3, 4, 8, 13]) {
    w.clear();
    mask.clear();
    const radius = brushRadius(size);
    w.brush(12, 12, radius, M.Sand);
    const occupied = Uint8Array.from(w.cells, Number);
    paintBrush(w, 12, 12, radius, "circle", "background", 0xabcdef, 1);
    mask.stroke({ x: 12.5, y: 12.5 }, { x: 12.5, y: 12.5 }, radius);
    assert.deepEqual(
      Uint8Array.from(w.backgroundPaint, (v) => Number(!!v)),
      Uint8Array.from(occupied, (v) => Number(!!v)),
    );
    assert.deepEqual(
      mask.data,
      Uint8Array.from(occupied, (v) => Number(!!v)),
    );
    applyTool(w, "warm", 12, 12, radius);
    for (let i = 0; i < w.length; i++)
      if (occupied[i]) assert.equal(w.temp[i], 32);
    w.brush(12, 12, radius, 0);
    assert.equal(w.count, 0);
  }
});
test("even Grab footprints move packed pixels once, and stamps clip cleanly at edges", () => {
  const w = new World(24, 24);
  w.brush(10, 10, brushRadius(4), M.Sand, "square");
  moveBrush(w, 10, 10, brushRadius(4), "square", 1, 0);
  assert.equal(w.count, 16);
  assert.deepEqual(bounds(w), { width: 4, height: 4, count: 16 });
  assert.equal(w.cells[9 * 24 + 9], 0);
  assert.equal(w.cells[9 * 24 + 13], M.Sand);
  w.clear();
  w.brush(0, 0, brushRadius(4), M.Wall, "square");
  assert.deepEqual(bounds(w), { width: 3, height: 3, count: 9 });
  assert.equal(
    w.chunks.reduce((a, b) => a + b, 0),
    9,
  );
});
