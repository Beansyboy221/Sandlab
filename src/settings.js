import { normalizeBindings } from "./shortcuts.js";
export const settingsKey = "sandlab.settings.v1";
export const settingGroups = [
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
      { key: "grid", label: "Grid overlay", type: "toggle", default: false },
      {
        key: "view",
        label: "Visualization",
        type: "select",
        options: [
          ["normal", "Natural"],
          ["heat", "Temperature"],
          ["pressure", "Pressure"],
        ],
        default: "normal",
      },
    ],
  },
  {
    id: "simulation",
    name: "Simulation",
    fields: [
      {
        key: "speed",
        label: "Simulation speed",
        type: "select",
        options: [
          [0.25, "0.25×"],
          [0.5, "0.5×"],
          [1, "1×"],
          [2, "2×"],
        ],
        default: 1,
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
        label: "Brush size",
        type: "range",
        min: 1,
        max: 30,
        step: 1,
        default: 6,
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
const definitions = Object.fromEntries(
  settingGroups
    .flatMap((group) => group.fields)
    .map((field) => [field.key, field]),
);
function validate(key, value) {
  const field = definitions[key];
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
      if (loaded && typeof loaded === "object" && !Array.isArray(loaded))
        for (const key of Object.keys(definitions)) {
          const value = validate(key, loaded[key]);
          if (value !== undefined) this.values[key] = value;
        }
    } catch {
      /* Unavailable or damaged storage must never prevent drawing. */
    }
  }
  get(key) {
    return this.values[key];
  }
  set(key, value) {
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
      this.storage.setItem(settingsKey, JSON.stringify(this.values));
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
