import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import {
  paletteEntities,
  paletteMaterials,
  paletteEntries,
} from "../src/sim/material-families.js";
import { isEntity } from "../src/sim/entity-kinds.js";
import {
  applyLevelMetadata,
  levelProperties,
} from "../src/level-properties.js";
import { snapshot, restore } from "../src/persistence.js";
const laser = M["Laser-Guided Missile"];
const mode = (w, id) =>
  applyLevelMetadata(w, { ...levelProperties(w), canvasMode: id });
const run = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
test("catalogs are separate, complete, and preserve IDs for old creatures and devices", () => {
  assert.equal(paletteMaterials.length, 60);
  assert.equal(paletteEntities.length, 32);
  assert.equal(paletteEntries.length, 92);
  assert.ok(paletteMaterials.every((m) => !isEntity(m)));
  assert.ok(paletteEntities.every(isEntity));
  assert.equal(M["Heat-Seeking Missile"], 105);
  assert.equal(M["Seeking Missile"], 105);
  assert.equal(materials[105].name, "Seeking Missile");
  assert.equal(M.Drone, 117);
  assert.equal(M["Laser-Guided Missile"], 119);
  assert.equal(M["Guided Missile"], 119);
  assert.equal(materials[119].name, "Guided Missile");
  for (const name of [
    "Cat",
    "Player",
    "Heater",
    "Battery",
    "Drone",
    "Solar Cell",
    "Missile",
  ])
    assert.ok(paletteEntities.includes(materials[M[name]]), name);
});
test("laser-guided missiles choose the nearest visible beam before the cursor, then reacquire", () => {
  const w = new World(100, 80);
  w.missiles.spawn(30, 40, 1, 0, laser);
  const a = w.missiles.items[0];
  w.set(20 * 100 + 40, M.Laser);
  w.set(60 * 100 + 70, M.Laser);
  w.missiles.guidance.setCursor({ x: 80, y: 70 });
  w.missiles.step();
  assert.equal(a.target, 2040);
  assert.equal(a.targetKind, "laser");
  assert.ok(a.angle < 0);
  w.set(2040, 0);
  w.missiles.step();
  assert.equal(a.target, 6070);
  w.set(6070, 0);
  w.missiles.step();
  assert.equal(a.targetKind, "cursor");
  w.missiles.guidance.setCursor(null);
  w.missiles.step();
  assert.equal(a.targetKind, "none");
});
test("guidance sees through glass, respects opaque walls, range and looping seams; rockets stay unguided", () => {
  const w = new World(100, 80);
  w.missiles.spawn(30, 40, 1, 0, laser);
  const a = w.missiles.items[0];
  w.set(40 * 100 + 50, M.Laser);
  for (let y = 0; y < 80; y++) w.set(y * 100 + 40, M.Wall);
  w.missiles.guidance.capture();
  assert.equal(w.missiles.guidance.nearest(a), -1);
  for (let y = 0; y < 80; y++) w.set(y * 100 + 40, M.Glass);
  assert.equal(w.missiles.guidance.nearest(a), 4050);
  w.mechanics.missileRange = 5;
  assert.equal(w.missiles.guidance.nearest(a), -1);
  w.border = "looping";
  a.x = 3;
  w.set(4050, 0);
  w.set(40 * 100 + 99, M.Laser);
  w.missiles.guidance.capture();
  assert.equal(w.missiles.guidance.nearest(a), 4099);
  const rocket = new World(100, 80);
  rocket.missiles.spawn(30, 40, 1, 0, M.Rocket);
  rocket.missiles.guidance.setCursor({ x: 50, y: 10 });
  rocket.set(20 * 100 + 50, M.Laser);
  rocket.missiles.step();
  assert.equal(rocket.missiles.items[0].angle, 0);
  assert.equal(rocket.missiles.items[0].targetKind, "none");
});
test("guidance settings, export and resize keep missile types, and omit transient cursor positions", () => {
  const w = new World(100, 80);
  w.missiles.spawn(30, 40, 1, 0, laser);
  w.missiles.guidance.setCursor({ x: 80, y: 10 });
  w.mechanics.laserGuidance = false;
  w.missiles.step();
  assert.equal(w.missiles.items[0].angle, 0);
  const s = snapshot(w),
    loaded = new World();
  restore(loaded, s);
  assert.equal(loaded.missiles.items[0].material, laser);
  assert.equal(loaded.missiles.guidance.cursor, null);
  assert.deepEqual(snapshot(loaded), s);
});
test("planet gravity attracts inward, preserves angular motion and lets matter settle on a core", () => {
  const w = new World(160, 120);
  mode(w, "planet");
  w.environment.sample(120, 60);
  assert.ok(w.environment.x < 0);
  assert.ok(Math.abs(w.environment.y) < 0.1);
  w.set(60 * 160 + 120, M.Sand);
  assert.ok(w.velocityY[60 * 160 + 120] > 0);
  run(w, 30);
  const at = w.cells.indexOf(M.Sand);
  assert.notEqual(at, 60 * 160 + 120);
  assert.ok(Math.floor(at / 160) > 60);
  assert.ok(w.velocityX[at] < 0);
  assert.ok(w.temp.every(Number.isFinite));
});
test("zero gravity affects particles, rigid shapes, elastics, characters and unpowered vehicles", () => {
  const w = new World(100, 100);
  mode(w, "zero");
  w.set(20 * 100 + 20, M.Sand);
  w.set(30 * 100 + 30, M.Steel);
  w.set(40 * 100 + 40, M.Rubber);
  w.stickmen.spawn(60, 65, M.Player);
  w.missiles.spawn(70, 30, 1, 0, M.Rover);
  w.mechanics.machineMotors = false;
  w.missiles.items[0].vx = w.missiles.items[0].vy = 0;
  const y = w.stickmen.bodies[0].y[2];
  run(w, 15);
  assert.equal(w.cells[2020], M.Sand);
  assert.equal(w.cells[3030], M.Steel);
  assert.equal(w.cells[4040], M.Rubber);
  assert.ok(Math.abs(w.stickmen.bodies[0].y[2] - y) < 1);
  assert.ok(Math.abs(w.missiles.items[0].y - 30) < 0.1);
});
test("moving gravity, vortex wind, daylight and temperature change deterministically and survive saves", () => {
  for (const id of ["wander", "vortex", "solar"]) {
    const w = new World(64, 64);
    mode(w, id);
    const x = w.environment.centerX,
      light = w.environment.light;
    run(w, 100);
    if (id === "solar") {
      assert.ok(w.environment.light > light);
      assert.ok(w.fields.ambientTemperature > 20);
    } else assert.notEqual(w.environment.centerX, x);
    if (id === "vortex")
      assert.ok(w.fields.airflow.velocityX.some((v) => Math.abs(v) > 0.05));
    const loaded = new World();
    restore(loaded, snapshot(w));
    assert.equal(loaded.canvasMode, id);
    run(w, 5);
    run(loaded, 5);
    assert.deepEqual(snapshot(loaded), snapshot(w));
  }
  const w = new World();
  for (const bad of ["script", null, 3])
    assert.throws(() =>
      applyLevelMetadata(w, { ...levelProperties(w), canvasMode: bad }),
    );
});
test("populated orbital worlds preserve subpixel momentum through history, export and resize", async () => {
  const { EditHistory } = await import("../src/history.js");
  const { resizeLevel } = await import("../src/level.js");
  const w = new World(160, 120);
  mode(w, "planet");
  w.modeStrength = 1.5;
  w.environment.update();
  for (let x = 25; x < 35; x++) w.set(30 * w.width + x, M.Sand);
  for (let x = 95; x < 105; x++) w.set(35 * w.width + x, M.Steel);
  run(w, 10);
  const saved = snapshot(w),
    h = new EditHistory(w);
  h.remember(w.name);
  mode(w, "zero");
  h.undo(w.name);
  assert.deepEqual(snapshot(w), saved);
  const loaded = new World();
  restore(loaded, saved);
  run(loaded, 8);
  run(w, 8);
  assert.deepEqual(snapshot(loaded), snapshot(w));
  const resized = resizeLevel(
    w,
    { ...levelProperties(w), width: 180, height: 140 },
    -10,
    -10,
  );
  assert.equal(resized.canvasMode, "planet");
  restore(new World(), snapshot(resized));
});
test("spatial laser acquisition matches exhaustive nearest visibility with partial tiles and seams", () => {
  for (const [width, height] of [
    [65, 91],
    [160, 123],
    [17, 33],
  ])
    for (const border of ["solid", "looping"]) {
      const w = new World(width, height);
      w.border = border;
      for (let n = 0; n < 180; n++) {
        const i = Math.floor(w.random() * w.length);
        w.set(i, n % 7 ? M.Laser : M.Wall);
      }
      w.missiles.guidance.capture();
      for (let n = 0; n < 30; n++) {
        const a = { x: w.random() * width, y: w.random() * height };
        let best = -1,
          distance = w.mechanics.missileRange ** 2;
        for (let i = 0; i < w.length; i++)
          if (w.cells[i] === M.Laser) {
            let dx = (i % width) + 0.5 - a.x,
              dy = Math.floor(i / width) + 0.5 - a.y;
            if (border === "looping") {
              dx -= Math.round(dx / width) * width;
              dy -= Math.round(dy / height) * height;
            }
            const d = dx * dx + dy * dy;
            if (
              (d < distance || (d === distance && (best < 0 || i < best))) &&
              w.missiles.guidance.visible(a, dx, dy)
            ) {
              best = i;
              distance = d;
            }
          }
        assert.equal(
          w.missiles.guidance.nearest(a),
          best,
          `${width}x${height} ${border}`,
        );
      }
    }
});
