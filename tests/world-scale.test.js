import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { cellMass } from "../src/sim/mechanical-mass.js";
import {
  ViewportNavigation,
  zoomWorld,
  reframeWorld,
} from "../src/viewport-navigation.js";
import { ViewportCache } from "../src/sim/viewport-cache.js";
import { predictHiddenEntities } from "../src/sim/hidden-entities.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { entityCanSpawn, entitySizeMeters } from "../src/sim/entity-metrics.js";
import {
  Settings,
  settingGroups,
  worldSettingGroups,
} from "../src/settings.js";
const mass = (w) =>
  w.cells.reduce((sum, id, i) => sum + (id ? cellMass(w, i) : 0), 0);
const block = (w, id = M.Water) => {
  for (let y = 8; y < 16; y++)
    for (let x = 8; x < 16; x++) w.set(y * w.width + x, id);
};

test("zoom changes physical coverage and fidelity with a constant live grid and conserved bulk mass", () => {
  const w = new World(32, 24);
  block(w);
  const before = mass(w);
  zoomWorld(w, 0.25);
  assert.equal(w.width, 32);
  assert.equal(w.height, 24);
  assert.equal(w.count, 16);
  assert.equal(mass(w), before);
  assert.equal(
    w.viewportState.cache.bytes,
    0,
    "uniform bulk needs no hidden detail cache",
  );
  const tick = w.tick;
  w.step();
  assert.equal(w.tick, tick + 1);
  zoomWorld(w, 0.125);
  assert.equal(mass(w), before);
  assert.equal(w.width, 32);
});
test("only unresolved boundaries are cached, follow motion, and cannot resurrect erased matter", () => {
  const w = new World(32, 24),
    i = 11 * 32 + 15;
  w.set(i, M.Sand, 87);
  w.pigment[i] = 0xffabcdef;
  zoomWorld(w, 0.25);
  assert.ok(w.viewportState.cache.bytes > 0);
  const coarse = w.cells.indexOf(M.Sand),
    x = coarse % w.width,
    y = Math.floor(coarse / w.width);
  w.swap(coarse, coarse + 1);
  zoomWorld(w, 0.125);
  assert.equal(w.count, 1);
  assert.equal(w.temp[w.cells.indexOf(M.Sand)], 87);
  assert.equal(w.pigment[w.cells.indexOf(M.Sand)], 0xffabcdef);
  assert.equal(w.cells[(y * 2 - 12 + 1) * 32 + (x + 1) * 2 - 16 + 1], M.Sand);
  zoomWorld(w, 0.25);
  w.set(w.cells.indexOf(M.Sand), 0);
  zoomWorld(w, 0.125);
  assert.equal(w.count, 0);
});
test("eviction and disabled cache interpolate current coarse state without changing represented mass", () => {
  for (const mb of [0, 0.001]) {
    const w = new World(32, 24);
    w.set(11 * 32 + 15, M.Steel);
    const before = mass(w);
    zoomWorld(w, 0.25, undefined, mb);
    assert.ok(w.viewportState.cache.bytes <= mb * 1048576);
    w.viewportState.cache.setLimit(0);
    zoomWorld(w, 0.125, undefined, 0);
    assert.equal(w.count, 4);
    assert.equal(mass(w), before);
    assert.ok(w.quantity.some((v) => v === 0.25));
    w.rigid.rebuild();
    assert.equal(
      w.rigid.bodies.length,
      1,
      "reconstructed geometry is connected",
    );
  }
});
test("LRU cache stays within byte budget and uniform viewport travel uses only a fixed overview", () => {
  const w = new World(32, 24);
  w.set(20, M.Sand);
  const mask = new Uint8Array(w.length).fill(1),
    cache = new ViewportCache(0.01);
  for (let i = 0; i < 100; i++) {
    w.variant[20] = i;
    cache.capture(w, mask);
    assert.ok(cache.bytes <= cache.limit);
  }
  assert.ok(cache.evictions > 0);
  cache.setLimit(0);
  assert.equal(cache.bytes, 0);
  for (let i = 0; i < 20; i++) reframeWorld(w, { x: i * 0.5, cacheMB: 0 });
  assert.equal(w.viewportState.overview.arrays.cells.length, 128 * 128);
  assert.equal(w.viewportState.cache.bytes, 0);
});
test("coarse structural motion remains live and cached cuts do not join separated shapes", () => {
  const w = new World(48, 40);
  for (let y = 16; y < 20; y++)
    for (let x = 16; x < 24; x++) w.set(y * 48 + x, M.Steel);
  zoomWorld(w, 0.25);
  w.rigid.rebuild();
  assert.equal(w.rigid.bodies.length, 1);
  const before = mass(w);
  for (let i = 0; i < 3; i++) w.step();
  assert.equal(mass(w), before);
  zoomWorld(w, 0.125);
  w.rigid.rebuild();
  assert.equal(w.rigid.bodies.length, 1);
});
test("world rules and overview round-trip; hidden cache is never stored in save files", () => {
  const w = new World(32, 24);
  w.set(11 * 32 + 15, M.Sand);
  zoomWorld(w, 0.25);
  w.mechanics.temperatureSimulation = false;
  w.simulationSpeed = 0.5;
  const data = snapshot(w),
    file = pack(data),
    json = JSON.stringify(file);
  assert.ok(!json.includes("detailRef"));
  assert.ok(!json.includes("detailX"));
  assert.ok(!json.includes("cache"));
  assert.ok(json.length < 30000);
  const loaded = new World(16, 16);
  restore(loaded, unpack(file));
  assert.equal(loaded.viewportState.cache.bytes, 0);
  assert.equal(loaded.metersPerPixel, 0.25);
  assert.equal(loaded.simulationSpeed, 0.5);
  assert.equal(loaded.mechanics.temperatureSimulation, false);
  const before = snapshot(loaded);
  for (const invalid of [
    { ...data, level: { ...data.level, metersPerPixel: 0.13 } },
    { ...data, viewport: { ...data.viewport, pitch: Infinity } },
    {
      ...data,
      viewport: { ...data.viewport, arrays: { cells: [16384, 255] } },
    },
  ]) {
    assert.throws(() => restore(loaded, invalid));
    assert.deepEqual(snapshot(loaded), before);
  }
});
test("unseen velocity prediction respects event time, walls, disabled mode and lifetime", () => {
  const entity = (id, x, vx) => ({
    id,
    material: M["Seeking Missile"],
    x,
    y: 0,
    vx,
    vy: 0,
    life: 400,
    observedTick: 0,
  });
  const overview = {
    actors: [],
    missiles: [entity(1, 0, 1), entity(2, 0, 0)],
    events: [{ tick: 10, x: 0, y: 0, radius: 2 }],
    pitch: 1,
    index: () => -1,
    arrays: { cells: [], quantity: [] },
  };
  predictHiddenEntities(overview, 20);
  assert.equal(overview.missiles.length, 1);
  assert.equal(overview.missiles[0].id, 1);
  assert.equal(overview.missiles[0].x, 20);
  assert.equal(overview.missiles[0].life, 380);
  overview.events = [];
  overview.missiles = [entity(3, 0, 1)];
  predictHiddenEntities(overview, 20, false);
  assert.equal(overview.missiles[0].x, 0);
});
test("entities retain physical geometry, become hidden below one pixel, and restore predicted poses", () => {
  const w = new World(64, 64);
  assert.ok(w.stickmen.spawn(32, 40, M.Player));
  const size = entitySizeMeters(M.Player);
  zoomWorld(w, 2);
  assert.equal(entityCanSpawn(w, M.Player), false);
  assert.equal(w.stickmen.bodies.length, 0);
  const hidden = w.viewportState.overview.actors[0];
  assert.ok(hidden);
  w.tick += 10;
  zoomWorld(w, 1);
  assert.equal(w.stickmen.bodies.length, 1);
  assert.equal(entitySizeMeters(M.Player), size);
  assert.ok(
    Math.abs(
      (Math.max(...w.stickmen.bodies[0].x) -
        Math.min(...w.stickmen.bodies[0].x)) *
        w.metersPerPixel -
        0.125 * 8,
    ) < 1e-5,
  );
});
test("simulation rules belong to worlds and cache preferences persist independently", () => {
  const store = new Map(),
    storage = {
      getItem: (k) => store.get(k),
      setItem: (k, v) => store.set(k, v),
    },
    settings = new Settings(storage),
    w = new World(16, 16);
  settings.set("maxCacheMB", 4);
  assert.equal(new Settings(storage).get("maxCacheMB"), 4);
  w.mechanics.pressureSimulation = false;
  settings.reset();
  assert.equal(w.mechanics.pressureSimulation, false);
  assert.ok(
    !settingGroups
      .flatMap((g) => g.fields)
      .some((f) => f.key === "pressureSimulation"),
  );
  assert.ok(
    worldSettingGroups
      .flatMap((g) => g.fields)
      .some((f) => f.key === "pressureSimulation"),
  );
});

test("integer panning preserves overlapping particles, offsets, bonds and mass", () => {
  const w = new World(48, 40);
  block(w, M.Steel);
  w.set(12 * 48 + 30, M.Sand, 87);
  const i = 12 * 48 + 30;
  w.velocityX[i] = 0.5;
  w.offsetX[i] = 0.25;
  const total = mass(w),
    id = w.elasticId[8 * 48 + 8];
  reframeWorld(w, { x: 0.125, y: 0.125 });
  assert.equal(w.cells[11 * 48 + 29], M.Sand);
  assert.equal(w.temp[11 * 48 + 29], 87);
  assert.equal(w.offsetX[11 * 48 + 29], 0.25);
  assert.equal(w.elasticId[7 * 48 + 7], id);
  assert.equal(mass(w), total);
});
test("nested detail survives several zoom levels and hidden entities respect paused blasts", () => {
  const w = new World(64, 64);
  w.set(31 * 64 + 31, M.Sand);
  zoomWorld(w, 1);
  zoomWorld(w, 0.125);
  assert.equal(w.count, 1);
  w.clear();
  assert.ok(w.stickmen.spawn(32, 40, M.Player));
  zoomWorld(w, 2);
  const actor = w.viewportState.overview.actors[0];
  w.explode(
    (actor.x[2] - w.viewOriginX) / w.metersPerPixel,
    (actor.y[2] - w.viewOriginY) / w.metersPerPixel,
    3,
  );
  zoomWorld(w, 1);
  assert.equal(w.stickmen.bodies.length, 0);
});

test("overview snapshots do not alias later destruction or entity edits", () => {
  const w = new World(32, 24);
  zoomWorld(w, 0.25);
  const data = snapshot(w);
  w.explode(16, 12, 3);
  assert.equal(data.viewport.events.length, 0);
  assert.equal(w.viewportState.overview.events.length, 1);
});
test("buoyant energy and zero-density optical packets survive coarse reconstruction", () => {
  for (const material of [M.Fire, M.Photon, M.Spark]) {
    const w = new World(32, 24);
    w.set(11 * 32 + 15, material);
    zoomWorld(w, 0.25);
    assert.equal(w.count, 1);
    assert.ok(w.quantity[w.cells.indexOf(material)] > 0);
    zoomWorld(w, 0.125);
    assert.equal(w.count, 1);
    assert.equal(w.cells.includes(material), true);
  }
});

test("pause-on-zoom is opt-in, runs before a valid detail change, and ignores pan and limits", () => {
  let stored = null;
  const settings = new Settings({
    getItem: () => stored,
    setItem: (_, v) => (stored = v),
  });
  const w = new World(32, 24),
    calls = [];
  const renderer = { point: () => ({ x: 16, y: 12 }), updateViewport() {} };
  const navigation = new ViewportNavigation(
    w,
    renderer,
    settings,
    () => calls.push("change"),
    () => calls.push(`pause:${w.metersPerPixel}`),
  );
  assert.equal(settings.get("pauseWhenZooming"), false);
  navigation.zoomAt(2, 0, 0);
  assert.deepEqual(calls, ["change"]);
  settings.set("pauseWhenZooming", true);
  assert.equal(
    new Settings({ getItem: () => stored }).get("pauseWhenZooming"),
    true,
  );
  calls.length = 0;
  navigation.zoomAt(0.5, 0, 0);
  assert.deepEqual(calls, ["pause:0.0625", "change"]);
  calls.length = 0;
  navigation.panBy(10, 10);
  assert.deepEqual(calls, []);
  w.metersPerPixel = 0.03125;
  navigation.zoomAt(2, 0, 0);
  assert.deepEqual(calls, []);
});

test("invalid dimensions cannot partially apply a multi-level zoom", () => {
  const w = new World(32, 24);
  block(w);
  const before = snapshot(w);
  assert.throws(() => reframeWorld(w, { pitch: 1, width: 1024 }));
  assert.deepEqual(snapshot(w), before);
  assert.equal(w.viewportState, null);
});

test("invalid hidden prediction metadata leaves an existing world unchanged", () => {
  const w = new World(80, 64);
  assert.ok(w.stickmen.spawn(40, 30, M.Player));
  zoomWorld(w, 0.25);
  const before = snapshot(w);
  for (const [key, value] of [
    ["observedEventSequence", -1],
    ["observedTick", Infinity],
    ["wasActive", "yes"],
  ]) {
    const bad = structuredClone(before);
    bad.viewport.actors[0][key] = value;
    assert.throws(() => restore(w, bad));
    assert.deepEqual(snapshot(w), before);
  }
});
