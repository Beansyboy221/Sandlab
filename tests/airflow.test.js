import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { applyTool, blowBrush } from "../src/sim/tools.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { resizeLevel } from "../src/level.js";
import { loadPreset } from "../src/presets.js";
const run = (w, n, fieldsOnly = false) => {
  for (let k = 0; k < n; k++) fieldsOnly ? w.fields.update(w) : w.step();
};
test("Blow only deposits air from movement, without touching matter or spawning held impulses", () => {
  const w = new World(64, 64),
    a = { x: 24, y: 24 };
  w.set(24 * 64 + 24, M.Smoke);
  const before = snapshot(w),
    cells = w.cells.slice();
  for (let n = 0; n < 60; n++) {
    blowBrush(w, a, a, 6);
    applyTool(w, "wind", 24, 24, 6);
  }
  assert.deepEqual(snapshot(w), before);
  blowBrush(w, a, { x: 40, y: 36 }, 6);
  assert.ok(w.fields.airflow.velocityX.some((v) => v > 0));
  assert.ok(w.fields.airflow.velocityY.some((v) => v > 0));
  assert.deepEqual(w.cells, cells);
  const moving = snapshot(w);
  blowBrush(w, a, a, 6);
  assert.deepEqual(snapshot(w), moving);
  run(w, 3, true);
  assert.ok(w.fields.pressure.some((v) => v > 0));
  assert.ok(w.fields.pressure.some((v) => v < 0));
  assert.ok(w.fields.airflow.velocityX.reduce((a, b) => a + b, 0) > 0);
  assert.ok(w.fields.airflow.velocityY.reduce((a, b) => a + b, 0) > 0);
});
test("Blow follows stroke direction, strength and length rather than event subdivision", () => {
  for (const [dx, dy] of [
    [24, 0],
    [-24, 0],
    [0, 24],
    [0, -24],
    [24, 24],
  ]) {
    const whole = new World(96, 96),
      divided = new World(96, 96),
      strong = new World(96, 96);
    const a = { x: 48, y: 48 },
      b = { x: 48 + dx, y: 48 + dy };
    blowBrush(whole, a, b, 5, "square");
    blowBrush(strong, a, b, 5, "square", 2);
    for (let n = 0; n < 12; n++)
      blowBrush(
        divided,
        { x: a.x + (dx * n) / 12, y: a.y + (dy * n) / 12 },
        { x: a.x + (dx * (n + 1)) / 12, y: a.y + (dy * (n + 1)) / 12 },
        5,
        "square",
      );
    const energy = (w) =>
      w.fields.airflow.velocityX.reduce((a, b) => a + Math.abs(b), 0) +
      w.fields.airflow.velocityY.reduce((a, b) => a + Math.abs(b), 0);
    assert.ok(Math.abs(energy(divided) / energy(whole) - 1) < 0.2);
    assert.ok(energy(strong) > energy(whole) * 1.9);
    run(whole, 2, true);
    const vx = whole.fields.airflow.velocityX.reduce((a, b) => a + b, 0),
      vy = whole.fields.airflow.velocityY.reduce((a, b) => a + b, 0);
    if (dx) assert.ok(vx * dx > 0);
    if (dy) assert.ok(vy * dy > 0);
  }
});
test("Blow clips off-canvas strokes, respects disabled airflow and cannot push through sealed walls", () => {
  const w = new World(64, 48);
  for (let y = 0; y < 48; y++) w.set(y * 64 + 32, M.Wall);
  blowBrush(w, { x: 12, y: 24 }, { x: 24, y: 24 }, 2, "circle", 2);
  run(w, 20, true);
  for (let y = 0; y < w.fields.height; y++)
    for (let x = 9; x < w.fields.width; x++) {
      assert.equal(w.fields.pressure[y * w.fields.width + x], 0);
      assert.equal(w.fields.airflow.velocityX[y * w.fields.width + x], 0);
    }
  const unchanged = snapshot(w);
  blowBrush(w, { x: -1000000, y: 0 }, { x: -1000000, y: 24 }, 5);
  assert.deepEqual(snapshot(w), unchanged);
  let deposits = 0;
  const impulse = w.fields.airflow.push.bind(w.fields.airflow);
  w.fields.airflow.push = (...args) => {
    deposits++;
    impulse(...args);
  };
  blowBrush(w, { x: -1000000, y: 8 }, { x: 1000000, y: 8 }, 0);
  assert.ok(
    deposits > 0 && deposits < 100,
    "Sampling must be bounded by the canvas",
  );
  w.fields.clear();
  w.mechanics.pressureSimulation = false;
  blowBrush(w, { x: 8, y: 8 }, { x: 16, y: 16 }, 4);
  assert.ok(w.fields.pressure.every((v) => v === 0));
});
function chamber(hole = -1, right = 51) {
  const w = new World(80, 64);
  for (let y = 12; y <= 51; y++)
    for (let x = 12; x <= right; x++)
      if (
        (x === 12 || x === right || y === 12 || y === 51) &&
        !(x === right && y === hole)
      )
        w.set(y * 80 + x, M.Wall);
  return w;
}
test("one-pixel vents release confined pressure as an outward jet across grid alignments", () => {
  for (const right of [49, 50, 51, 52])
    for (const hole of [24, 25, 26, 27]) {
      const w = chamber(hole, right),
        sealed = chamber(-1, right);
      for (let n = 0; n < 250; n++)
        for (const a of [w, sealed]) {
          for (let y = 16; y < 48; y += 4)
            for (let x = 16; x < 48; x += 4) a.fields.add(x, y, 0.03);
          a.fields.update(a);
        }
      w.fields.airflow.sample(w.fields, right, hole);
      assert.ok(w.fields.airflow.x > 0.2, `No jet at ${right},${hole}`);
      assert.ok(w.fields.pressure[w.fields.index(60, 28)] > 0);
      assert.equal(sealed.fields.pressure[sealed.fields.index(60, 28)], 0);
      assert.ok(
        w.fields.pressure[w.fields.index(28, 28)] <
          sealed.fields.pressure[sealed.fields.index(28, 28)],
      );
    }
});
test("burning fuel vents flames and smoke, while a sealed container keeps them inside", () => {
  for (const hole of [-1, 24, 25, 26, 27]) {
    const w = chamber(hole);
    for (let y = 43; y < 51; y++)
      for (let x = 16; x < 48; x++) {
        const i = y * 80 + x;
        w.set(i, M.Coal);
        w.life[i] = 500;
        w.temp[i] = 650;
      }
    let fire = false,
      smoke = false;
    for (let n = 0; n < 400; n++) {
      w.step();
      for (let y = 0; y < 64; y++)
        for (let x = 52; x < 80; x++) {
          fire ||= w.cells[y * 80 + x] === M.Fire;
          smoke ||= w.cells[y * 80 + x] === M.Smoke;
        }
    }
    assert.equal(fire || smoke, hole >= 0, `Vent ${hole}`);
    assert.ok(Math.max(...w.fields.pressure) > 1);
    assert.ok(w.fields.airflow.velocityX.every(Number.isFinite));
  }
});
test("localized wind moves gas, persists after input and is stopped by a sealed wall", () => {
  const w = new World(64, 48);
  for (let y = 0; y < 48; y++) w.set(y * 64 + 32, M.Wall);
  for (let y = 16; y < 28; y++)
    for (let x = 12; x < 24; x++) w.set(y * 64 + x, M.Smoke, 20);
  for (let n = 0; n < 20; n++) {
    applyTool(w, "wind", 24, 22, 8, "circle", 1, 0, 3);
    w.step();
  }
  assert.ok(w.cells.some((id, i) => id === M.Smoke && i % 64 >= 24));
  run(w, 20);
  assert.ok(w.fields.airflow.velocityX.some((v) => v > 0.01));
  for (let y = 0; y < w.fields.height; y++)
    for (let x = 9; x < w.fields.width; x++) {
      assert.equal(w.fields.airflow.velocityX[y * w.fields.width + x], 0);
      assert.equal(w.fields.pressure[y * w.fields.width + x], 0);
    }
});
test("ambient wind is gravity-relative, looping air stays uniform, and hot air rises", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(32, 32);
    w.setGravity(gx, gy);
    w.border = w.fields.border = "looping";
    w.mechanics.windStrength = 1;
    run(w, 80, true);
    w.fields.airflow.sample(w.fields, 16, 16);
    assert.ok(w.fields.airflow.x * gy - w.fields.airflow.y * gx > 0.5);
    assert.ok(w.fields.pressure.every((v) => Math.abs(v) < 1e-5));
    assert.ok(w.fields.temperature.every((v) => v === 20));
    w.mechanics.windStrength = 0;
    w.fields.airflow.clear();
    w.fields.temperature.fill(200);
    run(w, 20, true);
    w.fields.airflow.sample(w.fields, 16, 16);
    assert.ok(w.fields.airflow.x * gx + w.fields.airflow.y * gy < -0.1);
  }
});
test("airflow survives export, typed undo snapshots and deterministic continuation; legacy saves start still", () => {
  const w = new World(32, 32);
  applyTool(w, "wind", 16, 16, 8, "square", 1, -1, 2);
  w.set(500, M.Smoke);
  run(w, 10);
  const loaded = new World();
  restore(loaded, unpack(pack(snapshot(w))));
  assert.deepEqual(snapshot(loaded), snapshot(w));
  run(w, 30);
  run(loaded, 30);
  assert.deepEqual(snapshot(loaded), snapshot(w));
  restore(loaded, snapshot(w, true));
  assert.deepEqual(snapshot(loaded), snapshot(w));
  const old = snapshot(w);
  delete old.atmosphere.airflow;
  restore(loaded, old);
  assert.ok(loaded.fields.airflow.velocityX.every((v) => v === 0));
  const cropped = resizeLevel(
    w,
    {
      name: w.name,
      width: 16,
      height: 16,
      border: w.border,
      background: w.background,
    },
    4,
    4,
  );
  assert.equal(
    cropped.fields.airflow.velocityX[cropped.fields.index(8, 8)],
    w.fields.airflow.velocityX[w.fields.index(12, 12)],
  );
});
test("malformed airflow is rejected before changing the world", () => {
  const w = new World(32, 32);
  w.set(300, M.Sand);
  const before = snapshot(w);
  for (const bad of [NaN, Infinity, 3.01, -3.01]) {
    const data = structuredClone(before);
    data.atmosphere.airflow.velocityX[0] = bad;
    assert.throws(() => restore(w, data));
    assert.deepEqual(snapshot(w), before);
  }
  for (const bad of [null, {}, { velocityX: [] }]) {
    const data = structuredClone(before);
    data.atmosphere.airflow = bad;
    assert.throws(() => restore(w, data));
    assert.deepEqual(snapshot(w), before);
  }
});
test("vented chamber is stable and emits smoke beyond its outlet on phone and desktop worlds", () => {
  for (const [width, height] of [
    [320, 200],
    [200, 300],
  ]) {
    const w = new World(width, height);
    loadPreset(w, "vent");
    let escaped = false;
    const right = Math.floor((width - 60) * 0.4) + 59;
    for (let n = 0; n < 350; n++) {
      w.step();
      escaped ||= w.cells.some(
        (v, i) => i % width > right && [M.Fire, M.Smoke].includes(v),
      );
    }
    assert.ok(escaped);
    assert.equal(w.count, w.cells.filter(Boolean).length);
    assert.ok(
      w.fields.temperature.every(
        (v) => Number.isFinite(v) && v >= -273 && v <= 6000,
      ),
    );
  }
});
