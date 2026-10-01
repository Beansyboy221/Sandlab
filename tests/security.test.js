import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import {
  snapshot,
  pack,
  unpack,
  restore,
  safeThumbnail,
} from "../src/persistence.js";

test("malformed compressed files fail before expanding their arrays", () => {
  const data = pack(snapshot(new World(8, 8)));
  for (const patch of [
    { width: -8, height: -8 },
    { width: 1000000, height: 0 },
    { width: 513 },
    { version: 2 },
    { encoding: "executable" },
  ])
    assert.throws(() => unpack({ ...data, ...patch }));
  for (const runs of [
    [65, 0],
    [63, 0],
    [0, 0],
    [64, "<script>"],
    [64, Infinity],
    [64],
  ]) {
    assert.throws(() =>
      unpack({ ...data, arrays: { ...data.arrays, cells: runs } }),
    );
  }
  assert.throws(() => unpack(null));
});

test("invalid clocks and pressure cannot replace a live world or overflow Float32", () => {
  const world = new World(8, 8);
  world.set(10, M.Sand);
  for (const mutate of [
    (d) => (d.pressure[0] = 1e300),
    (d) => (d.pressure[0] = -81),
    (d) => (d.tick = -1),
    (d) => (d.seed = "bad"),
  ]) {
    const data = snapshot(world);
    mutate(data);
    assert.throws(() => restore(world, data));
    assert.equal(world.cells[10], M.Sand);
    assert.ok(world.fields.pressure.every(Number.isFinite));
  }
});

test("unrecognized JSON keys stay inert and never alter object prototypes", () => {
  const world = new World(8, 8);
  const data = JSON.parse(
    JSON.stringify(snapshot(world)).replace(
      '"version":1',
      '"version":1,"__proto__":{"sandlabPolluted":true},"script":"alert(1)"',
    ),
  );
  restore(world, unpack(data));
  assert.equal({}.sandlabPolluted, undefined);
  assert.equal(world.script, undefined);
});

test("saved previews accept only bounded PNG data, never remote URLs or SVG", () => {
  assert.equal(
    safeThumbnail("data:image/png;base64,iVBORw0KGgo="),
    "data:image/png;base64,iVBORw0KGgo=",
  );
  for (const value of [
    "https://example.com/track",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload='alert(1)'/>",
    'data:image/png;base64," onerror=alert(1)',
    "data:image/png;base64," + "A".repeat(500000),
    null,
  ])
    assert.equal(safeThumbnail(value), "");
});

test("the shipped page disables remote execution and external stylesheets", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  for (const directive of [
    "script-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ])
    assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /<script[^>]*>\s*[^<\s]/);
  assert.doesNotMatch(
    readFileSync(new URL("../style.css", import.meta.url), "utf8"),
    /@import|https?:\/\//,
  );
});

test("build excludes hidden and unrelated files and refuses source symlinks", () => {
  const directory = mkdtempSync(join(tmpdir(), "sandlab-build-security-"));
  try {
    mkdirSync(join(directory, "src"));
    for (const name of [
      "index.html",
      "style.css",
      "mobile.css",
      "src/app.js",
      "src/.env",
      "src/unrelated.exe",
    ])
      writeFileSync(join(directory, name), "test fixture");
    const script = new URL("../scripts/build.mjs", import.meta.url).pathname;
    const build = () =>
      spawnSync(process.execPath, [script], {
        cwd: directory,
        encoding: "utf8",
      });
    assert.equal(build().status, 0);
    assert.deepEqual(readdirSync(join(directory, "dist/src")), ["app.js"]);
    symlinkSync(join(directory, "src/.env"), join(directory, "src/leak.js"));
    const blocked = build();
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /refuses symlink/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
