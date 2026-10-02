import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { moveRay, reactEnergy } from "../src/sim/energy.js";
import { react } from "../src/sim/reactions.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { copyRegion, pasteRegion } from "../src/selection.js";
const cell = (w, x, y) => y * w.width + x;
function packet(name, heading = 0) {
  const w = new World(24, 24);
  w.set(250, M[name]);
  w.heading[250] = heading;
  return w;
}
function move(w, i = 250) {
  moveRay(w, i, i % w.width, Math.floor(i / w.width), materials[w.cells[i]]);
}

test("lasers cross glass and water without replacing them; opaque matter absorbs it", () => {
  for (const material of ["Glass", "Water", "Steel"]) {
    const w = packet("Laser");
    w.set(251, M[material]);
    move(w);
    assert.equal(w.cells[251], M[material]);
    assert.equal(
      w.cells.filter((id) => id === M.Laser).length,
      material === "Steel" ? 0 : 1,
    );
    if (material !== "Steel") assert.equal(w.cells[256], M.Laser);
  }
});
test("lasers reflect from mirrors, looping wraps them and boundaries absorb them", () => {
  const mirror = packet("Laser");
  mirror.set(251, M.Mirror);
  move(mirror);
  assert.equal(mirror.heading[250], 4);
  assert.equal(mirror.cells[251], M.Mirror);
  move(mirror);
  assert.equal(mirror.cells[245], M.Laser);
  for (const border of ["solid", "looping", "void"]) {
    const w = new World(24, 24);
    w.border = border;
    w.set(263, M.Laser);
    w.heading[263] = 0;
    move(w, 263);
    if (border === "looping") assert.equal(w.cells[244], M.Laser);
    else assert.equal(w.count, 0);
  }
});
test("lasers heat absorbing surfaces, solar cells turn light into circuit charge", () => {
  const laser = packet("Laser");
  laser.set(251, M.Wood);
  move(laser);
  assert.equal(laser.temp[251], 85);
  assert.equal(laser.cells[250], 0);
  const solar = packet("Laser");
  solar.set(251, M["Solar Cell"]);
  solar.set(252, M.Steel);
  move(solar);
  assert.equal(solar.charge[251], 6);
  solar.tick++;
  react(solar, 251, 11, 10);
  assert.equal(solar.charge[252], 6);
});
test("uranium retains bounded decay heating without emitting removed neutron particles", () => {
  const w = new World(24, 24);
  w.set(250, M.Uranium);
  w.random = () => 0;
  for (let n = 0; n < 10; n++) react(w, 250, 10, 10);
  assert.equal(w.cells[250], M.Uranium);
  assert.equal(w.count, 1);
  assert.ok(w.temp[250] > 20 && w.temp[250] <= 6000);
  assert.ok(w.fields.temperature.some((t) => t > 20));
});
test("black holes absorb mobile matter, repulsors push through pressure, and antimatter annihilates solids", () => {
  const hole = packet("Black Hole");
  hole.set(251, M.Sand);
  hole.set(249, M.Wall);
  react(hole, 250, 10, 10);
  assert.equal(hole.cells[251], 0);
  assert.equal(hole.cells[249], M.Wall);
  assert.ok(hole.fields.pressure.some((v) => v < 0));
  const repulsor = packet("Repulsor");
  react(repulsor, 250, 10, 10);
  assert.ok(repulsor.fields.pressure.some((v) => v > 0));
  const antimatter = packet("Antimatter");
  antimatter.set(251, M.Stone);
  react(antimatter, 250, 10, 10);
  assert.equal(antimatter.cells[250], M.Fire);
  assert.notEqual(antimatter.cells[251], M.Stone);
  assert.ok(antimatter.fields.pressure.some((v) => v > 0));
});
test("laser brush uses drag direction, ray heading travels with copies and saves, and legacy saves remain valid", () => {
  const w = new World(24, 24);
  w.brush(10, 10, 8, M.Laser, "circle", false, 0, -1);
  assert.equal(w.count, 1);
  assert.equal(w.heading[250], 6);
  const clip = copyRegion(w, { x: 10, y: 10, width: 1, height: 1 });
  pasteRegion(w, clip, 5, 5);
  assert.equal(w.heading[125], 6);
  const saved = snapshot(w),
    imported = new World(24, 24);
  restore(imported, unpack(pack(saved)));
  assert.deepEqual(snapshot(imported), saved);
  const malformed = structuredClone(saved);
  malformed.arrays.heading[0] = 8;
  assert.throws(() => restore(imported, malformed));
  assert.deepEqual(snapshot(imported), saved);
  const legacy = structuredClone(saved);
  delete legacy.arrays.heading;
  restore(imported, legacy);
  assert.ok(imported.heading.every((value) => value === 0));
});
test("energy worlds continue deterministically after a save and rays expire in confined volumes", () => {
  const a = new World(32, 32),
    b = new World(32, 32);
  a.border = "looping";
  a.set(10, M.Laser);
  a.set(30, M.Laser);
  a.set(300, M.Uranium);
  a.set(400, M.Laser);
  for (let n = 0; n < 20; n++) a.step();
  restore(b, unpack(pack(snapshot(a))));
  for (let n = 0; n < 80; n++) {
    a.step();
    b.step();
  }
  assert.deepEqual(snapshot(a), snapshot(b));
  const sealed = new World(24, 24);
  sealed.cells.fill(M.Glass);
  sealed.count = sealed.length;
  sealed.chunks.fill(0);
  for (let i = 0; i < sealed.length; i++) sealed.chunks[sealed.chunk(i)]++;
  sealed.set(250, M.Laser);
  move(sealed);
  assert.ok(!sealed.cells.includes(M.Laser));
  assert.equal(sealed.count, sealed.length - 1);
});

test("lightning brush size changes repeat cadence while clicks stay immediate and erasing stays continuous", async () => {
  const { Input, lightningInterval } = await import("../src/input.js");
  assert.equal(lightningInterval(1), 1000);
  assert.ok(lightningInterval(30) < 80);
  const original = performance.now;
  let now = 0;
  performance.now = () => now;
  try {
    const sample = (radius) => {
      let painted = 0;
      const input = {
        state: {
          tool: "paint",
          material: M.Lightning,
          radius,
          shape: "circle",
          replace: false,
        },
        lastLightningAt: -Infinity,
        world: { brush: () => painted++ },
      };
      for (now = 0; now <= 1000; now += 10)
        Input.prototype.paint.call(
          input,
          { x: 10, y: 10 },
          { x: 10, y: 10 },
          false,
        );
      return painted;
    };
    assert.equal(sample(1), 2);
    assert.ok(sample(30) >= 12);
    let paints = 0;
    const input = {
      state: {
        tool: "paint",
        material: M.Lightning,
        radius: 1,
        shape: "circle",
        replace: false,
        includeSolids: true,
      },
      lastLightningAt: 0,
      world: { brush: () => paints++ },
    };
    now = 1;
    Input.prototype.paint.call(
      input,
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      false,
      1,
      0,
      true,
    );
    assert.equal(paints, 1);
    Input.prototype.paint.call(
      input,
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      false,
    );
    assert.equal(paints, 1);
    Input.prototype.paint.call(input, { x: 10, y: 10 }, { x: 10, y: 10 }, true);
    assert.ok(paints > 1);
  } finally {
    performance.now = original;
  }
  const w = new World(24, 24);
  w.set(250, M.Lightning);
  w.clone[250] = 1;
  w.brush(10, 10, 12, M.Lightning);
  assert.equal(w.clone[250], 0);
  assert.equal(w.count, 1);
});
