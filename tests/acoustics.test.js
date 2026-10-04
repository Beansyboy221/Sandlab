import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { reactContact } from "../src/sim/chemistry.js";
import { changePhase } from "../src/sim/phase-changes.js";
import { snapshot, restore } from "../src/persistence.js";
import { soundPosition } from "../src/audio.js";
const run = (w, n) => {
  for (let i = 0; i < n; i++) {
    w.tick++;
    w.fields.border = w.border;
    w.fields.rebuildBarriers(w);
    w.sound.step(w);
  }
};
const energy = (w) => w.sound.wave.reduce((sum, v) => sum + v * v, 0);
test("sounds propagate, reflect at solid walls and lose energy at void boundaries", () => {
  const solid = new World(64, 32),
    voidW = new World(64, 32);
  voidW.border = "void";
  for (const w of [solid, voidW]) {
    w.sound.emit("explosion", 8, 16, 1);
    run(w, 15);
    assert.ok(w.sound.wave[4 * 16 + 5] !== 0);
    run(w, 55);
    assert.ok(w.sound.wave.every(Number.isFinite));
  }
  assert.ok(
    energy(solid) > energy(voidW) * 1.2,
    "reflecting room retains more sound than open air",
  );
  const room = new World(64, 32);
  for (let y = 0; y < 32; y++) room.set(y * 64 + 31, M.Wall);
  room.sound.emit("impact", 12, 16, 1);
  run(room, 60);
  for (let y = 0; y < 8; y++)
    for (let x = 9; x < 16; x++)
      assert.equal(
        room.sound.wave[y * 16 + x],
        0,
        "thin wall blocks cross-room transmission",
      );
});
test("sponge absorbs waves, looping wraps them and silent waves eventually sleep", () => {
  const air = new World(32, 32),
    sponge = new World(32, 32);
  sponge.cells.fill(M.Sponge);
  for (const w of [air, sponge]) {
    w.sound.emit("fizz", 16, 16, 1);
    run(w, 35);
  }
  assert.ok(energy(sponge) < energy(air) * 0.2);
  const loop = new World(32, 32);
  loop.border = "looping";
  loop.sound.emit("impact", 1, 16, 1);
  run(loop, 3);
  assert.notEqual(loop.sound.wave[4 * 8 + 7], 0);
  run(air, 1500);
  assert.ok(!air.sound.active);
  assert.ok(air.sound.wave.every((v) => v === 0));
});
test("chemistry, melting, explosions and weighted falling powders emit distinct bounded events", () => {
  const w = new World(32, 32);
  w.set(330, M.Acid);
  w.set(331, M["Baking Soda"]);
  reactContact(w, 330, 10, 10);
  assert.equal(w.sound.events[0].kind, "fizz");
  w.set(500, M.Wax, 90);
  changePhase(w, 500, 20, 15, materials[M.Wax]);
  assert.ok(w.sound.events.some((e) => e.kind === "melt"));
  w.explode(24, 24, 5);
  assert.ok(w.sound.events.some((e) => e.kind === "explosion"));
  let weights = [];
  for (const name of ["Sand", "Steel Powder"]) {
    const a = new World(32, 32);
    for (let x = 0; x < 32; x++) a.set(25 * 32 + x, M.Wall);
    a.set(5 * 32 + 12, M[name]);
    for (let n = 0; n < 40; n++) a.step();
    const events = a.sound.events.filter((e) => e.kind === "grain");
    assert.ok(events.length);
    weights.push(events[0]);
    const emitted = a.sound.emitted;
    for (let n = 0; n < 30; n++) a.step();
    assert.equal(a.sound.emitted, emitted, "resting grains remain silent");
  }
  assert.ok(
    weights[1].mass > weights[0].mass &&
      weights[1].strength > weights[0].strength,
  );
  for (let t = 0; t < 80; t++) {
    w.sound.tick = t * 5;
    for (let x = 0; x < 32; x++) w.sound.emit("impact", x, 12, 0.3);
  }
  assert.ok(w.sound.events.length <= 64);
  const saved = snapshot(w);
  restore(w, saved);
  assert.equal(w.sound.events.length, 0);
  assert.equal(w.sound.active, false);
});
test("stereo pans in screen coordinates and a controlled player becomes the listener", () => {
  const r = {
    canvas: { width: 100, height: 80 },
    project: (x, y) => ({ x, y }),
  };
  assert.equal(soundPosition({ x: 50, y: 40 }, r).pan, 0);
  assert.equal(soundPosition({ x: 0, y: 40 }, r).pan, -1);
  assert.equal(soundPosition({ x: 100, y: 40 }, r).pan, 1);
  const player = { x: [5], y: [40] };
  assert.ok(soundPosition({ x: 30, y: 40 }, r, player).pan > 0);
  assert.equal(soundPosition({ x: 5, y: 40 }, r, player).pan, 0);
  const rotated = {
    canvas: r.canvas,
    project: (x, y) => ({ x: y, y: 100 - x }),
  };
  assert.ok(soundPosition({ x: 20, y: 90 }, rotated).pan > 0);
});

test("audible listener transport shares thin-wall barriers, openings and sponge absorption", () => {
  const w = new World(96, 64),
    s = w.sound;
  const sample = () => {
    w.fields.rebuildBarriers(w);
    s.rebuildAbsorption(w);
    s.listener.prepare(w, 20, 32);
    return s.listener.sample(72, 32);
  };
  const open = sample();
  for (let y = 0; y < 64; y++) w.set(y * 96 + 47, M.Wall);
  const sealed = sample();
  assert.ok(sealed.gain < open.gain * 0.25);
  assert.ok(sealed.cutoff < 600 && open.cutoff > 8000);
  for (let y = 28; y < 36; y++) w.set(y * 96 + 47, 0);
  const door = sample();
  assert.ok(
    door.gain > sealed.gain * 2 && door.cutoff > sealed.cutoff * 2,
    "sound finds the opening",
  );
  w.clear();
  for (let y = 0; y < 64; y++)
    for (let x = 40; x < 56; x++) w.set(y * 96 + x, M.Sponge);
  const absorbed = sample();
  assert.ok(absorbed.gain < open.gain);
  assert.ok(s.listener.visited <= Math.min(8192, s.wave.length));
});

test("interior flat surfaces reflect briefly while open edges and sponge absorb", () => {
  const w = new World(96, 64),
    s = w.sound;
  w.border = "void";
  const echoes = () => {
    w.fields.rebuildBarriers(w);
    s.rebuildAbsorption(w);
    s.listener.prepare(w, 24, 32);
    return s.listener.sample(32, 32).reflections;
  };
  assert.equal(echoes().length, 0);
  for (let y = 0; y < 64; y++) w.set(y * 96 + 48, M.Wall);
  const wall = echoes();
  assert.ok(wall.length > 0 && wall.length <= 3);
  assert.ok(
    wall.every((e) => e.delay >= 0.025 && e.delay <= 0.32 && e.gain <= 0.15),
  );
  for (let y = 0; y < 64; y++)
    for (let x = 44; x < 52; x++) w.set(y * 96 + x, M.Sponge);
  const sponge = echoes();
  assert.ok(
    sponge.reduce((n, e) => n + e.gain, 0) <
      wall.reduce((n, e) => n + e.gain, 0),
  );
});

test("sound bursts disperse quickly and sleep within three seconds without new sources", () => {
  const w = new World(96, 64);
  w.sound.emit("explosion", 48, 32, 1);
  run(w, 10);
  const initial = energy(w);
  run(w, 90);
  assert.ok(energy(w) < initial * 0.02);
  run(w, 90);
  assert.equal(w.sound.active, false);
  assert.ok(w.sound.wave.every((v) => v === 0));
});

test("flow and missiles emit distinct throttled movement sounds", () => {
  const w = new World(96, 64);
  w.sound.tick = 10;
  w.tick = 10;
  const i = 10 * 96 + 21;
  w.set(i, M.Water);
  w.fallDistance[i] = 5;
  w.tick = 11;
  const y = 11,
    x = 21;
  w.tryMove(i, x, y, 1); // j + tick = 1088, a staggered emitter.
  assert.ok(w.sound.events.some((e) => e.kind === "slosh"));
  w.sound.clear();
  w.missiles.spawn(20, 20, 1, 0, M.Missile);
  w.tick = 11;
  w.sound.tick = 11;
  w.missiles.step();
  assert.ok(w.sound.events.some((e) => e.kind === "swoosh"));
  const count = w.sound.emitted;
  w.sound.emit("swoosh", 20, 20, 0.2);
  assert.equal(w.sound.emitted, count);
});

test("listener fields remain bounded in large worlds and wrap across looping seams", () => {
  const w = new World(512, 512);
  w.fields.rebuildBarriers(w);
  w.sound.rebuildAbsorption(w);
  const listener = w.sound.listener;
  listener.prepare(w, 256, 256);
  assert.equal(listener.visited, 8192);
  const costs = listener.cost;
  listener.prepare(w, 256, 256);
  assert.equal(listener.cost, costs);
  const small = new World(64, 32);
  small.border = "looping";
  small.fields.rebuildBarriers(small);
  small.sound.rebuildAbsorption(small);
  small.sound.listener.prepare(small, 2, 16);
  assert.ok(small.sound.listener.sample(62, 16).clarity > 0.9);
});
