# Sandlab

An original, client-side falling-sand sandbox with 72 palette substances and 84 simulation forms, customizable canvases, a responsive drawing surface, and local worlds. No application server, accounts, or build step is required.

## Run

```sh
npm start
```

Open **http://localhost:3000**. The development server uses Python 3. For deployment, upload `index.html`, `style.css`, and `src/` to any static host. JavaScript modules require HTTP serving rather than opening the HTML as a local file. The interface uses system fonts and needs no external services.

## Play

Choose an element and drag to paint. The tool picker on the drawing toolbar offers Warm, Cool, Fan, Grab, Pressure, Vacuum, and Squeeze. Fan pushes in your drag direction (right when held still); Grab drags a patch of particles and solids. Pressure repels mobile particles, while Vacuum attracts them. Squeeze releases stored liquid from sponges. Right-click to erase, or select the eraser on touch screens. Inspect (`M`) shows a zoomed view and live cell properties; hover to follow, or tap a cell to hold it. Copy (`I`) picks a material and returns to Draw without changing the world. Shift-drag previews a straight line. Control-drag previews a circle (center at the starting point) or rectangle outline using the current brush shape; release to draw or press Escape to cancel. Scroll over the canvas or use `[` / `]` to resize the brush. Control-scroll zooms at the pointer, middle-drag pans. On phones and tablets, use one finger to draw; use two fingers to pan and pinch to zoom. Both fingers must lift before drawing resumes, and camera gestures leave the world and edit history unchanged. The tool dropdown displays matching line icons and supports arrow keys, Enter, Escape, and first-letter navigation.

- `Space`: pause or resume; `.`: one simulation step.
- `B` / `E`: draw or erase; `1` / `2` / `3`: sand, water, fire.
- `Ctrl/⌘ Z`: restore the world before the last stroke or canvas change.
- `/`: search materials; `G`: grid overlay.
- Natural, Temperature, and Pressure views expose different systems.
- Lightning uses brush size as its repetition rate: 1 strike/s at size 1, about 12.6 strikes/s at size 30. The drawing slider shows Rate when lightning is selected. Clicks and taps fire immediately; holding and dragging repeat at the selected cadence.
- Settings → Keyboard lets you replace or clear any shortcut, with two bindings per action, conflict detection, and a keyboard-only reset. The question mark menu shows the app version, changelog, and local storage information.

Try oil over water, sand in a density column, cement with water, an acid bath in glass, ice next to a heater, metal touched by a spark, or TNT connected to a fuse. Seeds germinate on moist soil. Plants share moisture through roots and stems, grow upward, and stop growing outside suitable temperatures. Lightning seeks nearby conductors, heats its impact point, and energizes wires. Storm sources emit clouds and periodic strikes; clouds release rain. Clone learns an adjacent movable material. Fans push to the right; voids drain their surroundings. Wax melts and solidifies for casting experiments.

New phone worlds use a 200 × 300 grid; larger screens use 320 × 200. Rotating or resizing a window preserves the world. Imported saves retain their original dimensions and canvas properties.

The plus button creates a canvas with a name, border type, and background color. Dimensions come from the available drawing area. Mobile properties have one resolution value: the shorter side in pixels; the longer side is calculated automatically. Desktop has no size controls. Solid borders contain particles, looping borders connect opposite edges, and void borders drain outgoing particles. Grid limits are 512 pixels per axis and 200,000 cells total.

When resizing, drag the gold rectangle in the preview, enter exact X/Y offsets, or use arrow keys (Shift moves ten pixels). Shrinking places a crop window over the original canvas; expanding places the original particles inside the larger canvas. Mixed changes crop one axis and expand the other. Mint outlines show the new bounds and dim particles show what will be removed. The preview does not change the live canvas until you apply it. Undo and Redo restore dimensions, properties, and complete particle state.

## Saves

My worlds stores up to eight named worlds on the current device. Autosave captures the current experiment every 30 seconds and when the tab is hidden. Compressed `.sandlab` exports include canvas properties, temperature, pressure, electrical state, lifetimes, chunk activity, and the random seed. Files can be imported across devices. Import validation finishes before changing the live grid. LocalStorage capacity varies by browser; export files provide independent backups. Reaching eight saves does **not** evict an existing world.

## Architecture

| Module                        | Responsibility                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `src/sim/materials.js`        | Stable material IDs, colors, physical properties, phase rules                     |
| `src/sim/world.js`            | Typed-array grid, density movement, chunk occupancy/activity, brushes, explosions |
| `src/sim/reactions.js`        | Heat-driven transitions, combustion, electrical propagation, contact chemistry    |
| `src/sim/fields.js`           | Coarse pressure/temperature diffusion and cached forces                           |
| `src/sim/rigid-bodies.js`     | Rigid topology, mass, pose, and particle state                                    |
| `src/sim/body-motion.js`      | Integration, rolling, buoyancy, and stack support                                 |
| `src/sim/body-collisions.js`  | Rotational contact impulses, friction, and fracture                               |
| `src/sim/body-raster.js`      | Unique cell matching for continuous rotating shapes                               |
| `src/sim/body-connections.js` | Cached structural electrical connections                                          |
| `src/renderer.js`             | Canvas rendering, thermal palette, viewport, brush preview                        |
| `src/inspector.js`            | Read-only live cell properties and magnified rendering                            |
| `src/shortcuts.js`            | Validated shortcut catalogue, bindings, and key dispatch                          |
| `src/input.js`                | Pointer capture, continuous strokes, multitouch, wheel control                    |
| `src/persistence.js`          | Validated snapshots, RLE encoding, device storage                                 |
| `src/tool-picker.js`          | Accessible icon dropdown, keyboard navigation, touch targets                      |
| `src/sim/energy.js`           | Shared ray transport, energy absorption, thermal auras, and bounded emissions     |
| `src/sim/energy-materials.js` | Append-only energy and fictional material definitions                             |
| `src/level.js`                | Canvas creation and positioned resizing without losing particle state             |
| `src/level-editor.js`         | Canvas properties dialog and touch/keyboard placement preview                     |
| `src/level-properties.js`     | Validated canvas metadata and dimensions                                          |
| `src/presets.js`              | Internal simulation fixtures                                                      |
| `src/app.js`                  | UI wiring, bounded undo, fixed-step loop, frame budget and diagnostics            |

The engine uses structure-of-arrays storage rather than objects per particle. Empty 16 × 16 chunks are skipped. Settled chunks sleep movement checks, with periodic retries and immediate wake-up when their neighborhood changes; temperature, phase changes, electricity, and chemical reactions continue. Heat moves between occupied neighbors and exchanges with a coarse air temperature field. Atmospheric heat and pressure diffuse around solid barriers and vent at void edges; looping worlds wrap both fields. Density permits particles to displace lighter fluids. Registry thresholds describe phase transitions and fuel ignition. Air provides ambient oxygen; explicit oxygen accelerates combustion. Pressure is a damped coarse gameplay field relative to an ambient baseline of 1 atm, rather than a full fluid solver. Air temperature starts at 20°C; localized heat is retained, diffuses, and survives saves, Undo/Redo, and positioned resizes.

The simulation advances at a fixed 60 Hz target. Catch-up work is capped to keep interaction responsive under load. Rendering uses a low-resolution ImageData buffer scaled without smoothing; the display canvas respects device pixel ratio with a 2× cap. Thermal colors are precomputed. Seeded randomness and saved activity timestamps support reproducible continuation.

To add a material, append its definition to the registry. **Never reorder existing definitions**, because saves refer to their numeric IDs. Removed substances reserve their numeric slots and migrate old saves to remaining materials; they have no active palette entry or reaction behavior. Material names automatically capitalize the first letter of each word. Movement, conductivity, combustion, and phase changes follow properties. Add contact chemistry in `reactions.js` only when an existing physical rule cannot express the interaction.

## Verify

```sh
npm test
npm run bench
npm run test:browser
npm run test:levels
npm run test:energy
npm run test:experiments
npm run test:inspection
npm run test:security
npm run test:fill
npm run test:gestures
npm run test:rigid
```

Simulation tests use Node.js 20+. Browser tests use Python Playwright and Chromium (`/usr/bin/chromium` by default). The browser harness intercepts local requests and blocks external traffic, so it needs no running server. It checks desktop drawing, undo, wheel controls, views, export/import, local saves, canvas creation and positioned resizing, mobile layouts, rotation, two-finger camera gestures, and rolling solids rendered through the actual app. Internal preset fixtures remain available to the rendering and simulation checks. Screenshots are written to `tests/artifacts/`.

Bloom-enabled Chromium rendering on v1.6.2 measured **3.74 ms/frame** on a flame scene (4.1 ms at the 95th percentile). These measurements include particle rendering and the glow effect.

The same ten benchmark scenes were run sequentially on v1.6.1 and v1.6.2 in this workspace. Mean simulation time improved in nine scenes. Selected results (milliseconds per tick):

| Scene                           | v1.6.1 | v1.6.2 |
| ------------------------------- | -----: | -----: |
| Liquids, 54,400 particles       |  16.71 |   9.77 |
| Powders, 43,305 particles       |  12.89 |   6.62 |
| Burning surfaces                |   7.72 |   4.01 |
| Elastic bodies, 5,920 particles |  10.86 |   7.71 |
| Settled solid stack             |  38.53 |  14.35 |
| Dense tumbling solids           |  12.10 |  25.54 |

Dense tumbling solids now resolve rotation, torque, friction, and multiple contact faces, costing more than the earlier sliding-only behavior. Settled stacks remain intact instead of accumulating contact damage. Particle counts can therefore differ in these evolving scenes. The benchmark reports the mean and 95th percentile; it keeps all simulation systems enabled. Chromium rendered the starter scene at **60 FPS**. These are development-environment measurements, not device-independent guarantees. The optional FPS panel shows live frame rate and simulation cost.

`npm install` installs only the development formatter. `npm run format` formats the source; runtime code has no npm dependencies.

Bloom adds a soft screen-composited halo to flames, lightning, sparks, and hot materials. Its preallocated half-resolution buffers use a separable blur without relying on canvas filters. Toggle Settings → Rendering → Bloom to disable it; diagnostic views always omit bloom.

## Next worthwhile improvements

- Test on physical iOS Safari and Android devices; browser emulation does not cover every device behavior.
- Profile active lava, gas, and explosive loads on slower hardware before deciding whether workers are worthwhile.
- Refine concave solid contacts and optimize dense tumbling piles while retaining rotation, torque, friction, and fracture.
- Model heat capacity and latent heat to improve phase-change energy balance.
- Move named saves to IndexedDB if experiments regularly exceed LocalStorage capacity.

## Surface combustion

Burning fuels retain their material and use the particle lifetime field as a remaining burn duration. Exposed fuel emits flames and smoke, transfers heat to contiguous fuel, and becomes its residue when consumed. Surface flames linger long enough to ignite cold fuel and travel sideways along exposed combustible surfaces before rising. Smoke is released during combustion. Water extinguishes solid burning fuel; water underneath floating oil does not automatically quench the oil surface. Fire lifetimes vary by ±15%, using the seeded random generator. Burning state remains compatible with the existing save format.

## Absorbent solids

Sponge stores up to 48 cells of water, brine, Acid, oil, or kerosene per solid cell. It retains one compatible liquid type, with water and brine able to mix. Saturation changes its color. Liquid wicks between touching sponges, and plants draw water from wet sponges. Squeeze or pressure releases liquid into empty neighboring cells; warming a wet sponge produces steam. Absorbed oil and kerosene can burn, while stored water protects the sponge as it evaporates. Acid corrodes sponge. Stored contents move with Grab and survive undo, local saves, and export/import. Wet a sponge with different liquids, then warm or squeeze it to release the stored contents.

## Selection and copying

Choose Select (or press `V`). Square shape drags a rectangular marquee; circle shape paints a selection with the size slider or mouse wheel. Circle strokes add to the existing selection, including rectangles. Right-click or toggle the selection eraser to subtract cells without deleting particles.

Drag from any selected cell, including empty selected cells, to move the selected particles. Moves show a preview, clamp to the world, and protect other particles unless Replace is enabled. Erased holes stay transparent. Shift-drag paints/refines a selection instead of moving it. Deselect clears the highlight and keeps the clipboard; Escape deselects or cancels an active move/paste, and Ctrl/⌘ D deselects directly. Copy and paste preserve the remaining selection and its holes.

Selecting pauses the world so the copied region stays still. Copy captures all particle state; Paste shows a preview, then a click or tap places it. Empty clipboard cells stay transparent. Existing particles are protected unless Replace is enabled. Use `Ctrl/⌘ C`, `Ctrl/⌘ V`, and `Escape` to copy, paste, and cancel placement. Tapping Paste again also cancels the preview on touch devices. Undo restores a pasted world. The in-game clipboard stays local to the current session and supports repeat placements.

The materials button appears for Draw and material Fill. Other tools expose their controls on the drawing toolbar: heat/cooling/force strength, fan direction, whether Grab/Erase includes solids, and selection copy/paste controls.

## Settings

The gear in the top-right opens Rendering, Simulation, Brush, Storage, Keyboard, and Performance preferences. Bloom and glow strength, grid and visualization, simulation speed and startup pause, brush size/shape/outline, autosave interval and restoration, display quality, and performance displays apply immediately and persist locally. Toolbar and keyboard changes stay synchronized. Reduced display quality lowers canvas resolution without reducing the particle grid. Settings menus pause the world and restore the prior run state on closing. Reset preferences changes settings only; it preserves the current world, named saves, and autosave.

## Chemistry and new materials

The palette contains 72 substances, with 84 distinct simulation forms including alternate phases. Copper conducts heat and electricity and melts into molten copper; moisture and air form insulating patina. Steel and steel powder rust on exposed wet surfaces, faster in brine. Acid cleans oxides, and hot coal reduces rust back to steel.

Acid plus Baking Soda releases CO2 and Water with a local pressure burst. Gas creation/absorption, reaction heat, boiling, condensation, and combustion generate signed pressure changes. Acid neutralizes lye into water and brine. Sodium and liquid sodium react with aqueous liquids to release heat, pressure, hydrogen, and lye. Flammable gases need air or oxygen to ignite. Carbon dioxide and nitrogen suppress flames; hydrated, exposed plants consume carbon dioxide and release oxygen. Burning Sulfur produces Smoke. Rubber insulates electricity and heat but burns.

Water hydrates clay; wet clay separates into clay and steam when vapor has an escape space. Heating clay fires it into brick. Fertilizer dissolves into ordinary Water, carries finite nutrition through damp soil and plants, and improves hydrated growth. Dissolved nutrition travels through sponges and freezing; evaporation separates Steam and Fertilizer. There is no separate Nutrient Water material. Liquid nitrogen draws heat from nearby particles and boils into nitrogen. Nutrients travel with particles, selection moves, undo, and saves; older saves load with zero nutrients. Combine these materials to explore reactions and ceramic firing.

## Edit history, shortcuts, and changelog

Undo and Redo retain eight edits, including complete particle and pressure state. A new edit clears redo. Restoring history pauses the world so particles stay put. Redo is available on the toolbar, Ctrl/⌘ Shift Z, and Ctrl Y. Ctrl/⌘ S opens local saves, Ctrl/⌘ O imports, and Ctrl/⌘ Shift S exports. Ctrl/⌘ A selects the entire grid; Ctrl/⌘ X cuts, and Delete or Backspace deletes selected particles. Text inputs keep their normal editing keys. Settings → Keyboard lists and edits all shortcuts. The question mark opens app information and the changelog. Release notes live in `src/changelog.js`. New sessions begin empty; existing autosaves remain available.

## Reaction timing and physical limits

Gunpowder burns in place, using its own oxidizer, emitting embers and pressure instead of instantly blasting a large radius. Dense burning regions can reach its pressure trigger. TNT requires 45 hot simulation ticks before reacting; cooling cancels the countdown. A strong pressure spike bypasses the delay. Liquid fuel burns at exposed surfaces without directly detonating. Hydrogen and flammable gas require both oxygen/air and higher ignition temperatures. Electrical arcs bridge one empty cell between conductors; ordinary conducting metal does not instantly ignite adjacent fuel. Hot embers deposit ash and heat without conducting electricity. Cold water quenches fire and sparks while warming; it does not all instantly flash into steam. Brine evaporation separates salt and steam, and frozen aqueous mixtures retain their original liquid through melting.

This is a qualitative cellular simulation. Relative density, heat transport, exposed combustion, phase thresholds, pressure diffusion, and reaction products follow reusable rules. Temperature changes and particle volumes are approximate; the grid does not implement calibrated thermodynamics, molecular chemistry, or calibrated structural mechanics.

## GitHub Pages

The `.github/workflows/pages.yml` workflow tests the simulation, builds `dist/`, and publishes it to GitHub Pages after each push to `main`. No application secrets or runtime dependencies are required. In the repository's **Settings → Pages**, select **GitHub Actions** as the source. The game uses relative asset URLs, so it works under a repository URL such as `/Sandlab/`. After deployment, the game is available at https://beansyboy221.github.io/Sandlab/.

This repository and its GitHub Pages site are public. Local worlds and preferences stay in each player’s browser.

## Energy and fictional materials

Light and lasers travel as directional packets. Glass, water, and gases transmit them, mirrors reflect them, and opaque materials absorb them. Solar cells convert incoming light into charge that travels through connected conductors. Lasers aim along the stroke direction and deposit more heat than ordinary light. Heading is a compact particle field included in copying, resizing, history, and saves; legacy saves initialize it safely.

Sound is a visible mechanical pulse, with no audible playback. It deposits pressure as it travels, reflects from solid surfaces, and can shatter glass into Glass Shards after repeated impacts. Sponge damps sound. Uranium occasionally warms itself and nearby air through a bounded decay-heating rule. It does not emit neutron particles. These are qualitative gameplay models, rather than calibrated optics, acoustics, or nuclear physics.

The Fiction filter groups three experimental substances. Antimatter annihilates neighboring matter in a fiery blast. Black Holes pull through the pressure field and consume adjacent movable particles; Repulsors push through that field.

Ray travel, transparent-volume scanning, new emissions, and fission/annihilation events have fixed work limits. No interaction starts recursive simulation work or creates an unbounded list of effects. All effects remain local to the browser and use the existing bloom renderer.

On phones, the canvas occupies most of the available screen. The bottom dock keeps Play, the tool picker, and materials reachable. Swipe up or tap the grip to expand brush settings, undo/redo, tool properties, and zoom buttons. The dock stays at the bottom in every orientation. Rotation preserves world coordinates and counters browser rotation while changing gravity to follow screen-down. Powders, fluids, gases, elastics, combustion, weather, plant growth, and sponge drainage use the same gravity direction. Drawing, inspection, selection, zoom, and pan share the rotated view transform. The Fullscreen button uses canvas focus on mobile, so it works without iPhone Safari's browser fullscreen API; tap the visible × button in the top-right corner to exit focus. Browser address bars remain controlled by Safari. Adding Sandlab to the Home Screen offers a separate app window.

Elastic materials

Rope, Rubber, and Jelly use connected springs rather than granular movement. Draw a thin rope or a jelly body; use Grab to stretch it. Drawing its end against a rigid solid creates an anchor. Erase that support to release it. Strained links can tear, and heat/combustion/corrosion still apply. Only the Elastics group has this behavior.

Soap dissolves in water. Warm or agitate Soapy water with Pressure to produce bubbles. Bubbles rise through liquids, drain faster in open air, and pop under heat or strong pressure. The mobile material grid uses equal 76-pixel rows and equal column widths.

Each substance appears once in the palette. Searching an alternate phase name finds its parent substance. Particles start at their normal material temperature; Warm, Cool, heaters, and chemical reactions create alternate phases in the world. Copy samples the substance. Replace sits beside the main material picker.

Elastics use three physics substeps per simulation tick. Internal spring damping acts on deformation, while whole bodies accelerate under gravity and respond to pressure and liquid buoyancy. Their occupied grid cells move leading edges first, so dense bodies do not stop against their own particles. There is no elastic sleep timer. An eraser cuts stretched connections even in empty grid cells; skins and joints render as a separate continuous layer at display resolution, including in heat/pressure views, inspector lenses, save thumbnails, and resize previews. Inspect reports stretch and tension.

The world fills the display, including previously saved worlds, without automatically cropping content. Changing mobile resolution uses the crop/expansion placement preview and stays undoable. Connected elastic contact preserves both velocity and temporarily delayed raster displacement; disconnected fragments still collide. A swept path test prevents retained displacement from jumping through walls. Fertilizer is grouped under Powders.

Paint uses packed RGBA foreground coatings that travel with particle state and a fixed-coordinate background overlay. Stroke stamps prevent overlap from compounding opacity; the foreground stamp travels with the particle too. Both layers are validated, run-length encoded, saved, undoable, and preserved on resize. Legacy saves default to transparent overlays. Paint's eraser restores the underlying appearance without changing occupancy or physics.

## Bucket fill and body physics

Fill (`K`, rebindable) fills a four-connected region once per click/tap, including across looping edges. Material fill matches the starting material, protects occupied cells unless Replace is enabled, and right-click deletes that connected region. Foreground color fill matches material and existing coating, ignores empty space, and preserves all physics. Background color fill matches the existing background coating. Color, opacity, removal, and Undo/Redo use the same controls as Paint. An iterative typed-array queue bounds memory and avoids recursive stack overflow.

Wall is the sole Static palette material. It blocks particles and atmospheric flow, cannot fall or be destroyed by simulation effects, and remains removable through editing. Ordinary solids form connected rigid bodies from their drawn shape. Gravity, pressure, buoyancy, mass, rotational inertia, and impact momentum move each body; a separate rendering pass preserves its continuous shape. Rest coordinates and permanent links survive saves, cropping, and copying. Grab moves the complete connected body, and erasing splits it into independent fragments. Glass, ice, wood, and mineral solids have distinct impact toughness and fracture products. Friction converts slipping motion into spin, with different friction and bounce for ice, wood, glass, and metals. Painted round shapes roll down slopes; off-center forces and collisions transfer angular momentum. Local raster matching preserves unique cells without locking a rotated body. Contact faces are grouped by the obstacle they belong to; bounded centers of pressure support balanced shapes, and impulse relaxation transmits load through stacks. Electricity and heat follow permanent structural connections when raster positions separate. This is a qualitative grid contact solver, not calibrated engineering stress analysis.

Elastics remain the only spring materials. Three stable integration substeps are retained; cached connectivity avoids rebuilding components unless editing or tearing changes their links. Acid is now the sole acidic palette entry. Historic acid IDs are migrated when loading, including clone targets, residues, and sponge contents.

An isolated 5,600-node elastic comparison in this workspace measured 8.77 ms/tick on v1.5.0 and 8.26 ms/tick with cached connectivity (6% less simulation time). These are development-machine measurements, not phone guarantees.

## Material cleanup in v1.6.3

Both Fit canvas buttons have been removed. Zooming, panning, touch gestures and automatic viewport sizing remain available. Carbon Dioxide is named CO2, and Glass Dust is named Glass Shards. Plasma, Dragonfire, Frostfire, Fairy Dust, Furnace, Neutron, Nutrient Water, Mica, Sulfur Dioxide and Carbon Dioxide Foam are unavailable. Old saves map these IDs to Fire, Snow, Fertilizer, Heater, Water, Ceramic, Smoke or CO2 as appropriate; old Neutron packets disappear. Clone targets, residues, dissolved nutrition, sponge contents and solid links remain readable.
