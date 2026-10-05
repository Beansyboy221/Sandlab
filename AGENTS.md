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
| Solid collisions                  | `rigid-bodies.js`, `body-motion.js`, `body-collisions.js`, `body-stress.js`, `body-raster.js`, `collision-limits.js` in `src/sim/`              | `collisions`                                         |
| Springs and fine debris           | `src/sim/elasticity.js`, `elastic-geometry.js`, `elastic-momentum.js`, `fragments.js`                                                           | `elastics`                                           |
| Air, heat, fire                   | `src/sim/fields.js`, `airflow.js`, `combustion.js`, `ignition.js`                                                                               | `atmosphere`                                         |
| Characters, wildlife              | `src/sim/stickmen.js`, `stickman-body.js`, `creature-*.js`, `boids.js`                                                                          | `actors`                                             |
| Missiles, vehicles, electricity   | `src/sim/missiles.js`, `missile-guidance.js`, `machine-motion.js`, `circuits.js`                                                                | `devices`                                            |
| Rendering and light               | `src/renderer.js`, `lighting*.js`, `light-*.js`, `bloom.js`, `src/render/*.js`                                                                  | `lighting` + relevant physics group                  |
| Pointer/touch, selection, paint   | `src/input.js`, `controller-controls.js`, `gamepad-state.js`, `drawing-gesture.js`, `selection*.js`, `touch-navigation.js`                      | `input`                                              |
| Canvas properties, saves, history | `src/level*.js`, `persistence.js`, `history.js`                                                                                                 | `levels`; `--all` for persistence/schema changes     |
| Portal shapes, links, transport   | `src/sim/portal*.js`, `src/portal-input.js`, `src/portal-renderer.js`                                                                           | `portals`; `--all` for shared movement/state changes |
| Toolbar, palette, settings        | `src/app.js`, `settings*.js`, `material-groups*.js`, `style.css`, `mobile.css`                                                                  | `ui`                                                 |

## Verify once per input state

- `npm run check -- collisions` (or another group) runs focused Node regressions. Add `--browser` for the listed real-browser checks; touch/layout edits require the relevant browser checks.
- `npm run check -- --changed --list` shows an automatic conservative selection. Unknown/shared files fall back to the full suite; inspect the selection rather than treating it as a proof of coverage.
- `--reuse` explicitly reuses a successful Node check for identical source/test/build inputs and Node configuration within ten minutes. Browser tests are never cached. CI and `npm test` always run fresh.
- Run `npm test` once after changes to shared simulation rules, save schemas, material registries, broad physics or the check runner; expand checks when failures/new changes justify it. Do not repeat passed suites for unchanged inputs.
- Benchmark only the affected system: `npm run bench:collisions`, `bench:entities`, `bench:fire`, or `bench`. Run timings without concurrent CPU-heavy tests. Prefer operation-count assertions to flaky timing thresholds.
- Logs/cache live in ignored `.sandlab-cache/checks/`; inspect the failure tail and relevant test, not giant snapshot diffs. For a file-level Node failure, run `node tests/<failed>.test.js` for detailed assertions.

## Finish efficiently

Use `git diff --check`; review changed responsibilities and update the changelog for user-visible game changes. Keep worthwhile future work in `BACKLOG.md`. Development-only changes do not need an app version bump or a deployment.

Publish game changes only to the existing GitHub repository and GitHub Pages site. The ChatGPT Site is retired at the user’s request: do not mirror source to `/workspace/sandlab-site`, save Site versions, or deploy through Sites. Verify the pushed source and the actual GitHub Pages deployment. Do not create replacement sites/repos or persist credentials. GitHub CI skips docs-only runs and skips Pages publication when static game inputs are unchanged; manual dispatch forces publication. Superseded workflow runs are cancelled.

## Material extension and profiling

- `material-definitions.js` owns append-only material slots. Compose traits with `defineMaterial` from `material-authoring.js`; the registry compiler resolves references, validates and freezes definitions. Runtime state belongs in typed particle arrays, never in a material definition. Keep the old Wood Chips slot canonicalized to Sawdust; renamed materials retain aliases and stable IDs.
- `material-profiles.js` holds shared calibrated properties and fragment mappings. `materials.js` is the compatibility facade used by existing systems. Compile static lookup tables after every profile/migration; do not mutate definitions or tables during ticks.
- Enable the existing debug panel for opt-in simulation/render stage timings. `PerformanceCounters` is unsaved scratch; leave clocks outside particle loops. `render/material-pixels.js` and `render/elastic-renderer.js` share world-resolution color pixels; occupied rigid cells are their visible collision footprint.
- New focused checks: `node tests/material-registry.test.js`, `node tests/performance-counters.test.js`, `python3 tests/unified_scene_check.py`. Use the full suite for registry/schema changes.

- `brush-geometry.js` converts UI pixel diameter to the engine's cell-center half-span and owns shared odd/even footprints. Keep Draw, Color, selection, Grab, tool effects and outlines aligned. `brushSize` preferences are diameters with a persisted `brushUnit` migration marker. Check `brush-geometry.test.js` and `brush_diameter_check.py`.
- `sim/mechanical-mass.js` derives solid/elastic mass from dry density and stored liquid units. Rigid poses refresh weighted mass properties from cached fluid moments without rebuilding topology. No derived mass fields belong in saves. Check `mechanical-mass.test.js` plus `collisions`/`elastics`; benchmark without concurrent heavy tests.

- `light-reconstruction.js` caches only silhouette-dependent interpolation stencils; opaque edits invalidate nearby regions. Smoke/filter transport stays in `light-shadows.js`. Preserve exact silhouette edge queries and bounded source/range budgets. `npm run bench:fire` compares full fire rendering across optional checkouts; lightning uses its existing particle lifetime for a scene flash.

- Changelog bullets should be short, one sentence each, and describe player-visible changes; optimization entries should include measured scene-specific results when available, never invented speed claims.

- Audio foley is cached in `audio-voices.js`; `sim/acoustic-listener.js` samples Echolocation’s shared face barriers and absorption for muffling and finite reflection taps. Keep 64 queued events, eight starts per frame, 24 active voices, three reflection taps and the 8,192-tile listener budget bounded. `npm run bench:audio`, `acoustics.test.js` and `audio_occlusion_check.py` verify this path.

- `sim/mixtures.js` owns conserved dissolved ingredients and legacy mixture conversion; preserve its two typed state arrays across edits, pores and saves. Moving-matter air deposits are capped per tile and use persistent rigid bonds for exposure. Check `mixtures.test.js` and `palette_rail_check.py`; use the full suite for component transport changes.

- `material-perception.js` derives bounded optical/acoustic traits; `optical-transport.js` shares Snell/reflection helpers between `sim/optical-rays.js` and `light-recast.js`. Photon spectral bands/intensity reuse growth/moisture; never add an object per beam or recursively spawn rays. `perception.test.js` covers conservation, cache bounds, corners and save round trips; use full regressions for material changes.
- `audio-output.js` owns one master output graph and speaker/headphone calibration. `audio_occlusion_check.py` compares finite offline output and orientation-independent distance gain; emulation cannot replace physical-phone listening.

- `sim/elastic-momentum.js` preserves unsupported spring components’ centroid motion with bounded raster translation and four projection passes; contacts constrain their normal axis. `sim/microbiology.js` caps contact births at 32 per tick. `oxidationLevel` is saved particle state; old Patina (54) becomes oxidized Copper and Wire (107) becomes Copper. Check `material-upgrade.test.js` plus `elastics`/`collisions`; retain the 64/128 air/impact stress sample budgets.

- `sim/material-states.js` owns stock base/state configuration and inheritance; `defineMaterialState` overrides only state-dependent data and physical phase/fracture references must stay within their family. Explicit palette presets/assemblies use `paletteEntry`. Rubble (95) migrates to Stone Gravel; do not recreate a generic debris target. `sim/reaction-registry.js` compiles chemical components/product references once into indexed contacts, while `chemistry.js` executes them. Read `PHYSICS_MODEL.md` before extending these models; acidity/alkalinity are strengths, not pH or equivalent capacity. Chemical dissolution uses `dissolvable`, independent of spontaneous Water solubility. Check `material-states.test.js` and `material_states_check.py`, then full regressions for shared registry/state changes.

- `sim/liquid-equilibrium.js` relaxes resting radial liquids through short neighbor chains, with 128 visits/eight swaps per query and saved-state conservation. `canvas-modes.js` samples smooth point gravity; keep the coarse atmosphere field separate. `radial-liquids.test.js` checks shape, density, walls, budgets and save continuation; use `levels` first and full regressions for shared kinetic changes.

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for solver/data/render ownership. `sim/solvers/` owns thermal, electrical, atmospheric, particle and fixed tick calculations; world methods are compatibility/state facades. `sim/entity-definitions.js` and `entity-registry.js` own validated actor geometry and appearance, with projectile motion defaults in `projectile-profiles.js`. `engine-boundaries.test.js` rejects renderer/browser dependencies in the headless simulation. Keep the fused field/particle traversals and seeded ordering.
