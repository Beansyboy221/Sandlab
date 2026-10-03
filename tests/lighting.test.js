import test from "node:test";
import assert from "node:assert/strict";
import { Lighting, emissionStrength, LIGHT_CELL } from "../src/lighting.js";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { createLevel, resizeLevel } from "../src/level.js";
import { levelProperties } from "../src/level-properties.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
const cell = (l, x, y, c = 0) =>
  l.light[
    (Math.floor(y / l.cellSize) * l.width + Math.floor(x / l.cellSize)) * 3 + c
  ];
const put = (w, x, y, id, temp) => w.set(y * w.width + x, M[id], temp);
test("localized lights fall off radially, remain finite, and have bounded source work", () => {
  const w = new World(160, 120),
    l = new Lighting();
  put(w, 40, 60, "Lamp");
  l.update(w, 0);
  assert.ok(cell(l, 44, 60) > 0.8);
  assert.ok(cell(l, 60, 60) > cell(l, 80, 60));
  assert.equal(cell(l, 150, 10), 0);
  assert.ok(Math.abs(cell(l, 60, 60) - cell(l, 40, 80)) < 0.1);
  assert.ok(l.light.every((v) => Number.isFinite(v) && v >= 0 && v <= 3));
  const dense = new World(512, 256);
  dense.cells.fill(M.Fire);
  dense.temp.fill(680);
  l.update(dense);
  assert.ok(l.sourceCount <= 24);
  assert.ok(l.light.every(Number.isFinite));
  assert.ok(
    cell(l, 4, 4) > 0 && cell(l, 508, 252) > 0,
    "sources are merged spatially, never dropped by row",
  );
});
test("one-pixel opaque walls cast shadows while glass and water transmit light", () => {
  for (const material of ["Wall", "Glass", "Water"]) {
    const w = new World(160, 100),
      l = new Lighting();
    put(w, 40, 50, "Lamp");
    for (let y = 0; y < 100; y++) put(w, 65, y, material);
    l.update(w, 0);
    assert.ok(cell(l, 62, 50) > 0.05, "front surface receives light");
    if (material === "Wall") assert.equal(cell(l, 80, 50), 0);
    else assert.ok(cell(l, 80, 50) > 0.001, material);
  }
});
test("reflected light faintly reaches a shadowed corner and never crosses sealed walls", () => {
  const w = new World(160, 100),
    l = new Lighting();
  put(w, 40, 40, "Lamp");
  for (let y = 16; y < 76; y++) put(w, 64, y, "Wall");
  l.update(w, 0.2);
  let bounced = 0;
  for (let y = 0; y < l.height; y++)
    for (let x = 17; x < l.width; x++) {
      const i = (y * l.width + x) * 3;
      if (l.direct[i] === 0 && l.reflected[i] > 0) bounced++;
    }
  assert.ok(bounced > 0, "one reflected pass lights around a corner");
  assert.ok(Math.max(...l.reflected) < Math.max(...l.direct) * 0.21);
  l.update(w, 0);
  assert.ok(l.reflected.every((v) => v === 0));
  for (let y = 0; y < 100; y++) put(w, 64, y, "Wall");
  l.update(w, 0.2);
  assert.equal(cell(l, 80, 40), 0);
});
test("emission follows combustion, electrical charge and heat rather than generic light particles", () => {
  for (const name of ["Fire", "Spark", "Lightning", "Lamp"])
    assert.ok(emissionStrength(materials[M[name]], 20, 0, 0) > 0);
  assert.equal(emissionStrength(materials[M.Sand], 20, 0, 0), 0);
  assert.ok(emissionStrength(materials[M.Steel], 1000, 0, 0) > 0);
  assert.ok(emissionStrength(materials[M.Wood], 20, 10, 0) > 0);
  assert.ok(emissionStrength(materials[M.Copper], 20, 0, 8) > 0);
  assert.equal(M.Light, undefined);
});
test("lighting honors looping boundaries, resizing and removed lights without stale radiance", () => {
  const w = new World(160, 100),
    l = new Lighting();
  put(w, 2, 50, "Lamp");
  w.border = "looping";
  l.update(w, 0);
  assert.ok(cell(l, 156, 50) > 0.7);
  w.clear();
  l.update(w);
  assert.ok(l.light.every((v) => v === 0));
  const tiny = new World(8, 8);
  tiny.set(0, M.Lamp);
  tiny.border = "looping";
  l.update(tiny);
  assert.equal(l.length, 16);
  assert.ok(l.light.every(Number.isFinite));
});
test("ambient light persists through creation, saves, history-compatible snapshots, resize and legacy imports", () => {
  const w = createLevel({
    name: "Dark",
    width: 80,
    height: 60,
    border: "solid",
    background: "#335577",
    ambientLight: 0.12,
  });
  w.set(10, M.Lamp);
  const saved = snapshot(w);
  restore(w, unpack(pack(saved)));
  assert.equal(w.ambientLight, 0.12);
  const resized = resizeLevel(
    w,
    { ...levelProperties(w), width: 100, height: 80 },
    0,
    0,
  );
  assert.equal(resized.ambientLight, 0.12);
  const old = structuredClone(saved);
  delete old.level.ambientLight;
  restore(w, old);
  assert.equal(w.ambientLight, 1);
  for (const value of [null, -0.1, 1.1, NaN, ".2", {}]) {
    const bad = structuredClone(saved);
    bad.level.ambientLight = value;
    assert.throws(() => restore(w, bad));
  }
});

test("incandescent pools illuminate their exposed rim and buried emitters do not transmit through enclosing matter", () => {
  const w = new World(160, 120),
    l = new Lighting();
  for (let y = 64; y < 116; y++)
    for (let x = 16; x < 144; x++) w.set(y * 160 + x, M.Lava, 1300);
  l.update(w, 0);
  assert.ok(cell(l, 80, 52) > 0.1, "aligned pool rim still casts light");
  w.clear();
  for (let y = 20; y < 80; y++)
    for (let x = 20; x < 100; x++) w.set(y * 160 + x, M.Wall, 20);
  w.temp[48 * 160 + 48] = 1500;
  l.update(w, 0);
  assert.equal(cell(l, 108, 48), 0);
});

test("a filled glass tile remains transmissive instead of being mistaken for an opaque wall", () => {
  const w = new World(160, 100),
    l = new Lighting();
  w.set(50 * 160 + 40, M.Lamp);
  for (let y = 0; y < 100; y++)
    for (let x = 64; x < 68; x++) w.set(y * 160 + x, M.Glass);
  l.update(w, 0);
  assert.ok(cell(l, 80, 50) > 0.005);
  assert.ok(
    l.opacity[
      Math.floor(50 / LIGHT_CELL) * l.width + Math.floor(64 / LIGHT_CELL)
    ] < 1,
  );
});

test("particle visibility preserves narrow openings and follows diagonal silhouettes", () => {
  const w = new World(100, 80),
    l = new Lighting();
  for (let y = 0; y < 80; y++) if (y !== 40) w.set(y * 100 + 51, M.Wall);
  l.update(w, 0);
  assert.equal(
    l.trace(20.5, 40.5, 80.5, 40.5),
    1,
    "one-pixel opening transmits light",
  );
  assert.equal(
    l.trace(20.5, 39.5, 80.5, 39.5),
    0,
    "adjacent wall still blocks light",
  );
  w.clear();
  for (let p = 30; p <= 50; p++) w.set(p * 100 + p, M.Wall);
  l.update(w, 0);
  assert.equal(l.trace(20.5, 40.5, 60.5, 40.5), 0);
  assert.equal(l.trace(20.5, 20.5, 60.5, 20.5), 1);
  // Exact grid-corner endpoints must terminate in all directions.
  for (const [x, y] of [
    [20, 20],
    [60, 20],
    [20, 60],
    [60, 60],
  ])
    assert.ok(Number.isFinite(l.trace(40.5, 40.5, x, y)));
});

test("stationary optical inputs are reused but paused edits, paint and settings invalidate them", () => {
  const w = new World(100, 80),
    l = new Lighting();
  w.set(40 * 100 + 20, M.Lamp);
  assert.equal(l.update(w), true);
  assert.equal(l.update(w), false);
  w.tick++;
  assert.equal(
    l.update(w),
    false,
    "simulation ticks alone do not change optics",
  );
  w.set(40 * 100 + 40, M.Wall);
  assert.equal(l.update(w), true);
  w.pigment[40 * 100 + 40] = 0xffff0000;
  assert.equal(l.update(w), true);
  assert.equal(l.update(w, 0.2), true);
  w.border = "looping";
  assert.equal(l.update(w, 0.2), true);
  w.clear();
  assert.equal(l.update(w, 0.2), true);
  assert.ok(l.light.every((v) => v === 0));
});

test("shadow depth rays remain finite for emitters on integer grid boundaries", () => {
  const w = new World(100, 80),
    l = new Lighting();
  for (let y = 0; y < 80; y++) w.set(y * 100 + 40, M.Wall);
  l.update(w, 0);
  l.shadows.prepare(l, 20, 20, 60);
  assert.ok(l.shadows.depth.every(Number.isFinite));
  assert.ok(Math.abs(l.shadows.depth[0] - 20) < 1e-5);
});

test("smoke transport reuses bounded angular paths instead of tracing every lit sample", () => {
  const w = new World(160, 100),
    l = new Lighting();
  w.cells.fill(M.Smoke);
  w.cells[50 * w.width + 30] = M.Fire;
  w.temp.fill(20);
  l.resize(w);
  l.gather(w);
  const s = l.shadows;
  s.prepare(l, 30.37, 50.29, 96);
  assert.equal(
    s.enabled,
    false,
    "transparent-only worlds still cache attenuation",
  );
  assert.equal(s.filtered, true);
  let samples = 0;
  for (let y = 10; y < 90; y += 2)
    for (let x = 40; x < 120; x += 2) {
      const distance = Math.hypot(x + 0.23 - 30.37, y + 0.17 - 50.29);
      const cached = s.visibility(x + 0.23, y + 0.17, distance, l.cellSize);
      const exact = l.trace(30.37, 50.29, x + 0.23, y + 0.17, true);
      assert.ok(
        Math.abs(cached - exact) < 0.04,
        "smoke attenuation follows the exact reference",
      );
      samples++;
    }
  assert.ok(
    s.exactQueries < samples / 20,
    "diffuse smoke does not retrace long paths",
  );
  assert.ok(
    s.raySteps <= 768 * (96 * 2 + 2),
    "ray traversal is bounded by radius, not sample count",
  );
  const buffer = s.attenuation;
  s.prepare(l, 30.5, 50.5, 56);
  assert.equal(
    s.attenuation,
    buffer,
    "reuse the scratch allocation for smaller sources",
  );
});

test("cached filters refresh after removal and preserve walls, narrow vents and wrapped smoke", () => {
  const w = new World(160, 100),
    l = new Lighting();
  for (let y = 0; y < 100; y++) {
    w.set(y * w.width + 48, M.Smoke);
    if (y !== 50) w.set(y * w.width + 64, M.Wall);
  }
  w.set(50 * w.width + 30, M.Fire);
  l.update(w, 0);
  const s = l.shadows;
  s.prepare(l, 30.5, 50.5, 96);
  assert.ok(
    s.visibility(90.5, 50.5, 60, 2) > 0.9,
    "a one-pixel vent survives filtering",
  );
  assert.equal(s.visibility(90.5, 40.5, Math.hypot(60, 10), 2), 0);
  w.clear();
  l.update(w, 0);
  s.prepare(l, 30.5, 50.5, 96);
  assert.equal(
    s.visibility(90.5, 50.5, 60, 2),
    1,
    "removed smoke leaves no stale attenuation",
  );
  w.border = "looping";
  w.cells.fill(M.Smoke);
  l.update(w, 0);
  s.prepare(l, 2.5, 50.5, 96);
  const cached = s.visibility(-20.5, 50.5, 23, 2);
  assert.ok(Math.abs(cached - l.trace(2.5, 50.5, -20.5, 50.5, true)) < 0.04);
});

test("light reaches distant surfaces and lightning uses a bounded scene flash", () => {
  const w = new World(320, 200),
    l = new Lighting();
  w.set(100 * w.width + 40, M.Fire);
  l.update(w, 0);
  assert.ok(
    cell(l, 142, 100) > 0.0005,
    "ordinary light fades beyond the previous 96-pixel cutoff",
  );
  w.clear();
  for (let y = 0; y < 190; y++) w.set(y * w.width + 40, M.Lightning, 1800, 8);
  l.update(w, 0);
  assert.equal(l.flash, 1);
  assert.equal(l.sourceCount, 0, "bolt segments do not multiply shadow casts");
  w.life.fill(2);
  l.update(w, 0);
  assert.equal(l.flash, 0.25);
  w.clear();
  l.update(w, 0);
  assert.equal(l.flash, 0, "no stale flash after clearing the world");
});

test("reconstruction caches silhouettes and locally rebuilds edits while ignoring moving smoke", async () => {
  const { LightReconstruction } =
    await import("../src/light-reconstruction.js");
  const w = new World(160, 100),
    l = new Lighting(),
    r = new LightReconstruction();
  l.update(w, 0);
  r.prepare(l);
  assert.equal(r.work, w.length);
  w.set(50 * w.width + 40, M.Fire);
  w.set(40 * w.width + 60, M.Smoke);
  l.update(w, 0);
  r.prepare(l);
  assert.equal(
    r.work,
    0,
    "brightness and transparent material changes reuse stencils",
  );
  w.set(50 * w.width + 40, M.Wall);
  l.update(w, 0);
  r.prepare(l);
  assert.ok(
    r.work > 0 && r.work <= 4 * 256,
    "one silhouette edit invalidates nearby chunks only",
  );
  const rebuiltWeights = Array.from(r.weights),
    rebuiltIndices = Array.from(r.indices);
  l.dirtySilhouette.fill(1);
  r.prepare(l);
  assert.deepEqual(
    Array.from(r.weights),
    rebuiltWeights,
    "local invalidation matches a complete rebuild",
  );
  assert.deepEqual(Array.from(r.indices), rebuiltIndices);
  w.set(50 * w.width + 40, 0);
  l.update(w, 0);
  r.prepare(l);
  assert.ok(r.work > 0, "removed walls invalidate the same region");
  assert.ok(r.weights.every(Number.isFinite));
});

test("smoke disperses a faint bounded incident-colored bounce without crossing sealed walls", () => {
  const w = new World(160, 100),
    l = new Lighting();
  w.set(50 * w.width + 30, M.Fire);
  for (let y = 20; y < 80; y++)
    for (let x = 40; x < 60; x++) w.set(y * w.width + x, M.Smoke);
  for (let y = 0; y < 100; y++) w.set(y * w.width + 64, M.Wall);
  l.update(w, 0.2);
  const i = (25 * l.width + 25) * 3;
  assert.ok(l.reflected[i] > 0, "lit smoke scatters incident light");
  assert.ok(l.reflected[i] < l.direct[i] * 0.2, "scattering remains faint");
  assert.equal(cell(l, 80, 50), 0, "sealed wall still blocks scattered light");
});
