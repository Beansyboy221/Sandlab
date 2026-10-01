import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { react } from "../src/sim/reactions.js";
import { reactContact } from "../src/sim/chemistry.js";
import { strike } from "../src/sim/weather.js";
import { particleStateFields } from "../src/sim/particle-state.js";
import { createLevel, resizeLevel, ResizePlacement } from "../src/level.js";
import {
  applyLevelMetadata,
  defaultLevel,
  levelProperties,
} from "../src/level-properties.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { EditHistory } from "../src/history.js";

const properties = (width = 32, height = 24, border = "solid") => ({
  width,
  height,
  name: "Test canvas",
  border,
  background: "#204060",
});
const configured = (border) => createLevel(properties(32, 24, border));

test("canvas properties reject invalid dimensions and unsafe metadata before changing a world", () => {
  const w = configured("looping");
  w.set(77, M.Sand);
  const before = snapshot(w);
  for (const invalid of [
    { width: 0 },
    { height: 513 },
    { width: 512, height: 512 },
    { width: 8.5 },
    { name: " " },
    { name: "a".repeat(121) },
    { border: "invalid" },
    { background: "url(https://example.test)" },
    { background: "#123" },
  ]) {
    const data = { ...properties(), ...invalid };
    assert.throws(() => createLevel(data));
    assert.throws(() => resizeLevel(w, data, 0, 0));
  }
  for (const level of [
    null,
    [],
    { ...before.level, border: "bad" },
    { ...before.level, background: "<script>" },
  ]) {
    assert.throws(() => restore(w, { ...before, level }));
    assert.throws(() => unpack({ ...pack(before), level }));
    assert.deepEqual(snapshot(w), before);
  }
});

test("solid contains, void drains, and looping transports powder, gas, and their state", () => {
  for (const border of ["solid", "void", "looping"]) {
    const w = configured(border),
      bottom = 23 * 32 + 10;
    w.set(bottom, M.Sand, 44);
    w.nutrition[bottom] = 7;
    w.move(bottom, 10, 23);
    if (border === "solid") assert.equal(w.cells[bottom], M.Sand);
    if (border === "void") assert.equal(w.count, 0);
    if (border === "looping") {
      assert.equal(w.cells[10], M.Sand);
      assert.equal(w.nutrition[10], 7);
      assert.equal(w.temp[10], 44);
    }
    w.clear();
    w.set(10, M.Hydrogen, 20, 500);
    w.move(10, 10, 0);
    if (border === "solid") assert.equal(w.count, 1);
    if (border === "void") assert.equal(w.count, 0);
    if (border === "looping") assert.equal(w.cells[bottom], M.Hydrogen);
    assert.equal(
      w.chunks.reduce((a, b) => a + b, 0),
      w.count,
    );
  }
});

test("looping seams connect heat, electricity, contact chemistry, pressure, and sleeping chunks", () => {
  const w = configured("looping"),
    left = 10 * 32,
    right = left + 31;
  w.set(left, M.Metal, 500);
  w.set(right, M.Metal, 20);
  w.tick = 1;
  w.charge[left] = 6;
  react(w, left, 0, 10);
  assert.equal(w.charge[right], 6);
  w.transferHeat(left, w.index(-1, 10));
  assert.ok(w.temp[right] > 20);
  w.clear();
  w.set(left, M.Water);
  w.set(right, M.Salt);
  assert.equal(reactContact(w, left, 0, 10), true);
  assert.equal(w.cells[left], M.Brine);
  assert.equal(w.cells[right], 0);
  w.fields.clear();
  w.fields.add(0, 12, 8);
  w.fields.update();
  assert.ok(w.fields.pressure[w.fields.index(31, 12)] > 0);
  w.tick = 10;
  w.motionStamp.fill(0);
  w.wakeStamp.fill(0);
  w.set(0, M.Sand);
  assert.equal(w.motionStamp[w.chunk(31)], 11);
  assert.equal(w.motionStamp[w.chunk(23 * 32)], 11);
  const solid = configured("solid"),
    open = configured("void");
  solid.fields.add(0, 0, 8);
  open.fields.add(0, 0, 8);
  solid.fields.update();
  open.fields.update();
  assert.ok(solid.fields.pressure[0] > open.fields.pressure[0]);
});

test("wrapped lightning and explosions remain bounded on small grids", () => {
  const w = createLevel(properties(8, 8, "looping"));
  strike(w, 7, 7);
  assert.ok(w.count >= 8 && w.count <= 16);
  assert.ok(w.cells.slice(0, 8).some((id) => id === M.Lightning));
  w.clear();
  w.explode(0, 0, 20);
  assert.equal(w.count, 64);
  assert.equal(w.chunks[0], 64);
  for (let n = 0; n < 50; n++) w.step();
  assert.equal(
    w.chunks.reduce((a, b) => a + b, 0),
    w.count,
  );
});

test("shrinking crops the chosen rectangle and preserves every particle property", () => {
  const w = configured("solid");
  w.tick = 40;
  w.set(8 * 32 + 12, M.Sponge, 87);
  w.storedLiquid[8 * 32 + 12] = M.Brine;
  w.storedAmount[8 * 32 + 12] = 12;
  w.life[8 * 32 + 12] = 56;
  w.nutrition[8 * 32 + 12] = 20;
  w.set(1, M.Stone);
  w.fields.add(12, 8, 9);
  const before = snapshot(w),
    resized = resizeLevel(w, properties(16, 16, "looping"), 8, 4),
    target = 4 * 16 + 4;
  assert.equal(resized.count, 1);
  assert.equal(resized.cells[target], M.Sponge);
  for (const key of particleStateFields)
    assert.equal(resized[key][target], w[key][8 * 32 + 12], key);
  assert.equal(resized.fields.pressure[resized.fields.index(4, 4)], 9);
  assert.equal(resized.seed, w.seed);
  assert.equal(resized.tick, 40);
  assert.equal(resized.fields.border, "looping");
  assert.deepEqual(snapshot(w), before);
  assert.throws(() => resizeLevel(w, properties(16, 16), 17, 0));
});

test("expansion and mixed-axis resizing place the original cells without scaling them", () => {
  const w = configured("solid");
  w.set(5 * 32 + 7, M.Stone);
  w.temp[0] = 42;
  const expanded = resizeLevel(w, properties(48, 40), -9, -6);
  assert.equal(expanded.cells[11 * 48 + 16], M.Stone);
  assert.equal(expanded.temp[6 * 48 + 9], 42);
  assert.equal(expanded.temp[0], 20);
  const mixed = resizeLevel(w, properties(16, 40), 4, -7);
  assert.equal(mixed.cells[12 * 16 + 3], M.Stone);
  assert.equal(mixed.count, 1);
  assert.throws(() => resizeLevel(w, properties(48, 40), 1, 0));
  const placement = new ResizePlacement(w, properties(16, 40));
  placement.setPosition(4, 7);
  assert.deepEqual([placement.x, placement.y], [4, -7]);
  assert.deepEqual(placement.oldBox, { x: 0, y: 7, width: 32, height: 24 });
  assert.deepEqual(placement.newBox, { x: 4, y: 0, width: 16, height: 40 });
  placement.setPosition(-5, 999);
  assert.deepEqual([placement.x, placement.y], [0, -16]);
});

test("properties, dimensions, and particles round-trip through files, legacy saves, undo and redo", () => {
  const w = configured("looping"),
    history = new EditHistory(w);
  w.set(100, M.Sand);
  const before = snapshot(w);
  history.remember(w.name);
  Object.assign(
    w,
    resizeLevel(
      w,
      {
        ...properties(48, 40, "void"),
        name: "Expanded",
        background: "#abcdef",
      },
      -3,
      -2,
    ),
  );
  const after = snapshot(w),
    loaded = new World();
  restore(loaded, unpack(pack(after)));
  assert.deepEqual(snapshot(loaded), after);
  history.undo(w.name);
  assert.deepEqual(snapshot(w), before);
  history.redo(w.name);
  assert.deepEqual(snapshot(w), after);
  const legacy = { ...after };
  delete legacy.level;
  restore(w, legacy);
  assert.deepEqual(levelProperties(w), {
    ...defaultLevel,
    width: 48,
    height: 40,
  });
  applyLevelMetadata(w, { ...defaultLevel, name: "  Renamed  " });
  assert.equal(w.name, "Renamed");
});
