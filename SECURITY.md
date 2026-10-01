# Sandlab security review

Reviewed 2026-10-01. No malicious behavior was found in the checked-in application,
build script, or dependency configuration. This is a source review and regression
testing, not a guarantee against future changes, a compromised hosting account,
or browser vulnerabilities.

The published game contains only local HTML, CSS, and JavaScript. It has no runtime
packages, server, advertisements, analytics, remote fonts, remote scripts,
service worker, or application network requests. Saves stay in browser storage;
exports download only after a player presses Export.

The early HTML Content Security Policy blocks external scripts, inline JavaScript,
eval, network connections, frames, plugins, workers, base URL overrides, and form
submissions. Inline styles remain allowed for generated swatches and the interface.
PNG previews are validated; arbitrary URLs and SVG previews are rejected.
Save imports are JSON data, never code. World dimensions, compressed run lengths,
particle fields, pressure, and simulation metadata are checked before a live world
is replaced. Imports are limited to 12 MB and worlds to 200,000 cells.

The build ships HTML, CSS, and application `.js` files only, rejects source symlinks,
and excludes hidden files. Prettier is the sole development dependency, pinned in
the package and integrity-locked; it is not included in the published game. The
2026-10-01 `npm audit` reported zero known dependency vulnerabilities.

Run `npm test`, `npm run test:security`, `npm run test:browser`, and `npm run build`
before publishing security-related changes. Repeat dependency audits when updating
packages (`npm audit --ignore-scripts`). Prefer `npm ci --ignore-scripts` when
installing tooling. Keep repository and hosting accounts protected with MFA and
limit who can deploy. Future external services require reviewing the policy again.

The current static host does not expose configurable security response headers in
this project. The HTML policy applies after its meta tag is parsed. Framing protection
(`frame-ancestors`) and `X-Content-Type-Options` require server response headers;
do not claim the meta policy supplies those protections.
