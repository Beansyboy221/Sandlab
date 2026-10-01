import {
  paletteBase,
  paletteMaterials,
  materialSearchText,
} from "./sim/material-families.js";
import { MobileDock } from "./mobile-dock.js";
import { ToolPicker } from "./tool-picker.js";
import { LevelEditor } from "./level-editor.js";
import { EditHistory } from "./history.js";
import {
  shortcutAction,
  shortcutDefinitions,
  bindingsFor,
  formatChord,
} from "./shortcuts.js";
import { Inspector, cellAt } from "./inspector.js";
import { changelog } from "./changelog.js";
import { Settings } from "./settings.js";
import { SettingsPanel } from "./settings-panel.js";
import { Selection } from "./selection.js";
import { brushTools } from "./sim/tools.js";
import { World } from "./sim/world.js";
import { materials, M, categories, categoryLabels } from "./sim/materials.js";
import { Renderer } from "./renderer.js";
import { Input, lightningInterval } from "./input.js";
import { loadPreset } from "./presets.js";
import {
  snapshot,
  validateSnapshot,
  restore,
  pack,
  unpack,
  getSaves,
  saveWorld,
  deleteSave,
  autosave,
  getAutosave,
} from "./persistence.js";
import { icon, populateIcons } from "./icons.js";

const $ = (id) => document.getElementById(id);
populateIcons();
const settings = new Settings();
let autosaveTimer, toolPicker, mobileDock;
$("palette").querySelector("h1 span").textContent = paletteMaterials.length;
const portrait = innerWidth <= 700 && innerHeight > innerWidth;
const world = new World(portrait ? 200 : 320, portrait ? 300 : 200),
  renderer = new Renderer($("world"), world);
const inspector = new Inspector($("inspection-card"), world, renderer);
const state = {
  material: M.Sand,
  paintTemperature: 20,
  radius: settings.get("brushSize"),
  shape: settings.get("brushShape"),
  selectionShape: "square",
  selectionErase: false,
  erase: false,
  tool: "paint",
  power: 1,
  includeSolids: true,
  fanDirection: "drag",
  replace: false,
  paused: false,
  speed: settings.get("speed"),
  setRadius(radius) {
    this.radius = Math.max(1, Math.min(30, Math.round(radius)));
    $("brush").value = this.radius;
    syncBrushControl();
    if (renderer.cursor)
      renderer.cursor.radius =
        this.tool === "paint" &&
        (this.material === M.Lightning || materials[this.material].directed)
          ? 0
          : this.radius;
    if (selection.brushing) selection.radius = this.radius;
    settings.set("brushSize", this.radius);
  },
};
const selection = new Selection(world, updateToolProperties, remember, () =>
  toast("Move blocked by other particles. Enable Replace to overwrite."),
);
renderer.selection = selection;
let category = "all",
  history = new EditHistory(world),
  hover = null,
  toastTimer,
  simTime = 0,
  fps = 60,
  accumulator = 0,
  lastTime = performance.now(),
  statsTime = lastTime,
  frameCount = 0,
  lagFrames = 0;
let hasChanged = false;
const dialogPrevious = new WeakMap();
let pendingDelete = null;
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3000);
}
function remember() {
  history.remember($("world-name").textContent);
  syncHistory();
  hasChanged = true;
  $("canvas-tip").style.opacity = "0";
}
function resetSelection() {
  selection.clear();
}
function syncHistory() {
  $("undo-btn").disabled = !history.past.length;
  $("redo-btn").disabled = !history.future.length;
}
function travelHistory(direction) {
  if (!(direction === "undo" ? history.past : history.future).length) return;
  input.cancel();
  selection.cancel();
  setPaused(true);
  const name = history[direction]($("world-name").textContent);
  resetSelection();
  world.name = name || world.name;
  syncLevelDisplay();
  syncHistory();
  toast(direction === "undo" ? "Edit undone" : "Edit redone");
  hasChanged = true;
}
function undo() {
  travelHistory("undo");
}
function redo() {
  travelHistory("redo");
}
function setPaused(value) {
  if (!value && selection.dragging) selection.cancel();
  state.paused = value;
  accumulator = 0;
  $("play-btn").innerHTML = icon(value ? "play" : "pause");
  $("play-btn").setAttribute(
    "aria-label",
    value ? "Play simulation" : "Pause simulation",
  );
  $("run-status").textContent = value ? "Paused" : "Running";
  $("run-status").previousElementSibling.style.background = value
    ? "#a39573"
    : "#a6d5bd";
}
function syncBrushControl() {
  const frequency = state.tool === "paint" && state.material === M.Lightning;
  $("brush-label").textContent = frequency ? "Rate" : "Size";
  $("brush-value").value = frequency
    ? `${(1000 / lightningInterval(state.radius)).toFixed(1)}/s`
    : state.radius;
  $("brush-control").classList.toggle("frequency", frequency);
  $("brush").setAttribute(
    "aria-label",
    frequency ? "Lightning strike frequency" : "Brush radius",
  );
  if (frequency)
    $("brush").setAttribute(
      "aria-valuetext",
      `${(1000 / lightningInterval(state.radius)).toFixed(1)} strikes per second`,
    );
  else $("brush").removeAttribute("aria-valuetext");
}
function updateToolProperties() {
  syncBrushControl();
  if (selection.dragging && !state.paused) setPaused(true);
  const tool = state.tool;
  document.querySelector(".toolbox").dataset.tool = tool;
  $("palette-toggle").hidden = tool !== "paint";
  $("tool-properties").hidden = tool === "paint";
  $("selection-properties").hidden = tool !== "select";
  $("inspection-properties").hidden = tool !== "inspect";
  $("eyedropper-property").hidden = tool !== "eyedropper";
  const reading = tool === "inspect" || tool === "eyedropper";
  $("shape-btn").hidden = reading;
  $("canvas-tip").hidden = reading;
  $("clear-btn").hidden = tool === "select";
  $("deselect-selection").hidden = tool !== "select";
  $("deselect-selection").disabled = !selection.box && !selection.placing;
  $("power-property").hidden = ![
    "warm",
    "cool",
    "pressure",
    "vacuum",
    "squeeze",
  ].includes(tool);
  $("solids-property").hidden = !["grab", "erase"].includes(tool);
  $("direction-property").hidden = tool !== "fan";
  const shape = tool === "select" ? state.selectionShape : state.shape;
  $("brush-control").hidden =
    reading || (tool === "select" && shape === "square");
  const shapeButton = $("shape-btn"),
    selecting = tool === "select";
  if (
    shapeButton.dataset.shape !== shape ||
    shapeButton.dataset.selecting !== String(selecting)
  ) {
    shapeButton.dataset.shape = shape;
    shapeButton.dataset.selecting = String(selecting);
    shapeButton.innerHTML = icon(shape);
    shapeButton.setAttribute(
      "aria-label",
      `${selecting ? "Selection" : "Brush"} shape: ${shape}. Click to change.`,
    );
    shapeButton.title = selecting
      ? shape === "square"
        ? "Drag a selection rectangle"
        : "Paint the selection. Right-click or use the eraser to subtract."
      : "Change brush shape";
  }
  $("selection-erase").hidden = tool !== "select" || shape !== "circle";
  $("selection-erase").disabled = selection.placing;
  $("selection-erase").classList.toggle("active", state.selectionErase);
  $("selection-erase").setAttribute(
    "aria-pressed",
    String(state.selectionErase),
  );
  $("copy-selection").disabled =
    !selection.box || selection.placing || !!selection.dragging;
  $("paste-selection").disabled = !selection.clipboard || !!selection.dragging;
  $("paste-selection").classList.toggle("active", selection.placing);
  $("paste-selection").setAttribute("aria-pressed", String(selection.placing));
  $("power-label").textContent =
    tool === "warm"
      ? "Heat"
      : tool === "cool"
        ? "Cooling"
        : tool === "squeeze"
          ? "Duration"
          : "Force";
}
function setTool(value) {
  const tool = typeof value === "boolean" ? (value ? "erase" : "paint") : value;
  if (state.tool !== tool) {
    input.cancel();
    selection.cancel();
  }
  state.tool = tool;
  state.erase = tool === "erase";
  $("brush-tool").value = tool;
  toolPicker?.sync(tool);
  mobileDock?.toolChanged(tool);
  selection.visible = tool === "select";
  inspector.setActive(tool === "inspect");
  if (tool === "inspect") inspector.follow(hover);
  if (tool === "inspect" || tool === "eyedropper") renderer.cursor = null;
  syncInspectorControls();
  if (tool === "select") {
    setPaused(true);
    renderer.cursor = null;
  } else if (renderer.cursor) renderer.cursor.erase = state.erase;
  updateToolProperties();
  $("palette-toggle").querySelector("span:not([data-icon])").textContent =
    materials[state.material].name;
}
function deselect() {
  input.cancel();
  selection.clear();
  if (hover) input.hover(hover);
}
function copySelection() {
  if (selection.placing || selection.dragging) return;
  if (selection.copy())
    toast(
      `Copied ${selection.clipboard.width} × ${selection.clipboard.height} cells`,
    );
}
function pasteSelection() {
  if (!selection.clipboard) return;
  if (selection.placing) {
    selection.cancel();
    return;
  }
  setTool("select");
  selection.arm();
  selection.move(hover || { x: world.width / 2, y: world.height / 2 });
  toast("Tap to place. Paste again or Escape cancels.");
  $("world").focus();
}
$("deselect-selection").addEventListener("click", deselect);
$("copy-selection").addEventListener("click", copySelection);
$("paste-selection").addEventListener("click", pasteSelection);
$("paste-replace").addEventListener(
  "change",
  (e) => (selection.replace = e.target.checked),
);
$("tool-power").addEventListener("input", (e) => {
  state.power = +e.target.value;
  $("power-value").textContent = `${state.power}×`;
});
$("include-solids").addEventListener(
  "change",
  (e) => (state.includeSolids = e.target.checked),
);
$("fan-direction").addEventListener(
  "change",
  (e) => (state.fanDirection = e.target.value),
);
for (const [value, name] of brushTools) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = name;
  $("brush-tool").append(option);
}
$("brush-tool").addEventListener("change", (e) => {
  setTool(e.target.value);
  if (mobileDock?.media.matches) $("palette").classList.remove("open");
});
toolPicker = new ToolPicker($("brush-tool"), brushTools);
mobileDock = new MobileDock(
  document.querySelector(".toolbox"),
  world,
  renderer,
);
function selectMaterial(id, temperature = materials[id].temperature) {
  id = paletteBase[id];
  state.material = id;
  state.paintTemperature = temperature;
  setTool(false);
  const m = materials[id];
  renderMaterials();
  const details = $("material-detail");
  details.replaceChildren();
  const title = document.createElement("div");
  title.className = "detail-title";
  title.innerHTML = `<span class="swatch" style="--color:${m.color}"></span><h2>${m.name}</h2><span class="detail-type">${categoryLabels[m.paletteCategory] || m.category}</span>`;
  details.append(title);
  const temperatureControl = document.createElement("label");
  temperatureControl.className = "draw-temperature";
  temperatureControl.textContent = "Draw temperature";
  const temperatureInput = document.createElement("input");
  temperatureInput.id = "draw-temperature";
  temperatureInput.type = "number";
  temperatureInput.min = "-250";
  temperatureInput.max = "6000";
  temperatureInput.step = "1";
  temperatureInput.value = String(Math.round(temperature));
  temperatureInput.setAttribute("aria-label", "Draw temperature in Celsius");
  temperatureInput.addEventListener("change", () => {
    if (Number.isFinite(temperatureInput.valueAsNumber))
      state.paintTemperature = Math.max(
        -250,
        Math.min(6000, temperatureInput.valueAsNumber),
      );
    temperatureInput.value = String(state.paintTemperature);
  });
  temperatureControl.append(temperatureInput, document.createTextNode("°C"));
  details.append(temperatureControl);
  $("palette-toggle").querySelector("i").style.background = m.color;
  $("palette-toggle").querySelector("span:not([data-icon])").textContent =
    m.name;
}
function renderMaterials() {
  const query = $("search").value.trim().toLowerCase(),
    filtered = paletteMaterials.filter(
      (m) =>
        (category === "all" || m.paletteCategory === category) &&
        (!query || materialSearchText(m).includes(query)),
    );
  $("materials").replaceChildren();
  for (const m of filtered) {
    const b = document.createElement("button");
    b.className = "material" + (state.material === m.id ? " selected" : "");
    b.dataset.category = m.category;
    b.style.setProperty("--color", m.color);
    b.setAttribute("aria-pressed", String(state.material === m.id));
    b.innerHTML = `<span class="swatch"></span><span class="material-name">${m.name}</span>`;
    b.addEventListener("click", () => {
      selectMaterial(m.id);
      if (mobileDock?.media.matches) $("palette").classList.remove("open");
    });
    $("materials").append(b);
  }
  if (!filtered.length) {
    const p = document.createElement("p");
    p.style.cssText =
      "grid-column:1/-1;color:#91a6af;font-size:12px;padding:20px 0;line-height:1.7";
    p.textContent = "No elements found. Try another search or category.";
    $("materials").append(p);
  }
  $("material-count").textContent = filtered.length;
  $("category-title").textContent = query
    ? "Search results"
    : category === "all"
      ? "All elements"
      : categoryLabels[category];
}
for (const cat of categories) {
  const b = document.createElement("button");
  b.textContent = categoryLabels[cat];
  b.classList.toggle("selected", cat === "all");
  b.setAttribute("aria-pressed", String(cat === "all"));
  b.addEventListener("click", () => {
    category = cat;
    for (const item of $("categories").children) {
      item.classList.toggle("selected", item === b);
      item.setAttribute("aria-pressed", String(item === b));
    }
    renderMaterials();
  });
  $("categories").append(b);
}
$("search").addEventListener("input", renderMaterials);
$("brush").addEventListener("input", (e) => state.setRadius(+e.target.value));
$("play-btn").addEventListener("click", () => setPaused(!state.paused));
$("step-btn").addEventListener("click", () => {
  setPaused(true);
  if (selection.dragging) selection.cancel();
  world.step();
  hasChanged = true;
});
$("speed").addEventListener("change", (e) =>
  settings.set("speed", +e.target.value),
);
$("view").addEventListener("change", (e) => {
  settings.set("view", e.target.value);
});
$("shape-btn").addEventListener("click", () => {
  const key = state.tool === "select" ? "selectionShape" : "shape";
  state[key] = state[key] === "circle" ? "square" : "circle";
  if (key === "shape") settings.set("brushShape", state.shape);
  if (key === "selectionShape") {
    state.selectionErase = false;
    selection.cancel();
  }
  updateToolProperties();
  if (hover) input.hover(hover);
});
$("selection-erase").addEventListener("click", () => {
  state.selectionErase = !state.selectionErase;
  updateToolProperties();
  if (hover) input.hover(hover);
});
$("replace").addEventListener(
  "change",
  (e) => (state.replace = e.target.checked),
);
$("undo-btn").addEventListener("click", undo);
$("redo-btn").addEventListener("click", redo);
$("debug-btn").addEventListener("click", () =>
  settings.set("debug", !settings.get("debug")),
);
$("exit-focus-btn").addEventListener("click", () =>
  $("fullscreen-btn").click(),
);
$("reset-view-btn").addEventListener("click", () => renderer.resetView());
$("zoom-in-btn").addEventListener("click", () => zoomCenter(1.3));
$("zoom-out-btn").addEventListener("click", () => zoomCenter(1 / 1.3));
$("zoom-fit-btn").addEventListener("click", () => renderer.resetView());
function zoomCenter(factor) {
  const box = $("world").getBoundingClientRect();
  renderer.zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2);
}
$("fullscreen-btn").addEventListener("click", async () => {
  const focus = () => {
    const active = mobileDock.toggleFocus();
    $("fullscreen-btn").setAttribute(
      "aria-label",
      active ? "Exit canvas focus" : "Fullscreen simulation",
    );
  };
  if (mobileDock.media.matches || !$("canvas-wrap").requestFullscreen) {
    focus();
    return;
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("canvas-wrap").requestFullscreen();
  } catch {
    focus();
  }
});
$("palette-toggle").addEventListener("click", () =>
  $("palette").classList.toggle("open"),
);
$("palette-close").addEventListener("click", () =>
  $("palette").classList.remove("open"),
);
const input = new Input(
  $("world"),
  renderer,
  world,
  state,
  remember,
  (point) => {
    hover = point;
    inspector.follow(point);
  },
  selection,
  (tool, point) => {
    if (tool === "inspect") {
      inspector.sample(point);
      syncInspectorControls();
    } else {
      const cell = cellAt(world, point);
      if (!cell) return;
      if (!cell.material.id) return toast("Empty cell—choose a particle.");
      selectMaterial(cell.material.id, world.temp[cell.index]);
      toast(`${cell.material.name} selected`);
    }
  },
);
function syncInspectorControls() {
  $("inspect-hold").setAttribute("aria-pressed", String(inspector.pinned));
  $("inspect-hold").classList.toggle("active", inspector.pinned);
  $("inspect-hold").textContent = inspector.pinned ? "Follow" : "Hold cell";
}
$("inspect-hold").addEventListener("click", () => {
  if (inspector.pinned) {
    inspector.pinned = false;
    inspector.follow(hover);
  } else inspector.sample(hover);
  syncInspectorControls();
});
$("inspect-zoom").addEventListener("change", (e) => {
  inspector.zoom = +e.target.value;
  inspector.nextUpdate = 0;
});
function openDialog(id) {
  input.cancel();
  selection.cancel();
  const dialog = $(id);
  dialogPrevious.set(dialog, state.paused);
  setPaused(true);
  dialog.showModal();
}
function closeDialog(dialog) {
  dialog.close();
  // The native close event is queued; restore now so a quick shortcut cannot
  // be overwritten by that event after the menu has already disappeared.
  if (!document.querySelector("dialog[open]"))
    setPaused(dialogPrevious.get(dialog) ?? false);
  lastTime = performance.now();
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog
    .querySelectorAll(".dialog-close")
    .forEach((b) => b.addEventListener("click", () => closeDialog(dialog)));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        closeDialog(dialog);
    }
  });
}
$("settings-btn").addEventListener("click", () =>
  openDialog("settings-dialog"),
);
$("about-btn").addEventListener("click", () => openDialog("about-dialog"));
$("app-version").textContent = `Version ${changelog[0].version}`;
$("app-content-count").textContent =
  `${paletteMaterials.length} materials · ${materials.length - 1} simulation forms`;
for (const release of changelog) {
  const section = document.createElement("section"),
    heading = document.createElement("h3"),
    date = document.createElement("p"),
    list = document.createElement("ul");
  section.className = "changelog-release";
  heading.textContent = release.title;
  date.className = "small-print";
  date.textContent = release.date;
  for (const change of release.changes) {
    const item = document.createElement("li");
    item.textContent = change;
    list.append(item);
  }
  section.append(heading, date, list);
  $("changelog-list").append(section);
}
$("changelog-btn").addEventListener("click", () => {
  const previous = dialogPrevious.get($("about-dialog"));
  closeDialog($("about-dialog"));
  openDialog("changelog-dialog");
  dialogPrevious.set($("changelog-dialog"), previous);
});
$("clear-btn").addEventListener("click", () => openDialog("clear-dialog"));
$("confirm-clear").addEventListener("click", () => {
  remember();
  world.clear();
  resetSelection();
  syncLevelDisplay();
  closeDialog($("clear-dialog"));
  toast("World cleared");
});
function syncLevelDisplay() {
  mobileDock?.layout();
  $("world-name").textContent = world.name;
  $("world-resolution").textContent = `${world.width} × ${world.height}`;
  document.querySelector(".world-type").textContent =
    ` / ${world.border.toUpperCase()}`;
  renderer.draw();
}
const levelEditor = new LevelEditor($("level-dialog"), world, renderer, {
  open: openDialog,
  close: closeDialog,
  remember,
  refresh: () => {
    input.cancel();
    resetSelection();
    setTool("paint");
    inspector.point = null;
    syncLevelDisplay();
    hasChanged = true;
  },
});
$("new-canvas-btn").addEventListener("click", () => levelEditor.show());
$("level-properties-btn").addEventListener("click", () =>
  levelEditor.show(true),
);
function renderSaves() {
  const saves = getSaves();
  $("save-list").replaceChildren();
  if (!saves.length) {
    const p = document.createElement("div");
    p.className = "empty-saves";
    p.textContent = "No saved worlds. Save the current world above.";
    $("save-list").append(p);
  }
  for (const save of saves) {
    const row = document.createElement("div");
    row.className = "save-row";
    const img = document.createElement("img");
    if (save.thumbnail) img.src = save.thumbnail;
    img.alt = "World preview";
    row.append(img);
    const copy = document.createElement("div");
    copy.className = "save-copy";
    const h = document.createElement("h3");
    h.textContent = save.name;
    const p = document.createElement("p");
    p.textContent = new Date(save.date).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    copy.append(h, p);
    row.append(copy);
    const load = document.createElement("button");
    load.className = "quiet-button";
    load.textContent = "Load";
    load.addEventListener("click", () => {
      try {
        const data = unpack(save.data);
        validateSnapshot(data);
        remember();
        restore(world, data);
        resetSelection();
        world.name = data.level?.name || save.name;
        syncLevelDisplay();
        closeDialog($("saves-dialog"));
        toast("World loaded");
      } catch (e) {
        toast(e.message);
      }
    });
    row.append(load);
    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.setAttribute("aria-label", `Delete saved world ${save.name}`);
    remove.innerHTML = icon("trash");
    remove.addEventListener("click", () => {
      $("delete-save-name").textContent = save.name;
      pendingDelete = save.id;
      openDialog("delete-save-dialog");
    });
    row.append(remove);
    $("save-list").append(row);
  }
}
$("confirm-delete-save").addEventListener("click", () => {
  try {
    deleteSave(pendingDelete);
    renderSaves();
    closeDialog($("delete-save-dialog"));
    toast("Saved copy deleted");
  } catch {
    toast("Could not update local storage. Please try again.");
  }
});
$("save-btn").addEventListener("click", () => {
  $("save-name").value = $("world-name").textContent;
  renderSaves();
  openDialog("saves-dialog");
});
$("save-form").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    renderer.draw();
    saveWorld(
      world,
      $("save-name").value.trim() || "Untitled world",
      renderer.buffer.toDataURL(),
    );
    renderSaves();
    toast("World saved on this device");
  } catch (error) {
    toast(
      error.name === "QuotaExceededError"
        ? "Device storage is full. Export this world to keep it."
        : error.message,
    );
  }
});
$("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(pack(snapshot(world)))], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "sandlab-world.sandlab";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("World exported");
});
$("import-btn").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 64e6)
      throw Error(
        "This file is too large. Choose a Sandlab export under 64 MB.",
      );
    const data = unpack(JSON.parse(await file.text()));
    validateSnapshot(data);
    remember();
    restore(world, data);
    resetSelection();
    world.name = data.level?.name || file.name.replace(/\.(sandlab|json)$/, "");
    syncLevelDisplay();
    closeDialog($("saves-dialog"));
    toast("World imported");
  } catch (error) {
    toast(error.message || "Could not read this file.");
  }
  e.target.value = "";
});
function selectAll() {
  setTool("select");
  selection.clear();
  selection.mask.rectangle({
    x: 0,
    y: 0,
    width: world.width,
    height: world.height,
  });
  updateToolProperties();
}
function deleteSelection() {
  if (state.tool !== "select" || !selection.box || selection.dragging) return;
  let occupied = false;
  for (let i = 0; i < world.length; i++)
    if (selection.mask.data[i] && world.cells[i]) {
      occupied = true;
      break;
    }
  if (!occupied) return;
  remember();
  for (let i = 0; i < world.length; i++)
    if (selection.mask.data[i] && world.cells[i]) world.set(i, 0);
  selection.cancel();
  toast("Selected particles deleted");
}
const shortcutHandlers = {
  undo,
  redo,
  pause: () => setPaused(!state.paused),
  copy: () => {
    if (state.tool === "select") copySelection();
  },
  paste: () => {
    if (selection.clipboard) pasteSelection();
  },
  cut: () => {
    if (state.tool === "select" && selection.copy()) deleteSelection();
  },
  selectAll,
  deselect: () => {
    if (state.tool === "select") deselect();
  },
  delete: deleteSelection,
  step: () => {
    setPaused(true);
    selection.cancel();
    world.step();
    hasChanged = true;
  },
  paint: () => setTool(false),
  erase: () => setTool(true),
  select: () => setTool("select"),
  warm: () => setTool("warm"),
  cool: () => setTool("cool"),
  inspect: () => setTool("inspect"),
  eyedropper: () => setTool("eyedropper"),
  smaller: () => state.setRadius(state.radius - 1),
  larger: () => state.setRadius(state.radius + 1),
  grid: () => settings.set("grid", !settings.get("grid")),
  shape: () => $("shape-btn").click(),
  view: () => {
    const modes = ["normal", "heat", "pressure"];
    settings.set(
      "view",
      modes[(modes.indexOf(renderer.mode) + 1) % modes.length],
    );
  },
  fullscreen: () => $("fullscreen-btn").click(),
  help: () => $("about-btn").click(),
  save: () => $("save-btn").click(),
  import: () => {
    $("save-btn").click();
    $("import-btn").click();
  },
  export: () => $("export-btn").click(),
  search: () => {
    setTool("paint");
    if (mobileDock?.media.matches) $("palette").classList.add("open");
    $("search").focus();
  },
  sand: () => selectMaterial(M.Sand),
  water: () => selectMaterial(M.Water),
  fire: () => selectMaterial(M.Fire),
  escape: () => {
    input.cancel();
    if (document.body.classList.contains("canvas-focus"))
      mobileDock.toggleFocus();
    if (selection.placing || selection.dragging) selection.cancel();
    else if (state.tool === "select") deselect();
    $("palette").classList.remove("open");
  },
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && renderer.gesture) {
    e.preventDefault();
    input.cancel();
    return;
  }
  if (
    e.target.closest("input,select,textarea,[contenteditable]") ||
    document.querySelector("dialog[open]")
  )
    return;
  const action = shortcutAction(e, settings.get("shortcuts"));
  if (!action || (e.repeat && !["smaller", "larger"].includes(action))) return;
  if (action === "delete" && (state.tool !== "select" || !selection.box))
    return;
  e.preventDefault();
  shortcutHandlers[action]();
});
function syncShortcutTitles() {
  const overrides = settings.get("shortcuts");
  for (const [button, id] of [
    ["play-btn", "pause"],
    ["step-btn", "step"],
    ["undo-btn", "undo"],
    ["redo-btn", "redo"],
    ["deselect-selection", "deselect"],
    ["shape-btn", "shape"],
    ["fullscreen-btn", "fullscreen"],
  ]) {
    const action = shortcutDefinitions.find((entry) => entry.id === id),
      keys = bindingsFor(id, overrides).map(formatChord).join(" / ");
    $(button).title = action.label + (keys ? ` (${keys})` : "");
  }
}
const settingEffects = {
  shortcuts: syncShortcutTitles,
  bloom: () => (renderer.bloom = settings.get("bloom")),
  bloomIntensity: () =>
    (renderer.bloomIntensity = settings.get("bloomIntensity")),
  grid: () => (renderer.grid = settings.get("grid")),
  view: () => {
    renderer.mode = settings.get("view");
    $("view").value = renderer.mode;
    $("view-legend").hidden = renderer.mode !== "heat";
  },
  speed: () => {
    state.speed = settings.get("speed");
    $("speed").value = state.speed;
    accumulator = 0;
  },
  brushSize: () => state.setRadius(settings.get("brushSize")),
  brushShape: () => {
    state.shape = settings.get("brushShape");
    updateToolProperties();
    if (hover) input.hover(hover);
  },
  brushOutline: () => (renderer.brushOutline = settings.get("brushOutline")),
  displayQuality: () => {
    renderer.displayQuality = settings.get("displayQuality");
    renderer.resize();
  },
  showFps: () => ($("fps-label").hidden = !settings.get("showFps")),
  debug: () => {
    $("debug-panel").hidden = !settings.get("debug");
    $("debug-btn").setAttribute("aria-pressed", String(settings.get("debug")));
  },
  autosave: updateAutoTimer,
  autosaveInterval: updateAutoTimer,
};
function updateAutoTimer() {
  clearInterval(autosaveTimer);
  if (settings.get("autosave"))
    autosaveTimer = setInterval(
      storeAuto,
      settings.get("autosaveInterval") * 1000,
    );
}
settings.subscribe((keys) => {
  for (const key of keys) settingEffects[key]?.();
});
new SettingsPanel($("settings-dialog"), settings);
for (const effect of Object.values(settingEffects)) effect();
setPaused(settings.get("startPaused"));
const saved = settings.get("restoreLast") ? getAutosave() : null;
if (saved) {
  try {
    restore(world, saved);
    if (!saved.level) world.name = "Your last world";
    toast("Welcome back. Your last world is restored.");
  } catch {
    loadPreset(world, "blank");
  }
} else loadPreset(world, "blank");
selectMaterial(M.Sand);
$("particle-count").textContent = `${world.count.toLocaleString()} particles`;
syncLevelDisplay();
if (matchMedia("(pointer: coarse)").matches)
  $("canvas-tip").innerHTML =
    `${icon("pointer")} Drag to draw <span class="tip-dot">·</span> Select eraser to delete`;
let storageWarning = false;
function storeAuto() {
  if (!settings.get("autosave") || !hasChanged) return;
  try {
    autosave(world);
    storageWarning = false;
  } catch {
    if (!storageWarning) {
      toast("Autosave storage is full. Export your world for a backup.");
      storageWarning = true;
    }
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    storeAuto();
    input.cancel();
    selection.cancel();
  }
  lastTime = performance.now();
  accumulator = 0;
});
window.addEventListener("pagehide", storeAuto);
function frame(now) {
  const elapsed = Math.min(100, now - lastTime);
  lastTime = now;
  if (!document.hidden) {
    input.update();
    if (!state.paused) {
      accumulator += elapsed * state.speed;
      let steps = 0;
      const start = performance.now();
      while (accumulator >= 1000 / 60 && steps < 4) {
        world.step();
        accumulator -= 1000 / 60;
        steps++;
        hasChanged = true;
        if (performance.now() - start > 22) break;
      }
      simTime = performance.now() - start;
      if (accumulator > 100) {
        accumulator = 100;
        lagFrames++;
      }
    } else accumulator = 0;
    renderer.draw();
    inspector.update(now);
    frameCount++;
    if (now - statsTime >= 600) {
      fps = Math.round((frameCount * 1000) / (now - statsTime));
      frameCount = 0;
      statsTime = now;
      $("fps").textContent = fps;
      $("world-resolution").textContent = `${world.width} × ${world.height}`;
      $("particle-count").textContent =
        `${world.count.toLocaleString()} particles`;
      if (hover) {
        const x = Math.floor(hover.x),
          y = Math.floor(hover.y);
        if (x >= 0 && x < world.width && y >= 0 && y < world.height) {
          const i = y * world.width + x;
          $("hover-info").textContent =
            `${materials[world.cells[i]].name} · ${Math.round(world.temp[i])}°C · ${x}, ${y}`;
        }
      } else $("hover-info").textContent = "";
      if (!$("debug-panel").hidden)
        $("debug-panel").textContent =
          `${world.width} × ${world.height} cells\n${world.count.toLocaleString()} particles · tick ${world.tick}\nSimulation: ${simTime.toFixed(1)} ms/frame\nDisplay: ${fps} FPS · ${state.speed}× speed\nBacklog dropped: ${lagFrames} frames`;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Exposed only for reproducible browser diagnostics, not required by the UI.
window.sandlab = {
  world,
  state,
  renderer,
  inspector,
  selection,
  settings,
  levelEditor,
  mobileDock,
  loadPreset: (id) => {
    remember();
    loadPreset(world, id);
    resetSelection();
    syncLevelDisplay();
  },
  snapshot: () => snapshot(world),
  restore: (data) => {
    restore(world, data);
    resetSelection();
    syncLevelDisplay();
  },
};
