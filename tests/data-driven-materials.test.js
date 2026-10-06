import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileMaterials } from "../src/sim/material-registry.js";
import { defineMaterial, biological } from "../src/sim/material-authoring.js";
import { World } from "../src/sim/world.js";
import { materials, M } from "../src/sim/materials.js";
import { reactContact } from "../src/sim/chemistry.js";
import { compileContactReactions } from "../src/sim/reaction-registry.js";
import { solveBiology, biologyLimits } from "../src/sim/solvers/biology.js";

const empty = ["Empty", "none", "#000000", 0, {}];
function profile(name, properties, category = "solid") {
  return [name, category, "#667755", 1, properties];
}
// A minimal typed-state host makes registry independence explicit. Its mutation
// contract matches World; it deliberately knows no stock material names or IDs.
function host(registry, width = 32, height = 32) {
  const w = {
    width,
    height,
    length: width * height,
    tick: 0,
    ambientLight: 1,
    random: () => 0,
    wake() {},
  };
  for (const key of [
    "cells",
    "moisture",
    "nutrition",
    "growth",
    "residue",
    "storedLiquid",
    "storedAmount",
  ])
    w[key] = new Uint8Array(w.length);
  w.temp = new Float32Array(w.length).fill(20);
  w.life = new Uint16Array(w.length);
  w.index = (x, y) =>
    x < 0 || x >= width || y < 0 || y >= height ? -1 : y * width + x;
  w.relativeIndex = (x, y, dx, dy) => w.index(x + dx, y + dy);
  w.transform = (
    i,
    id,
    temperature = w.temp[i],
    life = registry[id].lifetime || 0,
  ) => {
    for (const key of [
      "moisture",
      "nutrition",
      "growth",
      "residue",
      "storedLiquid",
      "storedAmount",
    ])
      w[key][i] = 0;
    w.cells[i] = id;
    w.temp[i] = temperature;
    w.life[i] = life;
    return true;
  };
  return w;
}
function run(w, i, registry) {
  solveBiology(
    w,
    i,
    i % w.width,
    Math.floor(i / w.width),
    registry[w.cells[i]],
    registry,
  );
}
function growthRegistry(reverse = false) {
  const definitions = [
    profile("Mineral Bed", { growthSubstrate: true }),
    defineMaterial({
      name: "Bud",
      color: "#778855",
      density: 1,
      representation: "granular",
      traits: [
        biological("seed", { growthTo: "Stem", growthChance: 1, fedBonus: 0 }),
      ],
    }),
    profile("Stem", {
      biologicalHost: true,
      biology: {
        mode: "shoot",
        growthChance: 1,
        fedBonus: 0,
        uprightBias: 1,
        photosynthesisInput: "Feed Gas",
        photosynthesisOutput: "Waste Gas",
        photosynthesisChance: 1,
      },
    }),
    profile("Feed Gas", {}, "gas"),
    profile("Waste Gas", {}, "gas"),
    profile("Reservoir", { waterLike: true }, "liquid"),
  ];
  return compileMaterials([
    empty,
    ...(reverse ? definitions.reverse() : definitions),
  ]);
}
for (const reverse of [false, true])
  test(`unfamiliar seed and shoot configurations grow with ${reverse ? "reordered" : "ordinary"} IDs`, () => {
    const { materials: registry, M } = growthRegistry(reverse),
      w = host(registry),
      i = 16 * 32 + 16;
    w.transform(i, M.Bud);
    w.cells[i + 32] = M["Mineral Bed"];
    w.moisture[i] = 80;
    w.nutrition[i + 32] = 20;
    run(w, i, registry);
    assert.equal(w.cells[i], M.Stem);
    assert.equal(w.moisture[i], 72);
    assert.equal(w.nutrition[i], 16);
    assert.equal(w.nutrition[i + 32], 4);
    w.tick = 1;
    run(w, i, registry);
    assert.equal(w.cells[i - 32], M.Stem);
    assert.equal(w.growth[i - 32], 1);
    assert.equal(w.moisture[i] + w.moisture[i - 32], 64);
    assert.equal(w.nutrition[i] + w.nutrition[i - 32], 12);
    const before = w.cells.slice();
    w.temp[i] = -20;
    run(w, i, registry);
    assert.deepEqual(w.cells, before);
  });
test("configured photosynthesis needs light, warmth, feed gas and finite hydration", () => {
  const { materials: registry, M } = growthRegistry(),
    w = host(registry),
    i = 16 * 32 + 16;
  for (const light of [0, 1]) {
    w.cells.fill(0);
    w.transform(i, M.Stem);
    w.cells[i + 1] = M["Feed Gas"];
    w.moisture[i] = 40;
    w.tick = 0;
    w.ambientLight = light;
    run(w, i, registry);
    assert.equal(w.cells[i + 1], light ? M["Waste Gas"] : M["Feed Gas"]);
    if (light) assert.ok(w.moisture[i] < 38);
  }
  w.transform(i, M.Stem);
  w.cells[i + 1] = M["Feed Gas"];
  w.moisture[i] = 0;
  run(w, i, registry);
  assert.equal(w.cells[i + 1], M["Feed Gas"]);
});
test("hydration uses the configured liquid and yield without stock IDs", () => {
  const { materials: registry, M } = growthRegistry(true),
    w = host(registry),
    i = 200;
  w.transform(i, M.Bud);
  w.storedLiquid[i] = M.Reservoir;
  w.storedAmount[i] = 2;
  run(w, i, registry);
  assert.equal(w.storedAmount[i], 1);
  assert.equal(w.moisture[i], 80);
});
test("arbitrary decomposers and infections consume configured host capabilities", () => {
  const { materials: registry, M } = compileMaterials([
    empty,
    profile("Timber", { decomposable: true, biologicalHost: true }),
    profile("Hypha", {
      biology: {
        mode: "colonize",
        interval: 1,
        hydrationMinimum: 16,
        waterCost: 4,
        deathTo: "Detritus",
        lethalMaximum: 60,
      },
    }),
    profile(
      "Agent",
      {
        lifetime: 20,
        biology: {
          mode: "infect",
          interval: 1,
          incubation: 1,
          spentTo: "Detritus",
        },
      },
      "powder",
    ),
    profile("Detritus", {}, "powder"),
    profile("Inert", {}),
  ]);
  const w = host(registry),
    i = 300;
  w.transform(i, M.Hypha);
  w.moisture[i] = 40;
  w.cells[i + 1] = M.Timber;
  run(w, i, registry);
  assert.equal(w.cells[i + 1], M.Hypha);
  assert.equal(w.moisture[i] + w.moisture[i + 1], 36);
  w.temp[i] = 90;
  run(w, i, registry);
  assert.equal(w.cells[i], M.Detritus);
  w.transform(i, M.Agent);
  w.cells[i + 1] = M.Timber;
  run(w, i, registry);
  assert.equal(w.cells[i + 1], M.Agent);
  assert.equal(w.residue[i + 1], M.Timber);
  assert.equal(w.cells[i], 0);
  w.transform(i, M.Agent);
  w.cells[i + 1] = M.Inert;
  run(w, i, registry);
  assert.equal(w.cells[i + 1], M.Inert);
});
test("all growth shares a constant world budget and next tick permits more births", () => {
  const { materials: registry, M } = growthRegistry(),
    w = host(registry, 128, 64);
  const parents = [];
  for (let y = 3; y < 60; y += 3)
    for (let x = 2; x < 120; x += 3) {
      const i = y * w.width + x;
      parents.push(i);
      w.transform(i, M.Stem);
      w.moisture[i] = 100;
    }
  for (const i of parents) run(w, i, registry);
  assert.equal(w.floraBirths, biologyLimits.birthsPerTick);
  assert.equal(
    w.cells.filter((id) => id === M.Stem).length,
    parents.length + 32,
  );
  w.tick++;
  for (const i of parents) run(w, i, registry);
  assert.equal(w.floraBirths, 32);
});
test("biological data rejects callbacks, unknown products, unsafe ranges and resource underflow", () => {
  for (const biology of [
    { mode: "custom-script" },
    { grow() {} },
    { interval: 0 },
    { growthTo: "Unknown" },
    { growthChance: 2 },
    { waterCost: 200 },
    { photosynthesisWater: 40 },
    { mode: "colonize", hydrationMinimum: 16, waterCost: 12 },
    { minTemperature: 50, maxTemperature: 40 },
    { photosynthesisInput: "Empty" },
    JSON.parse('{"__proto__": 1}'),
  ])
    assert.throws(() =>
      compileMaterials([empty, profile("Sample", { biology })]),
    );
  const { materials: registry } = compileMaterials([
    empty,
    profile("Sample", { biology: { mode: "shoot" } }),
  ]);
  assert.ok(Object.isFrozen(registry[1].biology));
  assert.throws(() => {
    registry[1].biology.growthChance = 1;
  }, TypeError);
});
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith(".js")
        ? [join(dir, e.name)]
        : [],
  );
}
test("runtime simulation cannot branch on stock material names or numeric material IDs", () => {
  for (const file of files("src/sim")) {
    if (
      /\/(?:materials|material-[^/]+|biological-components|entity-definitions|entity-registry|creature-profiles|projectile-profiles)\.js$/.test(
        file,
      )
    )
      continue;
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /\bM\s*(?:\.|\[)|\b(?:m|material|other|target)\.name\s*(?:===|!==)/,
      file,
    );
  }
});

test("authored contact data compiles symmetric products and bounded conditions", () => {
  const { materials: registry, M } = compileMaterials([
    empty,
    profile("Reagent", {
      contactReactions: [
        {
          with: "Target",
          selfTo: "Residue",
          otherTo: "Vapor",
          chance: 0.3,
          minimumTemperature: 50,
          maximumTemperature: 100,
          heat: 12,
          pressure: 2,
        },
      ],
    }),
    profile("Target", {}),
    profile("Residue", {}, "powder"),
    profile("Vapor", {}, "gas"),
  ]);
  const contacts = compileContactReactions(registry),
    rule = contacts[M.Reagent][M.Target];
  assert.equal(rule, contacts[M.Target][M.Reagent]);
  assert.equal(rule.resultA, M.Residue);
  assert.equal(rule.resultB, M.Vapor);
  assert.equal(rule.chance, 0.3);
  assert.equal(rule.maximumTemperature, 100);
  assert.ok(
    Object.isFrozen(rule) &&
      Object.isFrozen(registry[M.Reagent].contactReactions[0]),
  );
  for (const contactReactions of [
    Array(17).fill({}),
    [{ with: "Missing", otherTo: "Empty" }],
    [{ with: "Empty", otherTo: "Empty", rate() {} }],
    [{ with: "Empty", otherTo: "Empty", chance: 2 }],
    [
      {
        with: "Empty",
        otherTo: "Empty",
        minimumTemperature: 100,
        maximumTemperature: 0,
      },
    ],
  ])
    assert.throws(() =>
      compileMaterials([empty, profile("Reagent", { contactReactions })]),
    );
  const conflicting = compileMaterials([
    empty,
    profile("A", { contactReactions: [{ with: "B", otherTo: "Empty" }] }),
    profile("B", { contactReactions: [{ with: "A", otherTo: "Empty" }] }),
  ]);
  assert.throws(
    () => compileContactReactions(conflicting.materials),
    /Conflicting/,
  );
});

test("authored reactions use the shared executor, temperature window and pressure field", () => {
  const configured = materials.map((m) => ({ ...m }));
  configured[M.Sand].contactReactions = [
    {
      with: M.Water,
      selfTo: M.Stone,
      otherTo: M.CO2,
      minimumTemperature: 50,
      maximumTemperature: 100,
      heat: 12,
      pressure: 2,
    },
  ];
  const contacts = compileContactReactions(configured),
    w = new World(32, 32),
    i = 400;
  w.set(i, M.Sand, 20);
  w.set(i + 1, M.Water, 20);
  assert.equal(reactContact(w, i, 16, 12, contacts), false);
  w.temp[i] = w.temp[i + 1] = 150;
  assert.equal(reactContact(w, i, 16, 12, contacts), false);
  w.temp[i] = w.temp[i + 1] = 80;
  assert.equal(reactContact(w, i, 16, 12, contacts), true);
  assert.equal(w.cells[i], M.Stone);
  assert.equal(w.cells[i + 1], M.CO2);
  assert.equal(w.temp[i], 92);
  assert.ok(w.fields.pressure[w.fields.index(16, 12)] > 0);
});

test("configured sources cannot deposit undefined or unbounded field values", () => {
  for (const properties of [
    { airSourceRange: 65, airSourceStrength: 0.4 },
    { airSourceRange: 8 },
    { airSourceRange: 8, airSourceStrength: NaN },
    { energyRule: "decay", emissionChance: 0.2 },
    {
      energyRule: "decay",
      emissionChance: 2,
      emissionHeat: 1,
      emissionAirHeat: 1,
    },
    { energyRule: "antimatter" },
    { weather: true, rainTo: "Empty" },
  ])
    assert.throws(() =>
      compileMaterials([empty, profile("Source", properties)]),
    );
});
