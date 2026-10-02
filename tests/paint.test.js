import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import {
  paintBrush,
  beginColorStroke,
  rgba,
  compositePaint,
} from "../src/sim/paint.js";
import {
  snapshot,
  pack,
  unpack,
  restore,
  validateSnapshot,
} from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection-region.js";
import { resizeLevel } from "../src/level.js";
import { EditHistory } from "../src/history.js";
import { hsvToRgb, rgbToHsv, parseHex, rgbToHex } from "../src/color.js";
const properties = (w, width = w.width, height = w.height) => ({
  name: w.name,
  border: w.border,
  background: w.background,
  width,
  height,
});
test("foreground recolors only occupied cells without changing physics", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10;
  w.set(i, M.Sand, 35, 120);
  const before = snapshot(w);
  beginColorStroke(w);
  paintBrush(w, 10, 10, 3, "circle", "foreground", 0xff0033, 1);
  assert.equal(w.count, 1);
  assert.equal(w.pigment[i], rgba(0xff0033));
  assert.equal(w.pigment.filter(Boolean).length, 1);
  for (const key of Object.keys(before.arrays).filter((k) => k !== "pigment"))
    assert.deepEqual([...w[key]], before.arrays[key]);
  w.step();
  const moved = w.cells.indexOf(M.Sand);
  assert.notEqual(moved, i);
  assert.equal(w.pigment[moved], rgba(0xff0033));
  assert.equal(w.pigment[i], 0);
  w.set(moved, 0);
  w.set(moved, M.Water);
  assert.equal(w.pigment[moved], 0);
});
test("background stays at fixed coordinates under moving particles", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10;
  w.set(i, M.Sand);
  beginColorStroke(w);
  paintBrush(w, 10, 10, 2, "square", "background", 0x4422ee, 0.5);
  assert.equal(w.backgroundPaint.filter(Boolean).length, 25);
  const layer = w.backgroundPaint.slice();
  for (let n = 0; n < 40; n++) w.step();
  assert.deepEqual(w.backgroundPaint, layer);
  assert.equal(w.count, 1);
  assert.equal(w.backgroundPaint[i], rgba(0x4422ee, 0.5));
});
test("opacity is applied once per stroke, and moves with foreground identity", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10;
  w.set(i, M.Stone);
  beginColorStroke(w);
  for (let n = 0; n < 10; n++)
    paintBrush(w, 10, 10, 2, "circle", "foreground", 0xff0000, 0.5);
  assert.equal(w.pigment[i], rgba(0xff0000, 0.5));
  w.swap(i, i + 32);
  paintBrush(w, 10, 11, 2, "circle", "foreground", 0xff0000, 0.5);
  assert.equal(w.pigment[i + 32], rgba(0xff0000, 0.5));
  beginColorStroke(w);
  paintBrush(w, 10, 11, 2, "circle", "foreground", 0xff0000, 0.5);
  assert.equal(w.pigment[i + 32] >>> 24, 192);
  assert.equal(
    compositePaint(rgba(0xff0000, 0.5), rgba(0x0000ff, 0.5)),
    rgba(0x5500aa, 192 / 255),
  );
});
test("paint removal restores materials and background without deleting objects", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10;
  w.set(i, M.Rubber);
  const id = w.elasticId[i];
  beginColorStroke(w);
  paintBrush(w, 10, 10, 1, "circle", "foreground", 0, 1);
  paintBrush(w, 10, 10, 1, "circle", "background", 0, 1);
  assert.equal(w.pigment[i], 0xff000000);
  beginColorStroke(w);
  paintBrush(w, 10, 10, 1, "circle", "foreground", 0, 1, true);
  paintBrush(w, 10, 10, 1, "circle", "background", 0, 1, true);
  assert.equal(w.pigment[i], 0);
  assert.equal(w.backgroundPaint[i], 0);
  assert.equal(w.elasticId[i], id);
  assert.equal(w.cells[i], M.Rubber);
});
test("both layers survive saves, history, export, resizing, and old saves", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10;
  w.set(i, M.Stone);
  const history = new EditHistory(w);
  history.remember(w.name);
  beginColorStroke(w);
  paintBrush(w, 10, 10, 1, "square", "foreground", 0x10ffee, 0.7);
  paintBrush(w, 10, 10, 1, "square", "background", 0x33aa10, 0.4);
  const painted = snapshot(w);
  const loaded = new World();
  restore(loaded, unpack(pack(painted)));
  assert.deepEqual(snapshot(loaded), painted);
  history.undo(w.name);
  assert.equal(w.pigment[i], 0);
  assert.equal(w.backgroundPaint[i], 0);
  history.redo(w.name);
  assert.deepEqual(snapshot(w), painted);
  const resized = resizeLevel(w, properties(w, 24, 24), 5, 6);
  assert.equal(resized.pigment[4 * 24 + 5], w.pigment[i]);
  assert.equal(resized.backgroundPaint[4 * 24 + 5], w.backgroundPaint[i]);
  const expanded = resizeLevel(w, properties(w, 40, 40), -3, -4);
  assert.equal(expanded.pigment[14 * 40 + 13], w.pigment[i]);
  assert.equal(expanded.backgroundPaint[14 * 40 + 13], w.backgroundPaint[i]);
  assert.equal(expanded.backgroundPaint[0], 0);
  const legacy = snapshot(w);
  delete legacy.arrays.pigment;
  delete legacy.arrays.backgroundPaint;
  restore(loaded, legacy);
  assert.equal(loaded.pigment.some(Boolean), false);
  assert.equal(loaded.backgroundPaint.some(Boolean), false);
  const compressed = pack(painted);
  delete compressed.arrays.pigment;
  delete compressed.arrays.backgroundPaint;
  restore(loaded, unpack(compressed));
  assert.equal(loaded.pigment.some(Boolean), false);
});
test("clipboard copies coating with particles and leaves background in place", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10;
  w.set(i, M.Jelly);
  beginColorStroke(w);
  paintBrush(w, 10, 10, 1, "square", "foreground", 0xccff00, 1);
  paintBrush(w, 10, 10, 1, "square", "background", 0xff00cc, 1);
  const clip = copyRegion(w, { x: 10, y: 10, width: 1, height: 1 });
  pasteRegion(w, clip, 20, 20);
  assert.equal(w.pigment[20 * 32 + 20], w.pigment[i]);
  assert.equal(w.backgroundPaint[20 * 32 + 20], 0);
  assert.notEqual(w.elasticId[20 * 32 + 20], w.elasticId[i]);
});
test("malformed paint payloads are rejected before replacing a world", () => {
  for (const key of ["pigment", "backgroundPaint"])
    for (const value of [-1, 4294967296, 1.1, NaN, "red"]) {
      const data = snapshot(new World(8, 8));
      data.arrays[key][0] = value;
      assert.throws(() => validateSnapshot(data));
    }
  const emptyCoat = snapshot(new World(8, 8));
  emptyCoat.arrays.pigment[0] = rgba(0xff0000);
  assert.throws(() => validateSnapshot(emptyCoat));
  const w = new World(8, 8);
  assert.doesNotThrow(() =>
    paintBrush(w, NaN, 1, 1, "circle", "foreground", 0, 1),
  );
  assert.equal(w.count, 0);
});
test("RGB, hex and HSV conversions match primary colors and roundtrip", () => {
  assert.deepEqual(parseHex("#f0a"), [255, 0, 170]);
  assert.equal(parseHex("xyz"), null);
  assert.equal(parseHex("#1234567"), null);
  assert.deepEqual(hsvToRgb(120, 1, 1), [0, 255, 0]);
  assert.deepEqual(hsvToRgb(240, 1, 1), [0, 0, 255]);
  assert.equal(rgbToHex([18, 52, 86]), "#123456");
  for (const rgb of [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [18, 52, 86],
    [132, 7, 220],
  ])
    assert.deepEqual(hsvToRgb(...rgbToHsv(...rgb)), rgb);
});
