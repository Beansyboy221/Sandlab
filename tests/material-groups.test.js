import { test } from "node:test";
import assert from "node:assert/strict";
import { MaterialGroups, materialGroupsKey } from "../src/material-groups.js";
import { materials, M, categories } from "../src/sim/materials.js";
import { paletteMaterials } from "../src/sim/material-families.js";
function storage(raw = null) {
  return {
    value: raw,
    getItem() {
      return this.value;
    },
    setItem(k, v) {
      assert.equal(k, materialGroupsKey);
      this.value = v;
    },
  };
}

test("built-in groups reflect behavior and devices are functional components", () => {
  assert.ok(
    !categories.includes("fiction") && !categories.includes("explosive"),
  );
  for (const [name, category] of [
    ["TNT", "solid"],
    ["Gunpowder", "powder"],
    ["Methane", "gas"],
    ["Antimatter", "energy"],
    ["Black Hole", "static"],
    ["Repulsor", "static"],
    ["Heater", "static"],
    ["Cooler", "static"],
    ["Fan", "static"],
    ["Clone", "static"],
    ["Void", "static"],
    ["Lamp", "static"],
    ["Mirror", "solid"],
    ["Solar Cell", "solid"],
    ["Drone", "devices"],
    ["Rover", "devices"],
    ["Heat-Seeking Missile", "devices"],
  ]) {
    assert.equal(materials[M[name]].paletteCategory, category, name);
  }
  for (const m of paletteMaterials.filter(
    (m) => m.paletteCategory === "devices",
  ))
    assert.ok(m.circuit || m.projectile || m.conductive, m.name);
});
test("groups create, rename, edit, filter and persist without changing material definitions", () => {
  const store = storage(),
    groups = new MaterialGroups(store);
  const a = groups.save(null, "Workbench", [
    M.Sand,
    M.Water,
    M.Sand,
    0,
    M.Ice,
    999,
  ]);
  assert.deepEqual(a.materials, [M.Sand, M.Water]);
  assert.equal(materials[M.Sand].paletteCategory, "powder");
  assert.ok(groups.includes(a.id, M.Water));
  groups.save(a.id, "Circuit Kit", [M.Wire, M["AND Gate"]]);
  const b = groups.save(null, "Oddities", [M.Antimatter]);
  assert.notEqual(a.id, b.id);
  const loaded = new MaterialGroups(store);
  assert.deepEqual(loaded.groups, groups.groups);
  assert.ok(loaded.includes(a.id, M.Wire));
  loaded.delete(a.id);
  assert.equal(loaded.get(a.id), undefined);
  assert.equal(loaded.groups.length, 1);
});
test("malformed groups and unavailable storage cannot lose valid saved groups", () => {
  const store = storage(
    JSON.stringify([
      { id: "custom-1", name: "Good", materials: [M.Sand] },
      { id: "custom-1", name: "Duplicate", materials: [] },
      { id: "__proto__", name: "Bad", materials: [] },
    ]),
  );
  const groups = new MaterialGroups(store);
  assert.equal(groups.groups.length, 1);
  assert.throws(() => groups.save(null, "Good", []));
  assert.throws(() => groups.save(null, " ", []));
  assert.throws(() => groups.save(null, "x".repeat(33), []));
  const before = structuredClone(groups.groups);
  store.setItem = () => {
    throw Error("quota");
  };
  assert.throws(() => groups.save(null, "Unsaved", [M.Fire]));
  assert.deepEqual(groups.groups, before);
  assert.throws(() => groups.delete("custom-1"));
  assert.deepEqual(groups.groups, before);
  const broken = new MaterialGroups({
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  });
  assert.equal(broken.groups.length, 0);
  assert.throws(() => broken.save(null, "Group", []));
});
test("group count is bounded and custom names stay plain data", () => {
  const groups = new MaterialGroups(storage());
  for (let n = 0; n < 16; n++)
    groups.save(null, n === 0 ? "<img src=x onerror=alert(1)>" : `Group ${n}`, [
      M.Sand,
    ]);
  assert.equal(groups.groups[0].name, "<img src=x onerror=alert(1)>");
  assert.throws(() => groups.save(null, "Extra", []));
  groups.save(groups.groups[0].id, "Renamed", [M.Water]);
  assert.equal(groups.groups.length, 16);
});
