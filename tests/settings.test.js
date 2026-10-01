import test from "node:test";
import assert from "node:assert/strict";
import { Settings, settingsKey } from "../src/settings.js";
function storage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    map,
  };
}
test("preferences survive reload and ignore unrecognized or invalid saved values", () => {
  const store = storage({
    [settingsKey]: JSON.stringify({
      bloom: false,
      view: "corrupt",
      speed: 999,
      brushSize: 80,
      startPaused: "true",
      grid: true,
      unknown: "ignore",
    }),
  });
  const prefs = new Settings(store);
  assert.equal(prefs.get("bloom"), false);
  assert.equal(prefs.get("view"), "normal");
  assert.equal(prefs.get("speed"), 1);
  assert.equal(prefs.get("brushSize"), 30);
  assert.equal(prefs.get("startPaused"), false);
  assert.equal(prefs.get("unknown"), undefined);
  prefs.set("autosave", false);
  prefs.set("bloomIntensity", 0.5);
  prefs.set("brushSize", 9);
  const loaded = new Settings(store);
  assert.equal(loaded.get("autosave"), false);
  assert.equal(loaded.get("bloomIntensity"), 0.5);
  assert.equal(loaded.get("brushSize"), 9);
});
test("settings handle corrupt or unavailable storage without blocking live updates", () => {
  const corrupt = new Settings(storage({ [settingsKey]: "{broken" }));
  assert.equal(corrupt.get("bloom"), true);
  const blocked = new Settings({
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("quota");
    },
  });
  let keys;
  blocked.subscribe((updated) => (keys = updated));
  blocked.set("grid", true);
  assert.equal(blocked.get("grid"), true);
  assert.equal(blocked.saved, false);
  assert.deepEqual(keys, ["grid"]);
  blocked.set("grid", "false");
  assert.equal(blocked.get("grid"), true);
  blocked.set("bloomIntensity", NaN);
  assert.equal(blocked.get("bloomIntensity"), 1);
});
test("reset restores preferences without touching world autosaves or named saves", () => {
  const store = storage({
    "sandlab.autosave.v1": "world",
    "sandlab.saves.v1": "named worlds",
  });
  const prefs = new Settings(store);
  prefs.set("autosave", false);
  prefs.set("displayQuality", 1);
  prefs.reset();
  assert.equal(prefs.get("autosave"), true);
  assert.equal(prefs.get("displayQuality"), 2);
  assert.equal(store.map.get("sandlab.autosave.v1"), "world");
  assert.equal(store.map.get("sandlab.saves.v1"), "named worlds");
});
