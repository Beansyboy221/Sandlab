import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { predatoryMotion } from "../src/sim/predation.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { resizeLevel } from "../src/level.js";
import { levelProperties } from "../src/level-properties.js";
import { loadPreset } from "../src/presets.js";
import { Settings } from "../src/settings.js";
const run = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
const missile = M["Heat-Seeking Missile"];
function pair(hunter, food, distance = 15) {
  const w = new World(160, 100);
  w.stickmen.spawn(50, 70, M[hunter]);
  w.stickmen.spawn(50 + distance, 70, M[food]);
  return w;
}
test("predators hunt specific prey, prey flee, and barriers block sensing and attacks", () => {
  for (const [hunter, food] of [
    ["Cat", "Rabbit"],
    ["Wolf", "Cat"],
    ["Shark", "Fish"],
  ]) {
    const w = pair(hunter, food),
      [a, b] = w.stickmen.bodies;
    assert.ok(predatoryMotion(w, a).move > 0, hunter);
    assert.ok(predatoryMotion(w, b).move > 0, food);
    assert.equal(a.behavior, "Hunting");
    assert.equal(b.behavior, "Fleeing");
    for (let y = 0; y < 100; y++) w.set(y * 160 + 57, M.Wall);
    assert.equal(predatoryMotion(w, a), null);
    assert.equal(predatoryMotion(w, b), null);
    assert.equal(b.health, 100);
    w.mechanics.predation = false;
    assert.equal(predatoryMotion(w, a), null);
  }
  const w = pair("Wolf", "Bird");
  assert.equal(predatoryMotion(w, w.stickmen.bodies[0]), null);
});
test("bites require contact, respect cooldown, and leave a physical finite-fuel corpse", () => {
  const w = pair("Cat", "Rabbit", 15),
    [a, b] = w.stickmen.bodies;
  for (let n = 0; n < 9; n++) {
    b.x[n] -= 14;
    b.px[n] -= 14;
  }
  predatoryMotion(w, a);
  assert.equal(b.health, 86);
  predatoryMotion(w, a);
  assert.equal(b.health, 86);
  b.health = 10;
  a.attackCooldown = 0;
  predatoryMotion(w, a);
  assert.equal(b.health, 0);
  assert.equal(b.alive, false);
  const y = b.y[2];
  run(w, 10);
  assert.ok(b.y[2] > y);
  assert.ok(b.fuel.every((v) => v <= 100));
});
test("actual land and water predator/prey physics stay finite through chasing", () => {
  for (const species of [
    ["Wolf", "Rabbit"],
    ["Shark", "Fish"],
  ]) {
    const w = pair(...species),
      [a, b] = w.stickmen.bodies;
    for (let y = 80; y < 100; y++)
      for (let x = 0; x < 160; x++) w.set(y * 160 + x, M.Wall);
    if (species[0] === "Shark")
      for (let y = 20; y < 80; y++)
        for (let x = 1; x < 159; x++) w.set(y * 160 + x, M.Water);
    run(w, 180);
    assert.ok(a.x.every(Number.isFinite) && b.x.every(Number.isFinite));
    assert.ok(a.alive);
    assert.ok(a.x[2] > 52);
    assert.ok(b.x[2] > 67);
  }
});
test("missiles select the nearest exposed hot surface, ignore gases, and turn gradually", () => {
  const w = new World(160, 100),
    near = 40 * 160 + 50,
    far = 50 * 160 + 100;
  w.set(near, M.Wall, 120);
  w.set(far, M.Wall, 1000);
  w.set(50 * 160 + 25, M.Fire, 900);
  w.missiles.spawn(20, 50, 1, 0);
  w.missiles.step();
  const a = w.missiles.items[0];
  assert.equal(a.target, near);
  assert.ok(Math.abs(a.angle) <= 0.065);
  w.temp[near] = 20;
  w.missiles.step();
  assert.equal(a.target, far);
  w.mechanics.missileRange = 32;
  w.missiles.step();
  assert.equal(a.target, -1);
  w.mechanics.missileRange = 256;
  w.mechanics.missileHoming = false;
  const angle = a.angle;
  w.missiles.step();
  assert.equal(a.angle, angle);
  const sealed = new World(80, 80);
  for (let y = 20; y < 25; y++)
    for (let x = 20; x < 25; x++) sealed.set(y * 80 + x, M.Wall, 20);
  sealed.temp[22 * 80 + 22] = 600;
  sealed.missiles.spawn(10, 10);
  sealed.missiles.step();
  assert.equal(sealed.missiles.targetCount, 0);
});
test("missiles hit one-cell walls at high speed, use configured blasts and expire quietly", () => {
  const w = new World(80, 80);
  w.mechanics.missileSpeed = 2;
  w.mechanics.missileBlast = 7;
  w.mechanics.missileHoming = false;
  for (let y = 0; y < 80; y++) w.set(y * 80 + 35, M.Wall);
  let hits = [];
  w.explode = (x, y, r) => hits.push({ x, y, r });
  w.missiles.spawn(10, 40);
  run(w, 30);
  assert.equal(w.missiles.items.length, 0);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].r, 7);
  assert.ok(hits[0].x <= 35);
  w.missiles.spawn(10, 10);
  w.missiles.items[0].life = 1;
  w.missiles.step();
  assert.equal(hits.length, 1);
  for (const border of ["solid", "void", "looping"]) {
    const b = new World(40, 40);
    b.border = border;
    b.mechanics.missileHoming = false;
    b.missiles.spawn(35, 20);
    b.missiles.items[0].x = 41;
    let exploded = false;
    b.explode = () => (exploded = true);
    b.missiles.step();
    assert.equal(exploded, border === "solid");
    assert.equal(b.missiles.items.length, border === "looping" ? 1 : 0);
  }
});
test("new bodies and missiles survive saves, resizing and tools; malformed missiles do not mutate a world", () => {
  const w = pair("Wolf", "Shark");
  w.missiles.spawn(20, 30);
  const a = w.missiles.items[0];
  w.missiles.brush("grab", 20, 30, 2, 4, 3);
  assert.equal(a.x, 24);
  assert.equal(a.y, 33);
  w.missiles.brush("warm", 24, 33, 2, 0, 0, 2);
  assert.equal(a.temperature, 44);
  const saved = snapshot(w);
  restore(w, unpack(pack(saved)));
  assert.deepEqual(snapshot(w), saved);
  const resized = resizeLevel(
    w,
    { ...levelProperties(w), width: 140, height: 90 },
    10,
    5,
  );
  assert.equal(resized.missiles.items[0].x, 14);
  assert.equal(resized.missiles.items[0].y, 28);
  for (const invalid of [
    { vx: NaN },
    { life: 0 },
    { material: M.Fire },
    { id: 0 },
  ]) {
    const bad = structuredClone(saved);
    Object.assign(bad.missiles[0], invalid);
    assert.throws(() => restore(w, bad));
    assert.deepEqual(snapshot(w), saved);
  }
  w.missiles.brush("erase", 24, 33, 2);
  assert.equal(w.missiles.items.length, 0);
  w.brush(20, 20, 20, missile);
  assert.equal(
    w.missiles.items.length,
    1,
    "whole missile rather than particles per brush cell",
  );
});
test("new presets work at all gravity orientations and world rules persist safely", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ])
    for (const id of ["reserve", "missiles"]) {
      const w = new World(160, 120);
      w.setGravity(gx, gy);
      loadPreset(w, id);
      run(w, 120);
      assert.ok(w.temp.every(Number.isFinite));
      assert.ok(w.stickmen.bodies.every((a) => a.x.every(Number.isFinite)));
      if (id === "reserve") assert.equal(w.stickmen.bodies.length, 5);
    }
  const store = { getItem: () => null, setItem: (k, v) => (store.value = v) };
  const s = new Settings(store);
  s.set("joystickSide", "right");
  s.set("joystickSize", 100);
  const world = new World(32, 24);
  world.mechanics.predation = false;
  world.mechanics.missileHeat = 200;
  const reloaded = new Settings({ getItem: () => store.value, setItem() {} });
  assert.equal(reloaded.get("joystickSide"), "right");
  assert.equal(reloaded.get("joystickSize"), 100);
  const loaded = new World();
  restore(loaded, snapshot(world));
  assert.equal(loaded.mechanics.predation, false);
  assert.equal(loaded.mechanics.missileHeat, 200);
});
