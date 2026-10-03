import { readFileSync } from "node:fs";
import { gitOutput } from "./git-output.mjs";
import { pathToFileURL } from "node:url";
export function siteChanged(paths, force = false) {
  return (
    force ||
    paths.some((path) =>
      /^(src\/|public\/|index\.html$|[^/]+\.css$|scripts\/build\.mjs$|\.openai\/hosting\.json$)/.test(
        path,
      ),
    )
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let publish = true;
  try {
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    if (
      process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" &&
      /^[0-9a-f]{40}$/.test(event.before) &&
      !/^[0]+$/.test(event.before)
    ) {
      const paths = gitOutput(["diff", "--name-only", event.before, "HEAD"])
        .split("\n")
        .filter(Boolean);
      publish = siteChanged(paths);
    }
  } catch {
    /* Missing commit/event history conservatively builds and publishes. */
  }
  console.log("site_changed=" + publish);
}
