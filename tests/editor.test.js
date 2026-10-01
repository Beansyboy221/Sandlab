import test from "node:test";
import assert from "node:assert/strict";
import { EditHistory } from "../src/history.js";
import { shortcutAction } from "../src/shortcuts.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { snapshot } from "../src/persistence.js";

test("undo and redo restore the entire world, including simulation since an edit", () => {
  const world = new World(16, 16),
    history = new EditHistory(world);
  history.remember("Empty world");
  world.set(150, M.Sponge, 85);
  world.storedLiquid[150] = M.Brine;
  world.storedAmount[150] = 12;
  world.fields.add(6, 9, 3);
  world.tick = 24;
  const result = snapshot(world);
  assert.equal(history.undo("Experiment"), "Empty world");
  assert.equal(world.count, 0);
  assert.equal(history.redo("Empty world"), "Experiment");
  assert.deepEqual(snapshot(world), result);
});

test("new edits invalidate redo and history retains only its bounded newest entries", () => {
  const world = new World(16, 16),
    history = new EditHistory(world, 2);
  for (let n = 0; n < 3; n++) {
    history.remember(String(n));
    world.set(100 + n, M.Stone);
  }
  assert.equal(history.past.length, 2);
  assert.equal(history.undo("3"), "2");
  assert.equal(history.undo("2"), "1");
  assert.equal(history.undo("1"), null);
  assert.equal(world.count, 1);
  history.remember("Branch");
  world.set(101, M.Water);
  assert.equal(history.future.length, 0);
  assert.equal(history.redo("Branch"), null);
});

test("desktop shortcuts distinguish command modifiers and preserve browser/text combinations", () => {
  for (const [event, result] of [
    [{ key: "z", ctrlKey: true }, "undo"],
    [{ key: "Z", metaKey: true, shiftKey: true }, "redo"],
    [{ key: "y", ctrlKey: true }, "redo"],
    [{ key: "s", metaKey: true }, "save"],
    [{ key: "S", ctrlKey: true, shiftKey: true }, "export"],
    [{ key: "o", ctrlKey: true }, "import"],
    [{ key: "x", metaKey: true }, "cut"],
    [{ key: "a", ctrlKey: true }, "selectAll"],
    [{ key: "Delete" }, "delete"],
    [{ key: "v" }, "select"],
    [{ key: "?", shiftKey: true }, "help"],
    [{ key: "r", ctrlKey: true }, null],
    [{ key: "e", altKey: true }, null],
    [{ key: "b", isComposing: true }, null],
  ])
    assert.equal(shortcutAction(event), result);
});
