import { isEntity } from "../src/sim/entity-kinds.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials, categories } from "../src/sim/materials.js";
import { elasticFields } from "../src/sim/elasticity.js";
import { react } from "../src/sim/reactions.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import {
  copyRegion,
  pasteRegion,
  moveRegion,
} from "../src/selection-region.js";
import { resizeLevel } from "../src/level.js";
const at = (w, x, y) => y * w.width + x;
function line(name = "Rope", anchor = false) {
  const w = new World(64, 64);
  if (anchor) w.set(at(w, 9, 10), M.Wall);
  for (let x = 10; x < 30; x++) w.set(at(w, x, 10), M[name]);
  return w;
}
function links(w) {
  let count = 0;
  for (const i of w.elastic.locations.values())
    for (let d = 0; d < 4; d++)
      if (w.elastic.locations.has(w[`bond${d}`][i])) count++;
  return count;
}
test("only elastics have springs and every material has one meaningful palette group", () => {
  assert.deepEqual(
    materials.filter((m) => m.elasticity).map((m) => m.name),
    ["Sponge", "Rubber", "Rope", "Jelly", "Glue"],
  );
  for (const m of materials.filter(
    (m) => m.id && !m.deprecated && !isEntity(m),
  ))
    assert.ok(categories.includes(m.paletteCategory), m.name);
  assert.equal(materials[M.TNT].category, "solid");
  assert.equal(materials[M.TNT].paletteCategory, "solid");
  assert.equal(materials[M.Plant].paletteCategory, "life");
  assert.equal(materials[M.Repulsor].paletteCategory, "static");
});
test("free elastic lines fall together without becoming powders or losing their original links", () => {
  for (const name of ["Rope", "Rubber", "Jelly"]) {
    const w = line(name);
    for (let n = 0; n < 120; n++) w.step();
    assert.equal(w.count, 20);
    assert.equal(links(w), 19);
    const positions = [...w.elastic.locations.values()];
    assert.ok(positions.every((i) => Math.floor(i / w.width) > 10));
    assert.equal(
      new Set(positions.map((i) => Math.floor(i / w.width))).size,
      1,
    );
    assert.ok(w.velocityX.every(Number.isFinite));
  }
});
test("anchored strings sag with gravity, remain connected, and release when their support is erased", () => {
  const w = line("Rope", true);
  for (let n = 0; n < 300; n++) w.step();
  assert.equal(w.cells[at(w, 10, 10)], M.Rope);
  assert.equal(links(w), 19);
  assert.ok(
    [...w.elastic.locations.values()].some((i) => Math.floor(i / w.width) > 18),
  );
  w.set(at(w, 9, 10), 0);
  for (let n = 0; n < 40; n++) w.step();
  assert.ok(!w.elasticAnchor.some(Boolean));
  assert.equal(w.cells[at(w, 10, 10)], 0);
  assert.equal(w.count, 20);
});
test("cuts remove links and stretched links tear without reconnecting on contact", () => {
  const w = line();
  w.set(at(w, 20, 10), 0);
  w.step();
  assert.equal(links(w), 17);
  const i = at(w, 10, 10),
    j = at(w, 50, 10);
  w.swap(i, j);
  w.step();
  assert.equal(w.bond0[j], 0);
  assert.equal(w.count, 19);
});
test("elastic saves, history, resize, and independent clipboard copies preserve state and links", () => {
  const w = line();
  w.velocityX[at(w, 15, 10)] = 0.1;
  const loaded = new World();
  restore(loaded, unpack(pack(snapshot(w))));
  assert.deepEqual(snapshot(loaded), snapshot(w));
  assert.equal(links(loaded), 19);
  const clip = copyRegion(w, { x: 10, y: 10, width: 20, height: 1 });
  pasteRegion(w, clip, 10, 25);
  assert.equal(links(w), 38);
  assert.equal(new Set(w.elasticId.filter(Boolean)).size, 40);
  const originalIds = new Set(clip.arrays.elasticId);
  for (const i of w.elastic.locations.values())
    if (Math.floor(i / w.width) === 25)
      assert.ok(!originalIds.has(w.elasticId[i]));
  const mask = new Uint8Array(w.length);
  for (let x = 10; x < 30; x++) mask[at(w, x, 10)] = 1;
  assert.ok(moveRegion(w, clip, 12, 12, mask));
  assert.equal(links(w), 38);
  assert.equal(w.elasticId[at(w, 12, 12)], clip.arrays.elasticId[0]);
  const resized = resizeLevel(
    w,
    {
      name: "Elastic test",
      width: 80,
      height: 80,
      border: "solid",
      background: "#111b20",
    },
    -8,
    -8,
  );
  assert.equal(links(resized), 38);
  assert.equal(resized.count, 40);
  resized.step();
  assert.equal(resized.count, 40);
  const legacy = snapshot(line("Rubber"));
  for (const key of elasticFields) delete legacy.arrays[key];
  restore(loaded, legacy);
  assert.equal(links(loaded), 19);
});
test("malformed elastic state is rejected before it can change a world", () => {
  const w = line(),
    before = snapshot(w),
    bad = snapshot(w);
  bad.arrays.elasticId[at(w, 11, 10)] = bad.arrays.elasticId[at(w, 10, 10)];
  assert.throws(() => restore(w, bad), /identity/);
  assert.deepEqual(snapshot(w), before);
  const invalid = snapshot(w);
  invalid.arrays.offsetX[at(w, 10, 10)] = 10;
  assert.throws(() => restore(w, invalid), /invalid particle/);
});
test("elastic boundaries contain, wrap, or delete particles without stale identities", () => {
  for (const border of ["solid", "looping", "void"]) {
    const w = new World(16, 16);
    w.border = border;
    w.set(at(w, 5, 15), M.Jelly);
    w.velocityY[at(w, 5, 15)] = 0.4;
    for (let n = 0; n < 10; n++) w.step();
    assert.equal(w.count, border === "void" ? 0 : 1);
    assert.equal(w.elastic.locations.size, w.count);
    assert.ok(
      [...w.elastic.locations.values()].every((i) => i >= 0 && i < w.length),
    );
  }
});
test("soap dissolves in water, heated soapy water forms bubbles, and bubbles rise through water", () => {
  const w = new World(20, 20);
  w.set(210, M.Soap);
  w.set(211, M.Water);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], 0);
  assert.equal(w.cells[211], M.Water);
  assert.equal(w.dissolvedId[211], M.Soap);
  w.temp[211] = 70;
  w.tick = 6;
  w.random = () => 0;
  react(w, 211, 11, 10);
  assert.equal(w.cells[191], M.Bubble);
  assert.equal(w.cells[211], M.Water);
  assert.equal(w.dissolvedAmount[211], 1);
  w.set(171, M.Water);
  w.move(191, 11, 9);
  assert.equal(w.cells[171], M.Bubble);
  w.temp[171] = 100;
  react(w, 171, 11, 8);
  assert.equal(w.cells[171], 0);
  w.set(210, M.Bubble);
  w.fields.add(10, 10, 10);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], 0);
});
test("bubbles have varied lifetimes and exposed foam drains sooner than submerged bubbles", () => {
  const w = new World(20, 20);
  for (let i = 40; i < 60; i++) w.set(i, M.Bubble);
  assert.ok(new Set(w.life.subarray(40, 60)).size > 5);
  w.set(210, M.Bubble, 20, 100);
  w.set(250, M.Bubble, 20, 100);
  w.set(251, M.Water);
  w.life[210] = w.life[250] = 100;
  react(w, 210, 10, 10);
  react(w, 250, 10, 12);
  assert.equal(w.life[210], 95);
  assert.equal(w.life[250], 99);
});

test("palette has one entry per substance while drawing temperatures resolve alternate phases", async () => {
  const { paletteMaterials, paletteBase, drawingPhase, materialSearchText } =
    await import("../src/sim/material-families.js");
  assert.equal(paletteMaterials.length, 71);
  for (const [base, phase, temp] of [
    ["Salt", "Molten Salt", 850],
    ["Water", "Ice", -20],
    ["Water", "Steam", 150],
    ["Stone", "Lava", 1400],
    ["Copper", "Molten Copper", 1150],
    ["Nitrogen", "Liquid Nitrogen", -210],
    ["Wax", "Liquid Wax", 80],
  ]) {
    assert.equal(paletteBase[M[phase]], M[base]);
    assert.ok(!paletteMaterials.some((m) => m.id === M[phase]));
    assert.equal(drawingPhase(M[base], temp), M[phase]);
    assert.ok(
      materialSearchText(materials[M[base]]).includes(phase.toLowerCase()),
    );
    const w = new World(20, 20);
    w.brush(10, 10, 0, M[base], "circle", false, 1, 0, temp);
    assert.equal(w.cells[210], M[phase]);
    assert.equal(w.temp[210], temp);
  }
});
test("restoring different dimensions rebinds the elastic solver to the live world", () => {
  const source = new World(20, 20);
  source.border = "void";
  source.set(19 * 20 + 5, M.Jelly);
  source.velocityY[19 * 20 + 5] = 0.4;
  const target = new World(64, 64);
  restore(target, snapshot(source));
  assert.equal(target.elastic.world, target);
  for (let n = 0; n < 10; n++) target.step();
  assert.equal(target.count, 0);
  assert.equal(target.elastic.locations.size, 0);
});

test("fertilizer remains a powder in the behavioral palette", () => {
  assert.equal(materials[M.Fertilizer].category, "powder");
  assert.equal(materials[M.Fertilizer].paletteCategory, "powder");
});
test("thick elastic bodies keep falling at useful speed over long runs without self-blocking", () => {
  for (const name of ["Rope", "Rubber", "Jelly"]) {
    const w = new World(80, 220);
    for (let y = 10; y < 25; y++)
      for (let x = 25; x < 45; x++) w.set(at(w, x, y), M[name]);
    const meanY = () =>
      [...w.elastic.locations.values()].reduce(
        (sum, i) => sum + Math.floor(i / w.width) + w.offsetY[i],
        0,
      ) / w.count;
    let before = meanY();
    for (let interval = 0; interval < 5; interval++) {
      for (let n = 0; n < 30; n++) w.step();
      const after = meanY();
      assert.ok(
        after - before > 20,
        `${name} stalled during interval ${interval}: ${after - before}`,
      );
      before = after;
    }
    assert.equal(w.count, 300);
    assert.equal(w.elastic.locations.size, 300);
    assert.ok(
      [...w.elastic.locations.values()].every((i) => w.velocityY[i] > 0.8),
    );
  }
});
test("an eraser cuts a stretched link through an empty cell even while paused", () => {
  for (const shape of ["circle", "square"]) {
    const w = new World(32, 32);
    w.set(at(w, 10, 10), M.Jelly);
    w.set(at(w, 11, 10), M.Jelly);
    w.swap(at(w, 11, 10), at(w, 15, 10));
    assert.equal(w.cells[at(w, 12, 10)], 0);
    assert.equal(links(w), 1);
    const state = w.elastic.measure(at(w, 10, 10));
    assert.equal(state.stretch, 4);
    assert.ok(state.tension > 3);
    w.brush(12, 10, 0, 0, shape);
    assert.equal(links(w), 0);
    assert.equal(w.count, 2);
    for (let n = 0; n < 30; n++) w.step();
    assert.equal(links(w), 0);
    assert.equal(w.count, 2);
  }
});
test("cutting a tensioned strand releases its ends and does not join the two resulting pieces", () => {
  const w = new World(64, 80);
  for (let x = 5; x < 17; x++) w.set(at(w, x, 20), M.Rope);
  for (let x = 16; x > 5; x--) w.swap(at(w, x, 20), at(w, 5 + (x - 5) * 2, 20));
  const leftId = w.elasticId[at(w, 15, 20)],
    rightId = w.elasticId[at(w, 17, 20)];
  w.brush(16, 20, 0, 0);
  assert.equal(links(w), 10);
  for (let n = 0; n < 3; n++) w.step();
  const left = w.elastic.locations.get(leftId),
    right = w.elastic.locations.get(rightId);
  assert.ok((left % w.width) + w.offsetX[left] < 15);
  assert.ok((right % w.width) + w.offsetX[right] > 17);
  assert.ok(
    !w.elastic.bonds.some((b) => b[left] === rightId || b[right] === leftId),
  );
  assert.equal(w.count, 12);
});
test("a detached jelly piece continues falling after a full-width cut", () => {
  const w = new World(64, 180);
  for (let y = 10; y < 30; y++)
    for (let x = 20; x < 35; x++) w.set(at(w, x, y), M.Jelly);
  const ids = new Set(w.elastic.locations.keys());
  for (let x = 20; x < 35; x++) w.brush(x, 20, 0, 0, "square");
  assert.equal(w.count, 285);
  for (let n = 0; n < 90; n++) w.step();
  assert.ok(
    [...w.elastic.locations].every(
      ([id, i]) => ids.has(id) && Math.floor(i / w.width) > 60,
    ),
  );
  assert.equal(w.count, 285);
});

test("connected elastic contact preserves momentum; detached pieces still collide", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10,
    j = i + 1;
  w.set(i, M.Jelly);
  w.set(j, M.Jelly);
  w.elastic.substep(0);
  w.velocityX[i] = 0.7;
  w.velocityY[i] = 0.4;
  const particle = w.elasticId[i];
  w.elastic.moveAxis(i, 0.7, true);
  const moved = w.elastic.locations.get(particle);
  assert.equal(w.velocityX[moved], Math.fround(0.7));
  assert.equal(w.velocityY[moved], Math.fround(0.4));
  assert.ok(Math.abs((moved % w.width) + w.offsetX[moved] - 10.7) < 1e-6);
  // A separate pair with no bonds must still resolve real surface contact.
  w.clear();
  w.set(i, M.Jelly, 20, 0, false);
  w.set(j, M.Jelly, 20, 0, false);
  w.elastic.substep(0);
  w.velocityX[i] = 0.7;
  w.elastic.moveAxis(i, 0.7, true);
  assert.ok(w.velocityX[i] < 0);
  assert.equal(w.count, 2);
  assert.equal(w.elastic.locations.size, 2);
});
test("deforming elastic blocks do not arrest shared diagonal motion", () => {
  for (const name of ["Rope", "Rubber", "Jelly"]) {
    const w = new World(180, 220);
    for (let y = 20; y < 45; y++)
      for (let x = 30; x < 60; x++) {
        const i = y * w.width + x;
        w.set(i, M[name]);
        w.velocityX[i] = 0.35 + (w.random() - 0.5) * 0.1;
        w.velocityY[i] = 0.8 + (w.random() - 0.5) * 0.1;
      }
    for (let n = 0; n < 90; n++) w.step();
    const positions = [...w.elastic.locations.values()];
    const x =
      positions.reduce((s, i) => s + (i % w.width) + w.offsetX[i], 0) / w.count;
    const y =
      positions.reduce(
        (s, i) => s + Math.floor(i / w.width) + w.offsetY[i],
        0,
      ) / w.count;
    assert.ok(x > 65, `${name} self-jammed horizontally: ${x}`);
    assert.ok(y > 110, `${name} self-jammed vertically: ${y}`);
    assert.equal(w.count, 750);
    assert.equal(w.elastic.locations.size, 750);
  }
});

test("delayed elastic raster placement survives saves and cannot tunnel through rigid walls", () => {
  const w = new World(32, 32),
    i = 10 * 32 + 10;
  w.set(i, M.Jelly);
  w.offsetX[i] = 1.4;
  const loaded = new World();
  restore(loaded, snapshot(w));
  assert.equal(loaded.offsetX[i], Math.fround(1.4));
  w.set(i + 1, M.Stone);
  w.velocityX[i] = 0.8;
  w.elastic.moveAxis(i, 1.8, true);
  assert.equal(w.cells[i], M.Jelly);
  assert.equal(w.cells[i + 1], M.Stone);
  assert.equal(w.cells[i + 2], 0);
  assert.ok(w.velocityX[i] < 0);
  assert.equal(w.count, 2);
});

test("unsupported deformed Jelly preserves free-flight momentum under all gravity orientations", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(500, 500);
    w.setGravity(gx, gy);
    w.seed = 7181;
    for (let y = 200; y < 225; y++)
      for (let x = 200; x < 230; x++) {
        const i = y * w.width + x;
        w.set(i, M.Jelly);
        const lateral = (w.random() - 0.5) * 1.5;
        w.velocityX[i] = gx * 0.6 + gy * lateral;
        w.velocityY[i] = gy * 0.6 - gx * lateral;
      }
    const depth = () =>
      [...w.elastic.locations.values()].reduce(
        (sum, i) =>
          sum +
          ((i % w.width) + w.offsetX[i]) * gx +
          (Math.floor(i / w.width) + w.offsetY[i]) * gy,
        0,
      ) / w.elastic.locations.size;
    for (let n = 0; n < 90; n++) w.step();
    const before = depth();
    for (let n = 0; n < 50; n++) w.step();
    assert.ok(
      depth() - before > 40,
      `free body stalled at gravity ${gx}, ${gy}`,
    );
    assert.equal(w.count, 750);
    assert.ok(!w.elasticAnchor.some(Boolean));
    assert.ok(w.offsetX.every((v) => Math.abs(v) <= 1.49 + 1e-6));
    assert.ok(w.offsetY.every((v) => Math.abs(v) <= 1.49 + 1e-6));
  }
});
