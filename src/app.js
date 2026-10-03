import { ControllerControls } from "./controller-controls.js";
import { interactionCount } from "./sim/chemistry.js";
import {
  isEntity,
  entityCategory,
  entityCategories,
  entityLabels,
} from "./sim/entity-kinds.js";
import { MaterialGroups } from "./material-groups.js";
import { MaterialGroupsPanel } from "./material-groups-panel.js";
import { FrameClock } from "./frame-clock.js";
import { defaultMechanics } from "./sim/mechanics-options.js";
import { GameAudio } from "./audio.js";
import { ColorPicker } from "./color-picker.js";
import { DrawingPause } from "./drawing-pause.js";
import { PlayerControls } from "./player-controls.js";
import { fittedCanvasSize } from "./canvas-view.js";
import {
  paletteBase,
  paletteMaterials,
  paletteEntities,
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
import { icon, materialIcon, populateIcons } from "./icons.js";

const $ = (id) => document.getElementById(id);
populateIcons();
const settings = new Settings();
const materialGroups = new MaterialGroups();
let autosaveTimer, toolPicker, mobileDock, drawingPause;
$("catalog-total").textContent = paletteMaterials.length;
const portrait = innerWidth <= 700 && innerHeight > innerWidth;
const world = new World(portrait ? 200 : 320, portrait ? 300 : 200),
  renderer = new Renderer($("world"), world);
const inspector = new Inspector($("inspection-card"), world, renderer);
const state = {
  material: M.Sand,
  radius: settings.get("brushSize"),
  shape: settings.get("brushShape"),
  selectionShape: "square",
  selectionErase: false,
  erase: false,
  tool: "paint",
  color: "#73b8ef",
  colorOpacity: 1,
  colorLayer: "foreground",
  fillLayer: "material",
  colorErase: false,
  power: 1,
  includeSolids: true,
  fanDirection: "drag",
  deviceFacing: 0,
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
let catalogKind = "materials",
  category = "all",
  history = new EditHistory(world),
  hover = null,
  toastTimer,
  simTime = 0,
  fps = 60,
  clock = new FrameClock(performance.now()),
  statsTime = performance.now(),
  frameCount = 0,
  tickCount = 0,
  tickRate = 0;
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
function setPaused(value, fromDrawing = false) {
  if (!fromDrawing && drawingPause?.active) {
    drawingPause.hold();
    value = true;
  }
  if (!value && selection.dragging) selection.cancel();
  state.paused = value;
  clock.resetSimulation();
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
  const portal = tool === "paint" && state.material === M.Portal;
  $("portal-properties").hidden = !portal;
  renderer.showPortalLinks = portal;
  for (const mode of ["link", "unlink"]) {
    const button = $(`portal-${mode}`),
      active = state.portalMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  document.querySelector(".toolbox").dataset.tool = tool;
  const materialTool =
    tool === "paint" || (tool === "fill" && state.fillLayer === "material");
  document.querySelector(".toolbox").dataset.materialTool =
    String(materialTool);
  $("palette-toggle").hidden = !materialTool;
  document.querySelector(".material-controls").hidden = !materialTool;
  $("replace-property").hidden =
    !materialTool ||
    !!(materials[state.material].actor || materials[state.material].projectile);
  $("device-facing-property").hidden =
    tool !== "paint" || !materials[state.material].circuit;
  $("tool-properties").hidden = tool === "paint";
  $("selection-properties").hidden = tool !== "select";
  $("inspection-properties").hidden = tool !== "inspect";
  $("fill-properties").hidden = tool !== "fill";
  const colorFill = tool === "fill" && state.fillLayer !== "material";
  $("paint-properties").hidden = tool !== "recolor" && !colorFill;
  $("paint-layer").hidden = colorFill;
  $("eyedropper-property").hidden = tool !== "eyedropper";
  const reading =
    tool === "inspect" || tool === "eyedropper" || tool === "guide";
  $("shape-btn").hidden = reading || tool === "fill";
  $("canvas-tip").hidden = reading;
  $("clear-btn").hidden = tool === "select";
  $("deselect-selection").hidden = tool !== "select";
  $("deselect-selection").disabled = !selection.box && !selection.placing;
  $("power-property").hidden = ![
    "warm",
    "cool",
    "pressure",
    "vacuum",
    "wind",
  ].includes(tool);
  $("solids-property").hidden = !["grab", "erase"].includes(tool);
  $("direction-property").hidden = tool !== "wind";
  const shape = tool === "select" ? state.selectionShape : state.shape;
  $("brush-control").hidden =
    reading || tool === "fill" || (tool === "select" && shape === "square");
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
    tool === "warm" ? "Heat" : tool === "cool" ? "Cooling" : "Force";
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
  selection.visible = tool === "select";
  inspector.setActive(tool === "inspect");
  if (tool === "inspect") inspector.follow(hover);
  if (tool === "inspect" || tool === "eyedropper" || tool === "guide")
    renderer.cursor = null;
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
function selectMaterial(id) {
  id = paletteBase[id];
  state.material = id;
  const entities = isEntity(materials[id]);
  if (catalogKind !== (entities ? "entities" : "materials"))
    setCatalog(entities ? "entities" : "materials");
  setTool(state.tool === "fill" && !entities ? "fill" : false);
  const m = materials[id];
  renderMaterials();
  $("palette-toggle").querySelector("i").style.background = m.color;
  $("palette-toggle").querySelector("span:not([data-icon])").textContent =
    m.name;
}
function setCatalog(kind) {
  catalogKind = kind;
  category = "all";
  $("search").value = "";
  $("catalog-title").textContent =
    kind === "entities" ? "Entities" : "Materials";
  $("catalog-total").textContent = (
    kind === "entities" ? paletteEntities : paletteMaterials
  ).length;
  $("search").placeholder =
    kind === "entities" ? "Find an entity…" : "Find a material…";
  $("search").setAttribute("aria-label", `Search ${kind}`);
  $("categories").setAttribute(
    "aria-label",
    `${kind === "entities" ? "Entity" : "Material"} categories`,
  );
  $("palette-close").setAttribute("aria-label", `Close ${kind}`);
  $("groups-btn").setAttribute(
    "aria-label",
    `Create or edit ${kind === "entities" ? "entity" : "material"} groups`,
  );
  for (const tab of document.querySelectorAll("[data-catalog]")) {
    const active = tab.dataset.catalog === kind;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  $("materials").setAttribute("aria-labelledby", `${kind}-tab`);
  renderCategories();
  renderMaterials();
}
for (const tab of document.querySelectorAll("[data-catalog]")) {
  tab.addEventListener("click", () => setCatalog(tab.dataset.catalog));
  tab.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const kind =
      e.key === "Home"
        ? "materials"
        : e.key === "End"
          ? "entities"
          : catalogKind === "materials"
            ? "entities"
            : "materials";
    setCatalog(kind);
    $(`${kind}-tab`).focus();
  });
}
function renderMaterials() {
  const query = $("search").value.trim().toLowerCase(),
    filtered = (
      catalogKind === "entities" ? paletteEntities : paletteMaterials
    ).filter(
      (m) =>
        (category === "all" ||
          (catalogKind === "entities"
            ? entityCategory(m)
            : m.paletteCategory) === category ||
          materialGroups.includes(category, m.id)) &&
        (!query || materialSearchText(m).includes(query)),
    );
  $("materials").replaceChildren();
  for (const m of filtered) {
    const b = document.createElement("button");
    b.className = "material" + (state.material === m.id ? " selected" : "");
    b.dataset.category = m.paletteCategory;
    b.style.setProperty("--color", m.color);
    b.setAttribute("aria-pressed", String(state.material === m.id));
    b.innerHTML = `<span class="swatch">${materialIcon(catalogKind === "entities" ? entityCategory(m) : m.paletteCategory)}</span><span class="material-name">${m.name}</span>`;
    b.addEventListener("click", () => {
      selectMaterial(m.id);
      if (mobileDock?.media.matches) $("palette").classList.remove("open");
      syncPaletteToggle();
    });
    $("materials").append(b);
  }
  if (!filtered.length) {
    const p = document.createElement("p");
    p.style.cssText =
      "grid-column:1/-1;color:#91a6af;font-size:12px;padding:20px 0;line-height:1.7";
    p.textContent = `No ${catalogKind} found. Try another search or category.`;
    $("materials").append(p);
  }
  $("material-count").textContent = filtered.length;
  $("category-title").textContent = query
    ? "Search results"
    : category === "all"
      ? `All ${catalogKind}`
      : materialGroups.get(category)?.name ||
        (catalogKind === "entities" ? entityLabels : categoryLabels)[category];
}
function renderCategories() {
  $("categories").replaceChildren();
  for (const cat of [
    ...(catalogKind === "entities" ? entityCategories : categories),
    ...materialGroups.groups.map((group) => group.id),
  ]) {
    const b = document.createElement("button");
    const label = document.createElement("span");
    label.textContent =
      materialGroups.get(cat)?.name ||
      (catalogKind === "entities" ? entityLabels : categoryLabels)[cat];
    b.innerHTML =
      cat === "all"
        ? icon("grid")
        : materialGroups.get(cat)
          ? icon("layers")
          : materialIcon(cat);
    b.append(label);
    b.dataset.group = cat;
    b.classList.toggle("selected", cat === category);
    b.setAttribute("aria-pressed", String(cat === category));
    b.addEventListener("click", () => {
      category = cat;
      for (const tab of $("categories").children) {
        const selected = tab.dataset.group === category;
        tab.classList.toggle("selected", selected);
        tab.setAttribute("aria-pressed", String(selected));
      }
      renderMaterials();
    });
    $("categories").append(b);
  }
}
renderCategories();
const groupsPanel = new MaterialGroupsPanel(
  $("groups-dialog"),
  materialGroups,
  {
    open: openDialog,
    close: closeDialog,
    changed: (id) => {
      category = id;
      renderCategories();
      renderMaterials();
    },
  },
);
$("groups-btn").addEventListener("click", () =>
  groupsPanel.open(
    materialGroups.get(category)?.id,
    catalogKind === "entities" ? paletteEntities : paletteMaterials,
    catalogKind,
  ),
);
$("search").addEventListener("input", renderMaterials);
$("device-facing").addEventListener(
  "change",
  (e) => (state.deviceFacing = +e.target.value),
);
$("brush").addEventListener("input", (e) => state.setRadius(+e.target.value));
$("play-btn").addEventListener("click", () => setPaused(!state.paused));
const mechanicKeys = Object.keys(defaultMechanics);
function syncMechanics() {
  for (const key of mechanicKeys) world.mechanics[key] = settings.get(key);
  world.fields.configure(world.mechanics);
}
function stepSimulation() {
  syncMechanics();
  setPaused(true);
  if (drawingPause?.active) return;
  if (selection.dragging) selection.cancel();
  world.step();
  hasChanged = true;
}
$("step-btn").addEventListener("click", stepSimulation);
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
$("canvas-fill-btn").addEventListener("click", () =>
  settings.set(
    "canvasFill",
    settings.get("canvasFill") === "fit" ? "stretch" : "fit",
  ),
);
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
function paletteVisible() {
  return mobileDock.media.matches || innerWidth <= 1100
    ? $("palette").classList.contains("open")
    : !document.body.classList.contains("palette-hidden");
}
function togglePalette() {
  if (mobileDock.media.matches || innerWidth <= 1100)
    $("palette").classList.toggle("open");
  else document.body.classList.toggle("palette-hidden");
  syncPaletteToggle();
}
function syncPaletteToggle() {
  $("palette-toggle").setAttribute("aria-expanded", String(paletteVisible()));
  $("palette-toggle").setAttribute("aria-controls", "palette");
  $("palette-toggle").setAttribute(
    "aria-label",
    `${paletteVisible() ? "Hide" : "Show"} material palette`,
  );
}
$("palette-toggle").addEventListener("click", togglePalette);
$("palette-close").addEventListener("click", () => {
  if (mobileDock.media.matches || innerWidth <= 1100)
    $("palette").classList.remove("open");
  else document.body.classList.add("palette-hidden");
  syncPaletteToggle();
});
window.addEventListener("resize", syncPaletteToggle);
syncPaletteToggle();
drawingPause = new DrawingPause(state, settings, (value) =>
  setPaused(value, true),
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
    } else if (tool === "eyedropper") {
      const cell = cellAt(world, point);
      if (!cell) return;
      if (!cell.material.id) return toast("Empty cell—choose a particle.");
      selectMaterial(cell.material.id);
      toast(`${cell.material.name} selected`);
    }
  },
  drawingPause,
  toast,
);
for (const mode of ["link", "unlink"])
  $(`portal-${mode}`).addEventListener("click", () => {
    input.cancel();
    state.portalMode = state.portalMode === mode ? "draw" : mode;
    updateToolProperties();
  });
$("portal-facing").addEventListener("change", () => {
  input.cancel();
  state.portalFacing = Number($("portal-facing").value);
});
const playerControls = new PlayerControls(
  $("canvas-wrap"),
  world,
  state,
  settings,
);
const audio = new GameAudio(world, renderer, settings, playerControls);
const controller = new ControllerControls(
  input,
  renderer,
  playerControls,
  settings,
  {
    pause: () => setPaused(!state.paused),
    togglePalette,
    paletteVisible,
    settings: () => openDialog("settings-dialog"),
    openTools: () => toolPicker.open(),
    closeTools: () => toolPicker.close(),
    cycleMaterial: (delta) => {
      const list =
        catalogKind === "entities" ? paletteEntities : paletteMaterials;
      const index = list.findIndex((m) => m.id === state.material);
      selectMaterial(list[(index + delta + list.length) % list.length].id);
    },
  },
);
mobileDock.onOrientationChange = () => {
  playerControls.reset();
  input.cancel();
  selection.cancel();
  inspector.nextUpdate = 0;
};
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
  playerControls.reset();
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
  clock.reset(performance.now());
}
$("fill-layer").addEventListener("change", (e) => {
  state.fillLayer = e.target.value;
  updateToolProperties();
});
const colorPicker = new ColorPicker(state, openDialog);
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
  `${paletteMaterials.length} materials · ${paletteEntities.length} entities · ${interactionCount} interactions`;
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
      renderer.worldImage().toDataURL(),
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
    selection.cancel();
    stepSimulation();
  },
  paint: () => setTool(false),
  recolor: () => setTool("recolor"),
  fill: () => setTool("fill"),
  erase: () => setTool(true),
  select: () => setTool("select"),
  grab: () => setTool("grab"),
  pressure: () => setTool("pressure"),
  vacuum: () => setTool("vacuum"),
  warm: () => setTool("warm"),
  cool: () => setTool("cool"),
  wind: () => setTool("wind"),
  inspect: () => setTool("inspect"),
  guide: () => setTool("guide"),
  eyedropper: () => setTool("eyedropper"),
  smaller: () => state.setRadius(state.radius - 1),
  larger: () => state.setRadius(state.radius + 1),
  grid: () => settings.set("grid", !settings.get("grid")),
  shape: () => $("shape-btn").click(),
  view: () => {
    const modes = ["normal", "heat", "pressure", "wind", "echo"];
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
  // Focused buttons own their activation keys, even if Space is a game shortcut.
  if (
    e.target.closest("input,select,textarea,[contenteditable]") ||
    (e.target.closest("button") &&
      [" ", "Enter"].includes(e.key) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey) ||
    document.querySelector("dialog[open]")
  )
    return;
  const action = shortcutAction(e, settings.get("shortcuts"));
  if (!action || (e.repeat && !["smaller", "larger"].includes(action))) return;
  if (action === "delete" && (state.tool !== "select" || !selection.box))
    return;
  const handler = shortcutHandlers[action];
  if (!handler) return;
  e.preventDefault();
  handler();
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
  lightBounces: () => {
    renderer.lightBounces = settings.get("lightBounces");
  },
  shortcuts: syncShortcutTitles,
  bloom: () => (renderer.bloom = settings.get("bloom")),
  bloomIntensity: () =>
    (renderer.bloomIntensity = settings.get("bloomIntensity")),
  grid: () => (renderer.grid = settings.get("grid")),
  canvasFill: () => {
    renderer.fill = settings.get("canvasFill");
    renderer.resetView();
    const fit = renderer.fill === "fit",
      current = fit ? "Fit" : "Stretch",
      next = fit ? "Stretch" : "Fit",
      button = $("canvas-fill-btn");
    button.innerHTML = icon(renderer.fill);
    button.setAttribute(
      "aria-label",
      `Canvas display: ${current}. Switch to ${next}`,
    );
    button.setAttribute("aria-pressed", String(!fit));
    button.title = `${current} canvas — switch to ${next}`;
  },
  view: () => {
    renderer.mode = settings.get("view");
    $("view").value = renderer.mode;
    $("view-legend").hidden = renderer.mode !== "heat";
  },
  speed: () => {
    state.speed = settings.get("speed");
    $("speed").value = state.speed;
    clock.resetSimulation();
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
    world.profile.enabled = renderer.profile.enabled = settings.get("debug");
    $("debug-panel").hidden = !settings.get("debug");
    $("debug-btn").setAttribute("aria-pressed", String(settings.get("debug")));
  },
  ...Object.fromEntries(mechanicKeys.map((key) => [key, syncMechanics])),
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
} else {
  const box = renderer.canvas.getBoundingClientRect(),
    size = fittedCanvasSize(200, box.width, box.height, renderer.rotation);
  Object.assign(world, new World(size.width, size.height));
  loadPreset(world, "blank");
}
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
  clock.reset(performance.now());
  statsTime = performance.now();
  frameCount = tickCount = 0;
});
window.addEventListener("pagehide", storeAuto);
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const elapsed = clock.takeFrame(now);
  if (!elapsed) return;
  controller.update(elapsed);
  input.update();
  playerControls.update();
  syncMechanics();
  const start = performance.now();
  if (clock.takeTick(elapsed, state.speed, state.paused)) {
    world.step();
    tickCount++;
    hasChanged = true;
  }
  simTime = performance.now() - start;
  audio.update(state.paused);
  renderer.draw();

  inspector.update(now);
  frameCount++;
  if (now - statsTime >= 600) {
    fps = Math.round((frameCount * 1000) / (now - statsTime));
    tickRate = Math.round((tickCount * 1000) / (now - statsTime));
    frameCount = tickCount = 0;
    statsTime = now;
    $("fps").textContent = fps;
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
        `${world.width} × ${world.height} cells\n${world.count.toLocaleString()} particles · tick ${world.tick}\nSimulation stages: ${world.profile.describe()}\nRender stages: ${renderer.profile.describe()}\nSimulation: ${simTime.toFixed(1)} ms/frame · ${tickRate} ticks/s (max 60)\nDisplay: ${fps} FPS · ${state.speed}× speed\nMissed ticks dropped: ${clock.droppedTicks}\nSolids: ${world.rigid.bodies.length} bodies · ${world.rigid.work.contacts} contacts\nCollision work: ${world.rigid.work.scanned.toLocaleString()} pixel checks · ${world.rigid.work.limitedPlans + world.rigid.work.limitedContacts} limited requests`;
  }
}
requestAnimationFrame(frame);
// Exposed only for reproducible browser diagnostics, not required by the UI.
window.sandlab = {
  world,
  state,
  renderer,
  audio,
  playerControls,
  controller,
  inspector,
  selection,
  settings,
  levelEditor,
  materialGroups,
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
