import test from "node:test";
import assert from "node:assert/strict";
import { applyTool } from "../src/sim/tools.js";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { react } from "../src/sim/reactions.js";
import { cellProperties } from "../src/inspector.js";
import { resizeLevel } from "../src/level.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
const at = (w, x, y) => y * w.width + x;
const run = (w, n) => {
  for (let k = 0; k < n; k++) w.step();
};

test("specific substance names preserve original save IDs without a generic gas alias", () => {
  for (const [name, id] of [
    ["Steel", 11],
    ["Steel powder", 19],
    ["Hydrochloric acid", 20],
    ["Kerosene", 23],
    ["Methane", 30],
    ["Mica", 33],
  ])
    assert.equal(M[name], id);
  for (const name of [
    "Gas",
    "Metal",
    "Metal dust",
    "Fuel",
    "Acid",
    "Insulator",
  ])
    assert.equal(M[name], undefined);
  assert.equal(materials[M.Hydrogen].combustionGas, M.Steam);
  assert.equal(materials[M.Methane].combustionGas, M["Carbon dioxide"]);
  assert.equal(materials[M.Glass].meltTo, M["Molten glass"]);
});
test("ambient atmosphere is stable; heater and cooler create local air temperature and signed pressure", () => {
  const empty = new World(48, 32);
  run(empty, 100);
  assert.ok(empty.fields.temperature.every((v) => v === 20));
  assert.ok(empty.fields.pressure.every((v) => v === 0));
  for (const id of [M.Heater, M.Cooler]) {
    const w = new World(48, 32);
    w.set(at(w, 12, 16), id);
    run(w, 90);
    const local = w.fields.temperature[w.fields.index(12, 16)],
      far = w.fields.temperature[w.fields.index(47, 0)];
    assert.ok(id === M.Heater ? local > 20.5 : local < 19.5, `${id}: ${local}`);
    assert.ok(Math.abs(far - 20) < Math.abs(local - 20) * 0.1);
    assert.ok(w.fields.pressure.some((v) => (id === M.Heater ? v > 0 : v < 0)));
    const inspected = cellProperties(w, { x: 13, y: 16 });
    assert.equal(inspected.rows[0][1], `${local.toFixed(1)}°C`);
  }
});
test("thin solid walls stop atmospheric fields, openings reconnect them, and void edges vent", () => {
  const wall = new World(40, 32);
  for (let y = 0; y < 32; y++) wall.set(at(wall, 20, y), M.Glass);
  wall.fields.add(8, 16, 30);
  wall.fields.temperature[wall.fields.index(8, 16)] = 300;
  for (let k = 0; k < 80; k++) wall.fields.update(wall);
  for (let fy = 0; fy < wall.fields.height; fy++)
    for (let fx = 6; fx < wall.fields.width; fx++) {
      assert.equal(wall.fields.pressure[fy * wall.fields.width + fx], 0);
      assert.equal(wall.fields.temperature[fy * wall.fields.width + fx], 20);
    }
  wall.set(at(wall, 20, 16), 0);
  wall.fields.add(8, 16, 30);
  for (let k = 0; k < 50; k++) wall.fields.update(wall);
  assert.ok(wall.fields.pressure[wall.fields.index(28, 16)] > 0);
  assert.ok(wall.fields.temperature[wall.fields.index(28, 16)] > 20);
  const sealed = new World(16, 16),
    open = new World(16, 16);
  open.border = "void";
  for (const w of [sealed, open]) {
    w.fields.border = w.border;
    w.fields.temperature.fill(100);
    w.fields.add(0, 0, 30);
    for (let n = 0; n < 30; n++) w.fields.update(w);
  }
  assert.equal(sealed.fields.temperature[0], 100);
  assert.ok(open.fields.temperature[0] < 100);
  assert.ok(open.fields.pressure[0] < sealed.fields.pressure[0]);
});
test("neutralization heats and pressurizes locally, metal acid reactions create hydrogen without erasing inert liquids", () => {
  for (const [acid, target] of [
    ["Vinegar", "Lye"],
    ["Hydrochloric acid", "Steel"],
  ]) {
    const w = new World(24, 24);
    w.random = () => 0;
    w.set(300, M[acid]);
    w.set(301, M[target]);
    react(w, 300, 12, 12);
    assert.ok(w.fields.pressure[w.fields.index(12, 12)] > 0);
    assert.ok(w.temp[300] > 20);
    assert.equal(w.cells[301], target === "Steel" ? M.Hydrogen : M.Brine);
  }
  for (const target of [
    M.Glass,
    M.Water,
    M.Oil,
    M.Kerosene,
    M.Mica,
    M.Copper,
  ]) {
    const w = new World(24, 24);
    w.random = () => 0;
    w.set(300, M["Hydrochloric acid"]);
    w.set(301, target);
    react(w, 300, 12, 12);
    assert.equal(w.cells[301], target);
  }
});
test("baking soda creates energetic but finite foam with CO2 and no fire, in all gravity directions", () => {
  for (const acid of [M.Vinegar, M["Hydrochloric acid"]])
    for (const gravity of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const w = new World(48, 48);
      w.setGravity(...gravity);
      w.set(at(w, 24, 24), acid);
      w.set(at(w, 25, 24), M["Baking soda"]);
      react(w, at(w, 24, 24), 24, 24);
      assert.equal(w.cells[at(w, 25, 24)], M["Carbon dioxide"]);
      assert.equal(w.cells[at(w, 24, 24)], M["Carbon dioxide foam"]);
      assert.ok(w.fields.pressure.some((v) => v >= 4));
      const saved = pack(snapshot(w)),
        loaded = new World();
      restore(loaded, unpack(saved));
      assert.deepEqual(snapshot(loaded), snapshot(w));
      let peak = 0;
      for (let n = 0; n < 200; n++) {
        w.step();
        peak = Math.max(peak, w.count);
        assert.ok(w.count <= 10);
      }
      assert.ok(peak >= 6, `burst only ${peak}`);
      assert.equal(w.cells.includes(M["Carbon dioxide foam"]), false);
      assert.equal(w.cells.includes(M.Fire), false);
      assert.ok(w.cells.includes(M.Water));
      assert.ok(w.cells.filter((v) => v === M["Carbon dioxide"]).length >= 5);
    }
});
test("air temperature survives save, undo-style restore, positioned resizing, and old saves; invalid fields are rejected before mutation", () => {
  const w = new World(32, 32);
  w.fields.temperature[w.fields.index(8, 8)] = 400;
  w.fields.add(8, 8, 9);
  const data = snapshot(w),
    loaded = new World();
  restore(loaded, unpack(pack(data)));
  assert.deepEqual(snapshot(loaded), data);
  const cropped = resizeLevel(
    w,
    {
      name: w.name,
      width: 16,
      height: 16,
      border: w.border,
      background: w.background,
    },
    4,
    4,
  );
  assert.equal(cropped.fields.temperature[cropped.fields.index(4, 4)], 400);
  const before = snapshot(loaded);
  for (const bad of [NaN, -274, 6001]) {
    const invalid = structuredClone(data);
    invalid.atmosphere.temperature[0] = bad;
    assert.throws(() => restore(loaded, invalid));
    assert.deepEqual(snapshot(loaded), before);
  }
  delete data.atmosphere;
  restore(loaded, data);
  assert.ok(loaded.fields.temperature.every((v) => v === 20));
});

test("Warm and Cool act on empty air as well as particles, causing signed pressure", () => {
  const w = new World(32, 32);
  applyTool(w, "warm", 8, 8, 1);
  assert.equal(w.fields.temperature[w.fields.index(8, 8)], 32);
  assert.ok(w.fields.pressure[w.fields.index(8, 8)] > 0);
  applyTool(w, "cool", 8, 8, 1, "circle", 1, 0, 2);
  assert.equal(w.fields.temperature[w.fields.index(8, 8)], 8);
  assert.ok(w.fields.pressure[w.fields.index(8, 8)] < 0);
});

test("room-temperature oxygen and CO2 are heavier than ambient air, while methane and hydrogen rise", () => {
  for (const id of [M.Oxygen, M["Carbon dioxide"], M.Methane, M.Hydrogen]) {
    const w = new World(24, 24);
    w.set(12 * 24 + 12, id);
    w.move(12 * 24 + 12, 12, 12);
    assert.equal(
      w.cells[(12 + (materials[id].density > 0 ? 1 : -1)) * 24 + 12],
      id,
    );
  }
});
