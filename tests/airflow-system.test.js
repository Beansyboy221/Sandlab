import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { applyTool, brushTools } from "../src/sim/tools.js";
import { flowColor, drawStreamlines } from "../src/airflow-view.js";
import { Settings, settingsKey } from "../src/settings.js";

const step = (w, n) => {
  for (let t = 0; t < n; t++) w.step();
};
test("Blow pushes air momentum, whose divergence creates pressure without crossing sealed surfaces", () => {
  const w = new World(48, 32);
  for (let y = 0; y < 32; y++) w.set(y * 48 + 32, M.Wall);
  applyTool(w, "wind", 26, 16, 6, "circle", 1, 0, 2);
  assert.ok(w.fields.airflow.velocityX.some((v) => v > 0));
  w.fields.update(w);
  assert.ok(w.fields.pressure.some((p) => p > 0));
  assert.ok(w.fields.pressure.some((p) => p < 0));
  for (let t = 0; t < 4; t++) w.fields.update(w);
  assert.ok(w.fields.airflow.velocityX.some((v) => v > 0.01));
  for (let t = 0; t < 25; t++) w.fields.update(w);
  assert.ok(w.fields.airflow.velocityX.some((v) => Math.abs(v) > 0.005));
  for (let y = 0; y < w.fields.height; y++)
    for (let x = 9; x < w.fields.width; x++) {
      assert.equal(w.fields.pressure[y * w.fields.width + x], 0);
      assert.equal(w.fields.airflow.velocityX[y * w.fields.width + x], 0);
    }
  w.mechanics.pressureSimulation = false;
  w.fields.configure(w.mechanics);
  for (const tool of ["wind", "pressure", "vacuum"])
    applyTool(w, tool, 16, 16, 4);
  assert.ok(w.fields.pressure.every((v) => v === 0));
  assert.ok(w.fields.airflow.velocityX.every((v) => v === 0));
});

test("surface traction pushes solids and overload fractures glass before steel; Wall stays static", () => {
  for (const material of [M.Glass, M.Steel, M.Wall]) {
    const w = new World(64, 64);
    for (let y = 10; y < 42; y++) w.set(y * 64 + 32, material);
    for (let y = 0; y < w.fields.height; y++)
      for (let x = 0; x < 8; x++)
        w.fields.pressure[y * w.fields.width + x] = 25;
    const i = 20 * 64 + 32;
    w.fields.surfaceForce(w, i);
    assert.ok(w.fields.forceX > 0);
    assert.ok(w.fields.surfaceStress >= 25);
    w.environment.sample = () => {
      w.environment.x = w.environment.y = 0;
    };
    w.mechanics.temperatureSimulation = false;
    let pushed = false,
      damaged = false;
    for (let t = 0; t < 24; t++) {
      w.tick++;
      w.fields.stressWrites = 0;
      w.rigid.step(w);
      pushed ||= w.offsetX.some((v) => v > 0.1);
      damaged ||=
        w.damage.some((v) => v > 0.01) || w.cells.includes(M["Glass Shards"]);
      assert.ok(w.fields.stressWrites <= 128);
    }
    if (material === M.Glass) {
      assert.ok(damaged);
      assert.ok(w.cells.includes(M["Glass Shards"]));
    }
    if (material === M.Steel) {
      assert.equal(damaged, false);
      assert.ok(pushed);
    }
    if (material === M.Wall) {
      assert.equal(damaged, false);
      assert.equal(w.cells[i], M.Wall);
    }
  }
});

test("pressure damage is bounded in a crowded brittle scene, and uniform pressure does not accelerate a symmetric body", () => {
  const w = new World(80, 80);
  for (let y = 8; y < 70; y += 3)
    for (let x = 8; x < 70; x += 3) w.set(y * 80 + x, M.Glass, 20, 0, false);
  for (let y = 0; y < w.fields.height; y++)
    for (let x = 0; x < w.fields.width; x++)
      w.fields.pressure[y * w.fields.width + x] = x % 2 ? 40 : 0;
  w.tick = 3;
  w.rigid.step(w);
  assert.ok(w.fields.stressWrites > 0 && w.fields.stressWrites <= 128);
  const a = new World(32, 32);
  for (let y = 10; y < 14; y++)
    for (let x = 10; x < 14; x++) a.set(y * 32 + x, M.Steel);
  a.fields.pressure.fill(10);
  let fx = 0,
    fy = 0;
  a.rigid.rebuild();
  for (const id of a.rigid.bodies[0].edges) {
    a.fields.surfaceForce(a, a.rigid.locations.get(id));
    fx += a.fields.forceX;
    fy += a.fields.forceY;
  }
  assert.equal(fx, 0);
  assert.equal(fy, 0);
});

test("force sampling uses world coordinates, names remain compatible, and old air preferences migrate", () => {
  const w = new World(64, 64);
  w.fields.pressure[w.fields.index(40, 40) - 1] = 8;
  w.fields.beginForceSample();
  w.fields.forceAt(40, 40);
  assert.ok(w.fields.forceX > 0);
  assert.equal(materials[M.Rocket].name, "Missile");
  assert.equal(M.Rocket, M.Missile);
  assert.equal(brushTools.find(([id]) => id === "wind")[1], "Blow");
  const storage = {
    getItem: () =>
      JSON.stringify({ windSimulation: false, pressureSimulation: true }),
    setItem() {},
  };
  const prefs = new Settings(storage);
  assert.equal(prefs.get("pressureSimulation"), false);
  assert.equal(prefs.get("windSimulation"), undefined);
});

test("optical flow direction colors differ, remain finite, and streamline work has a fixed bound", () => {
  const values = [];
  for (const [x, y] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0, 0],
  ]) {
    const out = {};
    flowColor(x, y, out);
    values.push(JSON.stringify(out));
    assert.ok(Object.values(out).every(Number.isFinite));
  }
  assert.equal(new Set(values).size, 5);
  const w = new World(320, 200);
  w.fields.airflow.velocityX.fill(1);
  let segments = 0;
  const context = {
    beginPath() {},
    moveTo() {},
    lineTo() {
      segments++;
    },
    stroke() {},
  };
  drawStreamlines(context, { x: 0, y: 0, scale: 2 }, w);
  assert.ok(segments > 0 && segments <= 600 * 5);
});
