import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { react } from "../src/sim/reactions.js";
import { arcGap } from "../src/sim/sparks.js";
import { snapshot, restore, pack, unpack } from "../src/persistence.js";

test("TNT requires sustained heat, can be cooled before ignition, and responds promptly to shock", () => {
  const w = new World(30, 30),
    i = 15 * 30 + 15;
  w.set(i, M.TNT, 250);
  for (let n = 0; n < 10; n++) react(w, i, 15, 15);
  assert.equal(w.cells[i], M.TNT);
  assert.equal(w.life[i], 35);
  w.temp[i] = 20;
  react(w, i, 15, 15);
  assert.equal(w.life[i], 0);
  w.temp[i] = 250;
  for (let n = 0; n < 44; n++) react(w, i, 15, 15);
  assert.equal(w.cells[i], M.TNT);
  react(w, i, 15, 15);
  assert.equal(w.cells[i], M.Fire);
  w.clear();
  w.set(i, M.TNT);
  w.fields.add(15, 15, 10);
  react(w, i, 15, 15);
  assert.equal(w.cells[i], M.Fire);
});

test("gunpowder deflagrates using its own oxidizer while liquid fuel burns without detonating", () => {
  for (const id of [M.Gunpowder, M.Kerosene]) {
    const w = new World(30, 30),
      i = 465;
    w.set(i, id, 650);
    w.set(i + 5, M.Stone);
    for (let n = 0; n < 12 && !w.life[i]; n++) react(w, i, 15, 15);
    assert.equal(w.cells[i], id);
    assert.ok(w.life[i] > 0);
    assert.equal(w.cells[i + 5], M.Stone);
  }
  const w = new World(30, 30);
  w.set(465, M.Gunpowder, 650);
  for (const i of [464, 466, 435, 495]) w.set(i, M["CO2"]);
  for (let n = 0; n < 12 && !w.life[465]; n++) react(w, 465, 15, 15);
  assert.ok(w.life[465] > 0);
});

test("electrical arcs require an open conductor gap and hot embers never energize wires", () => {
  const w = new World(20, 20);
  w.set(210, M.Steel);
  w.set(212, M.Copper);
  arcGap(w, 210, 10, 10);
  assert.equal(w.cells[211], M.Spark);
  react(w, 211, 11, 10);
  assert.ok(w.charge[212] > 0);
  w.set(211, M.Glass);
  w.charge[212] = 0;
  arcGap(w, 210, 10, 10);
  assert.equal(w.cells[211], M.Glass);
  w.set(211, M.Spark, 800, 8);
  w.residue[211] = M.Ash;
  react(w, 211, 11, 10);
  assert.equal(w.charge[212], 0);
  w.life[211] = 1;
  react(w, 211, 11, 10);
  assert.equal(w.cells[211], M.Ash);
  const edge = new World(8, 8);
  edge.set(7, M.Steel);
  edge.set(9, M.Steel);
  arcGap(edge, 7, 7, 0);
  assert.ok(!edge.cells.includes(M.Spark));
});

test("conductors do not instantly ignite neighboring fuel and cold water quenches sparks without vaporizing", () => {
  const w = new World(20, 20);
  w.set(210, M.Steel);
  w.set(211, M.Wood);
  w.charge[210] = 6;
  w.tick = 1;
  react(w, 210, 10, 10);
  assert.equal(w.temp[211], 20);
  w.set(210, M.Spark);
  w.set(211, M.Water);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], 0);
  assert.equal(w.cells[211], M.Water);
  assert.equal(w.temp[211], 50);
  assert.ok(w.charge[211] > 0);
});

test("brine leaves salt when evaporating, retains solute through freezing, and countdowns survive saves", () => {
  const w = new World(20, 20);
  w.set(210, M.Brine, 130);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Salt);
  assert.equal(w.cells[190], M.Steam);
  w.set(210, M.Brine, -30);
  react(w, 210, 10, 10);
  assert.equal(w.cells[210], M.Ice);
  assert.equal(w.residue[210], M.Brine);
  const copy = new World(20, 20);
  restore(copy, unpack(pack(snapshot(w))));
  copy.temp[210] = 10;
  react(copy, 210, 10, 10);
  assert.equal(copy.cells[210], M.Brine);
  w.set(210, M.TNT, 250);
  react(w, 210, 10, 10);
  restore(copy, unpack(pack(snapshot(w))));
  assert.equal(copy.life[210], 44);
});
