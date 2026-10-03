import { gitOutput } from "./git-output.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { selectTests } from "./test-selection.mjs";
const git = gitOutput;
const paths = [
  ...new Set(
    (
      git(["diff", "--name-only", "HEAD"]) +
      "\n" +
      git(["ls-files", "--others", "--exclude-standard"])
    )
      .split("\n")
      .filter(Boolean),
  ),
];
const available = readdirSync("tests")
    .filter((f) => f.endsWith(".test.js"))
    .map((f) => "tests/" + f),
  plan = selectTests(paths, available);
console.log(
  `Sandlab ${JSON.parse(readFileSync("package.json")).version} · ${git(["rev-parse", "--short", "HEAD"])}`,
);
console.log(
  `Working tree: ${paths.length ? paths.length + " changed files" : "clean"}`,
);
if (paths.length)
  console.log(
    paths.slice(0, 35).join("\n") +
      (paths.length > 35 ? "\n…" + (paths.length - 35) + " more" : ""),
  );
console.log("Map and workflow: AGENTS.md · backlog: BACKLOG.md");
if (paths.length) {
  console.log(
    `Suggested Node checks: ${plan.full ? "--all" : plan.groups.join(" ") || "--changed"} (${plan.files.length} files)`,
  );
  if (plan.browsers.length) console.log("Browser: " + plan.browsers.join(", "));
}
