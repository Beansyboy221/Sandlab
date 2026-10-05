import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { creatureMotion } from "../src/sim/creature-behavior.js";
import {
  breathableWater,
  clearHabitatPath,
} from "../src/sim/creature-habitat.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";
import { validateMechanics } from "../src/sim/mechanics-options.js";
import { loadPreset } from "../src/presets.js";

function scene(
  material = M.Fish,
  points = [
    [50, 70],
    [60, 80],
    [70, 70],
  ],
) {
  const w = new World(200, 150);
  w.mechanics.predation = false;
  if (material === M.Fish || material === M.Shark)
    for (let i = 0; i < w.length; i++) w.set(i, M.Water);
  for (const [x, y] of points) assert.ok(w.stickmen.spawn(x, y, material));
  return w;
}
const update = (w) => w.stickmen.boids.update(w, w.stickmen.bodies);
const run = (w, ticks) => {
  for (let n = 0; n < ticks; n++) w.step();
};
function translate(a, dx, dy) {
  for (let n = 0; n < 9; n++) {
    a.x[n] += dx;
    a.px[n] += dx;
    a.y[n] += dy;
    a.py[n] += dy;
  }
}

test("local groups need the configured number of living same-species members in their habitat", () => {
  for (const material of [M.Bird, M.Fish, M.Shark]) {
    const w = scene(material, [
      [50, 70],
      [60, 80],
    ]);
    update(w);
    assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 0));
    assert.ok(w.stickmen.spawn(70, 70, material));
    update(w);
    assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 3));
    w.mechanics.flockMinimum = 4;
    update(w);
    assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 0));
    w.mechanics.flockMinimum = 3;
    w.stickmen.bodies[2].alive = false;
    update(w);
    assert.equal(w.stickmen.bodies[0].flockSize, 0);
    w.stickmen.bodies[2].alive = true;
    w.stickmen.bodies[2].bonds[1] = 0;
    update(w);
    assert.equal(w.stickmen.bodies[0].flockSize, 0);
    w.stickmen.bodies[2].bonds[1] = 1;
    w.mechanics.flocking = false;
    update(w);
    assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 0));
  }
  const w = scene(M.Fish, [
    [50, 70],
    [60, 80],
  ]);
  w.stickmen.spawn(70, 70, M.Shark);
  update(w);
  assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 0));
  w.stickmen.spawn(160, 70, M.Fish);
  update(w);
  assert.equal(w.stickmen.bodies[0].flockSize, 0);
  for (let i = 0; i < w.length; i++) w.set(i, M.Oil);
  update(w);
  assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 0));
});
test("boids align headings, close loose formations, and separate close or coincident bodies", () => {
  const aligned = scene(M.Fish, [
    [70, 70],
    [60, 80],
    [80, 60],
  ]);
  aligned.stickmen.bodies[1].direction = aligned.stickmen.bodies[2].direction =
    -1;
  update(aligned);
  assert.ok(
    aligned.stickmen.bodies[0].flockMove < 0,
    "A minority heading turns toward its neighbors",
  );
  const cohesive = scene(M.Fish, [
    [50, 70],
    [70, 60],
    [70, 80],
  ]);
  for (const a of cohesive.stickmen.bodies)
    for (const n of [1, 2]) a.py[n] = a.y[n] + 0.06;
  update(cohesive);
  assert.ok(
    cohesive.stickmen.bodies[0].flockMove > 0,
    "A straggler moves toward the group center",
  );
  const separated = scene(M.Fish, [
    [50, 70],
    [60, 70],
    [70, 70],
  ]);
  translate(separated.stickmen.bodies[1], -8, 0);
  update(separated);
  assert.ok(
    separated.stickmen.bodies[0].flockMove < 0,
    "Separation beats forward cruising when another body is too close",
  );
  const first = separated.stickmen.bodies[0];
  for (const a of separated.stickmen.bodies.slice(1))
    translate(a, first.x[2] - a.x[2], first.y[2] - a.y[2]);
  update(separated);
  assert.ok(
    separated.stickmen.bodies.every(
      (a) => Number.isFinite(a.flockMove) && Number.isFinite(a.flockLift),
    ),
  );
  const overlap = new Map(
    separated.stickmen.bodies.map((a) => [a.id, a.flockMove]),
  );
  separated.stickmen.bodies.reverse();
  update(separated);
  for (const a of separated.stickmen.bodies)
    assert.ok(
      Math.abs(a.flockMove - overlap.get(a.id)) < 0.00001,
      "Coincident bodies use stable separation directions",
    );
});
test("walls, dry gaps and hot water block schooling; flying animals cannot join through liquid", () => {
  for (const barrier of [M.Wall, M.Empty, M.Lava]) {
    const w = scene(M.Fish, [
      [50, 70],
      [70, 70],
      [80, 80],
    ]);
    for (let y = 0; y < w.height; y++) w.set(w.index(60, y), barrier);
    update(w);
    assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 0));
  }
  const hot = scene();
  for (let y = 0; y < 150; y++) hot.set(hot.index(55, y), M.Water, 60);
  update(hot);
  assert.ok(hot.stickmen.bodies.every((a) => a.flockSize === 0));
  const birds = scene(M.Bird, [
    [50, 70],
    [70, 70],
    [80, 80],
  ]);
  for (let y = 0; y < 150; y++) birds.set(birds.index(60, y), M.Water);
  update(birds);
  assert.ok(birds.stickmen.bodies.every((a) => a.flockSize === 0));
});
test("school steering diverts around walls and the water surface, while fleeing takes priority", () => {
  const w = scene(M.Fish, [
    [50, 70],
    [65, 70],
    [75, 70],
  ]);
  for (let y = 0; y < 150; y++) w.set(w.index(85, y), M.Wall);
  update(w);
  const a = w.stickmen.bodies[2],
    motion = creatureMotion(w, a);
  assert.equal(a.behavior, "Schooling");
  assert.ok(Math.abs(motion.lift) > 0.01);
  const speed = 0.13,
    dx = motion.move * speed,
    dy = motion.lift,
    scale = 7 / Math.hypot(dx, dy);
  assert.ok(
    clearHabitatPath(
      w,
      a.x[0],
      a.y[0],
      a.x[0] + dx * scale,
      a.y[0] + dy * scale,
      "swim",
    ),
  );
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < 200; x++) w.set(w.index(x, y), M.Empty);
  for (const b of w.stickmen.bodies) translate(b, 0, -5);
  update(w);
  const first = w.stickmen.bodies[0];
  first.flockMove = 0;
  first.flockLift = -0.13;
  const surface = creatureMotion(w, first);
  assert.ok(surface.lift > -0.1, "The school does not swim out into air");
  const prey = scene(M.Fish, [
    [50, 70],
    [60, 80],
    [70, 70],
  ]);
  prey.mechanics.predation = true;
  prey.stickmen.spawn(95, 70, M.Shark);
  update(prey);
  const escape = creatureMotion(prey, prey.stickmen.bodies[0]);
  assert.equal(prey.stickmen.bodies[0].behavior, "Fleeing");
  assert.ok(escape.move < 0);
});
test("neighbors wrap across looping edges, steering is order independent and gravity relative", () => {
  const w = scene(M.Fish, [
    [6, 70],
    [188, 70],
    [176, 80],
  ]);
  w.border = "looping";
  update(w);
  assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 3));
  const expected = new Map(
    w.stickmen.bodies.map((a) => [a.id, [a.flockMove, a.flockLift]]),
  );
  w.stickmen.bodies.reverse();
  update(w);
  for (const a of w.stickmen.bodies) {
    assert.ok(Math.abs(a.flockMove - expected.get(a.id)[0]) < 0.00001);
    assert.ok(Math.abs(a.flockLift - expected.get(a.id)[1]) < 0.00001);
  }
  const world = scene();
  for (const b of world.stickmen.bodies)
    for (const n of [1, 2]) {
      b.px[n] = b.x[n] - 0.1;
      b.py[n] = b.y[n] - 0.02;
    }
  update(world);
  const a = world.stickmen.bodies[0],
    vx = a.flockMove * 0.13,
    vy = a.flockLift;
  world.setGravity(1, 0);
  update(world);
  assert.ok(Math.abs(-a.flockMove * 0.13 - vy) < 0.00001);
  assert.ok(Math.abs(a.flockLift - vx) < 0.00001);
});
test("physical flocks remain healthy, cohesive and separated, and resume after save/load", () => {
  for (const material of [M.Bird, M.Fish]) {
    const w = scene(material, [
      [80, 70],
      [100, 55],
      [110, 75],
    ]);
    run(w, 400);
    const bodies = w.stickmen.bodies;
    assert.ok(
      bodies.every((a) => a.alive && a.health > 95 && a.bonds.every(Boolean)),
    );
    assert.ok(
      bodies.every((a) => a.flockSize === 3),
      material === M.Bird
        ? "Birds remain in a flock"
        : "Fish remain in a school",
    );
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const distance = Math.hypot(
          bodies[i].x[2] - bodies[j].x[2],
          bodies[i].y[2] - bodies[j].y[2],
        );
        assert.ok(
          distance > 3 && distance < 40,
          `Sustainable spacing: ${distance}`,
        );
      }
    if (material === M.Fish)
      assert.ok(bodies.every((a) => breathableWater(w, a.x[0], a.y[0])));
    const saved = snapshot(w);
    restore(w, unpack(pack(saved)));
    assert.deepEqual(w.stickmen.snapshot(), saved.stickmen);
    run(w, 30);
    assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 3));
    w.mechanics.flocking = false;
    w.step();
    assert.ok(
      w.stickmen.bodies.every(
        (a) => a.flockSize === 0 && a.behavior === "Patrolling",
      ),
    );
  }
});
test("flocking rules persist with the world and reject invalid values", () => {
  const w = scene();
  w.mechanics = validateMechanics({
    flocking: false,
    flockMinimum: 5,
    flockRange: 64,
  });
  const loaded = new World();
  restore(loaded, snapshot(w));
  assert.equal(loaded.mechanics.flocking, false);
  assert.equal(loaded.mechanics.flockMinimum, 5);
  assert.equal(loaded.mechanics.flockRange, 64);
  assert.throws(() => validateMechanics({ flockMinimum: 0 }));
  assert.throws(() => validateMechanics({ flockRange: NaN }));
});
test("the flocking world starts both groups safely across canvas sizes and gravity orientations", () => {
  for (const [width, height] of [
    [64, 64],
    [200, 300],
    [320, 200],
  ])
    for (const [gx, gy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const w = new World(width, height);
      w.setGravity(gx, gy);
      loadPreset(w, "flocks");
      assert.equal(
        w.stickmen.bodies.length,
        6,
        `${width}x${height}, gravity ${gx},${gy}`,
      );
      run(w, 30);
      assert.ok(w.stickmen.bodies.every((a) => a.flockSize === 3));
      run(w, 210);
      assert.ok(
        w.stickmen.bodies.every(
          (a) => a.alive && a.health > 95 && a.bonds.every(Boolean),
        ),
      );
      assert.ok(
        w.stickmen.bodies
          .filter((a) => a.material === M.Fish)
          .every((a) => breathableWater(w, a.x[0], a.y[0])),
      );
    }
});
