export const changelog = [
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
