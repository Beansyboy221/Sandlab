import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canvasView,
  fittedCanvasSize,
  orientationTurn,
  gravityForTurn,
  transformPoint,
  inversePoint,
} from "../src/canvas-view.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { burnFuel } from "../src/sim/combustion.js";
import { grow } from "../src/sim/biology.js";
import { absorb } from "../src/sim/absorption.js";
import { strike } from "../src/sim/weather.js";
import { snapshot, restore } from "../src/persistence.js";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("short-side resolution determines dimensions from available area and orientation", () => {
  assert.deepEqual(fittedCanvasSize(100, 400, 700), {
    width: 100,
    height: 175,
  });
  assert.deepEqual(fittedCanvasSize(100, 700, 400), {
    width: 175,
    height: 100,
  });
  assert.deepEqual(fittedCanvasSize(100, 700, 400, 3), {
    width: 100,
    height: 175,
  });
  for (const [w, h] of [
    [400, 700],
    [700, 400],
    [1000, 100],
    [100, 1000],
    [800, 600],
    [320, 500],
  ])
    for (const short of [8, 64, 200, 512]) {
      const size = fittedCanvasSize(short, w, h);
      assert.ok(
        size.width >= 8 &&
          size.height >= 8 &&
          size.width <= 512 &&
          size.height <= 512 &&
          size.width * size.height <= 200000,
      );
    }
});
test("every world aspect fills every viewport, without cropping or blank margins", () => {
  for (const [width, height] of [
    [390, 694],
    [836, 328],
    [1440, 720],
    [700, 900],
  ])
    for (const [ww, wh] of [
      [200, 365],
      [320, 200],
      [8, 512],
    ])
      for (let turn = 0; turn < 4; turn++) {
        const view = canvasView(width, height, ww, wh, turn, 1, {
            x: ww / 2,
            y: wh / 2,
          }),
          v = view.viewport;
        const corners = [
          [0, 0],
          [ww, 0],
          [0, wh],
          [ww, wh],
        ].map(([x, y]) =>
          transformPoint(view.matrix, v.x + x * v.scale, v.y + y * v.scale),
        );
        close(Math.min(...corners.map((p) => p.x)), 0);
        close(Math.max(...corners.map((p) => p.x)), width);
        close(Math.min(...corners.map((p) => p.y)), 0);
        close(Math.max(...corners.map((p) => p.y)), height);
      }
});
test("rotated pointer transforms are invertible with zoom and off-center pan", () => {
  for (const fill of ["fit", "stretch"])
    for (let turn = 0; turn < 4; turn++)
      for (const zoom of [1, 2, 12]) {
        const view = canvasView(
            800,
            360,
            200,
            365,
            turn,
            zoom,
            {
              x: 87,
              y: 151,
            },
            fill,
          ),
          v = view.viewport;
        for (const [x, y] of [
          [0, 0],
          [70.5, 151.5],
          [200, 365],
        ]) {
          const pixel = transformPoint(
              view.matrix,
              v.x + x * v.scale,
              v.y + y * v.scale,
            ),
            point = inversePoint(view.matrix, pixel.x, pixel.y);
          close((point.x - v.x) / v.scale, x);
          close((point.y - v.y) / v.scale, y);
        }
      }
});
test("orientation gravity always points down on screen, while the world axes stay fixed to the device", () => {
  for (const angle of [0, 90, 180, 270, -90]) {
    const turn = orientationTurn(angle),
      g = gravityForTurn(turn),
      view = canvasView(800, 360, 200, 365, turn, 1, { x: 100, y: 182.5 });
    const origin = transformPoint(view.matrix, 0, 0),
      down = transformPoint(view.matrix, ...g);
    close(down.x - origin.x, 0);
    assert.ok(down.y > origin.y);
  }
});
test("powders and liquids fall, density swaps, and gases rise under every gravity direction", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    for (const id of [M.Sand, M.Water, M.Oil, M.Steam, M.Bubble]) {
      const w = new World(32, 32);
      w.setGravity(gx, gy);
      const i = 16 * 32 + 16;
      w.set(i, id);
      w.move(i, 16, 16);
      const sign = id === M.Steam || id === M.Bubble ? -1 : 1;
      assert.equal(w.cells[(16 + gy * sign) * 32 + 16 + gx * sign], id);
    }
    const w = new World(32, 32);
    w.setGravity(gx, gy);
    const i = 16 * 32 + 16,
      j = (16 + gy) * 32 + 16 + gx;
    w.set(i, M.Sand);
    w.set(j, M.Water);
    w.move(i, 16, 16);
    assert.equal(w.cells[j], M.Sand);
    assert.equal(w.cells[i], M.Water);
    w.set(i, M.Water);
    w.set(j, M.Oil);
    w.move(i, 16, 16);
    assert.equal(w.cells[i], M.Oil);
    assert.equal(w.cells[j], M.Water);
  }
});
test("elastic bodies accelerate along each gravity direction instead of grid-down", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(100, 100);
    w.setGravity(gx, gy);
    for (let y = 45; y < 55; y++)
      for (let x = 45; x < 55; x++) w.set(y * 100 + x, M.Jelly);
    for (let n = 0; n < 30; n++) w.step();
    const positions = [...w.elastic.locations.values()];
    const dx =
      positions.reduce((sum, i) => sum + (i % 100) + w.offsetX[i] - 49.5, 0) /
      100;
    const dy =
      positions.reduce(
        (sum, i) => sum + Math.floor(i / 100) + w.offsetY[i] - 49.5,
        0,
      ) / 100;
    assert.ok(dx * gx + dy * gy > 20);
    assert.ok(Math.abs(dx * gy - dy * gx) < 0.1);
    assert.equal(w.count, 100);
  }
});
test("fire vents and smoke plumes, plants, and sponge release respect gravity", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(32, 32);
    w.setGravity(gx, gy);
    w.random = () => 0;
    const i = 16 * 32 + 16;
    w.set(i, M.Wood, 700, 100);
    burnFuel(w, i, 16, 16, materials[M.Wood]);
    assert.equal(w.cells[w.relativeIndex(16, 16, 0, -1)], M.Fire);
    assert.equal(w.cells[w.relativeIndex(16, 16, -1, -2)], M["CO2"]);
    w.clear();
    w.set(i, M.Plant);
    w.moisture[i] = 120;
    grow(w, i, 16, 16);
    assert.equal(w.cells[w.relativeIndex(16, 16, 0, -1)], M.Plant);
    w.clear();
    w.set(i, M.Sponge);
    w.storedLiquid[i] = M.Water;
    w.storedAmount[i] = 1;
    w.cooldown[i] = 20;
    absorb(w, i, 16, 16);
    assert.equal(w.cells[w.relativeIndex(16, 16, 0, 1)], M.Water);
  }
});
import { materials } from "../src/sim/materials.js";
test("lightning follows gravity and hits a conductor under all four rotations", () => {
  for (const [gx, gy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const w = new World(32, 32);
    w.setGravity(gx, gy);
    w.random = () => 0.9;
    const j = (16 + gy * 8) * 32 + 16 + gx * 8;
    w.set(j, M.Steel);
    strike(w, 16, 16);
    assert.equal(w.charge[j], 6);
    for (let d = 0; d < 8; d++)
      assert.equal(w.cells[(16 + gy * d) * 32 + 16 + gx * d], M.Lightning);
  }
});
test("gravity wakes sleeping chunks and remains current when another saved grid is restored", () => {
  const w = new World(32, 32);
  w.set(10 * 32 + 10, M.Sand);
  w.tick = 100;
  w.motionStamp.fill(0);
  w.setGravity(-1, 0);
  assert.ok(w.motionStamp.every((v) => v === 101));
  w.step();
  assert.equal(w.cells[10 * 32 + 9], M.Sand);
  const saved = snapshot(new World(48, 48));
  restore(w, saved);
  assert.deepEqual([w.gravityX, w.gravityY], [-1, 0]);
});

test("Fit centers the complete canvas at uniform scale under all rotations and aspect ratios", () => {
  for (const [width, height] of [
    [390, 694],
    [836, 328],
    [1440, 720],
  ])
    for (const [ww, wh] of [
      [200, 365],
      [320, 200],
      [8, 512],
    ])
      for (let turn = 0; turn < 4; turn++) {
        const view = canvasView(
            width,
            height,
            ww,
            wh,
            turn,
            1,
            { x: ww / 2, y: wh / 2 },
            "fit",
          ),
          v = view.viewport;
        const corners = [
          [0, 0],
          [ww, 0],
          [0, wh],
          [ww, wh],
        ].map(([x, y]) =>
          transformPoint(view.matrix, v.x + x * v.scale, v.y + y * v.scale),
        );
        const xs = corners.map((p) => p.x),
          ys = corners.map((p) => p.y),
          left = Math.min(...xs),
          right = Math.max(...xs),
          top = Math.min(...ys),
          bottom = Math.max(...ys);
        assert.ok(
          left >= -1e-7 &&
            top >= -1e-7 &&
            right <= width + 1e-7 &&
            bottom <= height + 1e-7,
        );
        close(left, width - right);
        close(top, height - bottom);
        assert.ok(Math.abs(left) < 1e-7 || Math.abs(top) < 1e-7);
        close(
          Math.hypot(view.matrix[0], view.matrix[1]),
          Math.hypot(view.matrix[2], view.matrix[3]),
        );
      }
});
