import { defaultMechanics } from "./sim/mechanics-options.js";
import { normalizeBindings } from "./shortcuts.js";
export const settingsKey = "sandlab.settings.v1";
const allSettingGroups = [
  {
    id: "rendering",
    name: "Rendering",
    fields: [
      { key: "bloom", label: "Bloom", type: "toggle", default: true },
      {
        key: "bloomIntensity",
        label: "Glow strength",
        type: "range",
        min: 0.25,
        max: 1.5,
        step: 0.25,
        default: 1,
        depends: "bloom",
        suffix: "×",
      },
      {
        key: "lightBounces",
        label: "Reflected light",
        type: "range",
        min: 0,
        max: 0.25,
        step: 0.05,
        default: 0.1,
        displayScale: 100,
        suffix: "%",
      },
      {
        key: "canvasFill",
        label: "Canvas display",
        type: "select",
        options: [
          ["fit", "Fit"],
          ["stretch", "Stretch"],
        ],
        default: "stretch",
      },
      { key: "grid", label: "Grid overlay", type: "toggle", default: false },
      {
        key: "view",
        label: "Visualization",
        type: "select",
        options: [
          ["normal", "Natural"],
          ["heat", "Temperature"],
          ["pressure", "Pressure"],
          ["wind", "Airflow"],
          ["echo", "Echolocation"],
        ],
        default: "normal",
      },
    ],
  },
  {
    id: "audio",
    name: "Audio",
    fields: [
      { key: "sound", label: "Sound effects", type: "toggle", default: true },
      {
        key: "audioOutput",
        label: "Output",
        type: "select",
        default: "auto",
        options: [
          ["auto", "Automatic"],
          ["balanced", "Balanced / Headphones"],
          ["speakers", "Phone Speakers"],
        ],
        depends: "sound",
      },
      {
        key: "audioOcclusion",
        label: "Wall muffling",
        type: "toggle",
        default: true,
        depends: "sound",
      },
      {
        key: "audioEcho",
        label: "Room echoes",
        type: "toggle",
        default: true,
        depends: "sound",
      },
      {
        key: "volume",
        label: "Volume",
        type: "range",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.45,
        displayScale: 100,
        suffix: "%",
        depends: "sound",
      },
    ],
  },
  {
    id: "simulation",
    name: "Simulation",
    fields: [
      {
        key: "pressureSimulation",
        label: "Air & pressure",
        type: "toggle",
        default: defaultMechanics.pressureSimulation,
      },
      {
        key: "temperatureSimulation",
        label: "Temperature",
        type: "toggle",
        default: defaultMechanics.temperatureSimulation,
      },
      {
        key: "speed",
        label: "Simulation speed",
        type: "select",
        options: [
          [0.25, "0.25×"],
          [0.5, "0.5×"],
          [1, "1×"],
        ],
        default: 1,
      },
      {
        key: "pauseWhenZooming",
        label: "Pause when zooming",
        type: "toggle",
        default: false,
      },
      {
        key: "startPaused",
        label: "Start sessions paused",
        type: "toggle",
        default: false,
      },
    ],
  },
  {
    id: "atmosphere",
    name: "Atmosphere",
    fields: [
      {
        key: "windStrength",
        label: "Ambient wind",
        type: "range",
        min: 0,
        max: 2,
        step: 0.1,
        default: defaultMechanics.windStrength,
        suffix: " cells/tick",
      },
      {
        key: "windDirection",
        label: "Wind direction",
        type: "select",
        options: [
          ["right", "Right"],
          ["left", "Left"],
          ["up", "Up"],
          ["down", "Down"],
        ],
        default: defaultMechanics.windDirection,
      },
    ],
  },
  {
    id: "brush",
    name: "Brush",
    fields: [
      {
        key: "solidDrawRelease",
        label: "After drawing solids",
        type: "select",
        options: [
          ["resume", "Resume on release"],
          ["hold", "Stay paused"],
        ],
        default: "resume",
      },
      {
        key: "brushSize",
        label: "Brush diameter",
        type: "range",
        min: 1,
        max: 61,
        step: 1,
        default: 13,
        suffix: " px",
      },
      {
        key: "brushShape",
        label: "Drawing shape",
        type: "select",
        options: [
          ["circle", "Circle"],
          ["square", "Square"],
        ],
        default: "circle",
      },
      {
        key: "brushOutline",
        label: "Brush outline",
        type: "toggle",
        default: true,
      },
    ],
  },
  {
    id: "wildlife",
    name: "Wildlife",
    fields: [
      {
        key: "flocking",
        label: "Flocking and schooling",
        type: "toggle",
        default: defaultMechanics.flocking,
      },
      {
        key: "flockRange",
        label: "Group distance",
        type: "range",
        min: 24,
        max: 80,
        step: 8,
        default: defaultMechanics.flockRange,
        depends: "flocking",
        suffix: " cells",
      },
      {
        key: "flockMinimum",
        label: "Minimum group size",
        type: "range",
        min: 2,
        max: 8,
        step: 1,
        default: defaultMechanics.flockMinimum,
        depends: "flocking",
      },
      {
        key: "predation",
        label: "Predators and fleeing",
        type: "toggle",
        default: defaultMechanics.predation,
      },
      {
        key: "predatorRange",
        label: "Awareness distance",
        type: "range",
        min: 24,
        max: 120,
        step: 8,
        default: defaultMechanics.predatorRange,
        depends: "predation",
        suffix: " cells",
      },
    ],
  },
  {
    id: "devices",
    name: "Devices",
    fields: [
      {
        key: "machineMotors",
        label: "Drone and rover motors",
        type: "toggle",
        default: defaultMechanics.machineMotors,
      },
      {
        key: "machineSpeed",
        label: "Cruise speed",
        type: "range",
        min: 0.15,
        max: 0.8,
        step: 0.05,
        default: defaultMechanics.machineSpeed,
        depends: "machineMotors",
        suffix: " cells/tick",
      },
      {
        key: "missileHoming",
        label: "Heat seeking",
        type: "toggle",
        default: defaultMechanics.missileHoming,
      },
      {
        key: "laserGuidance",
        label: "Laser and cursor guidance",
        type: "toggle",
        default: defaultMechanics.laserGuidance,
      },
      {
        key: "missileHeat",
        label: "Minimum target heat",
        type: "range",
        min: 40,
        max: 800,
        step: 20,
        default: defaultMechanics.missileHeat,
        depends: "missileHoming",
        suffix: "°C",
      },
      {
        key: "missileRange",
        label: "Beam and heat seeker range",
        type: "range",
        min: 32,
        max: 512,
        step: 32,
        default: defaultMechanics.missileRange,
        suffix: " cells",
      },
      {
        key: "missileSpeed",
        label: "Flight speed",
        type: "range",
        min: 0.5,
        max: 2,
        step: 0.25,
        default: defaultMechanics.missileSpeed,
        suffix: " cells/tick",
      },
      {
        key: "missileBlast",
        label: "Blast radius",
        type: "range",
        min: 2,
        max: 10,
        step: 1,
        default: defaultMechanics.missileBlast,
        suffix: " cells",
      },
    ],
  },
  {
    id: "player",
    name: "Player",
    fields: [
      {
        key: "joystickSide",
        label: "Joystick side",
        type: "select",
        options: [
          ["left", "Left"],
          ["right", "Right"],
        ],
        default: "left",
      },
      {
        key: "joystickSize",
        label: "Joystick size",
        type: "range",
        min: 64,
        max: 120,
        step: 2,
        default: 82,
        suffix: " px",
      },
      {
        key: "joystickInset",
        label: "Distance from edge",
        type: "range",
        min: 0,
        max: 80,
        step: 2,
        default: 18,
        suffix: " px",
      },
      {
        key: "joystickRaise",
        label: "Raise joystick",
        type: "range",
        min: 0,
        max: 160,
        step: 4,
        default: 0,
        suffix: " px",
      },
    ],
  },
  {
    id: "controller",
    name: "Controller",
    fields: [
      {
        key: "controller",
        label: "Controller support",
        type: "toggle",
        default: true,
      },
      {
        key: "controllerDeadzone",
        label: "Stick deadzone",
        type: "range",
        min: 0.05,
        max: 0.35,
        step: 0.01,
        default: 0.18,
        displayScale: 100,
        suffix: "%",
        depends: "controller",
      },
      {
        key: "controllerCursorSpeed",
        label: "Cursor speed",
        type: "range",
        min: 0.25,
        max: 2,
        step: 0.25,
        default: 1,
        suffix: "×",
        depends: "controller",
      },
    ],
  },
  {
    id: "storage",
    name: "Storage",
    fields: [
      {
        key: "autosave",
        label: "Autosave world",
        type: "toggle",
        default: true,
      },
      {
        key: "autosaveInterval",
        label: "Autosave every",
        type: "select",
        options: [
          [15, "15 seconds"],
          [30, "30 seconds"],
          [60, "1 minute"],
        ],
        default: 30,
        depends: "autosave",
      },
      {
        key: "restoreLast",
        label: "Restore last world on launch",
        type: "toggle",
        default: true,
      },
    ],
  },
  {
    id: "keyboard",
    name: "Keyboard",
    fields: [{ key: "shortcuts", type: "bindings", default: {} }],
  },
  {
    id: "performance",
    name: "Performance",
    fields: [
      {
        key: "maxCacheMB",
        label: "Maximum hidden-detail cache",
        type: "select",
        options: [
          [0, "Off"],
          [4, "4 MiB"],
          [8, "8 MiB"],
          [16, "16 MiB"],
          [32, "32 MiB"],
          [64, "64 MiB"],
        ],
        default: 16,
      },
      {
        key: "predictHidden",
        label: "Predict unseen entity movement",
        type: "toggle",
        default: true,
      },
      {
        key: "fragmentParticles",
        label: "Simplify tiny broken pieces",
        type: "toggle",
        default: defaultMechanics.fragmentParticles,
      },
      {
        key: "displayQuality",
        label: "Display quality",
        type: "select",
        options: [
          [1, "Reduced"],
          [2, "Standard"],
        ],
        default: 2,
      },
      { key: "showFps", label: "FPS counter", type: "toggle", default: true },
      {
        key: "debug",
        label: "Performance details",
        type: "toggle",
        default: false,
      },
    ],
  },
];
const worldKeys = new Set([...Object.keys(defaultMechanics), "speed"]);
export const worldSettingGroups = allSettingGroups
  .map((group) => ({
    ...group,
    fields: group.fields
      .filter((field) => worldKeys.has(field.key))
      .map((field) => ({
        ...field,
        key: field.key === "speed" ? "simulationSpeed" : field.key,
      })),
  }))
  .filter((group) => group.fields.length);
export const settingGroups = allSettingGroups
  .map((group) => ({
    ...group,
    name: group.id === "simulation" ? "Session" : group.name,
    fields: group.fields.filter((field) => !worldKeys.has(field.key)),
  }))
  .filter((group) => group.fields.length);
const legacyDefinitions = Object.fromEntries(
  allSettingGroups.flatMap((g) => g.fields).map((f) => [f.key, f]),
);
const definitions = Object.fromEntries(
  settingGroups
    .flatMap((group) => group.fields)
    .map((field) => [field.key, field]),
);
function validate(key, value) {
  const field = legacyDefinitions[key];
  if (!field) return undefined;
  if (field.type === "bindings") return normalizeBindings(value);
  if (field.type === "toggle")
    return typeof value === "boolean" ? value : undefined;
  if (field.type === "select")
    return field.options.some(([option]) => option === value)
      ? value
      : undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(
    field.max,
    Math.max(field.min, Math.round(value / field.step) * field.step),
  );
}
export class Settings {
  constructor(storage) {
    this.listeners = new Set();
    this.legacyWorld = {
      mechanics: { ...defaultMechanics },
      simulationSpeed: 1,
    };
    this.values = Object.fromEntries(
      Object.entries(definitions).map(([key, field]) => [key, field.default]),
    );
    this.saved = true;
    let raw;
    try {
      this.storage = storage ?? globalThis.localStorage;
      raw = this.storage.getItem(settingsKey);
    } catch {
      this.saved = false;
      return;
    }
    try {
      const loaded = JSON.parse(raw);
      if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
        if (
          loaded.brushUnit !== "diameter" &&
          Number.isFinite(loaded.brushSize)
        )
          loaded.brushSize =
            Math.max(1, Math.min(30, Math.round(loaded.brushSize))) * 2 + 1;
        // Both former switches now control a single compressible air system.
        if (loaded.windSimulation === false) loaded.pressureSimulation = false;
        for (const key of worldKeys) {
          const value = validate(key, loaded[key]);
          if (value !== undefined) {
            if (key === "speed") this.legacyWorld.simulationSpeed = value;
            else this.legacyWorld.mechanics[key] = value;
          }
        }
        for (const key of Object.keys(definitions)) {
          const value = validate(key, loaded[key]);
          if (value !== undefined) this.values[key] = value;
        }
      }
    } catch {
      /* Unavailable or damaged storage must never prevent drawing. */
    }
  }
  get(key) {
    return (
      this.values[key] ??
      (key === "speed"
        ? this.legacyWorld.simulationSpeed
        : this.legacyWorld.mechanics[key])
    );
  }
  set(key, value) {
    if (!definitions[key]) return;
    value = validate(key, value);
    if (value === undefined || this.values[key] === value) return;
    if (
      key === "shortcuts" &&
      JSON.stringify(value) === JSON.stringify(this.values[key])
    )
      return;
    this.values[key] = value;
    this.persist();
    for (const listener of this.listeners) listener([key]);
  }
  subscribe(listener) {
    this.listeners.add(listener);
  }
  persist() {
    try {
      this.storage.setItem(
        settingsKey,
        JSON.stringify({ ...this.values, brushUnit: "diameter" }),
      );
      this.saved = true;
    } catch {
      this.saved = false;
    }
  }
  reset() {
    for (const [key, field] of Object.entries(definitions))
      this.values[key] = field.default;
    this.persist();
    const keys = Object.keys(definitions);
    for (const listener of this.listeners) listener(keys);
  }
}
