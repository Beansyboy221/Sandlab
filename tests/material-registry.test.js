import test from "node:test";
import assert from "node:assert/strict";
import {
  defineMaterial,
  porous,
  springy,
  combustible,
  conductor,
  oxidizable,
} from "../src/sim/material-authoring.js";
import { compileMaterials, capability } from "../src/sim/material-registry.js";
import { materials, materialTables } from "../src/sim/materials.js";
const empty = ["Empty", "none", "#000000", 0, {}];
const custom = (properties) =>
  defineMaterial({
    name: "Test",
    representation: "rigid",
    color: "#123456",
    density: 2,
    properties,
  });
test("traits combine pore storage, elastic motion and combustion; explicit overrides win", () => {
  const definition = defineMaterial({
    name: "Test Foam",
    color: "#123456",
    density: 0.4,
    traits: [
      porous(8, 0.2, 0.8),
      springy(0.2, 0.9, 5),
      combustible(250, 150, "Ash"),
      conductor(0.1),
    ],
    properties: { permeability: 0.7 },
  });
  const {
    materials: m,
    tables,
    M,
  } = compileMaterials([
    empty,
    definition,
    ["Ash", "powder", "#888888", 0.6, {}],
  ]);
  assert.equal(m[1].porosity, 8);
  assert.equal(m[1].permeability, 0.7);
  assert.equal(m[1].residue, M.Ash);
  assert.equal(m[1].elasticity, 0.2);
  assert.ok(tables.flags[1] & capability.elastic);
  assert.ok(tables.flags[1] & capability.conductive);
  assert.ok(tables.flags[1] & capability.combustible);
  assert.equal(m[1].rigid, false);
});
test("authoring rejects conflicting carriers, invalid ranges, unresolved references and duplicate identities", () => {
  assert.throws(
    () =>
      defineMaterial({
        name: "Bad",
        representation: "rigid",
        traits: [springy(0.2, 0.9, 5)],
      }),
    /Conflicting/,
  );
  for (const properties of [
    { porosity: 1.5 },
    { permeability: 2 },
    { retention: -1 },
    { brittleness: NaN },
    { meltTo: "Missing" },
    { melt: NaN },
    { conductivity: -1 },
    { id: 45 },
    { burn() {} },
  ])
    assert.throws(() => compileMaterials([empty, custom(properties)]));
  assert.throws(
    () => compileMaterials([empty, custom({}), custom({})]),
    /Duplicate/,
  );
  assert.throws(
    () => compileMaterials(Array.from({ length: 257 }, () => empty)),
    /Uint8/,
  );
});
test("Empty can be an explicit reaction/phase product, and definitions are immutable after compilation", () => {
  const d = custom({ melt: 200, meltTo: "Empty" }),
    { materials: m } = compileMaterials([empty, d]);
  assert.equal(m[1].meltTo, 0);
  assert.equal(m[1].phaseMaximum, 200);
  assert.throws(() => {
    m[1].conductivity = 2;
  }, TypeError);
});
test("compiled property and pair tables reproduce every existing heat coefficient exactly", () => {
  for (const a of materials) {
    assert.equal(materialTables.density[a.id], a.density);
    assert.equal(materialTables.porosity[a.id], a.porosity);
    for (const b of materials)
      assert.equal(
        materialTables.heatTransfer[a.id * materials.length + b.id],
        Math.min(0.24, (a.conductivity + b.conductivity) * 0.25),
      );
  }
});

test("oxidation traits compile a finite rate and surface color without particle state in definitions", () => {
  const definition = defineMaterial({
    name: "Test Metal",
    representation: "rigid",
    color: "#998877",
    density: 4,
    traits: [conductor(0.2), oxidizable(0.002, "#779988")],
  });
  const registry = compileMaterials([empty, definition]);
  assert.equal(registry.materials[1].oxidationRate, 0.002);
  assert.equal(registry.tables.oxidationRate[1], 0.002);
  assert.equal(registry.materials[1].oxidationColor, "#779988");
  assert.equal(registry.materials[1].oxidationLevel, undefined);
  assert.ok(registry.tables.oxidationRate.every(Number.isFinite));
  assert.throws(
    () => compileMaterials([empty, custom({ oxidationColor: "invalid" })]),
    /oxidation color/,
  );
});
