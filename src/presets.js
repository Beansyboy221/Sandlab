import { buildMaterialLab } from "./presets/material-labs.js";
import { painter } from "./presets/painter.js";
import { buildExperiment } from "./presets/experiments.js";
import { M } from "./sim/materials.js";
export const presets = [
  {
    id: "volcano",
    name: "Volcanic island",
    subtitle: "Lava and water",
    tag: "THERMODYNAMICS",
    color: "#f38a65",
  },
  {
    id: "circuit",
    name: "Live wire",
    subtitle: "Spark and metal circuit",
    tag: "ELECTRICITY",
    color: "#9dafe5",
  },
  {
    id: "chemistry",
    name: "Density column",
    subtitle: "Mercury, water, oil, and sand",
    tag: "FLUID DYNAMICS",
    color: "#7bbca8",
  },
  {
    id: "explosion",
    name: "Chain reaction",
    subtitle: "Gunpowder fuse and TNT",
    tag: "COMBUSTION",
    color: "#ce8fb1",
  },
  ...[
    [
      "reactions",
      "Reaction bench",
      "Sodium, neutralization, and oxide cleaning",
      "CHEMISTRY",
      "#b5cf85",
    ],
    [
      "pottery",
      "Pottery kiln",
      "Drying clay and fired brick",
      "CERAMICS",
      "#c76e58",
    ],
    [
      "absorption",
      "Sponge laboratory",
      "Water, oil, and absorbent solids",
      "ABSORPTION",
      "#e6c06c",
    ],
    [
      "storm",
      "Thunder valley",
      "Lightning rods and rain",
      "WEATHER",
      "#9dafe5",
    ],
    [
      "garden",
      "Seed garden",
      "Moist soil and growing seeds",
      "BIOLOGY",
      "#78b579",
    ],
    [
      "foundry",
      "Foundry",
      "Hot metal and a cooling mold",
      "METALLURGY",
      "#f3a576",
    ],
    [
      "phase",
      "Phase chamber",
      "Boiling and condensation",
      "THERMODYNAMICS",
      "#91c5df",
    ],
    [
      "acid",
      "Acid laboratory",
      "Wood and ceramic in acid",
      "CHEMISTRY",
      "#b4cb79",
    ],
    [
      "firebreak",
      "Firebreak",
      "Burning surfaces and a ceramic barrier",
      "COMBUSTION",
      "#ef9875",
    ],
  ].map(([id, name, subtitle, tag, color]) => ({
    id,
    name,
    subtitle,
    tag,
    color,
  })),
  {
    id: "blank",
    name: "Empty world",
    subtitle: "Empty world",
    tag: "SANDBOX",
    color: "#a0adb7",
  },
];
export function loadPreset(world, id) {
  world.name =
    presets.find((preset) => preset.id === id)?.name || "Untitled canvas";
  if (!presets.some((preset) => preset.id === id))
    throw Error("Unknown experiment.");
  world.clear();
  const w = world.width,
    h = world.height;
  const { put, rect, line, cup } = painter(world);
  if (buildMaterialLab(world, id) || buildExperiment(world, id)) return;
  if (id === "volcano") {
    rect(0, h - 10, w, 10, "Wall");
    for (let x = 0; x < w; x++)
      for (let y = Math.round(h * 0.68); y < h - 10; y++) put(x, y, "Water");
    for (let x = Math.round(w * 0.22); x < w * 0.73; x++) {
      const top = h * 0.34 + Math.abs(x - w * 0.475) * 0.86;
      for (let y = Math.round(top); y < h - 10; y++) put(x, y, "Stone");
    }
    rect(
      Math.round(w * 0.46),
      Math.round(h * 0.34),
      10,
      Math.round(h * 0.66) - 10,
      "Lava",
    );
    rect(Math.round(w * 0.46), h - 15, 10, 3, "Heater");
    line(w * 0.37, h * 0.48, w * 0.45, h * 0.35, "Lava", 2);
    const emitter = Math.round(h * 0.34) * w + Math.round(w * 0.475);
    world.set(emitter, M.Clone);
    world.clone[emitter] = M.Lava;
  } else if (id === "circuit") {
    line(w * 0.18, h * 0.5, w * 0.38, h * 0.5, "Steel", 2);
    line(w * 0.38, h * 0.5, w * 0.38, h * 0.3, "Steel", 2);
    line(w * 0.38, h * 0.3, w * 0.62, h * 0.3, "Steel", 2);
    line(w * 0.62, h * 0.3, w * 0.62, h * 0.65, "Steel", 2);
    line(w * 0.62, h * 0.65, w * 0.8, h * 0.65, "Steel", 2);
    line(w * 0.18, h * 0.52, w * 0.38, h * 0.52, "Ceramic", 1);
    rect(Math.round(w * 0.81), Math.round(h * 0.62), 10, 12, "TNT");
    const terminalX = Math.round(w * 0.81),
      terminalY = Math.round(h * 0.65);
    line(w * 0.62, terminalY, terminalX - 3, terminalY, "Steel", 1);
    rect(terminalX - 2, terminalY - 3, 2, 7, "Empty");
    put(terminalX - 1, terminalY, "Steel");
    // A capped arc gap heats a supported fuse underneath. The tinder cannot
    // topple into the electrical gap when the new contact solver settles it.
    rect(terminalX - 2, terminalY - 1, 2, 1, "Wall");
    rect(terminalX - 2, terminalY + 1, 3, 1, "Wood");
    rect(terminalX - 2, terminalY + 2, 3, 1, "Wall");
    // A static channel holds the live wire in place; keep the visible arc gap open.
    const backing = [];
    for (let i = 0; i < world.length; i++)
      if ([M.Steel, M.Ceramic].includes(world.cells[i])) {
        const x = i % w,
          y = Math.floor(i / w);
        world.eachNeighbor(x, y, (j) => {
          const jx = j % w,
            jy = Math.floor(j / w);
          const gap =
            jx >= terminalX - 2 &&
            jx <= terminalX + 10 &&
            jy >= terminalY - 1 &&
            jy <= terminalY;
          if (!world.cells[j] && !gap) backing.push(j);
        });
      }
    for (const i of backing) world.set(i, M.Wall);
    rect(terminalX, Math.round(h * 0.62) + 12, 10, 2, "Wall");
    put(Math.round(w * 0.18) - 3, Math.round(h * 0.5), "Spark");
  } else if (id === "chemistry") {
    const x = Math.round(w * 0.31),
      y = Math.round(h * 0.24),
      rw = Math.round(w * 0.38),
      rh = Math.round(h * 0.64);
    cup(x, y, rw + 3, rh);
    rect(x + 3, y + rh - 17, rw - 3, 17, "Mercury");
    rect(x + 3, y + rh - 43, rw - 3, 26, "Water");
    rect(x + 3, y + rh - 68, rw - 3, 25, "Oil");
    rect(x + 12, y - 12, rw - 22, 9, "Sand");
  } else if (id === "explosion") {
    rect(0, h - 8, w, 8, "Wall");
    for (let n = 0; n < 5; n++)
      rect(Math.round(w * 0.24 + n * w * 0.13), h - 22, 8, 14, "TNT");
    rect(0, h - 8, w, 8, "Wall");
    line(w * 0.12, h - 9, w * 0.85, h - 9, "Gunpowder", 0);
    // Two layers keep this fixture connected when reflected pressure lifts grains.
    for (let x = Math.round(w * 0.12) + 2; x < w * 0.85; x++) {
      const i = (h - 10) * w + x;
      if (!world.cells[i]) world.set(i, M.Gunpowder);
    }
    world.brush(w * 0.12, h - 10, 1, M.Fire, "circle", true);
  }
}
