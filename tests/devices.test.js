import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { circuitDirection, circuitOutput } from "../src/sim/circuits.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection.js";
import { resizeLevel } from "../src/level.js";
import { levelProperties } from "../src/level-properties.js";
import { emissionStrength } from "../src/lighting.js";
const at = (w, x, y) => y * w.width + x;
const run = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};
function circuit(rule, heading = 0) {
  const w = new World(40, 40),
    i = at(w, 20, 20),
    [dx, dy] = circuitDirection(heading);
  w.set(i, M[rule]);
  w.heading[i] = heading;
  const a = w.index(20 - dx, 20 - dy),
    b = w.index(20 + dy, 20 - dx),
    out = w.index(20 + dx, 20 + dy);
  w.set(a, M.Wire);
  w.set(b, M.Wire);
  w.set(out, M.Wire);
  return { w, i, a, b, out };
}

test("logic gates implement truth tables at every facing and emit only from the output port", () => {
  for (const heading of [0, 2, 4, 6])
    for (const rule of ["AND Gate", "OR Gate", "XOR Gate", "NOT Gate"]) {
      for (const a of [0, 1])
        for (const b of [0, 1]) {
          const c = circuit(rule, heading);
          c.w.charge[c.a] = a * 6;
          c.w.charge[c.b] = b * 6;
          c.w.circuits.step();
          const expected =
            rule === "AND Gate"
              ? a && b
              : rule === "OR Gate"
                ? a || b
                : rule === "XOR Gate"
                  ? a !== b
                  : !a;
          assert.equal(
            circuitOutput(materials[M[rule]], c.w.life[c.i]),
            Boolean(expected),
            `${rule}:${heading}:${a}:${b}`,
          );
          assert.equal(Boolean(c.w.charge[c.out]), Boolean(expected));
          assert.equal(c.w.charge[c.a], a * 6);
          assert.equal(c.w.charge[c.b], b * 6);
        }
    }
});
test("toggle uses rising edges, delay shifts exactly 12 ticks, and gate chains read a snapshot", () => {
  const t = circuit("Toggle Gate");
  t.w.charge[t.a] = 6;
  for (let i = 0; i < 10; i++) {
    t.w.circuits.step();
    assert.equal(t.w.life[t.i] & 1, 1);
  }
  t.w.charge[t.a] = 0;
  t.w.circuits.step();
  t.w.charge[t.a] = 6;
  t.w.circuits.step();
  assert.equal(t.w.life[t.i] & 1, 0);
  const d = circuit("Delay Gate");
  for (let i = 1; i <= 14; i++) {
    d.w.charge[d.a] = i === 1 ? 6 : 0;
    d.w.circuits.step();
    assert.equal(
      circuitOutput(materials[M["Delay Gate"]], d.w.life[d.i]),
      i === 12,
    );
  }
  const w = new World(24, 24),
    a = at(w, 10, 10),
    b = a + 1;
  w.set(a, M["NOT Gate"]);
  w.set(b, M["NOT Gate"]);
  w.circuits.step();
  assert.equal(w.life[a], 1);
  assert.equal(w.life[b], 1);
  w.circuits.step();
  assert.equal(w.life[b], 0);
  const reverse = new World(24, 24);
  reverse.set(b, M["NOT Gate"]);
  reverse.set(a, M["NOT Gate"]);
  reverse.circuits.step();
  reverse.circuits.step();
  assert.equal(reverse.life[b], 0);
});
test("sparks drive gates, batteries power wires, lamp emits only when signaled, and a fan cannot push through walls", () => {
  const w = new World(48, 32);
  w.set(at(w, 8, 10), M.Battery);
  for (let x = 9; x < 20; x++) w.set(at(w, x, 10), M.Wire);
  w.set(at(w, 20, 10), M["Signal Lamp"]);
  run(w, 80);
  assert.ok(w.cells.slice(at(w, 8, 10), at(w, 21, 10)).every((id) => id));
  let lit = false;
  for (let i = 0; i < 24; i++) {
    w.step();
    lit ||= !!w.life[at(w, 20, 10)];
  }
  assert.ok(lit);
  const lamp = materials[M["Signal Lamp"]];
  assert.equal(emissionStrength(lamp, 20, 0, 0), 0);
  assert.ok(emissionStrength(lamp, 20, 1, 0) > 1);
  const s = circuit("OR Gate");
  s.w.set(s.a, M.Spark);
  s.w.circuits.step();
  assert.equal(s.w.life[s.i], 1);
  const fan = circuit("Electric Fan");
  fan.w.charge[fan.a] = 6;
  fan.w.set(fan.out, M.Sand);
  fan.w.set(fan.out + 3, M.Wall);
  fan.w.tick++;
  fan.w.circuits.step();
  assert.equal(fan.w.cells[fan.out + 1], M.Sand);
  assert.equal(fan.w.cells[fan.out + 3], M.Wall);
});
test("circuit state, direction, registrations and signal timing survive copy, saves, movement and resizing", () => {
  const { w, i, a } = circuit("Toggle Gate", 6);
  w.charge[a] = 6;
  w.circuits.step();
  const clip = copyRegion(w, { x: 19, y: 19, width: 3, height: 3 });
  pasteRegion(w, clip, 9, 9);
  assert.ok(w.circuits.locations.has(at(w, 10, 10)));
  assert.equal(w.heading[at(w, 10, 10)], 6);
  assert.equal(w.life[at(w, 10, 10)], 3);
  w.swap(i, i + 4);
  assert.ok(!w.circuits.locations.has(i));
  assert.ok(w.circuits.locations.has(i + 4));
  const saved = snapshot(w),
    other = new World(40, 40);
  restore(other, unpack(pack(saved)));
  assert.deepEqual(snapshot(other), saved);
  run(w, 40);
  run(other, 40);
  assert.deepEqual(snapshot(other), snapshot(w));
  const resized = resizeLevel(
    w,
    { ...levelProperties(w), width: 64, height: 64 },
    0,
    0,
  );
  assert.equal(resized.circuits.locations.size, w.circuits.locations.size);
  resized.clear();
  assert.equal(resized.circuits.locations.size, 0);
});
test("drones hover and cruise, rovers fall and drive on terrain, and motors off obey rotated gravity", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(100, 100);
    w.setGravity(gx, gy);
    w.border = "looping";
    assert.ok(w.missiles.spawn(50, 50, gy, -gx, M.Drone));
    const a = w.missiles.items[0],
      height = a.x * gx + a.y * gy,
      start = a.x * gy - a.y * gx;
    run(w, 120);
    assert.ok(Math.abs(a.x * gx + a.y * gy - height) < 0.2);
    assert.ok(Math.abs(a.x * gy - a.y * gx - start) > 20);
    assert.ok(a.health > 90);
    w.mechanics.machineMotors = false;
    const before = a.x * gx + a.y * gy;
    run(w, 10);
    assert.ok(a.x * gx + a.y * gy > before + 2);
  }
  const w = new World(100, 80);
  for (let x = 0; x < 100; x++) w.set(at(w, x, 65), M.Wall);
  w.missiles.spawn(20, 25, 1, 0, M.Rover);
  const a = w.missiles.items[0];
  run(w, 80);
  assert.ok(a.y > 55 && a.y < 65);
  const before = a.x;
  run(w, 40);
  assert.ok(a.x > before + 8);
  assert.ok(a.health > 0);
});
test("machines turn at obstacles, burn into debris, preserve state and reject invalid imports atomically", () => {
  const w = new World(80, 80);
  for (let y = 0; y < 80; y++) w.set(at(w, 42, y), M.Wall);
  w.missiles.spawn(20, 20, 1, 0, M.Drone);
  run(w, 100);
  assert.equal(w.missiles.items.length, 1);
  assert.ok(w.missiles.items[0].x < 42);
  assert.ok(w.missiles.items[0].health > 0);
  const saved = snapshot(w),
    other = new World(80, 80);
  restore(other, unpack(pack(saved)));
  assert.deepEqual(snapshot(other), saved);
  run(w, 40);
  run(other, 40);
  assert.deepEqual(snapshot(other), snapshot(w));
  for (const invalid of [
    { health: 0 },
    { health: 101 },
    { life: 1 },
    { material: String(M.Drone) },
    { vx: NaN },
  ]) {
    const data = structuredClone(saved);
    Object.assign(data.missiles[0], invalid);
    assert.throws(() => restore(other, data));
  }
  const a = w.missiles.items[0];
  w.missiles.brush("warm", a.x, a.y, 3, 0, 0, 500);
  run(w, 50);
  assert.equal(w.missiles.items.length, 0);
  assert.ok(w.count > 80);
  const small = new World(24, 24);
  small.set(at(small, 9, 10), M.Wall);
  assert.equal(small.missiles.spawn(10, 10, 1, 0, M.Rover), false);
});
