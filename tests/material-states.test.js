import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials, canonicalMaterial } from "../src/sim/materials.js";
import {
  paletteMaterials,
  paletteBase,
  materialSearchText,
} from "../src/sim/material-families.js";
import {
  defineMaterial,
  defineMaterialState,
  acid,
  base,
  porous,
  conductor,
} from "../src/sim/material-authoring.js";
import { compileMaterials } from "../src/sim/material-registry.js";
import { compileContactReactions } from "../src/sim/reaction-registry.js";
import { fractureWork } from "../src/sim/fracture-energy.js";
import { fracture } from "../src/sim/body-collisions.js";
import { changePhase } from "../src/sim/phase-changes.js";
import { reactContact, etch } from "../src/sim/chemistry.js";
import { addOxide } from "../src/sim/oxidation.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection.js";

const empty = ["Empty", "none", "#000000", 0, {}];
test("state authoring inherits components without borrowing structural topology", () => {
  const registry = compileMaterials([
    empty,
    defineMaterial({
      name: "Steel",
      representation: "rigid",
      color: "#888888",
      density: 7,
      traits: [porous(2, 0.05, 0.9), conductor(0.6)],
      properties: { fragmentTo: "Test Grains", melt: 800, meltTo: "Test Melt" },
    }),
    defineMaterialState({
      name: "Test Grains",
      base: "Steel",
      state: "fragment",
      representation: "granular",
      properties: { permeability: 0.7 },
    }),
    defineMaterialState({
      name: "Test Melt",
      base: "Steel",
      state: "liquid",
      representation: "fluid",
      properties: { freeze: 780, freezeTo: "Steel" },
    }),
  ]);
  const [, bulk, grains, melt] = registry.materials;
  assert.equal(grains.baseMaterial, bulk.id);
  assert.equal(grains.density, 7);
  assert.equal(grains.conductivity, 0.6);
  assert.equal(grains.porosity, 2);
  assert.equal(grains.permeability, 0.7);
  assert.equal(grains.rigid, false);
  assert.equal(grains.meltTo, melt.id);
  assert.equal(grains.phaseMaximum, 800);
  assert.equal(bulk.breakInto, grains.id);
  assert.equal(melt.freezeTo, bulk.id);
  assert.throws(
    () =>
      compileMaterials([
        empty,
        defineMaterialState({
          name: "Lost",
          base: "Absent",
          state: "fragment",
          representation: "granular",
        }),
      ]),
    /Unknown/,
  );
  assert.throws(
    () =>
      compileMaterials([
        empty,
        ["A", "solid", "#111111", 2, { fragmentTo: "B" }],
        ["B", "powder", "#222222", 2, {}],
      ]),
    /Fracture changes substance/,
  );
});

test("Rubble is retired and fine/corroded states resolve to one placeable substance", () => {
  assert.equal(M.Rubble, undefined);
  assert.equal(canonicalMaterial(95), M["Stone Gravel"]);
  for (const [state, bulk] of [
    ["Metal Dust", "Steel"],
    ["Rust", "Steel"],
    ["Sawdust", "Wood"],
    ["Glass Shards", "Glass"],
  ]) {
    assert.equal(paletteBase[M[state]], M[bulk]);
    assert.ok(!paletteMaterials.some((m) => m.id === M[state]));
    assert.ok(
      materialSearchText(materials[M[bulk]]).includes(state.toLowerCase()),
    );
  }
  for (const m of materials.filter((m) => !m.deprecated)) {
    assert.equal(materials[m.baseMaterial].baseMaterial, m.baseMaterial);
    if (m.fragmentTo !== undefined)
      assert.equal(materials[m.fragmentTo].baseMaterial, m.baseMaterial);
  }
});

test("breaking distinct solids preserves their family, density, pigment and motion", () => {
  const w = new World(24, 24);
  for (const name of [
    "Wood",
    "Steel",
    "Copper",
    "Glass",
    "Crystal",
    "Mirror",
    "Stone",
    "Concrete",
    "Brick",
    "Ceramic",
  ]) {
    w.clear();
    w.set(200, M[name], 150);
    w.oxidationLevel[200] = 100;
    w.pigment[200] = 0xffabcdef;
    w.velocityX[200] = 0.4;
    w.offsetX[200] = 0.2;
    const before = materials[M[name]];
    fracture(w.rigid, 200, fractureWork(w, 200) * 1.1);
    const after = materials[w.cells[200]];
    assert.equal(after.materialState, "fragment", name);
    assert.equal(after.baseMaterial, before.baseMaterial, name);
    assert.equal(after.density, before.density, name);
    assert.equal(w.pigment[200], 0xffabcdef, name);
    assert.equal(w.oxidationLevel[200], 100, name);
    assert.ok(Math.abs(w.velocityX[200] - 0.4) < 0.00001, name);
    assert.ok(Math.abs(w.offsetX[200] - 0.2) < 0.00001, name);
  }
});

test("shared phase rules preserve distinct molten identities and no heat reduces rust to metal", () => {
  const w = new World(24, 24);
  for (const name of [
    "Steel",
    "Copper",
    "Stone",
    "Concrete",
    "Brick",
    "Ceramic",
    "Glass",
    "Crystal",
    "Mirror",
    "Rust",
  ]) {
    w.clear();
    w.set(200, M[name], materials[M[name]].melt + 10);
    w.pigment[200] = 0xff123456;
    changePhase(w, 200, 8, 8, materials[w.cells[200]]);
    const molten = materials[w.cells[200]];
    assert.equal(molten.category, "liquid", name);
    assert.equal(molten.baseMaterial, materials[M[name]].baseMaterial, name);
    assert.equal(w.pigment[200], 0xff123456);
    w.temp[200] = molten.freeze - 1;
    changePhase(w, 200, 8, 8, molten);
    assert.equal(w.cells[200], M[name], name);
  }
  w.set(200, M.Jelly, 80);
  changePhase(w, 200, 8, 8, materials[M.Jelly]);
  assert.equal(w.cells[200], M["Jelly Drops"]);
  w.temp[200] = 20;
  changePhase(w, 200, 8, 8, materials[M["Jelly Drops"]]);
  assert.equal(w.cells[200], M.Jelly);
});

test("oxide progression survives fracture, phase changes, clipboard and old-world migration", () => {
  const w = new World(24, 24);
  w.set(200, M.Steel);
  w.oxidationLevel[200] = 239;
  fracture(w.rigid, 200, 1000);
  assert.equal(w.oxidationLevel[200], 239);
  addOxide(w, 200, 16);
  assert.equal(w.cells[200], M.Rust);
  assert.equal(w.oxidationLevel[200], 255);
  const clip = copyRegion(w, { x: 8, y: 8, width: 1, height: 1 });
  pasteRegion(w, clip, 3, 3);
  const old = snapshot(w);
  old.arrays.cells[250] = 95;
  old.arrays.pigment[250] = 0xff334455;
  const loaded = new World();
  restore(loaded, unpack(pack(old)));
  assert.equal(loaded.cells[250], M["Stone Gravel"]);
  assert.equal(loaded.pigment[250], 0xff334455);
  assert.equal(loaded.oxidationLevel[75], 255);
  const legacy = snapshot(w);
  delete legacy.arrays.oxidationLevel;
  restore(loaded, legacy);
  assert.equal(loaded.oxidationLevel[200], 255);
});

test("new acids and carbonate bases generate reactions from components without name branches", () => {
  const definitions = [
    empty,
    ["Water", "liquid", "#3344ff", 1, {}],
    ["CO2", "gas", "#777777", 0.002, {}],
    ["Salt", "powder", "#ffffff", 2, {}],
    defineMaterial({
      name: "Test Acid",
      representation: "fluid",
      color: "#aabb44",
      density: 1.1,
      traits: [acid(0.7)],
    }),
    defineMaterial({
      name: "Test Carbonate",
      representation: "granular",
      color: "#aaaaaa",
      density: 1.5,
      traits: [base(0.5, "Salt", 1)],
    }),
  ];
  const registry = compileMaterials(definitions),
    rules = compileContactReactions(registry.materials, registry.M);
  const a = registry.M["Test Acid"],
    b = registry.M["Test Carbonate"],
    r = rules[a][b];
  assert.equal(r, rules[b][a]);
  assert.equal(r.resultA, registry.M.Water);
  assert.equal(r.resultB, registry.M.CO2);
  assert.equal(r.dissolvedProduct, registry.M.Salt);
  assert.equal(r.chance, 0.7);
  assert.throws(
    () =>
      compileMaterials([
        ...definitions,
        ["Invalid", "liquid", "#112233", 1, { acidity: 2 }],
      ]),
    /Invalid acidity/,
  );
});

test("carbonate and metal reactions have finite products, while etching retains attacked substance", () => {
  const w = new World(24, 24);
  w.random = () => 0;
  w.set(200, M.Acid);
  w.set(201, M["Baking Soda"]);
  reactContact(w, 200, 8, 8);
  assert.equal(w.cells[200], M.Water);
  assert.equal(w.cells[201], M.CO2);
  assert.equal(w.dissolvedId[200], M.Salt);
  assert.equal(w.dissolvedAmount[200], 1);
  assert.ok(w.fields.pressure.some((v) => v > 0));
  const count = w.count;
  reactContact(w, 200, 8, 8);
  assert.equal(w.count, count);
  w.clear();
  w.set(200, M.Acid);
  w.set(201, M.Steel);
  reactContact(w, 200, 8, 8);
  assert.equal(w.cells[200], M["Iron Salt"]);
  assert.equal(w.cells[201], M.Hydrogen);
  w.clear();
  w.set(200, M.Acid);
  w.set(201, M.Concrete);
  etch(w, 200, 8, 8, materials[M.Acid]);
  assert.equal(w.cells[201], 0);
  assert.equal(w.cells[200], M.Water);
  assert.equal(w.dissolvedId[200], M["Concrete Fragments"]);
  assert.equal(w.dissolvedAmount[200], 1);
  // Solute quantity travels through a phase attempt and survives sealed storage.
  const saved = snapshot(w),
    loaded = new World();
  restore(loaded, saved);
  assert.equal(loaded.dissolvedId[200], M["Concrete Fragments"]);
});
