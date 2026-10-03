import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { collide } from "../src/sim/body-collisions.js";

function wheel(
  gravity = [0, 1],
  slope = 0,
  material = M.Steel,
  { width = 180, height = 180, floor = 65, drop = 40 } = {},
) {
  const w = new World(width, height),
    [gx, gy] = gravity;
  w.setGravity(gx, gy);
  const map = (u, v) => {
    const x = gy * u + gx * v + (gy < 0 || gx < 0 ? width - 1 : 0);
    const y = -gx * u + gy * v + (gx > 0 || gy < 0 ? height - 1 : 0);
    return y * w.width + x;
  };
  for (let u = 0; u < (gy ? width : height); u++)
    for (let v = Math.floor(floor + u * slope); v < (gx ? width : height); v++)
      w.set(map(u, v), M.Wall);
  for (let v = -6; v <= 6; v++)
    for (let u = -6; u <= 6; u++)
      if (u * u + v * v <= 36) w.set(map(30 + u, drop + v), material);
  w.rigid.rebuild();
  return { w, body: w.rigid.bodies[0] };
}
function simulate(w, body, ticks) {
  let pose = w.rigid.pose(body),
    turn = 0;
  for (let n = 0; n < ticks; n++) {
    w.rigid.step();
    const next = w.rigid.pose(body);
    assert.ok(next && Object.values(next).every(Number.isFinite));
    turn += Math.atan2(
      Math.sin(next.angle - pose.angle),
      Math.cos(next.angle - pose.angle),
    );
    pose = next;
  }
  return { pose, turn };
}

test("rounded dropped solids roll downhill without raster locks under every gravity direction", () => {
  for (const gravity of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const { w, body } = wheel(gravity, 0.3),
      before = w.rigid.pose(body),
      count = w.count;
    const { pose, turn } = simulate(w, body, 85);
    const [gx, gy] = gravity;
    assert.ok(
      (pose.x - before.x) * gy - (pose.y - before.y) * gx > 35,
      JSON.stringify({ gravity, pose, turn }),
    );
    assert.ok(Math.abs(turn) > 3, JSON.stringify({ gravity, pose, turn }));
    assert.ok((pose.x - before.x) * gx + (pose.y - before.y) * gy > 15);
    assert.equal(w.cells.filter((id) => id === M.Wall).length, count - 113);
    assert.equal(w.cells.filter((id) => id === M.Steel).length, 113);
    assert.equal(w.rigid.locations.size, 113);
    // Continuous rest lengths survive the unique-cell raster assignments.
    const a = w.rigid.locations.get(body.ids[0]),
      b = w.rigid.locations.get(body.ids.at(-1));
    const distance = Math.hypot(
      (a % w.width) + w.offsetX[a] - (b % w.width) - w.offsetX[b],
      Math.floor(a / w.width) +
        w.offsetY[a] -
        Math.floor(b / w.width) -
        w.offsetY[b],
    );
    assert.ok(
      Math.abs(
        distance - Math.hypot(w.restX[a] - w.restX[b], w.restY[a] - w.restY[b]),
      ) < 0.001,
    );
  }
});

test("shallow pixel ramps do not become flat supports at portrait canvas offsets", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    for (const floor of [161.1, 161.5]) {
      const { w, body } = wheel([gx, gy], 0.22, M.Steel, {
        width: gx ? 358 : 200,
        height: gx ? 200 : 358,
        floor,
        drop: 15,
      });
      const before = w.rigid.pose(body),
        { pose, turn } = simulate(w, body, 130);
      const across = (pose.x - before.x) * gy - (pose.y - before.y) * gx;
      assert.ok(
        across > 20 && Math.abs(turn) > 2,
        JSON.stringify({ gx, gy, floor, across, turn }),
      );
      assert.equal(w.rigid.locations.size, 113);
    }
  }
});

test("surface friction turns sideways motion into rolling instead of freezing or free skating", () => {
  const { w, body } = wheel();
  for (const i of w.rigid.locations.values()) w.velocityX[i] = 1.2;
  const before = w.rigid.pose(body),
    { pose, turn } = simulate(w, body, 65);
  assert.ok(pose.x - before.x > 35);
  assert.ok(turn > 2);
  assert.ok(pose.omega > 0.05);
  assert.ok(Math.abs(pose.vx - pose.omega * 6) < 0.25);
  assert.ok(Math.abs(pose.y - 59) < 0.75);
});

test("low-friction ice slides farther than wood and balanced blocks settle without damage", () => {
  function block(material) {
    const w = new World(140, 70);
    for (let x = 0; x < w.width; x++) w.set(50 * w.width + x, M.Wall);
    for (let y = 47; y < 50; y++)
      for (let x = 25; x < 35; x++) {
        const i = y * w.width + x;
        w.set(i, material);
        w.velocityX[i] = 1.2;
      }
    w.rigid.rebuild();
    const body = w.rigid.bodies[0],
      start = w.rigid.pose(body);
    const result = simulate(w, body, 100);
    assert.ok(Math.abs(result.pose.angle) < 0.01);
    assert.ok(w.damage.every((value) => value === 0));
    return result.pose.x - start.x;
  }
  assert.ok(block(M.Ice) > block(M.Wood) + 20);
});

test("off-center applied forces transfer angular momentum to a solid body", () => {
  const w = new World(80, 80);
  for (let y = 25; y < 30; y++)
    for (let x = 25; x < 37; x++) w.set(y * w.width + x, M.Steel);
  w.rigid.rebuild();
  const body = w.rigid.bodies[0];
  for (const i of w.rigid.locations.values())
    if (i % w.width < 28) w.velocityY[i] = 1;
  const pose = w.rigid.pose(body);
  assert.ok(pose.omega < -0.02);
  simulate(w, body, 10);
  assert.ok(Math.abs(w.rigid.pose(body).angle) > 0.1);
});

test("body contact impulses conserve linear/angular momentum and cannot create kinetic energy", () => {
  const w = new World(20, 20),
    i = 8 * 20 + 8,
    j = 9 * 20 + 8;
  w.set(i, M.Steel);
  w.set(j, M.Copper);
  const a = {
    ids: new Uint32Array([1]),
    mass: 12,
    inertia: 20,
    friction: 0.5,
    restitution: 0.1,
  };
  const b = {
    ids: new Uint32Array([2]),
    mass: 18,
    inertia: 26,
    friction: 0.4,
    restitution: 0.1,
  };
  const p = { x: 8, y: 8, vx: 0.4, vy: 0.45, omega: 0.03 };
  const op = { x: 9, y: 10, vx: 0, vy: 0, omega: -0.01 };
  const solver = {
    world: w,
    bodyOf: new Map([[w.elasticId[j], b]]),
    passable: (k) => k >= 0 && k !== j,
    pose: () => op,
    sync: () => {},
  };
  const totals = () => ({
    px: a.mass * p.vx + b.mass * op.vx,
    py: a.mass * p.vy + b.mass * op.vy,
    L:
      a.mass * (p.x * p.vy - p.y * p.vx) +
      a.inertia * p.omega +
      b.mass * (op.x * op.vy - op.y * op.vx) +
      b.inertia * op.omega,
    E:
      (a.mass * (p.vx * p.vx + p.vy * p.vy) +
        a.inertia * p.omega * p.omega +
        b.mass * (op.vx * op.vx + op.vy * op.vy) +
        b.inertia * op.omega * op.omega) /
      2,
  });
  const before = totals();
  collide(
    solver,
    a,
    p,
    { i, j, x: 8.5, y: 9, count: 1, minX: 8.5, maxX: 8.5, minY: 9, maxY: 9 },
    0.4,
    0.5,
  );
  const after = totals();
  for (const key of ["px", "py", "L"])
    assert.ok(Math.abs(after[key] - before[key]) < 1e-9, key);
  assert.ok(after.E <= before.E);
  assert.ok(
    Math.abs(op.omega + 0.01) > 0.001,
    "other body should receive torque too",
  );
});

test("cached atmospheric gradients stay identical at boundaries and refresh each force pass", () => {
  for (const border of ["solid", "void", "looping"]) {
    const w = new World(27, 31),
      f = w.fields;
    f.border = border;
    for (let i = 0; i < f.pressure.length; i++) f.pressure[i] = (i % 9) - 4;
    for (let pass = 0; pass < 2; pass++) {
      f.beginForceSample();
      for (let y = 0; y < w.height; y++)
        for (let x = 0; x < w.width; x++) {
          const i = f.forceGradient(x, y);
          assert.equal(
            f.gradientX[i],
            f.sample((x >> 2) - 1, y >> 2) - f.sample((x >> 2) + 1, y >> 2),
          );
          assert.equal(
            f.gradientY[i],
            f.sample(x >> 2, (y >> 2) - 1) - f.sample(x >> 2, (y >> 2) + 1),
          );
        }
      f.pressure.fill(7);
    }
  }
});

test("resting stacks transmit weight without gaining speed or accumulating damage", () => {
  const w = new World(100, 100);
  for (let x = 0; x < w.width; x++) w.set(80 * w.width + x, M.Wall);
  for (let y = 50; y < 80; y++)
    for (let x = 30; x < 50; x++)
      w.set(y * w.width + x, y < 60 ? M.Steel : y < 70 ? M.Copper : M.Steel);
  for (let n = 0; n < 160; n++) w.step();
  assert.equal(w.rigid.locations.size, 600);
  assert.equal(w.rigid.bodies.length, 3);
  assert.ok(w.damage.every((value) => value === 0));
  for (const body of w.rigid.bodies) {
    const pose = w.rigid.pose(body);
    assert.ok(Math.hypot(pose.vx, pose.vy) < 0.1);
    assert.ok(Math.abs(pose.angle) < 0.001);
  }
});

test("rolling bodies cross a looping seam and resume deterministically after saving", () => {
  const { w, body } = wheel();
  w.border = "looping";
  assert.ok(w.rigid.translate(body, 145, 0));
  for (const i of w.rigid.locations.values()) w.velocityX[i] = 1.5;
  simulate(w, body, 45);
  assert.equal(w.rigid.locations.size, 113);
  assert.ok(w.rigid.pose(body).x < 100, "wheel should cross the right seam");
  const loaded = new World();
  restore(loaded, unpack(pack(snapshot(w))));
  for (let n = 0; n < 15; n++) {
    w.step();
    loaded.step();
  }
  assert.deepEqual(snapshot(loaded), snapshot(w));
});

test("pressure changes invalidate cached forces during a particle pass", () => {
  const w = new World(32, 32),
    f = w.fields;
  f.beginForceSample();
  const i = f.forceGradient(12, 12);
  assert.equal(f.gradientX[i], 0);
  f.add(8, 12, 5);
  assert.equal(f.gradientX[f.forceGradient(12, 12)], 5);
  f.add(16, 12, 3);
  assert.equal(f.gradientX[f.forceGradient(12, 12)], 2);
});

test("electricity follows permanent connections through a rotating and cut wire", async () => {
  const { react } = await import("../src/sim/reactions.js");
  const w = new World(80, 80);
  for (let x = 25; x < 45; x++) w.set(30 * w.width + x, M.Steel);
  w.rigid.rebuild();
  const body = w.rigid.bodies[0],
    p = w.rigid.pose(body);
  p.angle = 0.6;
  assert.equal(w.rigid.plan(body, p), null);
  w.rigid.commit(body, p);
  const source = w.rigid.locations.get(body.ids[10]);
  w.charge[source] = 6;
  w.tick++;
  react(w, source, source % w.width, Math.floor(source / w.width));
  for (const id of [body.ids[9], body.ids[11]])
    assert.equal(w.charge[w.rigid.locations.get(id)], 6);
  w.set(w.rigid.locations.get(body.ids[10]), 0);
  w.rigid.rebuild();
  assert.equal(w.rigid.bodies.length, 2);
  for (const fragment of w.rigid.bodies)
    for (const id of fragment.ids) {
      const i = w.rigid.locations.get(id);
      w.rigid.connections.each(i, (j) =>
        assert.equal(w.rigid.bodyOf.get(w.elasticId[j]), fragment),
      );
    }
});

test("heat follows a rotating solid's physical links across diagonal raster cells", () => {
  const w = new World(80, 80);
  for (let x = 25; x < 45; x++) w.set(30 * w.width + x, M.Steel);
  w.rigid.rebuild();
  const body = w.rigid.bodies[0],
    p = w.rigid.pose(body);
  p.angle = 0.6;
  assert.equal(w.rigid.plan(body, p), null);
  w.rigid.commit(body, p);
  let source = -1,
    target = -1;
  for (const id of body.ids) {
    const i = w.rigid.locations.get(id),
      j = w.rigid.locations.get(w.bond0[i]);
    if (
      j !== undefined &&
      (i + 1) % 3 === 0 &&
      Math.abs((i % w.width) - (j % w.width)) +
        Math.abs(Math.floor(i / w.width) - Math.floor(j / w.width)) >
        1
    ) {
      source = i;
      target = j;
      break;
    }
  }
  assert.ok(source >= 0);
  w.temp[source] = 300;
  w.temp[target] = 0;
  const targetId = w.elasticId[target];
  w.step();
  assert.ok(w.temp[w.rigid.locations.get(targetId)] > 10);
});
