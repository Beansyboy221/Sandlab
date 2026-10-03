import test from "node:test";
import assert from "node:assert/strict";
import { Settings, settingsKey } from "../src/settings.js";
import { DrawingPause } from "../src/drawing-pause.js";
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
      solidDrawRelease: "invalid",
    }),
  });
  const prefs = new Settings(store);
  assert.equal(prefs.get("bloom"), false);
  assert.equal(prefs.get("view"), "normal");
  assert.equal(prefs.get("speed"), 1);
  assert.equal(prefs.get("brushSize"), 61);
  assert.equal(prefs.get("startPaused"), false);
  assert.equal(prefs.get("unknown"), undefined);
  assert.equal(prefs.get("solidDrawRelease"), "resume");
  prefs.set("autosave", false);
  prefs.set("bloomIntensity", 0.5);
  prefs.set("brushSize", 9);
  prefs.set("solidDrawRelease", "hold");
  const loaded = new Settings(store);
  assert.equal(loaded.get("autosave"), false);
  assert.equal(loaded.get("bloomIntensity"), 0.5);
  assert.equal(loaded.get("brushSize"), 9);
  assert.equal(loaded.get("solidDrawRelease"), "hold");
});
test("legacy radius preferences migrate once to pixel diameters", () => {
  const store = storage({ [settingsKey]: JSON.stringify({ brushSize: 6 }) });
  const prefs = new Settings(store);
  assert.equal(prefs.get("brushSize"), 13);
  prefs.set("brushSize", 4);
  assert.equal(JSON.parse(store.map.get(settingsKey)).brushUnit, "diameter");
  assert.equal(new Settings(store).get("brushSize"), 4);
  prefs.reset();
  assert.equal(new Settings(store).get("brushSize"), 13);
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
  prefs.set("solidDrawRelease", "hold");
  prefs.reset();
  assert.equal(prefs.get("autosave"), true);
  assert.equal(prefs.get("displayQuality"), 2);
  assert.equal(prefs.get("solidDrawRelease"), "resume");
  assert.equal(store.map.get("sandlab.autosave.v1"), "world");
  assert.equal(store.map.get("sandlab.saves.v1"), "named worlds");
});

function drawingFixture(paused = false, release = "resume") {
  const state = { paused },
    settings = new Settings(storage());
  settings.set("solidDrawRelease", release);
  const pause = new DrawingPause(state, settings, (value) => {
    state.paused = value;
  });
  return { state, settings, pause };
}
test("solid drawing resumes only a world that was running before the stroke", () => {
  for (const paused of [false, true]) {
    const f = drawingFixture(paused);
    f.pause.begin(1);
    assert.equal(f.state.paused, true);
    f.pause.end(1);
    assert.equal(f.state.paused, paused);
    f.pause.end(1); // Lost capture after pointerup must have no effect.
    assert.equal(f.state.paused, paused);
  }
});
test("overlapping pointers keep solids fixed until the last drawing pointer lifts", () => {
  const f = drawingFixture();
  f.pause.begin(1);
  f.pause.begin(2);
  f.pause.end(1);
  assert.equal(f.state.paused, true);
  f.pause.end(99);
  assert.equal(f.state.paused, true);
  f.pause.end(2);
  assert.equal(f.state.paused, false);
});
test("stay-paused applies on release; canceled strokes restore prior playback", () => {
  const f = drawingFixture(false, "hold");
  f.pause.begin(1);
  f.pause.end(1);
  assert.equal(f.state.paused, true);
  f.state.paused = false;
  f.pause.begin(2);
  f.pause.cancel();
  assert.equal(f.state.paused, false);
  assert.equal(f.pause.active, false);
  f.state.paused = true;
  f.pause.begin(3);
  f.pause.cancel();
  assert.equal(f.state.paused, true);
});
test("explicit playback changes during drawing prevent automatic resuming", () => {
  const f = drawingFixture();
  f.pause.begin(1);
  f.pause.hold();
  f.pause.end(1);
  assert.equal(f.state.paused, true);
  f.state.paused = false;
  f.pause.begin(2);
  f.pause.cancel();
  assert.equal(f.state.paused, false);
});
