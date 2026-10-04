import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M, materials, materialTables } from "../src/sim/materials.js";
import {
  defineMaterial,
  optical,
  acoustic,
} from "../src/sim/material-authoring.js";
import { compileMaterials } from "../src/sim/material-registry.js";
import { bendLight, spectralIndex } from "../src/optical-transport.js";
import { moveRay } from "../src/sim/energy.js";
import { Lighting } from "../src/lighting.js";
import { LightSkin } from "../src/light-skin.js";
import { snapshot, restore } from "../src/persistence.js";

const empty = ["Empty", "none", "#000000", 0, {}];
const authored = (traits) =>
  defineMaterial({
    name: "Filter",
    representation: "rigid",
    color: "#888888",
    density: 2,
    traits,
  });
test("optical and acoustic traits compose, enforce energy budgets, and compile to scalar tables", () => {
  const { materials: m, tables } = compileMaterials([
    empty,
    authored([optical(0.2, 0.3, 1.5, 0.02), acoustic(0.1, 0.4, 0.6)]),
  ]);
  assert.equal(m[1].lightTransmission, 0.5);
  assert.equal(m[1].occludesLight, false);
  assert.equal(m[1].refractsLight, true);
  assert.equal(tables.soundTransmission[1], 0.6);
  for (const traits of [
    [optical(0.9, 0.2)],
    [optical(-0.1, 0.2)],
    [optical(0, 0, 5)],
    [acoustic(0.1, 2)],
  ])
    assert.throws(() => compileMaterials([empty, authored(traits)]));
  for (const material of materials) {
    assert.ok(
      material.lightAbsorption + material.lightReflectivity <= 1 + 1e-8,
      material.name,
    );
    assert.equal(material.occludesLight, material.lightTransmission < 0.001);
    assert.equal(
      materialTables.lightReflectivity[material.id],
      material.lightReflectivity,
    );
  }
});
test("Snell refraction preserves unit directions, disperses violet more than red, and handles total reflection", () => {
  const out = new Float64Array(3),
    angle = Math.PI / 4;
  bendLight(Math.cos(angle), Math.sin(angle), -1, 0, 1, 1.5, out);
  assert.ok(Math.abs(out[1] - Math.sin(angle) / 1.5) < 1e-10);
  assert.ok(Math.abs(Math.hypot(out[0], out[1]) - 1) < 1e-10);
  assert.ok(
    spectralIndex(materials[M.Prism], 7) > spectralIndex(materials[M.Prism], 1),
  );
  bendLight(Math.cos(angle), Math.sin(angle), -1, 0, 1.52, 1, out);
  assert.equal(out[2], 1);
  assert.ok(out[0] < 0 && out[1] > 0);
});
test("white packets split into seven conserved colors while monochromatic lasers stay monochromatic", () => {
  for (const id of [M.Photon, M.Laser]) {
    const w = new World(64, 48),
      start = 20 * 64 + 28;
    for (let y = 5; y < 44; y++)
      for (let x = 30; x < 34; x++) w.set(y * 64 + x, M.Prism);
    w.set(start, id);
    w.heading[start] = 1;
    moveRay(w, start, 28, 20, materials[id]);
    const bands = new Set();
    let energy = 0;
    for (let i = 0; i < w.length; i++)
      if (materials[w.cells[i]].ray) {
        bands.add(w.growth[i]);
        energy += w.moisture[i];
        assert.ok(
          Number.isFinite(w.velocityX[i]) && Number.isFinite(w.velocityY[i]),
        );
      }
    assert.ok(energy <= 255, `energy ${energy}`);
    if (id === M.Photon)
      for (let band = 1; band <= 7; band++)
        assert.ok(bands.has(band), `missing band ${band}`);
    else assert.deepEqual(bands, new Set([1]));
    const b = new World(24, 24);
    restore(b, snapshot(w));
    assert.deepEqual(snapshot(b), snapshot(w));
    for (let n = 0; n < 150; n++) b.step();
    assert.ok(!b.cells.includes(M.Photon) && !b.cells.includes(M.Laser));
  }
});
test("spectral splitting cannot exceed the shared packet birth budget", () => {
  const w = new World(64, 48),
    start = 20 * 64 + 28;
  for (let y = 5; y < 44; y++) w.set(y * 64 + 30, M.Prism);
  w.set(start, M.Photon);
  w.heading[start] = 1;
  w.energyBudgetTick = w.tick;
  w.energyBirths = 64;
  moveRay(w, start, 28, 20, materials[M.Photon]);
  assert.equal(w.energyBirths, 64);
  assert.equal(w.cells.filter((id) => id === M.Photon).length, 1);
});
test("shadow caches reuse stable geometry but invalidate edited filters and stay within their memory budget", () => {
  const w = new World(80, 60),
    l = new Lighting();
  w.set(30 * 80 + 20, M.Fire);
  for (let y = 0; y < 60; y++) w.set(y * 80 + 45, M.Wall);
  w.set(30 * 80 + 35, M.Smoke);
  l.update(w, 0);
  const revision = l.opticalRevision;
  w.temp[30 * 80 + 20] = 2500;
  l.update(w, 0);
  assert.equal(l.opticalRevision, revision);
  assert.equal(l.shadows.cacheHit, true);
  assert.equal(l.shadows.raySteps, 0);
  w.set(30 * 80 + 35, 0);
  l.update(w, 0);
  assert.ok(l.opticalRevision > revision);
  assert.equal(l.shadows.cacheHit, false);
  const shadow = l.shadows,
    cachedDepth = shadow.entries[0].depth.slice();
  shadow.cacheLimit = shadow.cacheBytes;
  shadow.prepare(l, 10.5, 10.5, 80, 1);
  assert.equal(shadow.entry, null);
  assert.deepEqual(shadow.entries[0].depth, cachedDepth);
  assert.ok(shadow.cacheBytes <= shadow.cacheLimit);
});
test("lamp clusters have no self shadows and optical recasts remain bounded behind occluders", () => {
  const w = new World(100, 80),
    l = new Lighting();
  for (let y = 38; y <= 42; y++)
    for (let x = 18; x <= 22; x++) w.set(y * 100 + x, M.Lamp);
  for (let y = 10; y < 70; y++)
    for (let x = 50; x < 54; x++) w.set(y * 100 + x, M.Prism);
  l.update(w, 0.2);
  assert.ok(l.light[(20 * l.width + 17) * 3] > 0.01);
  assert.ok(l.secondary.casts > 0 && l.secondary.casts <= 64);
  assert.ok(l.secondary.steps <= 64 * 256);
  assert.ok(l.recast.some((v) => v > 0));
  for (let y = 0; y < 80; y++) w.set(y * 100 + 70, M.Wall);
  l.update(w, 0.2);
  for (let y = 0; y < l.height; y++)
    for (let x = 36; x < l.width; x++)
      assert.equal(l.light[(y * l.width + x) * 3], 0);
});
test("subsurface skin lights a bounded interior without lighting empty space behind a wall", () => {
  const f = {
      opaqueCount: 3,
      opaqueIndices: Uint32Array.of(1, 2, 3),
      worldWidth: 5,
      worldHeight: 1,
      silhouette: Uint8Array.of(0, 1, 1, 1, 0),
    },
    shade = { data: new Uint8ClampedArray(20) };
  shade.data[0] = 200;
  new LightSkin().apply(f, shade, 0);
  assert.equal(shade.data[4], 80);
  assert.equal(shade.data[8], 32);
  assert.equal(shade.data[16], 0);
});
test("material sound transmission is independent of airflow and respects absorption and dispersion", () => {
  const faces = [];
  for (const name of ["Wall", "Glass", "Sponge"]) {
    const w = new World(48, 48);
    for (let y = 0; y < 48; y++)
      for (let x = 24; x < 28; x++) w.set(y * 48 + x, M[name]);
    w.sound.rebuildAbsorption(w);
    faces.push(Math.min(...w.sound.horizontal));
  }
  assert.equal(faces[0], 0);
  assert.ok(faces[1] > 0 && faces[1] < 1);
  assert.ok(
    materials[M.Sponge].soundAbsorption > materials[M.Glass].soundAbsorption,
  );
  assert.ok(
    materials[M.Sponge].soundDispersion > materials[M.Glass].soundDispersion,
  );
});
test("fire rises both straight and diagonally in every gravity orientation without crossing closed corners", () => {
  for (const [gx, gy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const outcomes = new Set();
    for (let n = 0; n < 40; n++) {
      const w = new World(24, 24);
      w.setGravity(gx, gy);
      w.random = () => n / 40;
      w.set(12 * 24 + 12, M.Fire);
      w.move(12 * 24 + 12, 12, 12);
      const i = w.cells.indexOf(M.Fire),
        dx = (i % 24) - 12,
        dy = Math.floor(i / 24) - 12;
      assert.equal(dx * gx + dy * gy, -1);
      outcomes.add(dx * gy - dy * gx);
    }
    assert.deepEqual(outcomes, new Set([-1, 0, 1]));
    const w = new World(24, 24);
    w.setGravity(gx, gy);
    w.random = () => 0.1;
    w.set(12 * 24 + 12, M.Fire);
    w.set((12 - gy) * 24 + 12 - gx, M.Wall);
    w.set((12 - gx) * 24 + 12 + gy, M.Wall);
    w.set((12 + gx) * 24 + 12 - gy, M.Wall);
    w.move(12 * 24 + 12, 12, 12);
    assert.notEqual(w.cells[(12 - gy + gx) * 24 + 12 - gx - gy], M.Fire);
  }
});
