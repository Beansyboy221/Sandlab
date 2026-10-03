# Sandlab

An original, client-side falling-sand sandbox with 62 materials, 32 entities and 114 active simulation forms, customizable canvases, a responsive drawing surface, and local worlds. No application server, accounts, or build step is required.

Live site: **https://beansyboy221.github.io/Sandlab/**. GitHub Pages is the sole publishing destination; the ChatGPT Site is retired.

## Run

```sh
npm start
```

Open **http://localhost:3000**. The development server uses Python 3. For deployment, upload `index.html`, `style.css`, `mobile.css`, `src/`, and `public/` to any static host. JavaScript modules require HTTP serving rather than opening the HTML as a local file. The interface uses system fonts and needs no external services.

## Play

Draw a solid shape while holding the pointer: physics pauses until release. Settings → Brush → After drawing solids can keep the world paused afterward; an already-paused world always stays paused.

Entities → Characters includes **Stickman** (AI) and **Player**. Click or tap empty space to spawn a jointed character. **A/D** move, **W or Space** jump, and **S** crouches; mobile provides a joystick: left/right moves, up jumps, and down crouches. **P** still pauses. Release controls returns keyboard shortcuts to the sandbox. The plus button's Starting world picker includes a Stickman playground and the other preset worlds. AI characters use A* over terrain with supported standing positions, walking/jump/drop edges, clearance checks, bounded searches and periodic replanning. They follow a player or patrol. Limbs can be cut or strained apart; characters burn, corrode, take impact damage and remain physical after death. Grab, Wind, Warm, Cool and Erase work on bodies. Saves, history, inspection, and resizing preserve their state. Each world supports up to 32 characters and creatures and one living Player. Walking covers about 12 cells per simulated second, roughly one character height; jumps rise about 8 cells and preserve lateral momentum. These are body-scaled gameplay values, rather than calibrated human biomechanics.

Entities → Wildlife includes **Cat**, **Rabbit**, **Fish** and **Bird**. Cats walk and turn away from cliffs; rabbits hop; fish swim in cool Water/Brine and suffocate outside it; birds fly, avoid walls and fall as ragdolls when dead. Shared nine-joint anatomy retains the same collisions, finite burning fuel, damage, cutting, tools and persistence. **Plus → Starting world → Wildlife pond** provides a safe land-and-water scene. Birds and aquatic species use Boids alignment, cohesion and separation when at least three nearby members of the same species share a clear habitat. Predation takes priority; lone creatures keep their individual behavior. Settings → Wildlife controls flocking, group distance and minimum group size. **Plus → Starting world → Flocks and schools** starts three birds and three fish together. Inspect shows their behavior and local group size.

Choose an element and drag to paint. The tool picker on the drawing toolbar offers Warm, Cool, Wind, Grab, Pressure and Vacuum. Wind adds local airflow in the chosen direction; Grab drags a patch of particles and solids. Pressure repels mobile particles, while Vacuum attracts them. Right-click to erase, or select the eraser on touch screens. Inspect (`M`) shows a zoomed view and live cell properties; hover to follow, or tap a cell to hold it. Pick (`I`) picks a material and returns to Draw without changing the world. Shift-drag previews a straight line. Control-drag previews a circle (center at the starting point) or rectangle outline using the current brush shape; release to draw or press Escape to cancel. Scroll over the canvas or use `[` / `]` to resize the brush. Control-scroll zooms at the pointer, middle-drag pans. On phones and tablets, use one finger to draw; use two fingers to pan and pinch to zoom. Both fingers must lift before drawing resumes, and camera gestures leave the world and edit history unchanged. The tool dropdown displays matching line icons and supports arrow keys, Enter, Escape, and first-letter navigation.

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

| Module                         | Responsibility                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `src/sim/materials.js`         | Stable material IDs, colors, physical properties, phase rules                     |
| `src/sim/world.js`             | Typed-array grid, density movement, chunk occupancy/activity, brushes, explosions |
| `src/sim/reactions.js`         | Heat-driven transitions, combustion, electrical propagation, contact chemistry    |
| `src/sim/fields.js`            | Coarse pressure, thermal transport, cached barriers and forces                    |
| `src/sim/airflow.js`           | Face velocities, pressure acceleration, wind and buoyancy                         |
| `src/sim/rigid-bodies.js`      | Rigid topology, mass, pose, and particle state                                    |
| `src/sim/body-motion.js`       | Integration, rolling, buoyancy, and stack support                                 |
| `src/sim/body-collisions.js`   | Rotational contact impulses, friction, and fracture                               |
| `src/sim/body-raster.js`       | Unique cell matching for continuous rotating shapes                               |
| `src/sim/body-connections.js`  | Cached structural electrical connections                                          |
| `src/renderer.js`              | Canvas rendering, thermal palette, viewport, brush preview                        |
| `src/inspector.js`             | Read-only live cell properties and magnified rendering                            |
| `src/shortcuts.js`             | Validated shortcut catalogue, bindings, and key dispatch                          |
| `src/input.js`                 | Pointer capture, continuous strokes, multitouch, wheel control                    |
| `src/persistence.js`           | Validated snapshots, RLE encoding, device storage                                 |
| `src/tool-picker.js`           | Accessible icon dropdown, keyboard navigation, touch targets                      |
| `src/sim/energy.js`            | Shared ray transport, energy absorption, thermal auras, and bounded emissions     |
| `src/sim/energy-materials.js`  | Append-only energy and fictional material definitions                             |
| `src/level.js`                 | Canvas creation and positioned resizing without losing particle state             |
| `src/level-editor.js`          | Canvas properties dialog and touch/keyboard placement preview                     |
| `src/level-properties.js`      | Validated canvas metadata and dimensions                                          |
| `src/sim/circuits.js`          | Directional gates, signal snapshots, toggles, delays and electrical outputs       |
| `src/sim/device-materials.js`  | Append-only electrical and moving-device definitions                              |
| `src/sim/machine-motion.js`    | Swept vehicle collisions, motors, gravity, step-up and damage                     |
| `src/material-groups.js`       | Bounded, validated custom material collections and local persistence              |
| `src/material-groups-panel.js` | Accessible custom-group editor                                                    |
| `src/presets.js`               | Internal simulation fixtures                                                      |
| `src/app.js`                   | UI wiring, bounded undo, fixed-step loop, frame budget and diagnostics            |

The engine uses structure-of-arrays storage rather than objects per particle. Empty 16 × 16 chunks are skipped. Settled chunks sleep movement checks, with periodic retries and immediate wake-up when their neighborhood changes; temperature, phase changes, electricity, and chemical reactions continue. Heat moves between occupied neighbors and exchanges with a coarse air temperature field. Atmospheric heat and pressure diffuse around solid barriers and vent at void edges; looping worlds wrap both fields. Density permits particles to displace lighter fluids. Registry thresholds describe phase transitions and fuel ignition. Air provides ambient oxygen; explicit oxygen accelerates combustion. Pressure is a coarse compressible gameplay field relative to an ambient baseline of 1 atm, coupled to air momentum rather than a calibrated fluid solver. Air temperature starts at 20°C; localized heat is retained, diffuses, and survives saves, Undo/Redo, and positioned resizes.

Rendering and simulation are capped at 60 frames and fixed ticks per second, including on high-refresh displays. Each rendered frame advances at most one physics tick; missed ticks are dropped instead of creating catch-up bursts. Slower hardware slows gracefully, and hidden tabs suspend drawing and physics. The 0.25× and 0.5× speed controls reduce tick frequency; 1× is the maximum. Rendering uses a low-resolution ImageData buffer scaled without smoothing; the display canvas respects device pixel ratio with a 2× cap. Thermal colors are precomputed. Seeded randomness and saved activity timestamps support reproducible continuation.

To add a material, append its definition to the registry. **Never reorder existing definitions**, because saves refer to their numeric IDs. Removed substances reserve their numeric slots and migrate old saves to remaining materials; they have no active palette entry or reaction behavior. Material names automatically capitalize the first letter of each word. Movement, conductivity, combustion, and phase changes follow properties. Add contact chemistry in `reactions.js` only when an existing physical rule cannot express the interaction.

## Faster development

Run `npm run inspect` for a compact status and code map. `npm run check -- collisions` (or `ui`, `input`, `elastics`, `atmosphere`, `actors`, `devices`, `levels`, `lighting`, `quick`) checks the affected system. Add `--browser` to run the group's desktop/mobile checks. `npm run check -- --changed --list` previews conservative selection from Git changes; unknown or shared files select the full suite.

Use `--reuse` to avoid rerunning a successful Node check with identical inputs within ten minutes. CI always runs fresh. Logs and cached results stay local in `.sandlab-cache/checks/`. `npm test` retains the complete regression suite. See [AGENTS.md](AGENTS.md) for code ownership, validation rules and publication workflow.

Documentation-only pushes skip CI. Development-only pushes still validate but skip static builds and Pages deployment. Game source, styles, assets and build-script changes publish normally; manual workflow dispatch forces a fresh publication. New pushes cancel superseded runs.

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

Sponge stores up to 48 cells of water, brine, Acid, oil, or kerosene per solid cell. It retains one compatible liquid type, with water and brine able to mix. Saturation changes its color. Liquid wicks between touching sponges, and plants draw water from wet sponges. Pressure releases liquid into empty neighboring cells; warming a wet sponge produces steam. Absorbed oil and kerosene can burn, while stored water protects the sponge as it evaporates. Acid corrodes sponge. Stored contents move with Grab and survive undo, local saves, and export/import. Wet a sponge with different liquids, then warm or apply pressure to release the stored contents.

## Selection and copying

Choose Select (or press `V`). Square shape drags a rectangular marquee; circle shape paints a selection with the size slider or mouse wheel. Circle strokes add to the existing selection, including rectangles. Right-click or toggle the selection eraser to subtract cells without deleting particles.

Drag from any selected cell, including empty selected cells, to move the selected particles. Moves show a preview, clamp to the world, and protect other particles unless Replace is enabled. Erased holes stay transparent. Shift-drag paints/refines a selection instead of moving it. Deselect clears the highlight and keeps the clipboard; Escape deselects or cancels an active move/paste, and Ctrl/⌘ D deselects directly. Copy and paste preserve the remaining selection and its holes.

Selecting pauses the world so the copied region stays still. Copy captures all particle state; Paste shows a preview, then a click or tap places it. Empty clipboard cells stay transparent. Existing particles are protected unless Replace is enabled. Use `Ctrl/⌘ C`, `Ctrl/⌘ V`, and `Escape` to copy, paste, and cancel placement. Tapping Paste again also cancels the preview on touch devices. Undo restores a pasted world. The in-game clipboard stays local to the current session and supports repeat placements.

The materials button appears for Draw and material Fill. Other tools expose their controls on the drawing toolbar: heat/cooling/force strength, wind direction, whether Grab/Erase includes solids, and selection copy/paste controls.

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

This is a qualitative cellular simulation. Relative density, heat transport, exposed combustion, phase thresholds, pressure-driven airflow, and reaction products follow reusable rules. Temperature changes and particle volumes are approximate; the grid does not implement calibrated thermodynamics, molecular chemistry, or calibrated structural mechanics.

## GitHub Pages

The `.github/workflows/pages.yml` workflow tests the simulation, builds `dist/`, and publishes it to GitHub Pages after each push to `main`. No application secrets or runtime dependencies are required. In the repository's **Settings → Pages**, select **GitHub Actions** as the source. The game uses relative asset URLs, so it works under a repository URL such as `/Sandlab/`. After deployment, the game is available at https://beansyboy221.github.io/Sandlab/.

This repository and its GitHub Pages site are public. Local worlds and preferences stay in each player’s browser.

## Energy and fictional materials

Lasers travel as directional packets. Glass, water, and gases transmit them, mirrors reflect them, and opaque materials absorb them. Solar cells convert incoming laser light into circuit charge. Lasers aim along the stroke and deposit heat. Heading survives copying, resizing, history and saves. The former Light and Sound palette entries are retired with stable numeric IDs; old saves migrate them to empty space.

Simulation events produce synthesized Web Audio effects: weighted grain/body impacts, fizz, melting, boiling, splashes, fire crackle, explosions/lightning and bird calls. Audio starts on a user gesture; Settings → Audio controls sound and volume. Sounds pan in screen coordinates, using the screen center or the controlled player's head as listener, with distance attenuation and coarse wall muffling. Voice counts, event queues and repeated emissions are bounded; a compressor limits dense scenes. There are no remote audio files, microphones or permissions for recording.

**Echolocation** displays a separate four-cell damped wave field. A leapfrog wave equation shares the atmosphere's cached barriers: solid walls reflect, looping edges wrap, void edges vent, and sponge absorbs sound. Waves are qualitative and slowed for readable visualization; they do not replace temperature/ambient pressure or add unlimited particle forces. Silent fields stop processing. Muting playback preserves the visualization; clearing/loading a world clears transient audio and waves. Uranium retains bounded decay heating without neutron particles.

Antimatter belongs to Energy; Black Hole and Repulsor belong to Static. Antimatter annihilates neighboring matter in a fiery blast. Black Holes pull through the pressure field and consume adjacent movable particles; Repulsors push through that field.

Ray travel, transparent-volume scanning, new emissions, and fission/annihilation events have fixed work limits. No interaction starts recursive simulation work or creates an unbounded list of effects. All effects remain local to the browser and use the existing bloom renderer.

On phones, the canvas occupies most of the available screen. The bottom dock keeps Play, the tool picker, and materials reachable. Swipe up or tap the grip to expand brush settings, undo/redo, tool properties, and zoom buttons. The dock stays at the bottom in every orientation. Rotation preserves world coordinates and counters browser rotation while changing gravity to follow screen-down. Powders, fluids, gases, elastics, combustion, weather, plant growth, and sponge drainage use the same gravity direction. Drawing, inspection, selection, zoom, and pan share the rotated view transform. The Fullscreen button uses canvas focus on mobile, so it works without iPhone Safari's browser fullscreen API; tap the visible × button in the top-right corner to exit focus. Browser address bars remain controlled by Safari. Adding Sandlab to the Home Screen offers a separate app window.

Elastic materials

Rope, Rubber, and Jelly use connected springs rather than granular movement. Draw a thin rope or a jelly body; use Grab to stretch it. Drawing its end against a rigid solid creates an anchor. Erase that support to release it. Strained links can tear, and heat/combustion/corrosion still apply. Only the Elastics group has this behavior.

Soap dissolves in water. Warm or agitate Soapy water with Pressure to produce bubbles. Bubbles rise through liquids, drain faster in open air, and pop under heat or strong pressure. The mobile material grid uses equal 76-pixel rows and equal column widths.

Each substance appears once in the palette. Searching an alternate phase name finds its parent substance. Particles start at their normal material temperature; Warm, Cool, heaters, and chemical reactions create alternate phases in the world. Pick samples the substance. Replace sits beside the main material picker.

Elastics use three physics substeps per simulation tick. Internal spring damping acts on deformation, while whole bodies accelerate under gravity and respond to pressure and liquid buoyancy. Their occupied grid cells move leading edges first, so dense bodies do not stop against their own particles. There is no elastic sleep timer. An eraser cuts stretched connections even in empty grid cells; skins and joints render as a separate continuous layer at display resolution, including in heat/pressure views, inspector lenses, save thumbnails, and resize previews. Inspect reports stretch and tension.

The world fills the display, including previously saved worlds, without automatically cropping content. Changing mobile resolution uses the crop/expansion placement preview and stays undoable. Connected elastic contact preserves both velocity and temporarily delayed raster displacement; disconnected fragments still collide. A swept path test prevents retained displacement from jumping through walls. Fertilizer is grouped under Powders.

Color uses packed RGBA foreground coatings that travel with particle state and a fixed-coordinate background overlay. Stroke stamps prevent overlap from compounding opacity; the foreground stamp travels with the particle too. Both layers are validated, run-length encoded, saved, undoable, and preserved on resize. Legacy saves default to transparent overlays. Color's eraser restores the underlying appearance without changing occupancy or physics.

## Bucket fill and body physics

Fill (`K`, rebindable) fills a four-connected region once per click/tap, including across looping edges. Material fill matches the starting material, protects occupied cells unless Replace is enabled, and right-click deletes that connected region. Foreground color fill matches material and existing coating, ignores empty space, and preserves all physics. Background color fill matches the existing background coating. Color, opacity, removal, and Undo/Redo use the same controls as Color. An iterative typed-array queue bounds memory and avoids recursive stack overflow.

Wall is the sole Static palette material. It blocks particles and atmospheric flow, cannot fall or be destroyed by simulation effects, and remains removable through editing. Ordinary solids form connected rigid bodies from their drawn shape. Gravity, pressure, buoyancy, mass, rotational inertia, and impact momentum move each body; a separate rendering pass preserves its continuous shape. Rest coordinates and permanent links survive saves, cropping, and copying. Grab moves the complete connected body, and erasing splits it into independent fragments. Glass, ice, wood, and mineral solids have distinct impact toughness and fracture products. Friction converts slipping motion into spin, with different friction and bounce for ice, wood, glass, and metals. Painted round shapes roll down slopes; off-center forces and collisions transfer angular momentum. Local raster matching preserves unique cells without locking a rotated body. Contact faces are grouped by the obstacle they belong to; bounded centers of pressure support balanced shapes, and impulse relaxation transmits load through stacks. Electricity and heat follow permanent structural connections when raster positions separate. This is a qualitative grid contact solver, not calibrated engineering stress analysis.

Elastics remain the only spring materials. Three stable integration substeps are retained; cached connectivity avoids rebuilding components unless editing or tearing changes their links. Acid is now the sole acidic palette entry. Historic acid IDs are migrated when loading, including clone targets, residues, and sponge contents.

An isolated 5,600-node elastic comparison in this workspace measured 8.77 ms/tick on v1.5.0 and 8.26 ms/tick with cached connectivity (6% less simulation time). These are development-machine measurements, not phone guarantees.

## Material cleanup in v1.6.3

Both Fit canvas buttons have been removed. Zooming, panning, touch gestures and automatic viewport sizing remain available. Carbon Dioxide is named CO2, and Glass Dust is named Glass Shards. Plasma, Dragonfire, Frostfire, Fairy Dust, Furnace, Neutron, Nutrient Water, Mica, Sulfur Dioxide and Carbon Dioxide Foam are unavailable. Old saves map these IDs to Fire, Snow, Fertilizer, Heater, Water, Ceramic, Smoke or CO2 as appropriate; old Neutron packets disappear. Clone targets, residues, dissolved nutrition, sponge contents and solid links remain readable.

### Predators and seekers (1.9.0)

Life includes Wolf and Shark alongside Cat, Rabbit, Fish and Bird. Predators hunt their defined prey, prey flee, and sight is blocked by solid terrain. Bites need physical contact and have a cooldown. Dead bodies retain their physics, burning fuel and breakable joints. Settings → Wildlife controls predation and detection distance. Predator reserve demonstrates land and aquatic species.

Entities → Missiles includes Heat-Seeking Missile. Draw a rocket and drag to choose its initial heading. Each vehicle gradually steers toward the nearest exposed hot non-gaseous material inside its sensing range; it does not steer around obstacles. Swept collisions detonate it, while its eight-second lifetime limits missed shots. Smoke exhaust cannot attract its own seeker. Warm, Cool, Wind, Grab and Erase affect rockets; world saves, history and resize retain their state. Settings → Devices controls homing, threshold, range, speed and blast radius. Missile range has static heated targets.

Settings → Player offers joystick side, diameter, horizontal inset and vertical lift. Layout follows the available canvas and avoids the dock in portrait and landscape. Moving settings or rotating clears captured input to prevent stuck movement. Push up to jump; keyboard W/Space still work.

### Local lighting (1.10.0)

New canvas and Canvas properties provide Ambient light (0–100%). Full ambient light preserves the existing appearance; at zero, unlit foreground and background are black. These properties are saved with the world and survive history, import/export and resize. Old saves without an ambient value use 100%. Diagnostic views remain readable regardless of ambient light.

Lamp in Entities → Sources is a stationary, warm light source. Fire, sparks, lightning, charge, burning material, incandescent surfaces, hot creatures and missile engines also emit light. Local illumination uses radial falloff and coarse shadow visibility. Glass and clear liquids transmit light; opaque surfaces block it. A short, attenuated surface reflection picks up material/pigment color. Settings → Rendering → Reflected light ranges from no bounce to a subtle 25%; Bloom controls a separate soft halo.

Optics use four-pixel tiles, a maximum of 96 spatially merged sources, and one short diffuse bounce. They update every other displayed frame, including paused edits, rather than slowing or changing physics. Thin walls block their entire optical tile, so shadows are conservative at this resolution. Dense emissive fields merge spatially without dropping entire parts of the scene. Lighting applies after all material and actor drawing and also appears in Inspect and world thumbnails. This is an approximate visual model, not spectral ray tracing.

Custom material groups use the plus beside Materials. Create a named collection, select materials, and save it; use the same button to edit the selected collection. Groups persist locally, with a limit of 16, and never change built-in physics categories. Explosives and Fiction are properties rather than palette groups; fixed sources are under Static.

Entities → Electrical includes fixed Wire, Battery, AND/OR/XOR/NOT Gates, Toggle Gate, Delay Gate, Signal Lamp and Electric Fan, with missiles under Entities → Missiles and Drone/Rover under Entities → Vehicles. Gates are ideal powered logic components. Facing sets their output port; A is the cell behind, B the cell to the left of the heading. A charged conductor, correctly oriented gate output or adjacent Spark is a high input. AND/OR/XOR take A and B; NOT, Toggle, Delay, Lamp and Fan take A. Toggle flips on rising edges; Delay is a 12-tick shift register. Battery repeatedly energizes the wire in front using the shared conductor cooldown. Wire stays fixed and propagates pulses with the existing conduction, heating and arcing rules. Gate evaluations share a pre-tick signal snapshot, so update order cannot change a circuit. State uses the existing life and heading arrays and survives copying, saving and resizing. Inspect displays signal state and ports. Logic workbench provides three isolated test circuits.

Drone and Rover use the existing capped moving-device pool and a separate motion module. Drones maintain flight and turn at obstacles; rovers accelerate along the gravity-relative ground, fall, step over two-cell ledges and turn at walls. Disabling motors lets both fall. Swept footprints catch thin walls; hard impacts, corrosive contact and heat reduce condition and leave debris on destruction. Warm, Cool, Wind, Grab and Erase affect machines. Settings → Devices controls motors and cruise speed. Device yard is a safe starter scene. Machines preserve condition, velocity and temperature through save/load, undo and resizing; older missile saves retain their schema.

## Wind and pressure

Settings → Atmosphere sets ambient wind strength and direction. Wind is a brush that adds local air momentum with the main tool direction and strength controls. Electric Fan uses that same field. The Airflow view displays speed and direction arrows; Inspect reports local horizontal and vertical air velocity. The Vented fire chamber preset starts a supported burning coal bed inside a wall container with a one-pixel side vent.

A compressible gameplay solver stores pressure, temperature and face velocities on four-cell air tiles. Pressure gradients accelerate air; divergence changes pressure, hot air rises opposite gravity, and bounded upwind transport carries air temperature. Four-lane barrier sampling blocks walls and gives narrow vents reduced volume flow. Burning fuel, flames, heat exchange, explosions and chemical reactions inject pressure into the same system, producing outward currents through openings rather than scripted vent attraction. Momentum dissipates gradually, and confined mean pressure decays slowly. Gases follow air currents most strongly; dense powders and liquids have lower drag. Weak currents retain surface combustion contact; strong jets can lift flames away. These are qualitative gameplay units, not calibrated fluid mechanics. Walls within a single coarse tile and diagonal microchannels remain approximate; ambient oxygen is not yet finite.

Typed reusable buffers avoid per-cell allocations. Airflow survives local saves, export/import, history and positioned resizing; older saves initialize air at rest. Solid edges reflect, looping edges share flux across the seam, and void edges exchange with ambient air. Global wind follows the gravity-relative view when a phone rotates.

Development measurements on 2026-10-03 (30 warm-up and 180 measured ticks): the complete air field on a 400 × 300 world averaged 0.53 ms, with 0.82 ms at the 95th percentile. A world with 30,800 steam particles and ambient wind averaged 14.39 ms per tick (p95 17.08 ms); 38,400 sand particles with wind averaged 11.08 ms (p95 14.46 ms). These measure simulation work in the development environment, not rendering or physical-phone performance. `npm run bench` includes wind-driven steam and the vented chamber.

## Entities and canvas modes

Materials contains substances; Entities contains Characters, Wildlife, Missiles, Vehicles, Electrical and Sources. Each tab has its own category filters and search. Custom groups retain mixed memberships, showing only entries belonging to the current tab. Pick switches to the appropriate catalog. New IDs are append-only, so existing creature and device saves remain compatible.

Laser-Guided Missile follows the nearest visible live Laser particle inside the configured sensing range, then falls back to the cursor. Opaque matter blocks beam acquisition; Glass, clear liquids and gases transmit it. Looping worlds acquire beams across their seam. Choose Guide from the main tool picker and tap or drag to aim without drawing; mouse movement also sets a target. Guide hides the material button. Rocket retains its launch direction without homing. The existing 32 moving-object limit and eight-second missile lifetime bound the work. Settings → Devices includes Laser guidance.

New canvas and Canvas properties offer six modes with a 0–200% strength slider:

- Sandbox retains ordinary downward gravity and cellular movement.
- Planet attracts matter toward the center and seeds new matter with tangential orbital velocity. Collisions can dissipate momentum and build a central pile or settle on a drawn core.
- Wandering Gravity moves the attraction point over time.
- Whirlpool combines a moving attraction point with rotating, wall-constrained atmospheric wind.
- Zero Gravity removes gravitational acceleration; existing momentum, collisions, wind and powered entities remain active.
- Day And Night cycles ambient illumination and air temperature over ten simulated seconds. Local light and heat sources remain active.

Modes share a coarse force field used by particles, rigid bodies, elastics, characters and vehicles. These are exploratory gameplay environments; character pathfinding still primarily targets supported terrain rather than orbital navigation. Mode properties survive saves, import/export, undo and positioned resizing.

Tiny broken components (at most three pixels) become granular or liquid debris specific to their parent material. Wood becomes Wood Chips, Rope becomes Rope Fibers, Copper becomes Copper Granules, and Jelly becomes Jelly Drops, for example. Fine forms remain hidden behind their parent palette entry, keeping one material choice per family. Conversion preserves temperature, pigment and momentum; larger pieces retain tension/rotation, anchored elastics stay attached, and healthy small drawings are unchanged. Settings → Performance → Simplify tiny broken pieces disables conversion. The damage marker uses existing saved particle state and topology is checked only after changes.

Run `npm run bench:entities` to compare tiny-fragment conversion, dense mode scenes and laser-guidance cost on your hardware. Run `npm run test:entities` for desktop, portrait and landscape browser checks, including touch aiming, catalog isolation, mode controls, settings and history.

## Bounded collision work

Solid collisions cache each body's pose once per tick and flush velocity once after the fixed support passes. Contact impulses update shared cached poses; they do not recursively simulate neighboring bodies. A candidate move groups collisions with a direct map and retains at most 16 impulse manifolds, while still scanning every pixel for blocked occupancy. Each body has at most 13 swept substeps and 96 candidate plans per tick; support relaxation has three fixed passes. Raster matching searches at most 64 nodes per contested reservation and at most 16 node visits per body pixel per plan. If a budget is exhausted, the candidate move is rejected without losing or overlapping matter. These limits bound collision processing by particle/body count rather than permitting expanding collision chains; very large worlds can still exceed a device's frame budget.

Impact damage is accumulated by stable particle ID and applied once after impulses. Reverse structural adjacency makes cuts proportional to incident bonds, rather than rescanning all solids per damaged cell. `npm run bench:collisions` reproduces small bodies landing on a 6,000-pixel slab. Settings → Performance → Performance details shows body/contact counts and collision pixel checks. Tests assert operation-count limits, particle preservation, momentum/rolling, resting stacks and save continuation.

## Controller

Pair a standard controller, then press a button so the browser can detect it. In sandbox mode, the left stick moves the cursor, RT/A draws and LT/B erases. The right stick pans; stick clicks zoom. Bumpers cycle materials and D-pad up/down changes brush size. X opens materials, Y opens tools, Start pauses, and LB+RB opens Settings. Navigate menus with D-pad and A/B.

A controlled Player uses the left stick or D-pad to move, A/up to jump, and down to crouch. Back/View switches between player and sandbox control. Settings → Controller includes a toggle, stick deadzone and cursor speed. Availability depends on browser Gamepad API support and a standard button mapping.

Settings → Simulation can independently disable wind, pressure, or temperature transport. Disabled wind clears air momentum and ignores wind brushes and fans. Disabled pressure clears the relative pressure field and ignores new pressure sources; wind and temperature remain independent. Disabled temperature preserves stored heat and stops particle/air heat exchange and atmospheric diffusion; direct Warm/Cool tools and heat-producing chemical reactions still work. Re-enabling a system resumes its solver. These switches are browser preferences rather than world-save properties.

Add Sandlab to your home screen from Safari’s Share menu on iPhone or the browser’s Install/Add to home screen menu on Android. The Apple touch icon and web app manifest use the supplied three-grain artwork. The installed app opens the GitHub Pages game in standalone mode. Icon assets remain local, and a service worker is not installed; launching still requires a network connection. Click or tap the logo/name for About and Changelog.
