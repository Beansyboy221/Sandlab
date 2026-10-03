import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { gitOutput } from "./git-output.mjs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { selectTests } from "./test-selection.mjs";
const root = process.cwd(),
  args = process.argv.slice(2),
  flags = new Set(["--all", "--changed", "--reuse", "--list", "--browser"]);
const available = readdirSync(join(root, "tests"))
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => "tests/" + f);
let base = null;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") {
    base = args[++i];
    if (!base || base.startsWith("-"))
      throw Error("--base needs a Git revision");
  } else if (args[i].startsWith("--") && !flags.has(args[i]))
    throw Error(`Unknown option: ${args[i]}`);
  else if (!args[i].startsWith("--")) names.push(args[i]);
}
function git(parameters) {
  return gitOutput(parameters, root).split("\n").filter(Boolean);
}
const changed =
  (!names.length && !args.includes("--all")) ||
  args.includes("--changed") ||
  base;
const paths = changed
  ? [
      ...new Set([
        ...git(["diff", "--name-only", base || "HEAD"]),
        ...git(["ls-files", "--others", "--exclude-standard"]),
      ]),
    ]
  : [];
const plan = args.includes("--all")
  ? {
      files: available.sort(),
      groups: [],
      full: true,
      reasons: [],
      browsers: ["browser_check"],
    }
  : selectTests(paths, available, names);
console.log(
  `${plan.full ? "Full" : "Focused"} check: ${plan.files.length} test files${plan.groups.length ? " · " + plan.groups.join(", ") : ""}`,
);
if (plan.reasons.length)
  console.log(`Conservative fallback for: ${plan.reasons.join(", ")}`);
if (plan.browsers.length)
  console.log(
    `Browser checks: ${plan.browsers.map((n) => "python3 tests/" + n + ".py").join(" ; ")}`,
  );
if (args.includes("--list")) {
  console.log(plan.files.join("\n") || "No simulation tests needed.");
  process.exit(0);
}
const directory = join(root, ".sandlab-cache", "checks");
mkdirSync(directory, { recursive: true });
function fingerprint() {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify([
      process.version,
      process.env.NODE_OPTIONS || "",
      plan.files,
    ]),
  );
  function add(path) {
    hash.update(relative(root, path) + "\0");
    hash.update(readFileSync(path));
  }
  function walk(path) {
    for (const e of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (
        e.name === "artifacts" ||
        e.name === "__pycache__" ||
        e.name.startsWith(".")
      )
        continue;
      if (e.isSymbolicLink())
        throw Error("Check fingerprint refuses symlinks.");
      if (e.isDirectory()) walk(join(path, e.name));
      else if (e.isFile()) add(join(path, e.name));
    }
  }
  for (const path of ["src", "scripts", "tests"]) walk(join(root, path));
  for (const path of [
    "package.json",
    "package-lock.json",
    "index.html",
    "style.css",
    "mobile.css",
  ])
    add(join(root, path));
  return hash.digest("hex");
}
if (plan.files.length) {
  const key = fingerprint(),
    cache = join(directory, key + ".json"),
    log = join(directory, key + ".log");
  let reuse = false;
  if (args.includes("--reuse"))
    try {
      const saved = JSON.parse(readFileSync(cache, "utf8"));
      reuse =
        saved.key === key &&
        Date.now() - saved.at >= 0 &&
        Date.now() - saved.at < 600000;
    } catch {}
  if (reuse)
    console.log(
      "PASS reused: identical inputs and Node version, within 10 minutes.",
    );
  else {
    const start = performance.now(),
      result = spawnSync(process.execPath, ["--test", ...plan.files], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
    const output =
      (result.stdout || "") +
      (result.stderr || "") +
      (result.status !== 0 && result.error
        ? "\nRunner error: " + result.error.message
        : "");
    writeFileSync(log, output);
    if (result.status !== 0) {
      console.error(output.split("\n").slice(-65).join("\n").slice(-12000));
      console.error(`Full failure log: ${log}`);
      process.exit(result.status || 1);
    }
    if (fingerprint() === key)
      writeFileSync(cache, JSON.stringify({ key, at: Date.now() }));
    console.log(
      `PASS: ${plan.files.length} test files in ${((performance.now() - start) / 1000).toFixed(2)}s. Log: ${relative(root, log)}`,
    );
  }
}
if (args.includes("--browser"))
  for (const name of plan.browsers) {
    const result = spawnSync("python3", ["tests/" + name + ".py"], {
      cwd: root,
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
