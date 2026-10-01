# Sandlab

An original, client-side falling-sand sandbox with 85 materials, customizable canvases, a responsive drawing surface, and local worlds. No application server, accounts, or build step is required.

## Run

```sh
npm start
```

Open **http://localhost:3000**. The development server uses Python 3. For deployment, upload `index.html`, `style.css`, and `src/` to any static host. JavaScript modules require HTTP serving rather than opening the HTML as a local file. The interface uses system fonts and needs no external services.

## Play

Choose an element and drag to paint. The tool picker on the drawing toolbar offers Warm, Cool, Fan, Grab, Pressure, Vacuum, and Squeeze. Fan pushes in your drag direction (right when held still); Grab drags a patch of particles and solids. Pressure repels mobile particles, while Vacuum attracts them. Squeeze releases stored liquid from sponges. Right-click to erase, or select the eraser on touch screens. Inspect (`M`) shows a zoomed view and live cell properties; hover to follow, or tap a cell to hold it. Copy (`I`) picks a material and returns to Draw without changing the world. Shift-drag previews a straight line. Control-drag previews a circle (center at the starting point) or rectangle outline using the current brush shape; release to draw or press Escape to cancel. Scroll over the canvas or use `[` / `]` to resize the brush. Control-scroll zooms at the pointer, middle-drag pans, and Fit resets the camera. Multiple fingers can paint simultaneously. The tool dropdown displays matching line icons and supports arrow keys, Enter, Escape, and first-letter navigation.

- `Space`: pause or resume; `.`: one simulation step.
- `B` / `E`: draw or erase; `1` / `2` / `3`: sand, water, fire.
- `Ctrl/⌘ Z`: restore the world before the last stroke or canvas change.
- `/`: search materials; `G`: grid overlay.
- Natural, Temperature, and Pressure views expose different systems.
- Lightning uses brush size as its repetition rate: 1 strike/s at size 1, about 12.6 strikes/s at size 30. The drawing slider shows Rate when lightning is selected. Clicks and taps fire immediately; holding and dragging repeat at the selected cadence.
- Settings → Keyboard lets you replace or clear any shortcut, with two bindings per action, conflict detection, and a keyboard-only reset. The question mark menu shows the app version, changelog, and local storage information.

Try oil over water, sand in a density column, cement with water, an acid bath in glass, ice next to a heater, metal touched by a spark, or TNT connected to a fuse. Seeds germinate on moist soil. Plants share moisture through roots and stems, grow upward, and stop growing outside suitable temperatures. Lightning seeks nearby conductors, heats its impact point, and energizes wires. Storm sources emit clouds and periodic strikes; clouds release rain. Clone learns an adjacent movable material. Fans push to the right; voids drain their surroundings. Wax melts and solidifies for casting experiments.

New phone worlds use a 200 × 300 grid; larger screens use 320 × 200. Rotating or resizing a window preserves the world. Imported saves retain their original dimensions and canvas properties.

The plus button creates a canvas with a name, X/Y pixel dimensions, border type, and background color. Use the sliders button beside the canvas size to edit these properties. Solid borders contain particles, looping borders connect opposite edges for movement and interactions, and void borders drain outgoing particles. Sizes range from 8 to 512 pixels per axis, up to 200,000 cells total.

When resizing, drag the gold rectangle in the preview, enter exact X/Y offsets, or use arrow keys (Shift moves ten pixels). Shrinking places a crop window over the original canvas; expanding places the original particles inside the larger canvas. Mixed changes crop one axis and expand the other. Mint outlines show the new bounds and dim particles show what will be removed. The preview does not change the live canvas until you apply it. Undo and Redo restore dimensions, properties, and complete particle state.

## Saves

My worlds stores up to eight named worlds on the current device. Autosave captures the current experiment every 30 seconds and when the tab is hidden. Compressed `.sandlab` exports include canvas properties, temperature, pressure, electrical state, lifetimes, chunk activity, and the random seed. Files can be imported across devices. Import validation finishes before changing the live grid. LocalStorage capacity varies by browser; export files provide independent backups. Reaching eight saves does **not** evict an existing world.

## Architecture

| Module                        | Responsibility                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `src/sim/materials.js`        | Stable material IDs, colors, physical properties, phase rules                     |
| `src/sim/world.js`            | Typed-array grid, density movement, chunk occupancy/activity, brushes, explosions |
| `src/sim/reactions.js`        | Heat-driven transitions, combustion, electrical propagation, contact chemistry    |
| `src/sim/fields.js`           | Coarse pressure diffusion and decay                                               |
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

The engine uses structure-of-arrays storage rather than objects per particle. Empty 16 × 16 chunks are skipped. Settled chunks sleep movement checks, with periodic retries and immediate wake-up when their neighborhood changes; temperature, phase changes, electricity, and chemical reactions continue. Heat moves between occupied neighbors. Density permits particles to displace lighter fluids. Registry thresholds describe phase transitions and fuel ignition. Air provides ambient oxygen; explicit oxygen accelerates combustion. Pressure is a coarse gameplay field, rather than a full fluid solver.

The simulation advances at a fixed 60 Hz target. Catch-up work is capped to keep interaction responsive under load. Rendering uses a low-resolution ImageData buffer scaled without smoothing; the display canvas respects device pixel ratio with a 2× cap. Thermal colors are precomputed. Seeded randomness and saved activity timestamps support reproducible continuation.

To add a material, append its definition to the registry. **Never reorder existing definitions**, because saves refer to their numeric IDs. Movement, conductivity, combustion, and phase changes follow properties. Add contact chemistry in `reactions.js` only when an existing physical rule cannot express the interaction.

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
```

Simulation tests use Node.js 20+. Browser tests use Python Playwright and Chromium (`/usr/bin/chromium` by default). The browser harness intercepts local requests and blocks external traffic, so it needs no running server. It checks desktop drawing, undo, wheel controls, views, export/import, local saves, canvas creation and positioned resizing, mobile layouts, rotation, and simultaneous touch pointers. Internal preset fixtures remain available to the rendering and simulation checks. Screenshots are written to `tests/artifacts/`.

Bloom-enabled Chromium rendering measured **1.87 ms/frame** on a flame scene (2.2 ms at the 95th percentile). These measurements include particle rendering and the glow effect.

Engine benchmark observations in this workspace: about **12.6 ms/tick** for 54,400 settled liquid particles, **10.4 ms/tick** for 43,305 powder particles, and **4.3 ms/tick** for 17,699 particles on burning surfaces. Chromium rendered the starter scene at **60 FPS**. These are development-environment measurements, not device-independent guarantees. The optional FPS panel shows live frame rate and simulation cost.

`npm install` installs only the development formatter. `npm run format` formats the source; runtime code has no npm dependencies.

Bloom adds a soft screen-composited halo to flames, lightning, sparks, and hot materials. Its preallocated half-resolution buffers use a separable blur without relying on canvas filters. Toggle Settings → Rendering → Bloom to disable it; diagnostic views always omit bloom.

## Next worthwhile improvements

- Test on physical iOS Safari and Android devices; browser emulation does not cover every device behavior.
- Profile active lava, gas, and explosive loads on slower hardware before deciding whether workers are worthwhile.
- Add zoom and pan for detailed inspection and for viewing portrait saves on wide screens.
- Model heat capacity and latent heat to improve phase-change energy balance.
- Move named saves to IndexedDB if experiments regularly exceed LocalStorage capacity.

## Surface combustion

Burning fuels retain their material and use the particle lifetime field as a remaining burn duration. Exposed fuel emits flames and smoke, transfers heat to contiguous fuel, and becomes its residue when consumed. Surface flames linger long enough to ignite cold fuel and travel sideways along exposed combustible surfaces before rising. Smoke is released during combustion. Water extinguishes solid burning fuel; water underneath floating oil does not automatically quench the oil surface. Fire lifetimes vary by ±15%, using the seeded random generator. Burning state remains compatible with the existing save format.

## Absorbent solids

Sponge stores up to 48 cells of water, brine, oil, or fuel per solid cell. It retains one compatible liquid type, with water and brine able to mix. Saturation changes its color. Liquid wicks between touching sponges, and plants draw water from wet sponges. Squeeze or pressure releases liquid into empty neighboring cells; warming a wet sponge produces steam. Absorbed oil and fuel can burn, while stored water protects the sponge as it evaporates. Acid corrodes sponge. Stored contents move with Grab and survive undo, local saves, and export/import. Wet a sponge with different liquids, then warm or squeeze it to release the stored contents.

## Selection and copying

Choose Select (or press `V`). Square shape drags a rectangular marquee; circle shape paints a selection with the size slider or mouse wheel. Circle strokes add to the existing selection, including rectangles. Right-click or toggle the selection eraser to subtract cells without deleting particles.

Drag from any selected cell, including empty selected cells, to move the selected particles. Moves show a preview, clamp to the world, and protect other particles unless Replace is enabled. Erased holes stay transparent. Shift-drag paints/refines a selection instead of moving it. Deselect clears the highlight and keeps the clipboard; Escape deselects or cancels an active move/paste, and Ctrl/⌘ D deselects directly. Copy and paste preserve the remaining selection and its holes.

Selecting pauses the world so the copied region stays still. Copy captures all particle state; Paste shows a preview, then a click or tap places it. Empty clipboard cells stay transparent. Existing particles are protected unless Replace is enabled. Use `Ctrl/⌘ C`, `Ctrl/⌘ V`, and `Escape` to copy, paste, and cancel placement. Tapping Paste again also cancels the preview on touch devices. Undo restores a pasted world. The in-game clipboard stays local to the current session and supports repeat placements.

The materials button appears only for Draw. Other tools expose their controls on the drawing toolbar: heat/cooling/force strength, fan direction, whether Grab/Erase includes solids, and selection copy/paste controls.

## Settings

The gear in the top-right opens Rendering, Simulation, Brush, Storage, Keyboard, and Performance preferences. Bloom and glow strength, grid and visualization, simulation speed and startup pause, brush size/shape/outline, autosave interval and restoration, display quality, and performance displays apply immediately and persist locally. Toolbar and keyboard changes stay synchronized. Reduced display quality lowers canvas resolution without reducing the particle grid. Settings menus pause the world and restore the prior run state on closing. Reset preferences changes settings only; it preserves the current world, named saves, and autosave.

## Chemistry and new materials

The palette contains 85 materials. Copper conducts heat and electricity and melts into molten copper; moisture and air form insulating patina. Metal and metal dust rust on exposed wet surfaces, faster in brine. Vinegar cleans oxides, and hot coal reduces rust back to metal.

Acid or vinegar plus baking soda releases carbon dioxide. Acids neutralize lye into water and brine. Sodium and liquid sodium react with aqueous liquids to release heat, pressure, hydrogen, and lye. Flammable gases need air or oxygen to ignite. Carbon dioxide and nitrogen suppress flames; hydrated, exposed plants consume carbon dioxide and release oxygen. Burning sulfur releases sulfur dioxide, which reacts with water to form acid. Rubber insulates electricity and heat but burns.

Water hydrates clay; wet clay separates into clay and steam when vapor has an escape space. Heating clay fires it into brick. Fertilizer dissolves into nutrient water, carries finite nutrition through damp soil and plants, and improves hydrated growth. Nutrient water works with sponges, retains nutrition through freezing, and dries back into fertilizer. Liquid nitrogen draws heat from nearby particles and boils into nitrogen. Nutrients travel with particles, selection moves, undo, and saves; older saves load with zero nutrients. Combine these materials to explore reactions and ceramic firing.

## Edit history, shortcuts, and changelog

Undo and Redo retain eight edits, including complete particle and pressure state. A new edit clears redo. Restoring history pauses the world so particles stay put. Redo is available on the toolbar, Ctrl/⌘ Shift Z, and Ctrl Y. Ctrl/⌘ S opens local saves, Ctrl/⌘ O imports, and Ctrl/⌘ Shift S exports. Ctrl/⌘ A selects the entire grid; Ctrl/⌘ X cuts, and Delete or Backspace deletes selected particles. Text inputs keep their normal editing keys. Settings → Keyboard lists and edits all shortcuts. The question mark opens app information and the changelog. Release notes live in `src/changelog.js`. New sessions begin empty; existing autosaves remain available.

## Reaction timing and physical limits

Gunpowder burns in place, using its own oxidizer, emitting embers and pressure instead of instantly blasting a large radius. Dense burning regions can reach its pressure trigger. TNT requires 45 hot simulation ticks before reacting; cooling cancels the countdown. A strong pressure spike bypasses the delay. Liquid fuel burns at exposed surfaces without directly detonating. Hydrogen and flammable gas require both oxygen/air and higher ignition temperatures. Electrical arcs bridge one empty cell between conductors; ordinary conducting metal does not instantly ignite adjacent fuel. Hot embers deposit ash and heat without conducting electricity. Cold water quenches fire and sparks while warming; it does not all instantly flash into steam. Brine evaporation separates salt and steam, and frozen aqueous mixtures retain their original liquid through melting.

This is a qualitative cellular simulation. Relative density, heat transport, exposed combustion, phase thresholds, pressure diffusion, and reaction products follow reusable rules. Temperature changes and particle volumes are approximate; the grid does not implement calibrated thermodynamics, molecular chemistry, or structural mechanics.

## GitHub Pages

The `.github/workflows/pages.yml` workflow tests the simulation, builds `dist/`, and publishes it to GitHub Pages after each push to `main`. No application secrets or runtime dependencies are required. In the repository's **Settings → Pages**, select **GitHub Actions** as the source. The game uses relative asset URLs, so it works under a repository URL such as `/Sandlab/`. After deployment, the game is available at https://beansyboy221.github.io/Sandlab/.

This repository and its GitHub Pages site are public. Local worlds and preferences stay in each player’s browser.

## Energy and fictional materials

Light and lasers travel as directional packets. Glass, water, and gases transmit them, mirrors reflect them, and opaque materials absorb them. Solar cells convert incoming light into charge that travels through connected conductors. Lasers aim along the stroke direction and deposit more heat than ordinary light. Heading is a compact particle field included in copying, resizing, history, and saves; legacy saves initialize it safely.

Sound is a visible mechanical pulse, with no audible playback. It deposits pressure as it travels, reflects from solid surfaces, and can shatter glass into glass dust after repeated impacts. Sponge damps sound. Neutrons penetrate and heat matter, are absorbed by sponge, and cause uranium to become hot metal while releasing pressure and secondary neutrons. Uranium occasionally emits neutrons. These are qualitative gameplay models, rather than calibrated optics, acoustics, or nuclear physics.

The Fiction filter groups six experimental substances. Dragonfire heats nearby matter and boils water; frostfire freezes liquids and weakens ordinary flames. Touching dragonfire and frostfire cancel into steam. Antimatter annihilates neighboring matter in a plasma-producing blast. Black holes pull through the pressure field and consume adjacent movable particles; repulsors push through that field. Fairy dust hydrates and fertilizes plants and makes seeds sprout without soil, consuming itself into light.

Ray travel, transparent-volume scanning, new emissions, and fission/annihilation events have fixed work limits. No interaction starts recursive simulation work or creates an unbounded list of effects. All effects remain local to the browser and use the existing bloom renderer.

On phones, the canvas occupies most of the available screen. The bottom dock keeps Play, the tool picker, and materials reachable. Swipe up or tap the grip to expand brush settings, undo/redo, tool properties, and zoom buttons. In landscape, the dock moves to the side when that gives the canvas more room; swipe left to expand a side dock. Tall canvases align left. Rotation refits the view without changing particles. The Fullscreen button uses canvas focus on mobile, so it works without iPhone Safari's browser fullscreen API; tap the visible × button in the top-right corner to exit focus. Browser address bars remain controlled by Safari. Adding Sandlab to the Home Screen offers a separate app window.
