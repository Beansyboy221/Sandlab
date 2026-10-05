import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { RadialLiquidFlow } from "../src/sim/liquid-equilibrium.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";

function planet(width = 100, height = 100) {
  const w = new World(width, height);
  w.canvasMode = "planet";
  w.mechanics.temperatureSimulation = false;
  w.environment.update();
  return w;
}
function run(w, ticks) {
  for (let n = 0; n < ticks; n++) w.step();
}
function fill(w, id, shape) {
  for (let y = 0; y < w.height; y++)
    for (let x = 0; x < w.width; x++)
      if (shape(x + 0.5 - w.width / 2, y + 0.5 - w.height / 2))
        w.set(y * w.width + x, id);
}
function distribution(w, id) {
  let count = 0,
    sum = 0;
  const radii = new Float64Array(16);
  for (let i = 0; i < w.length; i++)
    if (w.cells[i] === id) {
      const x = (i % w.width) + 0.5 - w.width / 2,
        y = Math.floor(i / w.width) + 0.5 - w.height / 2,
        r2 = x * x + y * y,
        sector = (((Math.atan2(y, x) + Math.PI) * 8) / Math.PI) | 0;
      radii[sector] = Math.max(radii[sector], Math.sqrt(r2));
      sum += r2;
      count++;
    }
  return {
    count,
    meanRadius2: sum / count,
    spread: Math.max(...radii) - Math.min(...radii),
    compactness: sum / count / (count / (2 * Math.PI)),
  };
}

test("radial gravity is continuous across air tiles, symmetric and finite at the core", () => {
  const w = planet();
  for (const [x, y] of [
    [7.999, 31],
    [8.001, 31],
    [49.5, 49.5],
    [50.5, 50.5],
  ]) {
    w.environment.sample(x, y);
    const { x: gx, y: gy } = w.environment;
    assert.ok(Number.isFinite(gx) && Number.isFinite(gy));
    assert.ok(Math.abs(gx * (50 - y) - gy * (50 - x)) < 1e-10);
  }
  w.environment.sample(7.999, 31);
  const a = w.environment.x;
  w.environment.sample(8.001, 31);
  assert.ok(Math.abs(a - w.environment.x) < 0.001);
  w.environment.sample(50, 50);
  assert.equal(w.environment.x, 0);
  assert.equal(w.environment.y, 0);
});

test("square, cross, off-center and viscous liquid pools settle without axis-shaped outlines", () => {
  const scenes = [
    [100, 100, M.Water, (x, y) => Math.abs(x) < 20 && Math.abs(y) < 20],
    [
      160,
      100,
      M.Water,
      (x, y) =>
        (Math.abs(x) < 7 && Math.abs(y) < 35) ||
        (Math.abs(y) < 7 && Math.abs(x) < 35),
    ],
    [140, 100, M.Water, (x, y) => x >= 10 && x < 50 && y >= -40 && y < 0],
    [100, 100, M.Oil, (x, y) => Math.abs(x) < 20 && Math.abs(y) < 20],
    [65, 81, M.Water, (x, y) => Math.abs(x) < 10 && Math.abs(y) < 10],
    [240, 160, M.Water, (x, y) => Math.abs(x) < 35 && Math.abs(y) < 35],
  ];
  for (const [width, height, id, shape] of scenes) {
    const w = planet(width, height);
    fill(w, id, shape);
    const count = w.count;
    run(w, 900);
    const d = distribution(w, id);
    assert.equal(d.count, count);
    assert.ok(d.compactness < 1.015, JSON.stringify(d));
    assert.ok(d.spread < 3.5, JSON.stringify(d));
    assert.equal(
      w.chunks.reduce((a, b) => a + b, 0),
      count,
    );
    assert.ok(
      w.velocityX.every(Number.isFinite) && w.velocityY.every(Number.isFinite),
    );
  }
});

test("density stratifies radially: water displaces oil toward the outer surface", () => {
  const w = planet();
  fill(w, M.Water, (x, y) => Math.abs(x) < 20 && y >= -20 && y < 0);
  fill(w, M.Oil, (x, y) => Math.abs(x) < 20 && y >= 0 && y < 20);
  run(w, 1000);
  const water = distribution(w, M.Water),
    oil = distribution(w, M.Oil);
  assert.equal(water.count, 800);
  assert.equal(oil.count, 800);
  assert.ok(
    water.meanRadius2 < oil.meanRadius2 * 0.75,
    JSON.stringify({ water, oil }),
  );
});

test("a sealed wall box constrains the fluid instead of fitting it to a circle", () => {
  const w = planet(80, 80),
    walls = [];
  for (let y = 25; y <= 54; y++)
    for (let x = 25; x <= 54; x++) {
      const i = y * 80 + x;
      if (x === 25 || x === 54 || y === 25 || y === 54) {
        w.set(i, M.Wall);
        walls.push(i);
      } else if (!(x === 26 && y < 30)) w.set(i, M.Water);
    }
  const count = distribution(w, M.Water).count;
  run(w, 300);
  assert.equal(distribution(w, M.Water).count, count);
  assert.ok(walls.every((i) => w.cells[i] === M.Wall));
  for (let i = 0; i < w.length; i++)
    if (w.cells[i] === M.Water) {
      const x = i % 80,
        y = Math.floor(i / 80);
      assert.ok(x > 25 && x < 54 && y > 25 && y < 54);
    }
});

function identities(w) {
  const entries = [];
  for (let i = 0; i < w.length; i++)
    if (w.cells[i])
      entries.push([
        w.pigment[i],
        w.cells[i],
        w.temp[i],
        w.life[i],
        w.variant[i],
        w.dissolvedId[i],
        w.dissolvedAmount[i],
        w.velocityX[i],
        w.velocityY[i],
        w.offsetX[i],
        w.offsetY[i],
      ]);
  return entries.sort((a, b) => a[0] - b[0]);
}
test("pressure paths conserve particle state, reduce potential and have fixed work bounds", () => {
  const w = planet();
  fill(w, M.Water, (x, y) => Math.abs(x) < 20 && Math.abs(y) < 20);
  for (let i = 0; i < w.length; i++)
    if (w.cells[i]) {
      w.pigment[i] = 0xff000000 | i;
      w.temp[i] = 20 + i / 10000;
      w.dissolvedId[i] = M.Salt;
      w.dissolvedAmount[i] = 1;
    }
  const before = identities(w),
    potential = distribution(w, M.Water).meanRadius2;
  const flow = new RadialLiquidFlow(w),
    source = 69 * 100 + 69;
  w.random = () => 0;
  w.tick = (8 - (source % 8)) % 8;
  const original = w.tryMove.bind(w);
  w.tryMove = (i, x, y, g) => {
    assert.equal(
      Math.abs(x - (i % w.width)) + Math.abs(y - Math.floor(i / w.width)),
      1,
    );
    return original(i, x, y, g);
  };
  assert.ok(flow.settle(w, source, 69, 69));
  assert.ok(flow.visits <= 128 && flow.moves > 0 && flow.moves <= 8);
  assert.ok(distribution(w, M.Water).meanRadius2 < potential);
  assert.deepEqual(identities(w), before);
});

test("liquid pressure respects zero strength and stored viscosity", () => {
  const w = planet();
  fill(w, M.Water, (x, y) => Math.abs(x) < 20 && Math.abs(y) < 20);
  const i = 6969,
    flow = new RadialLiquidFlow(w);
  w.tick = (8 - (i % 8)) % 8;
  w.modeStrength = 0;
  assert.equal(flow.settle(w, i, 69, 69), false);
  assert.equal(flow.visits, 0);
  w.modeStrength = 1;
  w.random = () => 0.9;
  w.dissolvedId[i] = M.Soap;
  w.dissolvedAmount[i] = 4;
  assert.equal(flow.settle(w, i, 69, 69), false);
  w.dissolvedAmount[i] = 0;
  assert.equal(flow.settle(w, i, 69, 69), true);
});

test("pressure scratch is unsaved and settled liquids continue identically after export", () => {
  const w = planet(64, 64);
  fill(w, M.Water, (x, y) => Math.abs(x) < 14 && Math.abs(y) < 14);
  run(w, 80);
  const loaded = new World();
  restore(loaded, unpack(pack(snapshot(w))));
  loaded.mechanics = { ...w.mechanics };
  run(w, 40);
  run(loaded, 40);
  assert.deepEqual(snapshot(loaded), snapshot(w));
  assert.ok(w.environment.liquidFlow && loaded.environment.liquidFlow);
});
