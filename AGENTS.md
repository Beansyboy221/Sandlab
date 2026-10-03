# Sandlab development map

Original browser sandbox; vanilla ES modules and Canvas, no runtime dependencies. Preserve stable material IDs, typed particle state, bounded collision work, local save validation, touch input, and the 60 FPS/tick caps. Never reorder registry definitions.

## Start small

- Run `npm run inspect` for the current version, changed files and relevant checks. Inspect `git status` before editing; preserve other work.
- Read this map and the relevant functions with `rg` plus bounded excerpts. Do not dump the whole project or re-read unchanged files.
- Keep one concrete improvement at a time. Reuse existing mechanisms; reproduce a physics/performance bug before changing its architecture.
- Batch independent searches and reads. Keep dependent edits, tests and publication steps sequential. No delegation unless the user or applicable instructions explicitly authorize it.

## Code ownership

| Area                              | Entry points                                                                                                                                    | Focused check                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Grid, materials, chemistry        | `src/sim/world.js`, `materials.js`, `material-{definitions,authoring,registry,profiles}.js`, `reactions.js`, `chemistry.js`, `phase-changes.js` | `--all` for shared rules                             |
| Solid collisions                  | `rigid-bodies.js`, `body-motion.js`, `body-collisions.js`, `body-raster.js`, `collision-limits.js` in `src/sim/`                                | `collisions`                                         |
| Springs and fine debris           | `src/sim/elasticity.js`, `elastic-geometry.js`, `fragments.js`                                                                                  | `elastics`                                           |
| Air, heat, fire                   | `src/sim/fields.js`, `airflow.js`, `combustion.js`, `ignition.js`                                                                               | `atmosphere`                                         |
| Characters, wildlife              | `src/sim/stickmen.js`, `stickman-body.js`, `creature-*.js`, `boids.js`                                                                          | `actors`                                             |
| Missiles, vehicles, electricity   | `src/sim/missiles.js`, `missile-guidance.js`, `machine-motion.js`, `circuits.js`                                                                | `devices`                                            |
| Rendering and light               | `src/renderer.js`, `lighting*.js`, `light-*.js`, `bloom.js`, `src/sim/*-renderer.js`                                                            | `lighting` + relevant physics group                  |
| Pointer/touch, selection, paint   | `src/input.js`, `controller-controls.js`, `gamepad-state.js`, `drawing-gesture.js`, `selection*.js`, `touch-navigation.js`                      | `input`                                              |
| Canvas properties, saves, history | `src/level*.js`, `persistence.js`, `history.js`                                                                                                 | `levels`; `--all` for persistence/schema changes     |
| Portal shapes, links, transport   | `src/sim/portal*.js`, `src/portal-input.js`, `src/portal-renderer.js`                                                                           | `portals`; `--all` for shared movement/state changes |
| Toolbar, palette, settings        | `src/app.js`, `settings*.js`, `material-groups*.js`, `style.css`, `mobile.css`                                                                  | `ui`                                                 |

## Verify once per input state

- `npm run check -- collisions` (or another group) runs focused Node regressions. Add `--browser` for the listed real-browser checks; touch/layout edits require the relevant browser checks.
- `npm run check -- --changed --list` shows an automatic conservative selection. Unknown/shared files fall back to the full suite; inspect the selection rather than treating it as a proof of coverage.
- `--reuse` explicitly reuses a successful Node check for identical source/test/build inputs and Node configuration within ten minutes. Browser tests are never cached. CI and `npm test` always run fresh.
- Run `npm test` once after changes to shared simulation rules, save schemas, material registries, broad physics or the check runner; expand checks when failures/new changes justify it. Do not repeat passed suites for unchanged inputs.
- Benchmark only the affected system: `npm run bench:collisions`, `bench:entities`, or `bench`. Run timings without concurrent CPU-heavy tests. Prefer operation-count assertions to flaky timing thresholds.
- Logs/cache live in ignored `.sandlab-cache/checks/`; inspect the failure tail and relevant test, not giant snapshot diffs. For a file-level Node failure, run `node tests/<failed>.test.js` for detailed assertions.

## Finish efficiently

Use `git diff --check`; review changed responsibilities and update the changelog for user-visible game changes. Keep worthwhile future work in `BACKLOG.md`. Development-only changes do not need an app version bump or a deployment.

Publish game changes only to the existing GitHub repository and GitHub Pages site. The ChatGPT Site is retired at the user’s request: do not mirror source to `/workspace/sandlab-site`, save Site versions, or deploy through Sites. Verify the pushed source and the actual GitHub Pages deployment. Do not create replacement sites/repos or persist credentials. GitHub CI skips docs-only runs and skips Pages publication when static game inputs are unchanged; manual dispatch forces publication. Superseded workflow runs are cancelled.

## Material extension and profiling

- `material-definitions.js` owns append-only material slots. Compose traits with `defineMaterial` from `material-authoring.js`; the registry compiler resolves references, validates and freezes definitions. Runtime state belongs in typed particle arrays, never in a material definition. Preserve the explicitly documented historical Wood Chips name collision.
- `material-profiles.js` holds shared calibrated properties and fragment mappings. `materials.js` is the compatibility facade used by existing systems. Compile static lookup tables after every profile/migration; do not mutate definitions or tables during ticks.
- Enable the existing debug panel for opt-in simulation/render stage timings. `PerformanceCounters` is unsaved scratch; leave clocks outside particle loops. `rigid-textures.js` caches only body geometry/current base colors, with live lighting applied separately.
- New focused checks: `node tests/material-registry.test.js`, `node tests/performance-counters.test.js`, `python3 tests/rigid_textures_check.py`. Use the full suite for registry/schema changes.

- `brush-geometry.js` converts UI pixel diameter to the engine's cell-center half-span and owns shared odd/even footprints. Keep Draw, Color, selection, Grab, tool effects and outlines aligned. `brushSize` preferences are diameters with a persisted `brushUnit` migration marker. Check `brush-geometry.test.js` and `brush_diameter_check.py`.
- `sim/mechanical-mass.js` derives solid/elastic mass from dry density and stored liquid units. Rigid poses refresh weighted mass properties from cached fluid moments without rebuilding topology. No derived mass fields belong in saves. Check `mechanical-mass.test.js` plus `collisions`/`elastics`; benchmark without concurrent heavy tests.
