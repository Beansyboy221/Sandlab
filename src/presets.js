import { buildDeviceLab } from "./presets/device-lab.js";
import { buildMissileRange } from "./presets/missile-range.js";
import { buildWildlife } from "./presets/wildlife.js";
import { buildMaterialLab } from "./presets/material-labs.js";
import { painter } from "./presets/painter.js";
import { buildExperiment } from "./presets/experiments.js";
import { M } from "./sim/materials.js";
import { buildVentChamber } from "./presets/vent-chamber.js";
export const presets = [
  {
    id: "vent",
    name: "Vented fire chamber",
    subtitle: "A one-pixel vent releases hot gas",
    tag: "AIRFLOW",
    color: "#84d4df",
  },
  {
    id: "logic",
    name: "Logic workbench",
    subtitle: "Powered gates, toggles and delays",
    tag: "CIRCUITS",
    color: "#a7c9e5",
  },
  {
    id: "machines",
    name: "Device yard",
    subtitle: "Hovering drones and a terrain rover",
    tag: "MACHINES",
    color: "#a8d9d4",
  },
  {
    id: "flocks",
    name: "Flocks and schools",
    subtitle: "Bird formations and a fish school",
    tag: "BOIDS",
    color: "#91c9d7",
  },
  {
    id: "reserve",
    name: "Predator reserve",
    subtitle: "Hunters on land and in water",
    tag: "WILDLIFE",
    color: "#b9c59a",
  },
  {
    id: "missiles",
    name: "Missile range",
    subtitle: "Seek exposed heat and collide",
    tag: "HOMING",
    color: "#e5b985",
  },
  {
    id: "wildlife",
    name: "Wildlife pond",
    subtitle: "Walk, hop, swim, and fly",
    tag: "LIFE",
    color: "#9ac9bd",
  },
  {
    id: "stickmen",
    name: "Stickman playground",
    subtitle: "Walk, jump, and follow",
    tag: "PLAY",
    color: "#82d4e8",
  },
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
    subtitle: "Powered wire and arc ignition",
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
  if (id === "stickmen") {
    const gx = world.gravityX,
      gy = world.gravityY;
    const across = gy ? w : h,
      down = gx ? w : h;
    const floor = Math.max(16, Math.min(down - 3, Math.floor(down * 0.78)));
    const map = (u, v) => ({
      x: gy * u + gx * v + (gy < 0 || gx < 0 ? w - 1 : 0),
      y: -gx * u + gy * v + (gx > 0 || gy < 0 ? h - 1 : 0),
    });
    for (let u = 0; u < across; u++) {
      for (const base of [floor, down - 3])
        for (let v = base; v < base + 3; v++) {
          const p = map(u, v);
          put(p.x, p.y, "Wall");
        }
      if (u >= across * 0.4 && u < across * 0.48)
        for (let v = floor - 3; v < floor; v++) {
          const p = map(u, v);
          put(p.x, p.y, "Wall");
        }
    }
    if (across >= 60 && down >= 40) {
      const a = map(Math.max(8, across * 0.14), floor - 1),
        b = map(across * 0.3, floor - 1);
      world.stickmen.spawn(a.x, a.y, M.Stickman);
      world.stickmen.spawn(b.x, b.y, M.Player);
    }
    return;
  }
  if (id === "vent") {
    buildVentChamber(world);
    return;
  }
  if (buildDeviceLab(world, id)) return;
  if (buildWildlife(world, id) || buildMissileRange(world, id)) return;
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
    const sourceX = Math.round(w * 0.18),
      terminalX = Math.round(w * 0.81),
      y = Math.round(h * 0.5);
    // A supported, unbranched conductor carries finite powered pulses to a
    // fixed arc terminal; the fuse is heated by the arc's actual energy budget.
    line(sourceX, y, terminalX - 3, y, "Copper", 0);
    rect(sourceX, y - 1, terminalX - sourceX - 2, 1, "Wall");
    rect(sourceX, y + 1, terminalX - sourceX - 2, 1, "Wall");
    put(sourceX - 1, y, "Battery");
    world.heading[y * w + sourceX - 1] = 0;
    world.electricalSupply[y * w + sourceX - 1] = 32768;
    put(terminalX - 1, y, "Signal Lamp");
    rect(terminalX - 2, y - 1, 2, 1, "Wall");
    rect(terminalX - 2, y + 1, 10, 12, "TNT");
    rect(terminalX - 2, y + 13, 10, 2, "Wall");
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
