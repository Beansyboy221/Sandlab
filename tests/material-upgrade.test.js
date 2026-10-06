import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials, categoryLabels } from "../src/sim/materials.js";
import {
  paletteMaterials,
  paletteEntities,
} from "../src/sim/material-families.js";
import { react } from "../src/sim/reactions.js";
import { growMicrobe } from "../src/sim/microbiology.js";
import { fractureLimits } from "../src/sim/body-stress.js";
import { conducts } from "../src/sim/oxidation.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection.js";
const at = (w, x, y) => y * w.width + x;
const run = (w, n) => {
  for (let k = 0; k < n; k++) w.step();
};

test("Crystal, Flora and sources are available in their intended catalogs", () => {
  assert.equal(M.Crystal, 133);
  assert.equal(M.Prism, M.Crystal);
  assert.equal(categoryLabels.life, "Flora");
  for (const name of [
    "Fungus",
    "Virus",
    "Heater",
    "Cooler",
    "Clone",
    "Void",
    "Lamp",
    "Fan",
    "Black Hole",
    "Repulsor",
  ])
    assert.ok(paletteMaterials.includes(materials[M[name]]), name);
  for (const m of paletteEntities)
    assert.ok(m.actor || m.projectile || m.circuit || m.photoelectric, m.name);
  assert.ok(
    !paletteMaterials.some((m) => ["Patina", "Wire", "Prism"].includes(m.name)),
  );
});
test("oxide levels migrate, move, copy, save and reset independently of pigment", () => {
  const w = new World(32, 32),
    i = at(w, 10, 10);
  w.set(i, M.Copper);
  w.oxidationLevel[i] = 241;
  w.pigment[i] = 0xff112233;
  w.swap(i, i + 1);
  assert.equal(w.oxidationLevel[i], 0);
  assert.equal(w.oxidationLevel[i + 1], 241);
  const clip = copyRegion(w, { x: 11, y: 10, width: 1, height: 1 });
  pasteRegion(w, clip, 20, 20);
  assert.equal(w.oxidationLevel[at(w, 20, 20)], 241);
  assert.ok(!conducts(w, i + 1));
  const data = snapshot(w),
    old = structuredClone(data);
  old.arrays.cells[i + 1] = 54;
  old.arrays.cells[at(w, 20, 20)] = 107;
  delete old.arrays.oxidationLevel;
  const loaded = new World();
  const packedOld = pack(data);
  packedOld.arrays.cells = pack({
    ...data,
    arrays: { ...data.arrays, cells: old.arrays.cells },
  }).arrays.cells;
  delete packedOld.arrays.oxidationLevel;
  restore(loaded, unpack(packedOld));
  assert.equal(loaded.cells[i + 1], M.Copper);
  assert.equal(loaded.oxidationLevel[i + 1], 255);
  assert.equal(loaded.cells[at(w, 20, 20)], M.Copper);
  assert.equal(loaded.oxidationLevel[at(w, 20, 20)], 0);
  restore(loaded, unpack(pack(data)));
  assert.deepEqual(snapshot(loaded), data);
  loaded.set(i + 1, M.Copper);
  assert.equal(loaded.oxidationLevel[i + 1], 0);
});
test("oxidized coatings block electrical propagation and battery input until cleaned", () => {
  const w = new World(32, 32),
    i = at(w, 10, 10);
  w.set(i, M.Copper);
  w.set(i + 1, M.Copper);
  w.oxidationLevel[i + 1] = 255;
  w.charge[i] = 6;
  w.tick = 1;
  react(w, i, 10, 10);
  assert.equal(w.charge[i + 1], 0);
  w.circuits.energize(i + 1);
  assert.equal(w.charge[i + 1], 0);
  w.oxidationLevel[i + 1] = 0;
  w.circuits.energize(i + 1);
  assert.equal(w.charge[i + 1], 6);
});
test("Fungus decomposes moist organic substrates but cannot grow on dry rock or in heat", () => {
  const w = new World(32, 32),
    i = at(w, 10, 10);
  w.set(i, M.Fungus);
  w.set(i + 1, M.Wood);
  w.tick = 6;
  growMicrobe(w, i, 10, 10, materials[M.Fungus]);
  assert.equal(w.cells[i + 1], M.Wood);
  w.moisture[i] = 80;
  growMicrobe(w, i, 10, 10, materials[M.Fungus]);
  assert.equal(w.cells[i + 1], M.Fungus);
  assert.equal(w.count, 2);
  assert.equal(w.moisture[i] + w.moisture[i + 1], 76);
  w.set(i - 1, M.Stone);
  growMicrobe(w, i, 10, 10, materials[M.Fungus]);
  assert.equal(w.cells[i - 1], M.Stone);
  w.temp[i] = 65;
  growMicrobe(w, i, 10, 10, materials[M.Fungus]);
  assert.equal(w.cells[i], M.Dirt);
});
test("Fungus tissue falls, roots in soil and burns through the shared fuel rules", () => {
  const w = new World(32, 64),
    i = at(w, 12, 10);
  w.set(i, M.Fungus);
  assert.ok(materials[M.Fungus].rigid);
  run(w, 8);
  assert.ok(
    [...w.rigid.locations.values()].every((k) => Math.floor(k / w.width) > 10),
  );
  w.clear();
  w.set(i, M.Fungus, 300);
  w.random = () => 0;
  react(w, i, 12, 10);
  assert.ok(w.life[i] > 0);
  assert.ok(w.cells.includes(M.Fire));
});
test("Virus needs living hosts, incubates, consumes tissue, expires and cannot replicate in metal", () => {
  const w = new World(32, 32),
    i = at(w, 10, 10);
  w.set(i, M.Virus);
  w.set(i + 1, M.Plant);
  w.set(i - 1, M.Steel);
  w.tick = 6;
  growMicrobe(w, i, 10, 10, materials[M.Virus]);
  assert.equal(w.cells[i], 0);
  assert.equal(w.cells[i + 1], M.Virus);
  assert.equal(w.residue[i + 1], M.Plant);
  assert.equal(w.cells[i - 1], M.Steel);
  w.set(i + 2, M.Fungus);
  for (let n = 0; n < 3; n++) {
    w.tick = 5 + n * 8;
    growMicrobe(w, i + 1, 11, 10, materials[M.Virus]);
  }
  assert.equal(w.cells[i + 2], M.Fungus);
  w.tick += 8;
  growMicrobe(w, i + 1, 11, 10, materials[M.Virus]);
  assert.equal(w.cells[i + 2], M.Virus);
  assert.equal(w.moisture[i + 1], 1);
  w.life[i + 1] = 1;
  growMicrobe(w, i + 1, 11, 10, materials[M.Virus]);
  assert.equal(w.cells[i + 1], M.Sawdust);
});
test("microbial contact growth has a global tick budget and survives export", () => {
  const w = new World(80, 80);
  for (let y = 8; y < 70; y += 2)
    for (let x = 8; x < 70; x += 8) {
      const i = at(w, x, y);
      w.set(i, M.Fungus);
      w.moisture[i] = 80;
      w.set(i + 1, M.Sawdust);
    }
  w.tick = 0;
  for (const i of w.cells.keys())
    if (w.cells[i] === M.Fungus)
      growMicrobe(
        w,
        i,
        i % w.width,
        Math.floor(i / w.width),
        materials[M.Fungus],
      );
  assert.equal(w.floraBirths, 32);
  const saved = snapshot(w),
    loaded = new World();
  restore(loaded, unpack(pack(saved)));
  assert.deepEqual(snapshot(loaded), saved);
});
test("a falling brick string stays intact in quiet air and crumbles on impact, while metal stays ductile", () => {
  for (const name of ["Brick", "Steel"]) {
    const w = new World(100, 150);
    for (let x = 20; x < 65; x++) w.set(at(w, x, 20), M[name]);
    for (let x = 0; x < 100; x++) w.set(at(w, x, 130), M.Wall);
    run(w, 40);
    const airborne = w.cells.filter((id) => id === M["Brick Rubble"]).length;
    if (name === "Brick")
      assert.equal(airborne, 0, "gravity is not a fracture load");
    else assert.equal(w.rigid.locations.size, 45);
    run(w, 80);
    if (name === "Brick")
      assert.ok(
        w.cells.filter((id) => id === M["Brick Rubble"]).length > airborne + 5,
      );
    else assert.equal(w.rigid.locations.size, 45);
    assert.equal(w.count, 145);
    assert.ok(w.rigid.work.airStressSamples <= fractureLimits.airSamples);
    assert.ok(w.rigid.work.impactStressSamples <= fractureLimits.impactSamples);
    assert.ok(w.velocityX.every(Number.isFinite));
  }
});
test("elastic Sponge retains water, falls freely and restores identical spring state", () => {
  const w = new World(64, 200);
  for (let y = 10; y < 20; y++)
    for (let x = 20; x < 30; x++) {
      const i = at(w, x, y);
      w.set(i, M.Sponge);
      w.storedLiquid[i] = M.Water;
      w.storedAmount[i] = 12;
    }
  run(w, 70);
  assert.ok(
    [...w.elastic.locations.values()].every(
      (i) => Math.floor(i / w.width) > 50,
    ),
  );
  assert.equal(w.elastic.locations.size, 100);
  assert.equal(w.rigid.locations.size, 0);
  const saved = snapshot(w),
    loaded = new World();
  restore(loaded, unpack(pack(saved)));
  run(w, 12);
  run(loaded, 12);
  assert.deepEqual(snapshot(loaded), snapshot(w));
});
