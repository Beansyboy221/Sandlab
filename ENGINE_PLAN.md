# Sandlab engine evolution

Status: staged roadmap. v1.26.0 unifies base/state authoring, validates physical
transition identities, preserves fracture/corrosion components and compiles common
chemical contact rules from material data. See [PHYSICS_MODEL.md](PHYSICS_MODEL.md)
for the explicit abstraction contract and implemented limits. v1.19.0 added
contained-fluid mechanical mass; v1.18.0 established traits, registry validation,
profiling and rigid textures. Quantitative amounts, thermal energy, editable
material packs and game modes remain staged work.

## Target

An editable 2D sandbox engine with believable physical relationships, explicitly approximate chemistry, predictable puzzle/platformer mechanics and original visual effects. Preserve the working game, stable saved IDs, finite storage, bounded collision work, touch controls and GitHub Pages deployment. Improve one subsystem at a time rather than replace the engine.

Accuracy means defined units, stable qualitative relationships and tested conservation where applicable. It does not mean molecular chemistry, engineering stress analysis or exact real-world outcomes at a one-cell spatial scale. Fictional materials and game modes may intentionally override the physical rules, with those overrides visible in their definitions.

## What exists and what needs attention

| Area                 | Existing implementation                                                                                                                                       | Next coherent improvement                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Material definitions | Composable authoring, validated immutable definitions, shared profiles and compiled tables; stable IDs                                                        | Expand trait coverage and typed dispatch only when a concrete material or measured hot path needs it                              |
| Motion               | Grid particles, rigid shapes, elastic networks and jointed actors                                                                                             | Keep these representations; use common local force/contact/property interfaces                                                    |
| Density and mass     | Relative particle density; rigid/elastic mechanical mass includes finite liquid reservoirs; positive gas density and separate buoyancy encode rising behavior | Define amount/volume units and calibrate density/buoyancy units beyond solid/elastic contained-fluid mass                         |
| Porous transport     | Integer capacity, permeability and retention; shared finite reservoirs                                                                                        | Calibrate beds and drainage; describe capacity as a storage abstraction rather than literal physical void fraction                |
| Heat                 | Neighbor temperature exchange using `conductivity`; threshold phase changes                                                                                   | Explicit thermal conductivity, heat capacity and latent heat; pressure/phase coupling in small tested increments                  |
| Electricity          | Conductive flag, timed charge propagation, gates and sparks                                                                                                   | Separate digital signals from electrical conductivity/current, then add limited Joule heating and resistance where useful         |
| Chemistry            | Component-compiled contact pairs, explicit product references, finite dissolution, combustion, corrosion and bounded behavior handlers                        | Extend normalized reagent amounts, acid/base equivalent capacity, concentration and energy/yield accounting before equilibrium/pH |
| Atmosphere           | Pressure and face velocity on four-cell tiles; barriers, buoyancy, temperature transport                                                                      | Retain the shared field; calibrate sealed/vented scenes, boundary behavior and finite oxidizer                                    |
| Drawing              | Pixel buffer; cached rigid textures with continuous fallback; elastic/entity passes; lighting and bloom                                                       | Use stage timings to target the next bottleneck; reuse elastic topology and preserve one camera/light pipeline                    |
| Diagnostics          | Opt-in per-stage simulation/render timings, overall FPS and bounded collision work counters                                                                   | Add topology/memory counters when needed; calibrate scenarios and measure on physical devices                                     |

## Material composition

Author materials as plain data assembled from reusable traits. Compile once into fast material-ID-indexed property tables, capability flags, phase references and indexed reaction dispatch. Continue storing particle state in typed arrays. A trait is a reusable definition, not a JavaScript object or virtual method on every pixel.

Keep these concepts separate:

- **Identity and presentation:** stable ID/key, name, color, texture, palette group and light properties.
- **Representation:** exactly one carrier such as granular, fluid, rigid, elastic or static; a material can change carrier when it changes phase or fragments.
- **Physical traits:** density, friction, restitution, porosity, permeability, retention, brittleness, strength, elasticity/damping, thermal conductivity, heat capacity and electrical conductivity.
- **Behaviors:** combustion, phase transitions, dissolution, corrosion, growth, source/device behavior and declared exceptions.
- **State:** temperature, stored fluid, strain, damage, charge and other changing data. Allocate additional state only when justified by measured memory/performance needs.

Example proposed authoring syntax (not a new public API yet):

```js
const conductiveFoam = defineMaterial({
  key: "conductive-foam",
  name: "Conductive Foam",
  representation: "elastic",
  traits: [porous(8, 0.35, 0.8), springy(0.3, 0.12), conductive(0.6)],
  properties: { density: 0.45, friction: 0.6, thermalConductivity: 0.04 },
  reactions: [{ with: "acid", rate: 0.02, products: ["residue"], heat: 0 }],
});
```

Numbers are illustrative game coefficients until units and calibration are defined. Composition must have explicit precedence: base traits, then named overrides. Reject conflicting carriers, unknown references, invalid ranges and ambiguous behavior ordering. A porous metal or burnable elastic combines shared properties without copying their handlers. Impossible combinations should produce authoring errors rather than surprise runtime behavior.

Keep material keys stable across saves and custom definitions. Preserve the current numeric IDs and legacy aliases during migration. Version custom definition packs and store the required pack definitions/identity with an exported world so it remains portable. Imported material/mode packs should be bounded declarative data; trusted development code can supply a separately registered custom handler. Do not evaluate JavaScript strings from save files.

## Rule pipeline

Use bounded systems for contact reactions, atmosphere interactions, phase changes and optional scripted behaviors. Define ordering explicitly: sample the current state, resolve contact candidates, apply budgeted changes, then invalidate affected motion/render/field regions. Preserve local temperature/pressure effects and container barriers.

Common reactions should describe reactants, conditions, rate, products/yields, energy release/absorption and gas production. Compile exact pairs and tags to indexed dispatch; do not search every reaction for every cell. Multi-product rules must handle insufficient space by retaining pending reactant/product amounts instead of silently deleting them. Complex biology, portals and devices can remain small named handlers with bounded work. A mutation/result interface should preserve pore contents, body topology, pigment and saveable state consistently.

Choose a documented quantity model before promising conservation: fixed cell occupancy is not automatically equal mass when materials have different densities, gas phases expand, or a host stores many liquid pixels. Start with normalized substance amounts and explicit source/sink accounting; add state fields only when a concrete reaction or phase transition requires them. Track matter lost through void boundaries and editor deletion separately from accidental loss. Digital electrical signals can coexist with a simplified physical conduction model; they should have distinct meanings.

## Estimation and neural networks

Keep the deterministic, approximate solver as the authoritative state. It already estimates physical behavior through local grid rules, coarse air fields and bounded body constraints. A simulation still needs frequent updates to respond to arbitrary drawing, cutting, explosions and player input.

A neural replacement would require suitable training data, browser inference cost measurements and an explicit comparison with the current solver. Arbitrary material edits, rare reactions, portals and unfamiliar geometry are difficult generalization cases. A network predicting the next pixels does not guarantee conserved contents, connected rope cuts, persistent entities, reliable puzzle outcomes or stable long-run behavior. A small network is not inherently cheaper than indexed local rules. Runtime or game mode changes would also invalidate assumptions used during training.

Prefer measured analytic approximations:

- Sleep stable motion islands, while heat, wet pores, chemistry and nearby changes can wake them. Never permanently stop a freely falling elastic body.
- Schedule only participating/active regions; use slower **simulation-time** cadences for slow processes with correct accumulated rates. Keep fast collision/fire/contact checks responsive.
- Cache gradients, barriers, body topology and render data with explicit invalidation.
- Keep air and other smooth fields coarse; preserve narrow boundary/vent checks and refine only if benchmarks show a net benefit.
- Use body-level broad phases and fixed collision/fracture budgets so contacts cannot cause cascading work.
- Convert only suitably broken tiny fragments to ordinary particles, as the existing fragment option does.
- Prefer measured render-quality adjustments over silently removing chemistry or changing physical outcomes. Distinguish intentional slow-motion from discarded ticks; deterministic puzzle replay should be driven by tick-indexed inputs and seeded state.

AI could later assist offline material suggestions, parameter fitting or experiment generation, with reviewed definitions and regression tests. Any surrogate should begin as an isolated optional visual/non-authoritative experiment, with errors measured against the solver. Training/inference infrastructure is not part of the first milestones.

## Noise and stochastic approximation

Noise is a source of structured variation, not a solution to physical equations. Seeded noise can make cheap visuals richer: smoke wisps, flame flicker, material texture, water highlights and spatially correlated variation. Reuse the existing stored material variants first. Cache small noise tiles/fields, update cosmetic animation at a suitable cadence, and reuse samples across render passes. Prefer a cheap hash or lookup when only uncorrelated variation is needed; multi-octave Perlin/simplex noise per cell per tick can cost more than the work it replaces.

Noise may provide deliberately bounded gameplay turbulence, but it adds external motion/energy and must be labeled as such. It cannot replace conserved airflow, temperature transport, collision response or chemical yields. A noisy picture of smoke alone does not tell fire how to escape a vent or push a solid.

Stochastic approximation is a separate opportunity: distribute slow reaction attempts across ticks, use reproducible sampling, and scale rates to elapsed simulation time. For a Poisson-rate process, interval probability is `1 - exp(-rate * dt)`; precompute it for the few supported cadences rather than calculate exponentials in hot loops. Do not accumulate one-time contact exposure across periods when reactants are absent. Test error distributions and boundary cases against the unscheduled reference. Fast collisions, explosive fronts and topology changes need prompt exact handling within their bounded local models.

Low-discrepancy or blue-noise update ordering can be tested to avoid visible bands and directional bias, but regular staggered schedules are cheaper and should remain the baseline. Compare full-frame cost and artifacts before adopting a noise algorithm. Cosmetic detail can adapt to performance without changing material quantities or puzzle outcomes.

## Rendering and performance

Preserve the split between simulation occupancy and visible geometry. Powders/liquids/gases suit a compact pixel buffer; rigid bodies need continuous rotation, elastics need their bonds/membranes, and creatures/devices need jointed or authored shapes. Sharing physics properties does not require drawing them all as loose pixels.

1. Measure simulation, raster/occupancy, rigid rendering, elastic rendering, entities, lighting, bloom, UI and allocation cost independently in representative worlds. The 16.7 ms frame budget includes both simulation and drawing. Emulated phones verify layout but do not establish actual phone performance.
2. Cache a rigid body's base color/texture in local coordinates and transform it once per body rather than set a color and fill each cell every frame. Keep illumination, hot glow and visibility dynamic; caching final lit pixels would produce stale light as a body moves. Invalidate for cuts, burns, color edits and material changes.
3. Reuse elastic adjacency, face connectivity and color buckets; update changing positions and strain. Avoid rebuilding unchanged topology or duplicate bonds, while preserving visible cuts and stretched skins.
4. Cull invisible bodies and fields where simulation semantics allow; retain looping copies, shadows and consistent inspect/preview output. Keep all passes on the same camera transform.
5. Evaluate dirty pixel tiles and render-buffer reuse before a renderer migration. Adopt workers, WebGL or instancing only after a reproducible profile shows a benefit large enough to pay for transfer/synchronization and additional implementation complexity.

Existing v1.17.0 measurements on the development host: dry 60,800-cell powder about 4.1 ms/tick, an active sand/water scene about 14.9 ms/tick, and crowded rigid benchmarks about 3.7–4.6 ms/physics pass. These are scenario-specific CPU measurements, not full browser-frame or physical-phone guarantees.

v1.18.0 controlled comparison: a 16,000-cell rigid drawing pass averaged 18.45 ms before caching and 1.78 ms after, with 100 samples after 20 warmup draws. Dense sand/water simulation remained comparable at about 14.8 versus 14.7 ms/tick. Freezing the registry array caused a measured lookup regression and was removed; individual definitions and the name map remain frozen. `npm run bench:render` and its optional checkout argument reproduce the drawing fixture.

v1.19.1 fire-lighting comparison (`npm run bench:fire`, 320×200 world, 1,000×625 display, 60 measured browser draws after 10 warmups): fire plume 28.09→15.49 ms, dense flames 47.96→25.67 ms, burning wood 50.80→24.66 ms. Each draw forces a real optical refresh; normal play retains the 30 Hz lighting cadence. Exact trace calls fell 95–97%. The tested revision also extends source reach to 112–192 pixels, adds faint smoke scattering, and uses one lifetime-driven lightning flash. Cached particle-silhouette stencils and filtered angular transport remain derived scratch, never save data. The optical field is coarser above 32,768 particles, but reconstruction and shadow edges still query full particle silhouettes. These are controlled render-only host measurements, not physical-phone FPS guarantees.

## Ordered delivery plan

| Stage                           | Deliverable                                                                                                                                   | Verification / exit condition                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Establish the contract       | Document units, supported accuracy, update ordering and source/sink accounting; add reproducible subsystem diagnostics and calibration scenes | Compare friction/slopes, settling/buoyancy, porous intake/drainage, thermal exchange/phases, corrosion, confined gas and electrical behavior; establish simulation/render baselines |
| 2. Make definitions composable  | Validated traits, organized definition files, compiled dispatch/property tables and stable aliases                                            | Recreate a few existing materials through traits with unchanged behavior; a new combined material needs no edits to unrelated solvers; saves/Undo/clipboard remain compatible       |
| 3. Improve physical consistency | Separate density/buoyancy and electrical/thermal meanings; add contained-liquid mass, heat capacity and latent heat in independent increments | Conservation/error measurements, stable phase cycles, saturated body motion, thermal equilibrium and bounded conduction; calibrate rather than merely add properties                |
| 4. Open rule authoring          | Declarative contact/environment reactions and small registered special handlers, validated product yields and budgets                         | Prototype a reaction and a combined behavior without adding name branches; finite material/energy accounting and crowded-scene work limits hold                                     |
| 5. Optimize visible bodies      | Profile-driven rigid albedo caching, elastic topology reuse and appropriate dirty rendering                                                   | Before/after CPU, draw-call/allocation and memory results; screenshots for rotated/cut/heated/lit/painted bodies, wrapping, selection, inspection and mobile input                  |
| 6. Add authoring tools          | Material editor with live previews, validation and local/import/export definition packs                                                       | Editing is transactional/undoable; invalid changes cannot damage a world; a portable pack reproduces its saved experiment                                                           |
| 7. Separate modes from physics  | Data-driven goals, spawn/checkpoint rules, sensors, allowed tools, input policies, scripted triggers and presentation                         | One chemistry puzzle and one platformer run on the same engine; seeded tests cover success/failure/reset/save; modes do not fork material physics                                   |

Use focused checks for each increment and the full suite for shared rule/state migrations. Benchmark one changed subsystem at a time. Preserve a working playable release between stages; do not bundle a registry rewrite, physics rewrite, new renderer and editor into one change.

Next increment: calibrate heat capacity and conductivity before latent heat, with closed thermal-equilibrium and phase-cycle fixtures. Contained-fluid mass now refreshes within existing pose scans; intake/outflow momentum, gas density/buoyancy separation and explicit physical units remain future calibration work. Keep expanded reaction authoring as a separate change. The editor and game modes build on that tested foundation.
