import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials, canonicalMaterial } from "../src/sim/materials.js";
import { paletteMaterials } from "../src/sim/material-families.js";
import { react } from "../src/sim/reactions.js";
import { grow } from "../src/sim/biology.js";
import { absorb } from "../src/sim/absorption.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection.js";
const at = (w, x, y) => y * w.width + x;
function sample(a, b, temperature = 20) {
  const w = new World(20, 20);
  w.set(210, M[a], temperature);
  w.set(211, M[b], temperature);
  return w;
}
test("existing material IDs stay stable and every phase/product resolves to a valid material", () => {
  assert.equal(M.Sponge, 51);
  assert.equal(M.Water, 2);
  assert.equal(M.Heater, 38);
  assert.equal(materials.length, 103);
  assert.equal(M["Liquid Nitrogen"], 71);
  for (const m of materials)
    for (const key of [
      "meltTo",
      "boilTo",
      "freezeTo",
      "condenseTo",
      "oxidizeTo",
      "bakeTo",
      "dryTo",
      "combustionGas",
      "residue",
    ])
      if (m[key] !== undefined)
        assert.ok(
          Number.isInteger(m[key]) && materials[m[key]],
          `${m.name}.${key}`,
        );
});
test("removed materials are unavailable, names use capitals, and renamed substances preserve IDs", () => {
  assert.equal(M.CO2, 61);
  assert.equal(M["Glass Shards"], 79);
  assert.equal(paletteMaterials.length, 76);
  const retired = materials.filter((m) => m.retired);
  assert.equal(retired.length, 12);
  for (const m of retired) {
    assert.equal(M[m.name], undefined);
    assert.ok(!paletteMaterials.includes(m));
    assert.ok(!materials[canonicalMaterial(m.id)].deprecated);
  }
  for (const m of materials.filter((m) => !m.deprecated))
    assert.ok(
      m.name.split(/\s+/).every((word) => /^[A-Z]/.test(word)),
      m.name,
    );
});
test("old saves migrate removed cells, structural state, clone targets and sponge contents", () => {
  const w = new World(32, 32),
    retired = materials.filter((m) => m.retired);
  for (let n = 0; n < retired.length; n++)
    w.set(100 + n, canonicalMaterial(retired[n].id));
  w.set(200, M.Sponge);
  w.storedLiquid[200] = M.Water;
  w.storedAmount[200] = 3;
  w.set(210, M.Clone);
  const old = snapshot(w);
  for (let n = 0; n < retired.length; n++)
    old.arrays.cells[100 + n] = retired[n].id;
  old.arrays.nutrition[103] = 96;
  old.arrays.life[104] = 0;
  old.arrays.storedLiquid[200] = 66;
  old.arrays.clone[210] = 80;
  old.arrays.residue[211] = 66;
  const loaded = new World();
  restore(loaded, unpack(pack(old)));
  for (let n = 0; n < retired.length; n++)
    assert.equal(loaded.cells[100 + n], canonicalMaterial(retired[n].id));
  assert.equal(loaded.nutrition[103], 96);
  assert.equal(loaded.life[104], materials[M.Smoke].lifetime);
  assert.equal(loaded.storedLiquid[200], M.Water);
  assert.equal(loaded.storedAmount[200], 3);
  assert.equal(loaded.nutrition[200], 255);
  assert.equal(loaded.clone[210], M.Fire);
  assert.equal(loaded.residue[211], M.Water);
  assert.equal(loaded.count, loaded.cells.filter(Boolean).length);
  for (let n = 0; n < 90; n++) loaded.step();
  assert.ok(loaded.cells.every((id) => !materials[id].deprecated));
});
test("fertilizer dissolves in ordinary water and evaporation recovers it without creating removed liquids", () => {
  const w = sample("Water", "Fertilizer");
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Water);
  assert.equal(w.cells[211], 0);
  assert.equal(w.nutrition[210], 96);
  w.temp[210] = 130;
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Fertilizer);
  assert.equal(w.nutrition[210], 96);
  assert.equal(w.cells[190], M.Steam);
  w.set(211, M.Water);
  react(w, 211, 11, 10);
  assert.equal(w.cells[211], M.Water);
  assert.equal(w.nutrition[211], 96);
  assert.equal(w.cells[210], 0);
});
test("neutralization and gas-generating contacts consume exactly one reactant pair, in either scan direction", () => {
  for (const [a, b, first, second] of [
    ["Acid", "Baking Soda", "Water", "CO2"],
    ["Acid", "Baking Soda", "Water", "CO2"],
    ["Acid", "Lye", "Water", "Brine"],
    ["Sodium", "Water", "Lye", "Hydrogen"],
    ["Liquid Sodium", "Brine", "Lye", "Hydrogen"],
    ["Water", "Fertilizer", "Water", "Empty"],
    ["Water", "Clay", "Empty", "Wet Clay"],
  ])
    for (const reversed of [false, true]) {
      const w = sample(a, b);
      react(w, reversed ? 211 : 210, reversed ? 11 : 10, 10);
      assert.equal(w.cells[210], M[first], a);
      assert.equal(w.cells[211], M[second], b);
      const cells = w.cells.slice();
      react(w, 210, 10, 10); // no stale reactant repeats into another neighbor
      assert.ok(w.count <= (a === "Acid" || a === "Acid" ? 3 : 2));
      assert.equal(w.count, w.cells.filter(Boolean).length);
      if (a.includes("sodium") || a === "Sodium") assert.ok(w.temp[211] >= 230);
      else if (b !== "Baking Soda") assert.deepEqual(w.cells, cells);
    }
});
test("sodium reactions add pressure and can ignite their hydrogen byproduct without unbounded temperature", () => {
  const w = sample("Sodium", "Water");
  react(w, 210, 10, 10);
  assert.ok(w.fields.pressure.some((v) => v > 0));
  assert.equal(w.cells[211], M.Hydrogen);
  react(w, 211, 11, 10);
  assert.ok(w.cells.includes(M.Fire));
  assert.ok(w.temp.every(Number.isFinite));
});
test("corrosion requires wet exposed surfaces, salt accelerates it, and copper patina stops conduction", () => {
  const dry = sample("Steel", "Stone");
  dry.random = () => 0;
  react(dry, 210, 10, 10);
  assert.equal(dry.cells[210], M.Steel);
  const wet = sample("Steel", "Water");
  wet.random = () => 0.004;
  react(wet, 210, 10, 10);
  assert.equal(wet.cells[210], M.Steel);
  wet.set(211, M.Brine);
  react(wet, 210, 10, 10);
  assert.equal(wet.cells[210], M.Rust);
  const submerged = sample("Steel", "Water");
  for (const i of [209, 190, 230]) submerged.set(i, M.Water);
  submerged.random = () => 0;
  react(submerged, 210, 10, 10);
  assert.equal(submerged.cells[210], M.Steel);
  const copper = sample("Copper", "Water");
  copper.random = () => 0;
  react(copper, 210, 10, 10);
  assert.equal(copper.cells[210], M.Patina);
  assert.equal(materials[M.Copper].conductive, true);
  assert.ok(!materials[M.Patina].conductive);
  copper.set(211, M.Acid);
  react(copper, 211, 11, 10);
  assert.equal(copper.cells[210], M.Copper);
  assert.equal(copper.cells[211], M.Water);
});
test("lye consumes organic matter but leaves mineral vessels, metal, and glass intact", () => {
  for (const target of [
    "Wood",
    "Rubber",
    "Plant",
    "Glass",
    "Ceramic",
    "Steel",
  ]) {
    const w = sample("Lye", target);
    w.random = () => 0;
    react(w, 210, 10, 10);
    assert.equal(w.cells[211], materials[M[target]].organic ? 0 : M[target]);
    if (materials[M[target]].organic) assert.equal(w.cells[210], M.Water);
  }
});
test("rust is reduced by hot coal, and burning sulfur produces smoke without removed gases", () => {
  const w = sample("Rust", "Coal", 750);
  w.random = () => 0;
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Steel);
  assert.equal(w.cells[211], M["CO2"]);
  w.clear();
  w.set(210, M.Sulfur, 400);
  w.random = () => 0;
  react(w, 210, 10, 10);
  assert.ok(w.cells.includes(M.Smoke));
  assert.ok(w.cells.every((id) => !materials[id].deprecated));
});
test("wet clay dries into separate clay and steam, then fires into stable brick", () => {
  const w = sample("Wet Clay", "Ceramic", 130);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Clay);
  assert.equal(w.cells[190], M.Steam);
  w.temp[210] = 800;
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Brick);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Brick);
  const sealed = sample("Wet Clay", "Ceramic", 130);
  for (const i of [209, 190, 230]) sealed.set(i, M.Ceramic);
  react(sealed, 210, 10, 10);
  assert.equal(sealed.cells[210], M["Wet Clay"]);
});
test("copper and sodium phase cycles, cryogenic boiling, and dense gas displacement use shared physics", () => {
  const w = new World(20, 20);
  for (const [before, temperature, after] of [
    ["Copper", 1100, "Molten Copper"],
    ["Molten Copper", 1000, "Copper"],
    ["Sodium", 110, "Liquid Sodium"],
    ["Liquid Sodium", 80, "Sodium"],
    ["Liquid Nitrogen", -180, "Nitrogen"],
    ["Nitrogen", -210, "Liquid Nitrogen"],
  ]) {
    w.clear();
    w.set(210, M[before], temperature);
    react(w, 210, 10, 10);
    assert.equal(w.cells[210], M[after]);
  }
  w.clear();
  w.set(210, M["Liquid Nitrogen"]);
  w.set(211, M.Water);
  for (let n = 0; n < 6; n++) {
    w.transferHeat(210, 211);
    react(w, 210, 10, 10);
    react(w, 211, 11, 10);
  }
  assert.equal(w.cells[211], M.Ice);
  w.clear();
  w.set(210, M["CO2"]);
  w.move(210, 10, 10);
  assert.equal(w.cells[230], M["CO2"]);
});
test("inert gas blankets shorten flame life, while plants consume CO2 and release oxygen", () => {
  const w = new World(20, 20);
  w.set(210, M.Fire, 680, 40);
  const initial = w.life[210];
  for (const i of [209, 211, 190, 230]) w.set(i, M["CO2"]);
  react(w, 210, 10, 10);
  assert.ok(w.life[210] < initial - 1);
  w.clear();
  w.set(210, M.Plant);
  w.growth[210] = 22;
  w.moisture[210] = 100;
  w.set(211, M["CO2"]);
  w.tick = 2;
  w.random = () => 0;
  grow(w, 210, 10, 10);
  assert.equal(w.cells[211], M.Oxygen);
  assert.equal(w.moisture[210], 98);
});
test("fertilizer has finite transported nutrition and boosts hydrated growth without growing dry plants", () => {
  const w = sample("Dirt", "Water");
  w.nutrition[211] = 96;
  w.random = () => 0;
  react(w, 210, 10, 10);
  assert.equal(w.nutrition[210], 96);
  assert.ok(w.moisture[210] > 0);
  assert.equal(w.cells[211], 0);
  const plain = new World(20, 20),
    fed = new World(20, 20);
  for (const world of [plain, fed]) {
    world.set(210, M.Plant);
    world.moisture[210] = 200;
    world.tick = 1;
    world.random = () => 0.07;
  }
  fed.nutrition[210] = 128;
  grow(plain, 210, 10, 10);
  grow(fed, 210, 10, 10);
  assert.equal(plain.cells[190], 0);
  assert.equal(fed.cells[190], M.Plant);
  assert.equal(fed.nutrition[210] + fed.nutrition[190], 124);
  fed.clear();
  fed.set(210, M.Plant);
  fed.nutrition[210] = 128;
  fed.moisture[210] = 0;
  grow(fed, 210, 10, 10);
  assert.equal(fed.cells[190], 0);
});
test("dissolved fertilizer in ordinary water works with sponges, phase changes, saves, clipboard, and legacy saves", () => {
  const w = sample("Sponge", "Water");
  w.nutrition[211] = 96;
  w.tick = 0;
  absorb(w, 210, 10, 10);
  assert.equal(w.storedLiquid[210], M.Water);
  assert.equal(w.storedAmount[210], 1);
  assert.equal(w.nutrition[210], 96);
  w.cooldown[210] = 10;
  absorb(w, 210, 10, 10);
  assert.equal(w.cells[230], M.Water);
  assert.equal(w.nutrition[230], 96);
  assert.equal(w.nutrition[210], 0);
  w.set(250, M.Water);
  w.nutrition[250] = 96;
  w.temp[250] = -10;
  react(w, 250, 10, 12);
  assert.equal(w.cells[250], M.Ice);
  assert.equal(w.nutrition[250], 96);
  w.temp[250] = 20;
  react(w, 250, 10, 12);
  assert.equal(w.cells[250], M.Water);
  assert.equal(w.nutrition[250], 96);
  w.set(270, M.Dirt);
  w.nutrition[270] = 123;
  w.swap(270, 271);
  assert.equal(w.nutrition[271], 123);
  const clip = copyRegion(w, { x: 11, y: 13, width: 1, height: 1 });
  pasteRegion(w, clip, 2, 2);
  assert.equal(w.nutrition[42], 123);
  const saved = pack(snapshot(w)),
    restored = new World(20, 20);
  restore(restored, unpack(saved));
  assert.deepEqual(snapshot(restored), snapshot(w));
  const legacy = structuredClone(saved);
  delete legacy.arrays.nutrition;
  restore(restored, unpack(legacy));
  assert.ok(restored.nutrition.every((v) => v === 0));
  const uncompressed = snapshot(w);
  delete uncompressed.arrays.nutrition;
  restore(restored, uncompressed);
  assert.ok(restored.nutrition.every((v) => v === 0));
});

test("heated flammable gas cannot ignite inside a complete inert-gas blanket", () => {
  const w = new World(20, 20);
  w.set(210, M.Hydrogen, 650);
  for (const i of [209, 211, 190, 230]) w.set(i, M["CO2"]);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Hydrogen);
  assert.ok(!w.cells.includes(M.Fire));
  w.set(209, M.Oxygen);
  react(w, 210, 10, 10);
  assert.ok(w.cells.includes(M.Fire));
});
