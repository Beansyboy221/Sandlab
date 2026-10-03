import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import {
  copyRegion,
  pasteRegion,
  moveRegion,
} from "../src/selection-region.js";
import { resizeLevel } from "../src/level.js";
import { levelProperties } from "../src/level-properties.js";
import {
  transportActor,
  transportMissile,
} from "../src/sim/portal-transport.js";
import { transportElastics } from "../src/sim/portal-elastics.js";
import { cellProperties } from "../src/inspector.js";
import { PortalInput } from "../src/portal-input.js";

function shape(w, x, y, width, height, facing = 7) {
  w.portals.beginStroke(facing);
  for (let dy = 0; dy < height; dy++)
    for (let dx = 0; dx < width; dx++) w.set(w.index(x + dx, y + dy), M.Portal);
  const id = w.portalId[w.index(x, y)];
  w.portals.endStroke();
  return id;
}
function pair() {
  const w = new World(120, 100);
  const a = shape(w, 10, 40, 30, 2, 6),
    b = shape(w, 85, 15, 2, 40, 0);
  assert.ok(w.portals.link(a, b));
  return { w, a, b };
}
function occupancy(w) {
  assert.equal(w.count, w.cells.filter(Boolean).length);
  const chunks = new Uint16Array(w.chunks.length);
  for (let i = 0; i < w.length; i++) if (w.cells[i]) chunks[w.chunk(i)]++;
  assert.deepEqual(w.chunks, chunks);
}

test("Portal is appended, static, indestructible, and distinct strokes can touch without merging", () => {
  assert.equal(M.Portal, 129);
  assert.equal(materials[M.Portal].category, "static");
  const w = new World(40, 40);
  const a = shape(w, 10, 10, 8, 1),
    b = shape(w, 10, 11, 8, 1);
  assert.notEqual(a, b);
  w.portals.ensure();
  assert.equal(w.portals.shapes.size, 2);
  const i = w.index(12, 10);
  assert.equal(w.transform(i, M.Fire), false);
  w.explode(12, 10, 8);
  assert.equal(w.cells[i], M.Portal);
  occupancy(w);
});

test("powders, liquids, gases and energy retain particle properties and rotate momentum", () => {
  for (const name of [
    "Sand",
    "Water",
    "Oil",
    "Acid",
    "Oxygen",
    "Fire",
    "Laser",
  ]) {
    const { w } = pair(),
      i = w.index(25, 39);
    w.set(i, M[name], 73, 89);
    const lifetime = w.life[i];
    w.velocityX[i] = 0.2;
    w.velocityY[i] = 1.1;
    w.pigment[i] = 0xff89abce;
    w.charge[i] = 3;
    w.cooldown[i] = 7;
    w.nutrition[i] = 21;
    w.heading[i] = 2;
    assert.equal(w.tryMove(i, 25, 40, 1), true, name);
    const j = w.movedTo;
    assert.ok(j % w.width > 86, name);
    for (const [key, value] of [
      ["cells", M[name]],
      ["temp", 73],
      ["life", lifetime],
      ["pigment", 0xff89abce],
      ["charge", 3],
      ["cooldown", 7],
      ["nutrition", 21],
    ])
      assert.equal(w[key][j], value, `${name}.${key}`);
    assert.ok(Math.abs(w.velocityX[j] - 1.1) < 1e-6);
    assert.ok(Math.abs(w.velocityY[j] + 0.2) < 1e-6);
    assert.equal(w.portalCooldown[j], 12);
    if (name === "Laser") assert.equal(w.heading[j], 0);
    assert.equal(w.cells[i], 0);
    occupancy(w);
  }
});

test("portal crossing works with every orientation and reverses through a linked pair", () => {
  for (const [dx, dy, facing] of [
    [1, 0, 4],
    [-1, 0, 0],
    [0, 1, 6],
    [0, -1, 2],
  ]) {
    const w = new World(80, 80),
      a = shape(w, 25, 25, dx ? 1 : 10, dx ? 10 : 1, facing);
    const b = shape(w, 55, 55, 1, 10, 4);
    w.portals.link(a, b);
    const x = dx ? 25 - dx : 30,
      y = dy ? 25 - dy : 30,
      i = w.index(x, y);
    w.set(i, M.Sand);
    assert.ok(w.tryMove(i, x + dx, y + dy, 1));
    assert.ok(w.velocityX[w.movedTo] < 0);
    const back = w.index(54, 60);
    w.set(back, M.Water);
    assert.ok(w.tryMove(back, 55, 60, 0));
    occupancy(w);
  }
});

test("unlinked portals and blocked exits never delete or overwrite incoming matter", () => {
  const { w, a } = pair(),
    i = w.index(25, 39);
  w.set(i, M.Sand);
  for (let y = 15; y < 55; y++) w.set(w.index(87, y), M.Wall);
  const before = snapshot(w);
  assert.equal(w.tryMove(i, 25, 40, 1), false);
  assert.deepEqual(snapshot(w), before);
  w.portals.unlink(a);
  assert.equal(w.tryMove(i, 25, 40, 1), false);
  occupancy(w);
});

test("relinking four portals leaves reciprocal pairs and deleting an end cleans its partner", () => {
  const { w, a, b } = pair(),
    c = shape(w, 50, 70, 20, 1),
    d = shape(w, 80, 80, 20, 1);
  assert.ok(w.portals.link(c, d));
  assert.ok(w.portals.link(a, c));
  assert.equal(w.portalLink[w.index(10, 40)], c);
  assert.equal(w.portalLink[w.index(50, 70)], a);
  assert.equal(w.portalLink[w.index(85, 15)], 0);
  assert.equal(w.portalLink[w.index(80, 80)], 0);
  assert.equal(w.portals.link(a, a), false);
  for (const i of [...w.portals.shapes.get(c).cells]) w.set(i, 0);
  snapshot(w);
  assert.equal(w.portalLink[w.index(10, 40)], 0);
  assert.ok(w.portals.shapes.has(b));
});

test("rigid solids cross whole, retaining mass, connectivity and angular momentum", () => {
  const { w } = pair();
  for (let y = 34; y < 39; y++)
    for (let x = 20; x < 25; x++) w.set(w.index(x, y), M.Steel, 92);
  w.rigid.rebuild();
  const body = w.rigid.bodies[0],
    ids = [...body.ids];
  const pose = w.rigid.pose(body);
  pose.vy = 1.5;
  pose.omega = 0.04;
  w.rigid.sync(body, pose);
  for (let n = 0; n < 12 && w.rigid.pose(body).x < 60; n++) w.step();
  assert.ok(w.rigid.pose(body).x > 86);
  assert.deepEqual([...body.ids], ids);
  assert.equal(w.rigid.locations.size, 25);
  assert.ok(w.rigid.pose(body).vx > 0);
  assert.ok(w.rigid.pose(body).omega > 0);
  occupancy(w);
});

test("blocked or out-of-bounds body destinations retain every solid pixel", () => {
  const { w } = pair();
  for (let y = 15; y < 55; y++) w.set(w.index(90, y), M.Wall);
  for (let y = 35; y < 39; y++)
    for (let x = 20; x < 24; x++) w.set(w.index(x, y), M.Steel);
  for (let n = 0; n < 25; n++) w.step();
  assert.equal(w.rigid.locations.size, 16);
  assert.ok([...w.rigid.locations.values()].every((i) => i % w.width < 40));
  occupancy(w);
  const edge = new World(60, 60);
  edge.border = "void";
  const a = shape(edge, 10, 30, 20, 1, 6),
    b = shape(edge, 55, 5, 1, 25, 0);
  edge.portals.link(a, b);
  for (let y = 23; y < 28; y++)
    for (let x = 15; x < 20; x++) edge.set(edge.index(x, y), M.Steel);
  for (let n = 0; n < 20; n++) edge.step();
  assert.equal(edge.rigid.locations.size, 25);
});

test("ropes cross atomically without cutting their bonds or pinning themselves to a portal", () => {
  const { w } = pair();
  for (let x = 22; x < 28; x++) w.set(w.index(x, 39), M.Rope);
  const ids = [...w.elastic.locations.keys()];
  for (const i of w.elastic.locations.values()) w.velocityY[i] = 0.9;
  transportElastics(w.elastic);
  assert.ok([...w.elastic.locations.values()].every((i) => i % w.width > 86));
  assert.deepEqual(
    [...w.elastic.locations.keys()].sort((a, b) => a - b),
    ids,
  );
  assert.equal(
    [...w.elastic.locations.values()].filter((i) => w.bond0[i]).length,
    5,
  );
  assert.ok(
    [...w.elastic.locations.values()].every(
      (i) => w.portalCooldown[i] === 12 && !w.elasticAnchor[i],
    ),
  );
  occupancy(w);
});

test("creatures, player ragdolls, missiles and vehicles retain their state through portals", () => {
  for (const name of ["Player", "Cat", "Fish", "Bird"]) {
    const { w } = pair();
    assert.ok(w.stickmen.spawn(25, 32, M[name]));
    const a = w.stickmen.bodies[0];
    // Put the leading joint just above the entry, with a retained downward velocity.
    const bottom = Math.max(...a.y),
      shift = 39.5 - bottom;
    for (let n = 0; n < 9; n++) {
      a.y[n] += shift;
      a.py[n] = a.y[n] - 1;
      a.px[n] = a.x[n];
    }
    const health = a.health,
      bonds = [...a.bonds];
    assert.ok(transportActor(w, a), name);
    assert.ok(a.x[2] > 86, name);
    assert.equal(a.health, health);
    assert.deepEqual([...a.bonds], bonds);
    assert.ok(a.x[2] - a.px[2] > 0);
    assert.equal(transportActor(w, a), false, "cooldown");
    restore(w, unpack(pack(snapshot(w))));
    assert.ok(w.stickmen.bodies[0].portalUntil > w.tick);
  }
  for (const name of ["Seeking Missile", "Guided Missile", "Drone", "Rover"]) {
    const { w } = pair();
    assert.ok(w.missiles.spawn(25, 37, 0, 1, M[name]));
    const a = w.missiles.items[0];
    a.vx = 0;
    a.vy = 1;
    assert.ok(transportMissile(w, a, w.index(25, 40)), name);
    assert.ok(a.x > 86);
    assert.equal(a.life, materials[M[name]].vehicle ? 0 : 480);
    assert.equal(a.vx, 1);
    assert.equal(a.vy, 0);
    restore(w, unpack(pack(snapshot(w))));
    assert.ok(w.missiles.items[0].portalUntil > w.tick);
  }
});

test("saved links, selection moves, copied pairs and canvas crops preserve independent identities", () => {
  const { w, a, b } = pair(),
    original = snapshot(w);
  restore(w, unpack(pack(original)));
  assert.deepEqual(snapshot(w), original);
  const rows = cellProperties(w, { x: 25, y: 40 }).rows;
  assert.ok(
    rows.some(([key, value]) => key === "Linked to" && value === `#${b}`),
  );
  const clip = copyRegion(w, { x: 10, y: 40, width: 30, height: 2 }),
    mask = new Uint8Array(w.length);
  for (const i of w.portals.shapes.get(a).cells) mask[i] = 1;
  assert.ok(moveRegion(w, clip, 10, 60, mask));
  assert.equal(w.portalId[w.index(10, 60)], a);
  assert.equal(w.portalLink[w.index(85, 15)], a);
  const single = copyRegion(w, { x: 10, y: 60, width: 30, height: 2 });
  pasteRegion(w, single, 10, 70);
  assert.notEqual(w.portalId[w.index(10, 70)], a);
  assert.equal(w.portalLink[w.index(10, 70)], 0);
  const all = copyRegion(w, { x: 0, y: 0, width: w.width, height: w.height });
  const clone = new World(120, 100);
  pasteRegion(clone, all, 0, 0);
  const ca = clone.portalId[clone.index(10, 60)],
    cb = clone.portalId[clone.index(85, 15)];
  assert.equal(clone.portalLink[clone.index(10, 60)], cb);
  assert.equal(clone.portalLink[clone.index(85, 15)], ca);
  const cropped = resizeLevel(
    w,
    { ...levelProperties(w), width: 70, height: 100 },
    0,
    0,
  );
  assert.equal(cropped.portalLink[cropped.index(10, 60)], 0);
  restore(cropped, snapshot(cropped));
  occupancy(cropped);
});

test("malformed portal identities, relations and cooldowns are rejected before changing a world", () => {
  const { w } = pair(),
    original = snapshot(w),
    cell = w.index(10, 40);
  for (const mutate of [
    (s) => (s.arrays.portalLink[cell] = 999),
    (s) => (s.arrays.portalId[cell] = 0),
    (s) => (s.arrays.portalId[0] = 1),
    (s) => (s.arrays.portalCooldown[0] = 13),
    (s) => (s.arrays.heading[cell] = 1),
  ]) {
    const bad = structuredClone(original);
    mutate(bad);
    assert.throws(() => restore(w, bad));
    assert.deepEqual(snapshot(w), original);
  }
  const old = structuredClone(original);
  for (const key of ["portalId", "portalLink", "portalCooldown"])
    delete old.arrays[key];
  assert.throws(() => restore(w, old));
  const empty = snapshot(new World(16, 16));
  for (const key of ["portalId", "portalLink", "portalCooldown"])
    delete empty.arrays[key];
  restore(w, empty);
  assert.equal(w.portals.shapes.size, 0);
});
test("outline portals can be linked through their numbered center handles without painting their empty centers", () => {
  const w = new World(100, 80);
  for (const [x, y] of [
    [20, 20],
    [65, 35],
  ]) {
    w.portals.beginStroke();
    for (let dy = 0; dy < 10; dy++)
      for (let dx = 0; dx < 10; dx++)
        if (!dx || !dy || dx === 9 || dy === 9)
          w.set(w.index(x + dx, y + dy), M.Portal);
    w.portals.endStroke();
  }
  const renderer = { viewport: { scale: 2 } },
    state = { tool: "paint", material: M.Portal };
  let edits = 0;
  const input = new PortalInput(
    w,
    renderer,
    state,
    () => edits++,
    () => {},
  );
  assert.equal(w.cells[w.index(25, 25)], 0);
  assert.equal(input.begin({ x: 25, y: 25 }, false), true);
  input.move({ x: 70, y: 40 });
  assert.equal(renderer.portalDrag.target, 2);
  input.end({ x: 70, y: 40 });
  assert.equal(edits, 1);
  assert.equal(w.portalLink[w.index(20, 20)], 2);
  assert.equal(w.cells[w.index(25, 25)], 0);
});
