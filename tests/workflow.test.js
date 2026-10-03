import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { selectTests, groups } from "../scripts/test-selection.mjs";
import { siteChanged } from "../scripts/site-changed.mjs";
const all = readdirSync("tests")
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => "tests/" + f);
test("focused groups reference real tests and unknown changes fall back to the full suite", () => {
  for (const name of Object.keys(groups))
    assert.ok(selectTests([], all, [name]).files.length > 0);
  for (const path of [
    "src/sim/world.js",
    "src/persistence.js",
    "src/sim/materials.js",
    "scripts/check.mjs",
    "package.json",
    "new-system.js",
  ])
    assert.deepEqual(selectTests([path], all).files, [...all].sort());
  assert.throws(() => selectTests([], all, ["typo"]));
});
test("collision and touch changes select their meaningful regressions without slow unrelated fixtures", () => {
  const collision = selectTests(["src/sim/body-motion.js"], all);
  assert.ok(collision.files.includes("tests/collision-bounds.test.js"));
  assert.ok(collision.files.includes("tests/rigid-physics.test.js"));
  assert.ok(!collision.files.includes("tests/presets.test.js"));
  const touch = selectTests(["src/input.js"], all);
  assert.ok(touch.files.includes("tests/touch-navigation.test.js"));
  assert.ok(touch.browsers.includes("touch_gestures_check"));
  assert.equal(selectTests(["README.md", "AGENTS.md"], all).files.length, 0);
  assert.deepEqual(selectTests(["tests/workflow.test.js"], all).files, [
    "tests/workflow.test.js",
  ]);
});
test("development-only changes skip publication; runtime, build and manual releases publish", () => {
  assert.equal(
    siteChanged([
      "AGENTS.md",
      "README.md",
      "scripts/check.mjs",
      "tests/workflow.test.js",
      "package.json",
    ]),
    false,
  );
  for (const path of [
    "src/sim/world.js",
    "index.html",
    "style.css",
    "mobile.css",
    "scripts/build.mjs",
    "public/icon.png",
    ".openai/hosting.json",
  ])
    assert.equal(siteChanged([path]), true, path);
  assert.equal(siteChanged([], true), true);
});
