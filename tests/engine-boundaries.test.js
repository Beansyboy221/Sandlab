import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { materialDefinitions } from "../src/sim/material-definitions.js";
import { actorDefinitions } from "../src/sim/entity-definitions.js";
import {
  compileActorProfiles,
  compileProjectileProfile,
} from "../src/sim/entity-registry.js";
import { projectileDefaults } from "../src/sim/projectile-profiles.js";
import { actorProfiles, humanProfile } from "../src/sim/creature-profiles.js";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { writeElasticPixels } from "../src/render/elastic-renderer.js";
import { snapshot } from "../src/persistence.js";

const root = resolve("src");
test("mechanical scheduling and collision rules have explicit solver ownership", () => {
  const pipeline = readFileSync("src/sim/solvers/pipeline.js", "utf8"),
    world = readFileSync("src/sim/world.js", "utf8"),
    physics = readFileSync("src/sim/solvers/physics.js", "utf8");
  assert.match(pipeline, /from "\.\/physics\.js"/);
  assert.doesNotMatch(
    pipeline,
    /w\.(?:rigid|elastic|stickmen|missiles|fragments)\.step\(/,
  );
  for (const method of [
    "move",
    "canMove",
    "tryMove",
    "setGravity",
    "explode",
  ]) {
    const body = world.match(
      new RegExp(`  ${method}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`),
    );
    assert.ok(body, method);
    assert.doesNotMatch(body[1], /\b(?:if|for|while)\b/, method);
  }
  assert.match(physics, /from "\.\/particle-motion\.js"/);
  assert.match(physics, /from "\.\/particle-contacts\.js"/);
  assert.match(
    readFileSync("src/sim/acoustics.js", "utf8"),
    /from "\.\/solvers\/acoustics\.js"/,
  );
  assert.match(
    readFileSync("src/sim/optical-rays.js", "utf8"),
    /from "\.\/solvers\/optics\.js"/,
  );
});
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(resolve(path, e.name))
      : e.name.endsWith(".js")
        ? [resolve(path, e.name)]
        : [],
  );
}
test("module imports resolve and headless solvers cannot depend on renderers or browser UI", () => {
  for (const file of files(root)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:from\s*|import\s*)["'](\.[^"']+)["']/g,
    )) {
      const target = resolve(dirname(file), match[1]);
      assert.ok(existsSync(target), `${file}: ${match[1]}`);
      if (file.startsWith(resolve("src/sim") + "/"))
        assert.ok(
          !target.startsWith(resolve("src/render") + "/") &&
            !/\/renderer\.js$/.test(target),
          file,
        );
    }
    if (file.startsWith(resolve("src/sim") + "/"))
      assert.doesNotMatch(
        source,
        /\b(?:document|window|Path2D|CanvasRenderingContext2D)\b/,
        file,
      );
  }
});
function assertData(value) {
  assert.notEqual(typeof value, "function");
  if (value && typeof value === "object")
    for (const child of Object.values(value)) assertData(child);
}
test("definitions contain data and actor compilation validates, copies and freezes anatomy", () => {
  assertData(materialDefinitions);
  assertData(actorDefinitions);
  const input = structuredClone(actorDefinitions),
    compiled = compileActorProfiles(input);
  assert.equal(compiled.player, compiled.ai);
  assert.deepEqual(compiled.ai.lengths, humanProfile.lengths);
  input.ai.x[0] = 500;
  assert.equal(compiled.ai.x[0], 0);
  assert.ok(Object.isFrozen(compiled) && Object.isFrozen(compiled.ai.links[0]));
  assert.throws(() => {
    compiled.ai.speed = 9;
  }, TypeError);
  for (const invalid of [
    { x: [1] },
    { links: [[0, 9]] },
    { speed: -1 },
    { mode: "script" },
  ]) {
    const bad = structuredClone(actorDefinitions);
    Object.assign(bad.ai, invalid);
    assert.throws(() => compileActorProfiles(bad), /Invalid actor/);
  }
  assert.throws(
    () => compileActorProfiles({ a: { base: "b" }, b: { base: "a" } }),
    /inheritance/,
  );
  assert.throws(() =>
    compileProjectileProfile({ lifetime: 999 }, projectileDefaults),
  );
  assert.equal(
    compileProjectileProfile({ thrust: 0.12 }, projectileDefaults).thrust,
    0.12,
  );
  assert.equal(actorProfiles.shark.prey[0], "fish");
});

test("elastic pixels preserve authoritative contents, particle colors, seams and cuts", () => {
  const w = new World(32, 32);
  w.set(10 * 32 + 8, M.Jelly);
  w.set(10 * 32 + 9, M.Jelly);
  w.swap(10 * 32 + 9, 10 * 32 + 13);
  w.set(10 * 32 + 11, M.Sand);
  const colors = new Uint8ClampedArray(w.length * 3).fill(180),
    pixels = new Uint8ClampedArray(w.length * 4);
  const sand = 10 * 32 + 11,
    node = 10 * 32 + 8;
  pixels[node * 4] = 37;
  pixels[node * 4 + 3] = 255;
  pixels[sand * 4] = 99;
  pixels[sand * 4 + 3] = 255;
  const before = snapshot(w);
  writeElasticPixels(w, pixels, colors);
  assert.equal(pixels[(10 * 32 + 10) * 4 + 3], 255);
  assert.equal(pixels[sand * 4], 99);
  assert.equal(pixels[node * 4], 37);
  assert.deepEqual(snapshot(w), before);
  w.elastic.cutBrush(10, 10, 0, "circle");
  pixels.fill(0);
  writeElasticPixels(w, pixels, colors);
  assert.equal(pixels[(10 * 32 + 10) * 4 + 3], 0);
  w.clear();
  w.border = "looping";
  w.set(10 * 32 + 31, M.Jelly);
  w.set(10 * 32 + 0, M.Jelly);
  pixels.fill(0);
  writeElasticPixels(w, pixels, colors);
  assert.equal(pixels[(10 * 32 + 16) * 4 + 3], 0);
});
