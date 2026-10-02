import test from "node:test";
import assert from "node:assert/strict";
import { cellAt, cellProperties } from "../src/inspector.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { snapshot } from "../src/persistence.js";
import { Settings } from "../src/settings.js";
import {
  shortcutAction,
  normalizeBindings,
  normalizeChord,
  bindingConflict,
} from "../src/shortcuts.js";

test("inspection reads exact cell state without changing world or accepting letterbox coordinates", () => {
  const world = new World(16, 16);
  world.set(0, M.Fire, 721.25);
  world.life[0] = 28;
  world.charge[0] = 3;
  world.fields.add(0, 0, 2);
  const before = snapshot(world),
    data = cellProperties(world, { x: 0.5, y: 0.2 });
  assert.equal(data.material.name, "Fire");
  assert.deepEqual(data.rows.slice(0, 4), [
    ["Temperature", "721.3°C"],
    ["Lifetime", "28 ticks"],
    ["Charge", "3 ticks"],
    ["Pressure", "2.00"],
  ]);
  assert.deepEqual(snapshot(world), before);
  for (const point of [
    null,
    { x: NaN, y: 1 },
    { x: -0.1, y: 0 },
    { x: 16, y: 0 },
    { x: 0, y: 16 },
    { x: 0, y: Infinity },
  ])
    assert.equal(cellAt(world, point), null);
});
test("inspection reports stored liquids, clone targets, frozen mixtures, and ignition timers", () => {
  const world = new World(16, 16),
    point = { x: 0, y: 0 };
  world.set(0, M.Sponge);
  world.storedLiquid[0] = M.Brine;
  world.storedAmount[0] = 23;
  assert.ok(
    cellProperties(world, point).rows.some(
      ([label, value]) => label === "Absorbed" && value === "Brine · 23 / 48",
    ),
  );
  world.set(0, M.Ice);
  world.residue[0] = M.Brine;
  assert.ok(
    cellProperties(world, point).rows.some(
      ([label, value]) => label === "Frozen from" && value === "Brine",
    ),
  );
  world.set(0, M.Clone);
  world.clone[0] = M.Water;
  assert.ok(
    cellProperties(world, point).rows.some(
      ([label, value]) => label === "Clones" && value === "Water",
    ),
  );
  world.set(0, M.TNT);
  world.life[0] = 32;
  assert.ok(
    cellProperties(world, point).rows.some(
      ([label, value]) => label === "Ignition timer" && value === "32 ticks",
    ),
  );
});
test("custom bindings replace defaults, preserve modifier distinctions, and expose conflicts", () => {
  const bindings = {
    pause: ["Space", "k"],
    undo: ["Mod+u"],
    inspect: ["Alt+m"],
    paint: [],
  };
  assert.equal(shortcutAction({ key: "p" }, bindings), null);
  assert.equal(shortcutAction({ key: "k" }, bindings), "pause");
  assert.equal(shortcutAction({ key: " " }, bindings), "pause");
  assert.equal(shortcutAction({ key: "u", metaKey: true }, bindings), "undo");
  assert.equal(shortcutAction({ key: "u", ctrlKey: true }, bindings), "undo");
  assert.equal(
    shortcutAction({ key: "u", ctrlKey: true, shiftKey: true }, bindings),
    null,
  );
  assert.equal(shortcutAction({ key: "m", altKey: true }, bindings), "inspect");
  assert.equal(shortcutAction({ key: "b" }, bindings), null);
  assert.equal(shortcutAction({ key: "+", shiftKey: true }), "larger");
  assert.equal(bindingConflict("k", "step", bindings).id, "pause");
  assert.equal(
    bindingConflict("k", "pause", { ...bindings, fill: [] }),
    undefined,
  );
  assert.equal(normalizeChord("Shift+Mod+Z"), "Mod+Shift+z");
  assert.equal(normalizeChord("Mod+Mod+z"), null);
});
test("binding validation drops corrupt or unknown entries and preferences survive reload/reset", () => {
  const loaded = normalizeBindings({
    pause: ["k", "k"],
    paint: [],
    undo: ["Mod+u"],
    erase: ["badkey"],
    help: ["a", "b", "c"],
    unknown: ["j"],
  });
  assert.deepEqual(loaded, { pause: ["k"], paint: [], undo: ["Mod+u"] });
  assert.equal(normalizeBindings([]), undefined);
  const map = new Map(),
    storage = {
      getItem: (key) => map.get(key),
      setItem: (key, value) => map.set(key, value),
    },
    settings = new Settings(storage);
  settings.set("shortcuts", loaded);
  const reloaded = new Settings(storage);
  assert.deepEqual(reloaded.get("shortcuts"), loaded);
  assert.equal(
    shortcutAction({ key: "k" }, reloaded.get("shortcuts")),
    "pause",
  );
  reloaded.reset();
  assert.deepEqual(reloaded.get("shortcuts"), {});
  assert.equal(
    shortcutAction({ key: "p" }, reloaded.get("shortcuts")),
    "pause",
  );
});
