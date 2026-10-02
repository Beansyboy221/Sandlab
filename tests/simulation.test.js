import { saveWorld, getSaves } from "../src/persistence.js";
import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { react } from "../src/sim/reactions.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
const index = (w, x, y) => y * w.width + x;
const run = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
const count = (w, id) => w.cells.reduce((n, v) => n + (v === id), 0);
test("sand falls, settles within boundaries, and conserves particles", () => {
  const w = new World(30, 30);
  w.brush(15, 2, 3, M.Sand);
  const n = w.count;
  run(w, 70);
  assert.equal(w.count, n);
  assert.equal(w.cells.slice(0, 600).includes(M.Sand), false);
  assert.equal(
    w.chunks.reduce((a, b) => a + b, 0),
    n,
  );
});
test("sand sinks through water and oil floats above it", () => {
  const w = new World(12, 20);
  for (let y = 10; y < 20; y++)
    for (let x = 0; x < 12; x++) w.set(index(w, x, y), M.Water);
  w.set(index(w, 6, 4), M.Sand);
  w.set(index(w, 7, 18), M.Oil);
  run(w, 100);
  let sandY = 0,
    oilY = 99;
  for (let i = 0; i < w.length; i++) {
    if (w.cells[i] === M.Sand) sandY = (i / w.width) | 0;
    if (w.cells[i] === M.Oil) oilY = (i / w.width) | 0;
  }
  assert.equal(sandY, 19);
  assert.ok(oilY <= 10, `oil at ${oilY}`);
});
test("temperature transfer is conservative between particles", () => {
  const w = new World(10, 10),
    a = 44,
    b = 45;
  w.set(a, M.Steel, 100);
  w.set(b, M.Steel, 20);
  w.transferHeat(a, b);
  assert.ok(w.temp[a] < 100);
  assert.ok(w.temp[b] > 20);
  assert.ok(Math.abs(w.temp[a] + w.temp[b] - 120) < 0.001);
});
test("registry phase transitions: water, steam, ice, lava, snow and metal", () => {
  for (const [id, temp, expected] of [
    [M.Water, 120, M.Steam],
    [M.Steam, 30, M.Water],
    [M.Ice, 10, M.Water],
    [M.Lava, 600, M.Stone],
    [M.Snow, 10, M.Water],
    [M.Steel, 1500, M["Molten steel"]],
  ]) {
    const w = new World(10, 10);
    w.set(55, id, temp);
    react(w, 55, 5, 5);
    assert.equal(w.cells[55], expected, materials[id].name);
  }
});
test("combustion burns fuel in place and water quenches fire", () => {
  const w = new World(10, 10);
  w.set(55, M.Wood, 600);
  for (let n = 0; n < 60 && !w.life[55]; n++) react(w, 55, 5, 5);
  assert.equal(w.cells[55], M.Wood);
  assert.ok(w.life[55] > 0);
  w.set(55, M.Fire);
  w.set(56, M.Water);
  react(w, 55, 5, 5);
  assert.equal(w.cells[55], M.Smoke);
  assert.equal(w.cells[56], M.Water);
  assert.ok(w.temp[56] > 20 && w.temp[56] < 100);
});
test("electric pulse crosses a wire, then recovers for another pulse", () => {
  const w = new World(30, 10);
  for (let x = 3; x < 26; x++) {
    w.set(index(w, x, 5), M.Steel);
    w.set(index(w, x, 6), M.Wall);
  }
  w.set(index(w, 2, 5), M.Spark);
  let reached = false;
  for (let t = 0; t < 50; t++) {
    w.step();
    reached ||= w.charge[index(w, 25, 5)] > 0;
  }
  assert.ok(reached);
  run(w, 50);
  assert.equal(
    w.charge.reduce((a, b) => a + b, 0),
    0,
  );
});
test("acid attacks stone but cannot dissolve glass", () => {
  const w = new World(10, 10);
  w.set(55, M["Acid"]);
  w.set(56, M.Wood);
  w.set(54, M.Glass);
  for (let i = 0; i < 100; i++) react(w, 55, 5, 5);
  assert.equal(w.cells[56], 0);
  assert.equal(w.cells[54], M.Glass);
});
test("water dissolves salt and cures cement", () => {
  const w = new World(10, 10);
  w.set(55, M.Water);
  w.set(56, M.Salt);
  react(w, 55, 5, 5);
  assert.equal(w.cells[55], M.Brine);
  assert.equal(w.cells[56], 0);
  w.set(55, M.Water);
  w.set(56, M.Cement);
  react(w, 55, 5, 5);
  assert.equal(w.cells[56], M.Concrete);
});
test("explosion heats adjacent explosives, preserves ceramic and emits pressure", () => {
  const w = new World(50, 40);
  w.set(index(w, 20, 20), M.TNT, 250);
  w.set(index(w, 25, 20), M.TNT);
  w.set(index(w, 19, 20), M.Ceramic);
  for (let n = 0; n < 45; n++) react(w, index(w, 20, 20), 20, 20);
  assert.ok(w.temp[index(w, 25, 20)] > 200);
  assert.equal(w.cells[index(w, 19, 20)], M.Ceramic);
  assert.ok(w.fields.pressure.some((v) => v > 0));
});
test("clones learn liquids and voids consume neighboring cells", () => {
  const w = new World(10, 10);
  w.set(55, M.Clone);
  w.set(56, M.Water);
  for (let i = 0; i < 10; i++) react(w, 55, 5, 5);
  assert.equal(w.clone[55], M.Water);
  assert.ok(count(w, M.Water) > 1);
  w.set(55, M.Void);
  react(w, 55, 5, 5);
  assert.equal(w.cells[56], 0);
});
test("RLE save roundtrip preserves all fields and deterministic continuation", () => {
  const w = new World(30, 30);
  w.brush(15, 3, 4, M.Sand);
  w.brush(15, 25, 4, M.Water);
  run(w, 10);
  const data = unpack(JSON.parse(JSON.stringify(pack(snapshot(w))))),
    other = new World(30, 30);
  restore(other, data);
  assert.deepEqual(other.cells, w.cells);
  assert.deepEqual(other.temp, w.temp);
  run(w, 20);
  run(other, 20);
  assert.deepEqual(other.cells, w.cells);
  assert.deepEqual(other.temp, w.temp);
  assert.equal(other.count, w.count);
});
test("invalid save is rejected before mutating the world", () => {
  const w = new World(10, 10);
  w.set(55, M.Sand);
  const data = snapshot(w);
  data.arrays.cells[0] = 254;
  assert.throws(() => restore(w, data));
  assert.equal(w.cells[55], M.Sand);
});
test("seeded identical input produces identical simulation", () => {
  const a = new World(40, 30),
    b = new World(40, 30);
  for (const w of [a, b]) {
    w.brush(10, 5, 6, M.Water);
    w.brush(25, 5, 6, M.Sand);
    run(w, 50);
  }
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.temp, b.temp);
});
test("pressure diffusion stays finite and decays", () => {
  const w = new World(32, 32);
  w.fields.add(16, 16, 50);
  run(w, 100);
  assert.ok(w.fields.pressure.every(Number.isFinite));
  assert.ok(Math.max(...w.fields.pressure) < 0.05);
});

test("settled chunks wake immediately when a supporting floor is erased", () => {
  const w = new World(64, 64);
  for (let x = 0; x < 64; x++) w.set(index(w, x, 35), M.Wall);
  w.brush(30, 25, 5, M.Sand);
  run(w, 120);
  const before = w.cells.slice();
  for (let x = 24; x < 37; x++) w.set(index(w, x, 35), 0);
  run(w, 20);
  assert.ok(w.cells.slice(36 * 64).includes(M.Sand));
  assert.notDeepEqual(w.cells, before);
});
test("heat sources keep working in settled chunks", () => {
  const w = new World(32, 32);
  w.set(index(w, 15, 20), M.Heater);
  w.set(index(w, 16, 20), M.Steel);
  w.set(index(w, 16, 21), M.Wall);
  w.set(index(w, 17, 20), M.Wall);
  w.set(index(w, 16, 19), M.Wall);
  run(w, 120);
  assert.ok(w.temp[index(w, 16, 20)] > 200);
  w.set(index(w, 15, 20), M.Cooler);
  run(w, 300);
  assert.ok(w.temp[index(w, 16, 20)] < 0);
});
test("cross-device saves resize a world atomically and continue to run", () => {
  const phone = new World(200, 300);
  phone.brush(100, 15, 5, M.Sand);
  const desktop = new World(320, 200);
  restore(desktop, unpack(pack(snapshot(phone))));
  assert.equal(desktop.width, 200);
  assert.equal(desktop.height, 300);
  run(desktop, 30);
  assert.equal(desktop.count, phone.count);
  assert.equal(
    desktop.chunks.reduce((a, b) => a + b, 0),
    desktop.count,
  );
});
test("malformed clone IDs and overflowing temperatures cannot corrupt a world", () => {
  const w = new World(20, 20);
  w.set(55, M.Sand);
  for (const [field, value] of [
    ["clone", 255],
    ["temp", 1e300],
    ["life", -1],
  ]) {
    const bad = snapshot(w);
    bad.arrays[field][55] = value;
    assert.throws(() => restore(w, bad));
    assert.equal(w.cells[55], M.Sand);
  }
});
test("a cold electrical pulse cannot reach the end of a long wire in one tick", () => {
  const w = new World(40, 12);
  for (let x = 3; x < 36; x++) {
    w.set(index(w, x, 6), M.Steel);
    w.set(index(w, x, 7), M.Wall);
  }
  w.set(index(w, 2, 6), M.Spark);
  w.step();
  assert.equal(w.charge[index(w, 35, 6)], 0);
  run(w, 40);
  assert.ok(w.cooldown[index(w, 35, 6)] > 0);
});
test("save continuation remains deterministic after chunks settle", () => {
  const a = new World(40, 40);
  a.brush(20, 15, 8, M.Water);
  a.brush(8, 8, 4, M.Sand);
  run(a, 160);
  const b = new World(40, 40);
  restore(b, unpack(pack(snapshot(a))));
  run(a, 60);
  run(b, 60);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.temp, b.temp);
  assert.equal(a.seed, b.seed);
});
test("water cannot cure several cement particles after being consumed", () => {
  const w = new World(10, 10);
  w.set(55, M.Water);
  for (const i of [54, 56, 45, 65]) w.set(i, M.Cement);
  react(w, 55, 5, 5);
  assert.equal(count(w, M.Concrete), 1);
  assert.equal(count(w, M.Cement), 3);
});
test("mixed material stress preserves finite state and occupancy invariants", () => {
  const w = new World(64, 48);
  for (let i = 0; i < w.length; i++)
    if (w.random() < 0.3)
      w.set(i, 1 + Math.floor(w.random() * (materials.length - 1)));
  run(w, 140);
  assert.ok(w.temp.every(Number.isFinite));
  assert.ok(w.cells.every((v) => v < materials.length));
  assert.equal(
    w.count,
    w.cells.reduce((a, b) => a + Boolean(b), 0),
  );
  assert.equal(
    w.count,
    w.chunks.reduce((a, b) => a + b, 0),
  );
});

test("a ninth named save cannot evict an existing world", () => {
  const store = new Map(),
    previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    },
  });
  try {
    const w = new World(10, 10);
    w.set(55, M.Sand);
    for (let n = 0; n < 8; n++) saveWorld(w, `World ${n}`, "");
    const before = JSON.stringify(getSaves());
    assert.throws(() => saveWorld(w, "Ninth world", ""), /eight saved worlds/);
    assert.equal(JSON.stringify(getSaves()), before);
    assert.equal(getSaves().length, 8);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("flames have slight seeded lifetime variation, including explicit lifetimes", () => {
  const w = new World(32, 20);
  for (let i = 0; i < 100; i++) w.set(i, M.Fire);
  const values = w.life.slice(0, 100);
  assert.ok(new Set(values).size > 3);
  assert.ok(values.every((v) => v >= 38 && v <= 52));
  for (let i = 100; i < 200; i++) w.set(i, M.Fire, 700, 20);
  assert.ok(w.life.slice(100, 200).every((v) => v >= 17 && v <= 23));
});
test("burning wood emits smoke while the source still exists, then becomes ash", () => {
  const w = new World(40, 40),
    source = index(w, 20, 28);
  w.set(source, M.Wood, 700);
  w.set(source + w.width, M.Wall);
  let smokeDuringBurn = false;
  for (let n = 0; n < 260; n++) {
    w.step();
    if (
      w.cells[source] === M.Wood &&
      w.life[source] > 0 &&
      count(w, M.Smoke) > 0
    )
      smokeDuringBurn = true;
  }
  assert.ok(smokeDuringBurn);
  assert.ok(count(w, M.Ash) > 0);
  assert.equal(count(w, M.Wood), 0);
});
test("one flame ignites a cold surface and spreads across its exposed top", () => {
  const w = new World(80, 60);
  for (let y = 42; y < 45; y++)
    for (let x = 8; x < 72; x++) w.set(index(w, x, y), M.Wood);
  for (let x = 8; x < 72; x++) w.set(index(w, x, 45), M.Wall);
  w.set(index(w, 10, 41), M.Fire);
  let farthest = 0,
    smoke = false;
  // Friction holds the slab in place; allow the flame front to advance without
  // depending on fuel sliding sideways into the initial flame.
  for (let n = 0; n < 560; n++) {
    w.step();
    for (let x = 8; x < 72; x++)
      if (w.cells[index(w, x, 42)] === M.Wood && w.life[index(w, x, 42)])
        farthest = Math.max(farthest, x);
    smoke ||= count(w, M.Smoke) > 0;
  }
  assert.ok(farthest >= 25, `fire only reached x=${farthest}`);
  assert.ok(smoke);
  assert.ok(
    w.cells.slice(44 * w.width, 45 * w.width).includes(M.Wood),
    "deep fuel must not vanish immediately",
  );
});
test("enclosed fuel cannot ignite without an exposed oxidizing face", () => {
  const w = new World(20, 20);
  w.set(210, M.Wood, 700);
  for (const j of [209, 211, 190, 230]) w.set(j, M.Ceramic);
  for (let n = 0; n < 50; n++) react(w, 210, 10, 10);
  assert.equal(w.life[210], 0);
  assert.equal(w.cells[210], M.Wood);
  assert.equal(count(w, M.Fire), 0);
});
test("cold water extinguishes a burning solid fuel surface", () => {
  const w = new World(20, 20);
  w.set(210, M.Wood, 700);
  for (let n = 0; n < 50 && !w.life[210]; n++) react(w, 210, 10, 10);
  assert.ok(w.life[210]);
  w.set(211, M.Water, 20);
  react(w, 210, 10, 10);
  assert.equal(w.life[210], 0);
  assert.ok(w.temp[210] <= 100);
  assert.equal(w.cells[210], M.Wood);
});
test("surface flames do not jump a noncombustible break or wrap across grid edges", () => {
  const w = new World(72, 52);
  for (let x = 0; x < 72; x++)
    w.set(index(w, x, 40), x < 24 || x > 49 ? M.Wood : M.Ceramic);
  for (let x = 0; x < 72; x++) w.set(index(w, x, 41), M.Wall);
  w.set(index(w, 0, 39), M.Fire);
  run(w, 240);
  for (let x = 50; x < 72; x++) {
    assert.equal(w.cells[index(w, x, 40)], M.Wood);
    assert.equal(w.life[index(w, x, 40)], 0);
  }
});
test("burning state survives export/import and continues deterministically", () => {
  const a = new World(40, 40);
  for (let x = 5; x < 35; x++) {
    a.set(index(a, x, 30), M.Wood);
    a.set(index(a, x, 31), M.Wall);
  }
  a.set(index(a, 7, 29), M.Fire);
  run(a, 80);
  assert.ok(a.life.some((v, i) => v && a.cells[i] === M.Wood));
  const b = new World(40, 40);
  restore(b, unpack(pack(snapshot(a))));
  run(a, 80);
  run(b, 80);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.life, b.life);
  assert.deepEqual(a.temp, b.temp);
  assert.equal(a.seed, b.seed);
});

test("blocking oxygen pauses a burning fuel countdown without renewing it", () => {
  const w = new World(20, 20),
    i = 210;
  w.set(i, M.Wood, 700);
  w.life[i] = 70;
  for (const j of [209, 211, 190, 230]) w.set(j, M.Ceramic);
  react(w, i, 10, 10);
  assert.equal(w.life[i], 70);
  assert.equal(count(w, M.Fire), 0);
  w.set(190, 0);
  react(w, i, 10, 10);
  assert.equal(w.life[i], 69);
});
test("water below oil allows surface combustion, and side splashes are symmetric", () => {
  for (const side of [-1, 1]) {
    const w = new World(20, 20),
      i = 210;
    w.set(i, M.Oil, 700);
    w.life[i] = 70;
    w.set(i + 20, M.Water, 20);
    react(w, i, 10, 10);
    assert.equal(w.life[i], 69);
    w.set(i + side, M.Water, 20);
    react(w, i, 10, 10);
    assert.equal(w.life[i], 0);
    assert.ok(w.temp[i] <= 100);
  }
});

test("seeds germinate in moist soil, grow upward, and stop growing in freezing conditions", () => {
  const w = new World(24, 32);
  for (let y = 24; y < 32; y++)
    for (let x = 0; x < 24; x++) {
      w.set(index(w, x, y), M.Dirt);
      w.moisture[index(w, x, y)] = 210;
    }
  for (let x = 3; x < 22; x += 4) w.set(index(w, x, 23), M.Seed);
  run(w, 400);
  assert.ok(count(w, M.Plant) > 5);
  assert.ok(w.cells.slice(0, 23 * 24).includes(M.Plant));
  const frozen = new World(12, 20);
  frozen.set(index(frozen, 6, 15), M.Plant, -10);
  frozen.moisture[index(frozen, 6, 15)] = 255;
  run(frozen, 200);
  assert.equal(count(frozen, M.Plant), 1);
});
test("lightning stays connected, strikes a conductor, heats it, and activates its wire", () => {
  const w = new World(40, 40);
  for (let y = 18; y < 35; y++) w.set(index(w, 22, y), M.Steel);
  w.set(index(w, 20, 1), M.Lightning);
  w.step();
  assert.ok(count(w, M.Lightning) > 12);
  assert.ok(w.charge[index(w, 22, 18)]);
  assert.ok(w.temp[index(w, 22, 18)] >= 800);
  run(w, 25);
  assert.ok(w.temp[index(w, 22, 34)] > 20);
  assert.equal(count(w, M.Lightning), 0);
});
test("new biological and weather state survives a save, and old saves remain loadable", () => {
  const w = new World(24, 32);
  w.set(500, M.Plant);
  w.moisture[500] = 123;
  w.growth[500] = 7;
  w.set(28, M.Storm);
  w.life[28] = 5;
  const copy = new World(24, 32);
  restore(copy, unpack(pack(snapshot(w))));
  run(w, 30);
  run(copy, 30);
  assert.deepEqual(snapshot(copy), snapshot(w));
  const old = snapshot(w);
  delete old.arrays.moisture;
  delete old.arrays.growth;
  restore(copy, old);
  assert.equal(copy.moisture.some(Boolean), false);
  const compressed = pack(snapshot(w));
  delete compressed.arrays.moisture;
  delete compressed.arrays.growth;
  restore(copy, unpack(compressed));
  assert.equal(copy.growth.some(Boolean), false);
});

import { applyTool, dragBrush } from "../src/sim/tools.js";
import { absorb } from "../src/sim/absorption.js";
test("warm and cool brushes trigger normal phase changes without painting over cells", () => {
  const w = new World(20, 20),
    i = index(w, 10, 10);
  w.set(i, M.Water);
  for (let n = 0; n < 8; n++) applyTool(w, "warm", 10, 10, 1);
  react(w, i, 10, 10);
  assert.equal(w.cells[i], M.Steam);
  w.set(i, M.Water);
  for (let n = 0; n < 3; n++) applyTool(w, "cool", 10, 10, 1);
  react(w, i, 10, 10);
  assert.equal(w.cells[i], M.Ice);
  assert.equal(w.count, 1);
  applyTool(w, "warm", 0, 0, 10);
  assert.equal(w.cells[0], 0);
});
test("fan moves mobile particles, grab carries solids and contents, and walls prevent overwrites", () => {
  const w = new World(40, 24),
    i = index(w, 14, 12);
  w.set(i, M.Sponge);
  w.storedLiquid[i] = M.Oil;
  w.storedAmount[i] = 17;
  w.set(index(w, 15, 12), M.Wood);
  w.set(index(w, 15, 11), M.Sand);
  applyTool(w, "fan", 14, 12, 3, "square", 1, 0);
  assert.equal(w.cells[i], M.Sponge);
  assert.equal(w.cells[index(w, 16, 11)], M.Sand);
  dragBrush(w, { x: 14, y: 12 }, { x: 19, y: 12 }, 3, "square");
  assert.equal(w.cells[index(w, 19, 12)], M.Sponge);
  assert.equal(w.storedAmount[index(w, 19, 12)], 17);
  assert.equal(w.storedLiquid[index(w, 19, 12)], M.Oil);
  w.set(index(w, 20, 12), M.Ceramic);
  const before = w.count;
  dragBrush(w, { x: 19, y: 12 }, { x: 19, y: 12 }, 3, "square");
  assert.equal(w.count, before);
  assert.equal(
    w.chunks.reduce((a, b) => a + b, 0),
    before,
  );
  const blocked = new World(12, 12);
  blocked.set(index(blocked, 5, 5), M.Water);
  blocked.set(index(blocked, 6, 5), M.Stone);
  applyTool(blocked, "fan", 5, 5, 0, "circle", 1, 0);
  assert.equal(blocked.cells[index(blocked, 5, 5)], M.Water);
  assert.equal(blocked.count, 2);
});
test("pressure and vacuum brushes produce bounded opposite forces and never wrap edges", () => {
  const w = new World(40, 40);
  applyTool(w, "pressure", 20, 20, 6);
  assert.ok(w.fields.pressure.some((v) => v > 0));
  w.fields.clear();
  applyTool(w, "vacuum", 20, 20, 6);
  assert.ok(w.fields.pressure.some((v) => v < 0));
  for (let n = 0; n < 100; n++) applyTool(w, "vacuum", 20, 20, 6);
  assert.ok(w.fields.pressure.every((v) => v >= -80 && v <= 80));
  const before = w.fields.pressure.slice();
  w.fields.add(-1, 20, 5);
  assert.deepEqual(w.fields.pressure, before);
  run(w, 100);
  assert.ok(w.fields.pressure.every(Number.isFinite));
});
test("sponge absorbs several liquid types up to capacity and cannot mix oil with water", () => {
  for (const liquid of [M.Water, M.Brine, M.Oil, M.Kerosene]) {
    const w = new World(12, 12),
      i = index(w, 6, 6),
      j = i + 1;
    w.set(i, M.Sponge);
    for (let n = 0; n < 60; n++) {
      w.set(j, liquid);
      w.tick = (3 - (i % 3)) % 3;
      absorb(w, i, 6, 6);
    }
    assert.equal(w.storedAmount[i], 48);
    assert.equal(w.storedLiquid[i], liquid);
    assert.equal(w.cells[j], liquid);
    w.set(j, liquid === M.Oil ? M.Water : M.Oil);
    absorb(w, i, 6, 6);
    assert.equal(w.cells[j], liquid === M.Oil ? M.Water : M.Oil);
  }
});
test("sponge releases liquid under squeeze or pressure and heat produces steam instead of dry burning", () => {
  for (const method of ["squeeze", "pressure", "warm"]) {
    const w = new World(20, 20),
      i = index(w, 10, 10);
    w.set(i, M.Sponge);
    w.storedLiquid[i] = M.Water;
    w.storedAmount[i] = 5;
    if (method === "warm") w.temp[i] = 500;
    else applyTool(w, method, 10, 10, 0);
    if (method === "pressure") w.fields.add(10, 10, 10);
    react(w, i, 10, 10);
    assert.equal(w.storedAmount[i], 4);
    assert.equal(count(w, method === "warm" ? M.Steam : M.Water), 1);
    assert.equal(w.cells[i], M.Sponge);
    assert.equal(w.life[i], 0);
  }
  const fuel = new World(16, 16),
    i = index(fuel, 8, 8);
  fuel.set(i, M.Sponge, 220);
  fuel.storedLiquid[i] = M.Kerosene;
  fuel.storedAmount[i] = 3;
  react(fuel, i, 8, 8);
  assert.ok(count(fuel, M.Fire) > 0);
  assert.equal(fuel.storedAmount[i], 2);
});
test("sponge save state is deterministic, backward compatible, and validated before mutation", () => {
  const w = new World(20, 20),
    i = index(w, 10, 10);
  w.set(i, M.Sponge);
  w.storedLiquid[i] = M.Brine;
  w.storedAmount[i] = 23;
  applyTool(w, "vacuum", 10, 10, 2);
  const copy = new World(20, 20);
  restore(copy, unpack(pack(snapshot(w))));
  run(w, 15);
  run(copy, 15);
  assert.deepEqual(snapshot(copy), snapshot(w));
  const valid = snapshot(copy),
    bad = snapshot(copy);
  bad.arrays.storedLiquid[i] = M.Steel;
  assert.throws(() => restore(copy, bad));
  assert.deepEqual(snapshot(copy), valid);
  const old = snapshot(w);
  delete old.arrays.storedAmount;
  delete old.arrays.storedLiquid;
  restore(copy, old);
  assert.equal(copy.storedAmount.some(Boolean), false);
});

import { grow } from "../src/sim/biology.js";
test("touching sponges wick compatible liquid without creating or losing stored cells", () => {
  const w = new World(20, 20),
    i = index(w, 8, 8),
    j = i + 1;
  w.set(i, M.Sponge);
  w.set(j, M.Sponge);
  w.storedLiquid[i] = M.Water;
  w.storedAmount[i] = 48;
  w.tick = (3 - (i % 3)) % 3;
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[j], 4);
  assert.equal(w.storedAmount[i] + w.storedAmount[j], 48);
  w.storedLiquid[j] = M.Oil;
  const before = w.storedAmount[j];
  absorb(w, i, 8, 8);
  assert.equal(w.storedAmount[j], before);
});
test("plants can drink from a wet sponge but do not consume its oil", () => {
  for (const liquid of [M.Water, M.Oil]) {
    const w = new World(16, 16),
      i = index(w, 8, 8),
      j = i + 1;
    w.set(i, M.Plant);
    w.moisture[i] = 0;
    w.set(j, M.Sponge);
    w.storedLiquid[j] = liquid;
    w.storedAmount[j] = 1;
    w.tick = (4 - (i % 4)) % 4;
    w.random = () => 0;
    grow(w, i, 8, 8);
    assert.equal(w.storedAmount[j], liquid === M.Water ? 0 : 1);
    assert.equal(w.moisture[i] > 0, liquid === M.Water);
    if (liquid === M.Water) assert.equal(w.storedLiquid[j], 0);
  }
});

test("positive pressure pushes particles away and vacuum pulls them toward its center", () => {
  for (const force of [40, -40]) {
    const w = new World(40, 32),
      i = index(w, 20, 16);
    w.set(i, M.Sand);
    w.fields.add(16, 16, force);
    w.random = () => 0;
    w.move(i, 20, 16);
    assert.equal(w.cells[index(w, force > 0 ? 21 : 19, 16)], M.Sand);
    assert.equal(w.count, 1);
  }
});

test("tool strength scales heating and force, and particle-only erase preserves solids", () => {
  const w = new World(20, 20),
    i = index(w, 8, 8);
  w.set(i, M.Water);
  applyTool(w, "warm", 8, 8, 0, "circle", 1, 0, 3);
  assert.equal(w.temp[i], 56);
  applyTool(w, "pressure", 8, 8, 0, "circle", 1, 0, 3);
  assert.ok(Math.abs(w.fields.pressure[w.fields.index(8, 8)] - 9.9) < 0.001);
  w.set(i + 1, M.Sponge);
  applyTool(w, "erase-mobile", 8, 8, 2);
  assert.equal(w.cells[i], 0);
  assert.equal(w.cells[i + 1], M.Sponge);
});
