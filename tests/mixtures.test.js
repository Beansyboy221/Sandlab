import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { paletteMaterials } from "../src/sim/material-families.js";
import { react } from "../src/sim/reactions.js";
import { absorb } from "../src/sim/absorption.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import {
  effectiveDensity,
  effectiveViscosity,
  freezingPoint,
  diffuseDissolved,
} from "../src/sim/mixtures.js";
function ingredients(w, id) {
  let n = 0;
  for (let i = 0; i < w.length; i++)
    n +=
      Number(w.cells[i] === id) +
      (w.dissolvedId[i] === id ? w.dissolvedAmount[i] : 0);
  return n;
}
test("mixtures leave the palette and legacy worlds migrate to separate preserved components", () => {
  for (const name of ["Brine", "Soapy Water", "Mud", "Wet Clay"])
    assert.ok(!paletteMaterials.some((m) => m.name === name));
  const w = new World(24, 24);
  const old = snapshot(w);
  for (const [i, name] of [
    [100, "Brine"],
    [101, "Soapy Water"],
    [102, "Mud"],
    [103, "Wet Clay"],
  ])
    old.arrays.cells[i] = M[name];
  delete old.arrays.dissolvedId;
  delete old.arrays.dissolvedAmount;
  restore(w, old);
  assert.deepEqual(
    [w.cells[100], w.cells[101], w.cells[102], w.cells[103]],
    [M.Water, M.Water, M.Dirt, M.Clay],
  );
  assert.deepEqual([w.dissolvedId[100], w.dissolvedId[101]], [M.Salt, M.Soap]);
  assert.equal(w.storedAmount[102], 2);
  assert.equal(w.storedAmount[103], 1);
});
test("drawing and contact dissolve bounded ingredients while density, viscosity and freezing respond", () => {
  const w = new World(24, 24),
    i = 200;
  w.set(i, M.Water);
  w.set(i + 1, M.Salt);
  react(w, i + 1, 9, 8);
  assert.equal(w.cells[i], M.Water);
  assert.equal(ingredients(w, M.Salt), 1);
  assert.ok(effectiveDensity(w, i) > materials[M.Water].density);
  assert.ok(freezingPoint(w, i) < 0);
  w.brush(8, 8, 0, M.Soap); // Different additives cannot overwrite the first ingredient.
  assert.equal(w.dissolvedId[i], M.Salt);
  const j = 240;
  w.set(j, M.Water);
  w.brush(0, 10, 0, M.Soap);
  assert.equal(w.cells[j], M.Water);
  assert.equal(w.dissolvedId[j], M.Soap);
  assert.ok(effectiveViscosity(w, j) > 1);
  for (let n = 0; n < 8; n++) w.brush(0, 10, 0, M.Soap);
  assert.equal(w.dissolvedAmount[j], 4);
});
test("wicking and draining carry ingredients without producing combined material IDs", () => {
  const w = new World(24, 24);
  w.random = () => 0;
  const i = 200;
  w.set(i, M.Sponge);
  w.set(i + 1, M.Brine);
  w.set(i + w.width, M.Wall);
  w.tick = 1;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[i], 1);
  assert.equal(ingredients(w, M.Salt), 1);
  w.cooldown[i] = 4;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[i], 0);
  assert.equal(ingredients(w, M.Salt), 1);
  assert.ok(!w.cells.includes(M.Brine));
  assert.ok(!w.storedLiquid.includes(M.Brine));
  const copy = new World();
  restore(copy, unpack(pack(snapshot(w))));
  assert.deepEqual(snapshot(copy), snapshot(w));
});
test("evaporation separates additives and freezing retains them; sealed solutions conserve contents", () => {
  const w = new World(24, 24),
    i = 200;
  w.set(i, M.Brine, 130);
  react(w, i, 8, 8);
  assert.equal(ingredients(w, M.Salt), 1);
  assert.equal(w.cells[i], M.Steam);
  w.clear();
  w.set(i, M.Brine, -2);
  react(w, i, 8, 8);
  assert.equal(w.cells[i], M.Water);
  w.temp[i] = -30;
  react(w, i, 8, 8);
  assert.equal(w.cells[i], M.Ice);
  assert.equal(w.dissolvedId[i], M.Salt);
  w.temp[i] = 20;
  react(w, i, 8, 8);
  assert.equal(w.cells[i], M.Water);
  assert.equal(ingredients(w, M.Salt), 1);
  w.set(i, M.Brine, 130);
  for (const j of [i - 1, i + 1, i - 24, i + 24]) w.set(j, M.Wall);
  react(w, i, 8, 8);
  assert.equal(w.cells[i], M.Water);
  assert.equal(w.dissolvedAmount[i], 1);
});
test("local diffusion conserves solute, and malicious ingredient data cannot replace a world", () => {
  const w = new World(24, 24);
  w.set(200, M.Water);
  w.set(201, M.Water);
  w.dissolvedId[200] = M.Salt;
  w.dissolvedAmount[200] = 4;
  w.variant[200] = 1;
  w.tick = 4;
  for (let tick = 0; tick < 100; tick++) {
    w.tick = tick;
    diffuseDissolved(w, 200, 8, 8);
  }
  assert.equal(ingredients(w, M.Salt), 4);
  assert.ok(w.dissolvedAmount[201] > 0);
  const valid = snapshot(w),
    bad = snapshot(w);
  bad.arrays.dissolvedId[200] = M.Wall;
  assert.throws(() => restore(w, bad));
  assert.deepEqual(snapshot(w), valid);
});
test("physical density is positive for gases and buoyancy is separate; clay outweighs jelly", () => {
  for (const m of materials.filter(
    (m) => m.category === "gas" && !m.deprecated,
  ))
    assert.ok(m.density > 0, m.name);
  assert.ok(materials[M.Clay].density > materials[M.Jelly].density);
  assert.ok(materials[M.Hydrogen].density < materials[M.Oxygen].density);
  assert.equal(materials[M.Mirror].density, materials[M.Glass].density);
});
test("moving matter creates bounded airflow and pressure without leaking through walls or disabled mechanics", () => {
  const w = new World(64, 64),
    f = w.fields,
    a = f.airflow;
  f.rebuildBarriers(w);
  w.set(20 * 64 + 20, M.Sand);
  w.tryMove(20 * 64 + 20, 20, 21, 1);
  assert.ok(a.velocityY.some((v) => v > 0));
  f.update(w);
  assert.ok(f.pressure.some((v) => Math.abs(v) > 0));
  a.clear();
  for (let n = 0; n < 10000; n++)
    a.displace(w, 20, 20, 3, 0, materials[M.Steel]);
  assert.ok(Math.max(...a.velocityX) <= 0.251);
  for (let y = 0; y < 64; y++) w.set(y * 64 + 24, M.Wall);
  f.rebuildBarriers(w);
  a.clear();
  a.displace(w, 23, 20, 3, 0, materials[M.Steel]);
  assert.equal(a.velocityX[f.index(23, 20)], 0);
  f.configure({ pressureSimulation: false });
  a.displace(w, 20, 20, 2, 2, materials[M.Water]);
  assert.ok(a.velocityX.every((v) => v === 0));
});

test("solid and elastic motion displace air, whereas unmoving bodies do not invent wind", () => {
  for (const material of [M.Steel, M.Jelly]) {
    const w = new World(64, 80);
    for (let y = 12; y < 16; y++)
      for (let x = 24; x < 29; x++) w.set(y * 64 + x, material);
    for (let t = 0; t < 8; t++) w.step();
    assert.ok(
      w.fields.airflow.velocityY.some((v) => v > 0),
      materials[material].name,
    );
    const copy = new World();
    restore(copy, snapshot(w));
    for (let t = 0; t < 4; t++) {
      w.step();
      copy.step();
    }
    assert.deepEqual(snapshot(copy), snapshot(w));
  }
  const w = new World(32, 32);
  w.set(31 * 32 + 16, M.Wall);
  for (let t = 0; t < 10; t++) w.step();
  assert.ok(w.fields.airflow.velocityY.every((v) => v === 0));
});
