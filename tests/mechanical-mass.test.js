import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials } from "../src/sim/materials.js";
import { cellMass } from "../src/sim/mechanical-mass.js";
import { snapshot, restore } from "../src/persistence.js";

function store(w, i, amount, type = M.Water) {
  w.storedAmount[i] = amount;
  w.storedLiquid[i] = amount ? type : 0;
}
function sponge() {
  const w = new World(32, 32),
    ids = [];
  for (let x = 10; x < 13; x++) {
    const i = 10 * 32 + x;
    ids.push(i);
    w.set(i, M.Sponge);
  }
  w.rigid.rebuild();
  return { w, body: w.rigid.bodies[0], ids };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} versus ${b}`);

test("reservoir units add liquid mass, shift the center and refresh inertia without topology changes", () => {
  const { w, body, ids } = sponge(),
    graph = body.edges,
    dry = body.mass;
  store(w, ids[2], 4);
  const pose = w.rigid.pose(body),
    m = materials[M.Sponge].density;
  close(body.mass, dry + 4);
  close(cellMass(w, ids[2]), m + 4);
  close(pose.x, (10.5 * m + 11.5 * m + 12.5 * (m + 4)) / body.mass);
  const expectedInertia = ids.reduce(
    (sum, i) =>
      sum +
      cellMass(w, i) *
        ((w.restX[i] - body.lx) ** 2 + (w.restY[i] - body.ly) ** 2 + 1 / 6),
    0,
  );
  close(body.inertia, expectedInertia);
  assert.equal(w.rigid.dirty, false);
  assert.equal(body.edges, graph);
  assert.equal(w.rigid.bodies[0], body);
  const updates = w.rigid.work.massUpdates;
  for (let n = 0; n < 10; n++) w.rigid.pose(body);
  assert.equal(w.rigid.work.massUpdates, updates);
  store(w, ids[2], 0);
  w.rigid.pose(body);
  assert.equal(body.mass, dry);
  assert.equal(body.inertia, body.dryInertia);
  assert.equal(body.radius, body.dryRadius);
});
test("redistribution with unchanged total mass and centroid still changes rotational inertia", () => {
  const { w, body, ids } = sponge();
  store(w, ids[1], 2);
  w.rigid.pose(body);
  const before = { mass: body.mass, x: body.lx, inertia: body.inertia };
  store(w, ids[1], 0);
  store(w, ids[0], 1);
  store(w, ids[2], 1);
  w.rigid.pose(body);
  close(body.mass, before.mass);
  close(body.lx, before.x);
  close(body.inertia, before.inertia + 2);
  store(w, ids[0], 1, M.Oil);
  w.rigid.pose(body);
  close(body.mass, body.dryMass + 1 + materials[M.Oil].density);
});
test("a wet solid responds less to pressure, while empty-space gravity stays mass independent", () => {
  function pushed(wet) {
    const w = new World(64, 64);
    for (let y = 20; y < 23; y++)
      for (let x = 20; x < 23; x++) {
        const i = y * 64 + x;
        w.set(i, M.Sponge);
        if (wet) store(w, i, 2);
      }
    w.rigid.rebuild();
    w.fields.rebuildBarriers(w);
    for (let i = 0; i < w.fields.pressure.length; i++)
      w.fields.pressure[i] = (i % w.fields.width) * 0.2;
    w.rigid.step();
    return w.rigid.pose(w.rigid.bodies[0]);
  }
  const dry = pushed(false),
    wet = pushed(true);
  assert.ok(Math.abs(dry.vx) > Math.abs(wet.vx) * 3);
  close(dry.vy, wet.vy);
});
test("elastic spring forces conserve paired momentum with unequal fluid loading", () => {
  const w = new World(24, 24),
    a = 10 * 24 + 10,
    b = a + 1;
  w.set(a, M.Rope);
  w.set(b, M.Rope);
  w.offsetX[b] = 0.1;
  store(w, b, 2);
  w.elastic.substep(0.01);
  close(cellMass(w, a) * w.velocityX[a] + cellMass(w, b) * w.velocityX[b], 0);
  assert.ok(
    w.velocityX[a] > 0 &&
      Math.abs(w.velocityX[a]) > Math.abs(w.velocityX[b]) * 3,
  );
  close(w.velocityY[a], w.velocityY[b]);
});
test("added pore contents reduce buoyancy without expanding the occupied body volume", () => {
  const velocity = (wet) => {
    const w = new World(32, 32);
    for (let i = 0; i < w.length; i++) w.set(i, M.Water);
    for (let y = 14; y < 17; y++)
      for (let x = 14; x < 17; x++) {
        const i = y * 32 + x;
        w.set(i, M.Sponge);
        if (wet) store(w, i, 2);
      }
    w.rigid.rebuild();
    w.rigid.step();
    assert.equal(w.rigid.locations.size, 9);
    return w.rigid.pose(w.rigid.bodies[0]).vy;
  };
  assert.ok(velocity(false) < 0);
  assert.ok(velocity(true) > 0);
});
test("wet body rotation, movement and mass resume identically after a save", () => {
  const { w, body, ids } = sponge();
  store(w, ids[0], 2, M.Oil);
  store(w, ids[2], 3);
  const p = w.rigid.pose(body);
  p.angle = 0.4;
  p.omega = 0.03;
  assert.equal(w.rigid.plan(body, p), null);
  w.rigid.commit(body, p);
  const saved = snapshot(w),
    loaded = new World();
  restore(loaded, saved);
  for (let n = 0; n < 12; n++) {
    w.step();
    loaded.step();
  }
  assert.deepEqual(snapshot(w), snapshot(loaded));
  const wet = w.rigid.bodies[0],
    copy = loaded.rigid.bodies[0];
  close(wet.mass, copy.mass);
  close(wet.inertia, copy.inertia);
  assert.equal(w.rigid.locations.size, 3);
});
