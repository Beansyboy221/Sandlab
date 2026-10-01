export const changelog = [
  {
    version: "1.2.1",
    date: "2026-10-01",
    title: "Tool names",
    changes: [
      "Renamed Paint to Draw, Magnifier to Inspect, and Eyedropper to Copy in the tool picker and keyboard settings.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-10-01",
    title: "Energy and imagination",
    changes: [
      "Every tool now has a matching line icon in a touch-friendly dropdown with keyboard navigation.",
      "Added light, lasers, sound, neutrons, mirrors, solar cells, uranium, and glass dust.",
      "Light reflects from mirrors, passes through glass and water, and powers solar cells. Lasers heat targets; sound makes pressure pulses; neutrons trigger uranium fission.",
      "Added dragonfire, frostfire, antimatter, black holes, repulsors, and fairy dust, with a Fiction filter in the material palette.",
      "Ray direction survives copying, resizing, undo, and save files. Existing saves and material IDs remain compatible.",
      "Lightning brush size controls strike frequency: small brushes strike slowly, large brushes strike rapidly. Clicks and taps remain immediate.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-01",
    title: "Canvas creation and resizing",
    changes: [
      "Replaced Experiments with a plus button for creating named canvases with custom pixel dimensions, borders, and background colors.",
      "Canvas properties can be edited beside the canvas size. Resizing includes a draggable placement preview for cropping or adding space.",
      "Solid borders contain particles, looping borders connect opposite edges, and void borders let particles escape. Reactions, heat, and pressure follow the border type.",
      "Canvas properties and complete particle state survive saves, exports, autosave, undo, and redo.",
      "Fixed a timing issue that could override pause shortcuts pressed immediately after closing a menu.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-10-01",
    title: "About Sandlab",
    changes: [
      "The question mark menu now shows the app version, changelog, and local storage information.",
      "Removed the redundant controls list. Keyboard bindings remain in Settings → Keyboard.",
    ],
  },
  {
    date: "2026-10-01",
    title: "Inspection and keyboard controls",
    changes: [
      "Added a magnifier with live temperature, lifetime, charge, pressure, and material-specific readings.",
      "Added an eyedropper to pick a material directly from the world.",
      "Keyboard shortcuts can be changed, cleared, or reset in Settings → Keyboard. Help displays your current bindings.",
    ],
  },
  {
    date: "2026-10-01",
    title: "Edit history and reaction timing",
    changes: [
      "Added redo, cut, select all, delete selection, and common desktop shortcuts.",
      "Added this changelog under Help → What’s new.",
      "Gunpowder burns progressively and builds pressure; liquid fuel burns at exposed surfaces.",
      "TNT heats up before a delayed reaction; strong pressure can still trigger it rapidly.",
      "Burning coal, wood, and gunpowder emit hot embers. Conductors spark across small electrical gaps.",
      "Cold water quenches without instant vaporization; brine retains salt through boiling and freezing.",
      "Removed Terrarium. New sessions start with an empty world.",
    ],
  },
  {
    date: "2026-10-01",
    title: "Public access and security",
    changes: [
      "Made Sandlab playable without a ChatGPT sign-in.",
      "Blocked remote scripts and network connections, removed remote fonts, and hardened save imports.",
    ],
  },
  {
    date: "2026-10-01",
    title: "Materials and experiments",
    changes: [
      "Expanded the palette to 71 materials, including copper, sodium, clay, fertilizer, and liquid nitrogen.",
      "Added oxidation, neutralization, nutrient transport, and ceramic firing.",
      "Added Reaction bench and Pottery kiln.",
    ],
  },
  {
    date: "Earlier updates",
    title: "Sandbox controls",
    changes: [
      "Added lightning, growing plants, bloom, absorption, temperature tools, and force tools.",
      "Added rectangle and brush selections, copying, pasting, dragging, and deselection.",
      "Added grouped settings and a full-height mobile materials palette.",
    ],
  },
];
