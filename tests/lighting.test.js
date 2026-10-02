import test from "node:test";
import assert from "node:assert/strict";
import { Lighting, emissionStrength } from "../src/lighting.js";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { createLevel, resizeLevel } from "../src/level.js";
import { levelProperties } from "../src/level-properties.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
const cell = (l, x, y, c = 0) =>
  l.light[(Math.floor(y / 4) * l.width + Math.floor(x / 4)) * 3 + c];
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
  assert.ok(l.sourceCount <= 96);
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
  assert.equal(l.length, 4);
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
  assert.ok(l.opacity[12 * l.width + 16] < 1);
});
