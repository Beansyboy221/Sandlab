import { spawnSync } from "node:child_process";
export function gitOutput(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  // Some sandbox monitors report EPERM after an actual successful exit.
  // Use the completed process status rather than execFileSync's wrapper error.
  if (result.status !== 0)
    throw Error(
      result.stderr || result.error?.message || "Git command failed.",
    );
  return result.stdout.trim();
}
