import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import {
  absorb,
  acceptsLiquid,
  consumeWater,
  releaseForChange,
} from "../src/sim/absorption.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection.js";

const at = (w, x, y) => y * w.width + x;
function vessel(id) {
  const w = new World(16, 16),
    i = at(w, 8, 8);
  w.set(i, id);
  for (const j of [i - 1, i + 1, i - w.width, i + w.width]) w.set(j, M.Wall);
  w.random = () => 0;
  w.tick = (3 - (i % 3)) % 3;
  return { w, i };
}
const waterUnits = (w) =>
  w.cells.reduce((n, id) => n + Number(id === M.Water || id === M.Steam), 0) +
  w.storedAmount.reduce((a, b) => a + b, 0);

test("every porous material uses its integer capacity for water and oil, including solids and elastics", () => {
  for (const m of materials.filter(
    (m) => !m.deprecated && m.porosity && m.permeability,
  ))
    for (const liquid of [M.Water, M.Oil]) {
      if (!acceptsLiquid(m.id, liquid)) continue;
      const { w, i } = vessel(m.id);
      // Drawn wet phases already contain water; test initially empty reservoirs.
      w.storedAmount[i] = 0;
      w.storedLiquid[i] = 0;
      for (let n = 0; n < m.porosity + 2; n++) {
        w.set(i + 1, liquid);
        absorb(w, i, 8, 8);
      }
      assert.equal(w.storedAmount[i], m.porosity, m.name);
      assert.equal(w.storedLiquid[i], liquid, m.name);
      assert.equal(w.cells[i + 1], liquid);
    }
});

test("capacity-weighted wicking conserves liquid and dissolved nutrients across different hosts", () => {
  const { w, i } = vessel(M.Sponge),
    j = i + 1;
  w.set(j, M.Sand);
  w.storedAmount[i] = 48;
  w.storedLiquid[i] = M.Brine;
  w.nutrition[i] = 96;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[j], 1);
  assert.equal(w.storedLiquid[j], M.Brine);
  assert.equal(w.storedAmount[i] + w.storedAmount[j], 48);
  assert.equal(w.nutrition[i] + w.nutrition[j], 96);
  w.storedLiquid[j] = M.Oil;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[i], 47);
});

test("permeability limits intake; retention independently controls drainage along each gravity axis", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const { w, i } = vessel(M.Sand);
    w.setGravity(gx, gy);
    w.random = () => 0.05;
    const below = w.relativeIndex(8, 8, 0, 1);
    w.set(below, 0);
    w.storedAmount[i] = 1;
    w.storedLiquid[i] = M.Water;
    absorb(w, i, 8, 8);
    assert.equal(w.storedAmount[i], 0);
    assert.equal(w.cells[below], M.Water);
    assert.equal(waterUnits(w), 1);
  }
  const { w, i } = vessel(M.Sponge);
  w.set(i + w.width, 0);
  w.random = () => 0.05;
  w.storedAmount[i] = 1;
  w.storedLiquid[i] = M.Water;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[i], 1);
  const slow = vessel(M.Clay);
  slow.w.random = () => 0.05;
  slow.w.set(slow.i + 1, M.Water);
  absorb(slow.w, slow.i, 8, 8);
  assert.equal(slow.w.storedAmount[slow.i], 0);
});

test("pressure, heat, freezing and blocked destruction conserve finite contents", () => {
  const { w, i } = vessel(M.Wood);
  w.storedAmount[i] = 3;
  w.storedLiquid[i] = M.Water;
  assert.equal(w.transform(i, M.Ash), true); // equally capacious residue retains it
  assert.equal(w.storedAmount[i], 3);
  assert.equal(w.transform(i, M.Fire), false); // nowhere for trapped water
  assert.equal(w.cells[i], M.Ash);
  w.set(i - w.width, 0);
  w.temp[i] = -20;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[i], 3);
  w.temp[i] = 130;
  absorb(w, i, 8, 8);
  assert.equal(w.cells[i - w.width], M.Steam);
  assert.equal(waterUnits(w), 3);
  w.set(i - w.width, 0);
  w.temp[i] = 20;
  w.cooldown[i] = 10;
  absorb(w, i, 8, 8);
  assert.equal(w.cells[i - w.width], M.Water);
  assert.equal(w.storedAmount[i], 1);
  w.set(i - w.width, 0);
  assert.equal(releaseForChange(w, i, M.Fire), true);
  assert.equal(w.storedAmount[i], 0);
});

test("root water uses pore storage before metabolic consumption, and rejects absorbed oil", () => {
  const { w, i } = vessel(M.Dirt),
    j = i + 1;
  w.set(j, M.Plant);
  w.moisture[j] = 0;
  w.storedLiquid[i] = M.Water;
  w.storedAmount[i] = 3;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[j], 1);
  assert.equal(consumeWater(w, j), true);
  assert.equal(w.moisture[j], 80);
  assert.equal(w.storedAmount[i], 2);
  w.storedLiquid[j] = M.Oil;
  w.storedAmount[j] = 1;
  assert.equal(consumeWater(w, j), false);
  assert.equal(w.storedAmount[j], 1);
});

test("pore contents survive saves, clipboard and legacy hydration; invalid capacities never mutate the world", () => {
  const { w, i } = vessel(M.Wood);
  w.storedAmount[i] = 3;
  w.storedLiquid[i] = M.Oil;
  w.nutrition[i] = 12;
  const copy = new World(16, 16);
  restore(copy, unpack(pack(snapshot(w))));
  assert.deepEqual(snapshot(copy), snapshot(w));
  const clip = copyRegion(w, { x: 8, y: 8, width: 1, height: 1 });
  pasteRegion(w, clip, 3, 3);
  assert.equal(w.storedAmount[at(w, 3, 3)], 3);
  const before = snapshot(w),
    bad = structuredClone(before);
  bad.arrays.storedAmount[i] = 4;
  assert.throws(() => restore(w, bad), /absorbed liquid/);
  assert.deepEqual(snapshot(w), before);
  w.set(i, M.Mud);
  const legacy = snapshot(w);
  delete legacy.porousModel;
  legacy.arrays.storedAmount[i] = 0;
  legacy.arrays.storedLiquid[i] = 0;
  restore(copy, legacy);
  assert.equal(copy.storedAmount[i], 2);
});

test("a pore pass has bounded neighbor work and incoming fluid cannot cascade in one tick", () => {
  const { w, i } = vessel(M.Sponge),
    j = i + 1,
    k = j + 1;
  w.set(j, M.Sand);
  w.set(k, M.Sand);
  w.storedLiquid[i] = M.Water;
  w.storedAmount[i] = 48;
  w.inParticlePass = true;
  w.tick = 3;
  // Align source schedule without changing target's receiving stamp.
  const origin = w.relativeIndex.bind(w);
  let visits = 0;
  w.relativeIndex = (...args) => {
    visits++;
    return origin(...args);
  };
  w.tick = ((3 - (i % 3)) % 3) + 3;
  absorb(w, i, 8, 8);
  assert.ok(visits <= 8, visits);
  assert.equal(w.storedAmount[j], 1);
  absorb(w, j, 9, 8);
  assert.equal(w.storedAmount[k], 0);
});
