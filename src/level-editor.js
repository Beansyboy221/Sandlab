import { reframeWorld } from "./viewport-navigation.js";
import { writeElasticPixels } from "./render/elastic-renderer.js";
import { canvasModes } from "./sim/canvas-modes.js";
import {
  fittedCanvasSize,
  canvasResolutionLimit,
  inversePoint,
} from "./canvas-view.js";
import { materials } from "./sim/materials.js";
import { presets, loadPreset } from "./presets.js";
import {
  levelProperties,
  validateLevelProperties,
  applyLevelMetadata,
} from "./level-properties.js";
import { createLevel, resizeLevel, ResizePlacement } from "./level.js";
import {
  validateScale,
  CELL_METERS,
  physicalDistance,
  scaleRatio,
} from "./sim/world-units.js";
import { WorldRulesPanel } from "./world-rules-panel.js";

export class LevelEditor {
  constructor(
    dialog,
    world,
    renderer,
    { open, close, remember, refresh, zoomed = () => {} },
  ) {
    this.dialog = dialog;
    this.world = world;
    this.renderer = renderer;
    this.openDialog = open;
    this.closeDialog = close;
    this.remember = remember;
    this.refresh = refresh;
    this.zoomed = zoomed;
    this.form = dialog.querySelector("form");
    this.rules = new WorldRulesPanel(
      dialog.querySelector("#world-simulation-fields"),
    );
    this.starter = dialog.querySelector("#level-starter");
    for (const preset of presets)
      if (preset.id !== "blank") {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.name;
        this.starter.append(option);
      }
    for (const [value, name] of canvasModes)
      dialog.querySelector("#level-canvasMode").append(new Option(name, value));
    this.inputs = Object.fromEntries(
      [
        "name",
        "border",
        "background",
        "ambientLight",
        "canvasMode",
        "modeStrength",
        "metersPerPixel",
      ].map((key) => [key, dialog.querySelector(`#level-${key}`)]),
    );
    this.ambientOutput = dialog.querySelector("#level-ambientLight-value");
    this.inputs.ambientLight.addEventListener("input", () => {
      this.ambientOutput.value = `${this.inputs.ambientLight.value}%`;
    });
    this.strengthOutput = dialog.querySelector("#level-modeStrength-value");
    this.inputs.modeStrength.addEventListener("input", () => {
      this.strengthOutput.value = `${this.inputs.modeStrength.value}%`;
    });
    this.axes = {
      width: dialog.querySelector("#level-width"),
      height: dialog.querySelector("#level-height"),
    };
    for (const input of Object.values(this.axes))
      input.addEventListener("input", () => this.syncDimensions());
    this.preview = dialog.querySelector("#resize-preview");
    this.context = this.preview.getContext("2d", { alpha: false });
    this.particles = document.createElement("canvas");
    this.previewPanel = dialog.querySelector("#resize-panel");
    this.fields = dialog.querySelector("#level-fields");
    this.error = dialog.querySelector("#level-error");
    this.scaleSummary = dialog.querySelector("#world-scale-summary");
    this.inputs.metersPerPixel.addEventListener("input", () =>
      this.updateScaleSummary(),
    );
    this.submit = dialog.querySelector("#level-submit");
    this.placement = null;
    this.drag = null;
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.commit();
    });
    this.form.addEventListener("input", () => {
      this.error.textContent = "";
      this.updateScaleSummary();
      if (!this.placement)
        this.submit.textContent =
          this.editing && this.sizeChanged()
            ? "Place resize"
            : this.editing
              ? "Apply changes"
              : "Create world";
    });
    dialog.querySelector("#resize-back").addEventListener("click", () => {
      this.placement = null;
      this.showFields();
    });
    dialog.querySelector("#resize-center").addEventListener("click", () => {
      this.placement.setPosition(
        this.placement.maxX / 2,
        this.placement.maxY / 2,
      );
      this.draw();
    });
    for (const axis of ["x", "y"])
      dialog.querySelector(`#resize-${axis}`).addEventListener("input", () => {
        const x = Number(dialog.querySelector("#resize-x").value),
          y = Number(dialog.querySelector("#resize-y").value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          this.placement.setPosition(x, y);
          this.draw();
        }
      });
    this.preview.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || this.drag || !this.placement) return;
      this.preview.setPointerCapture(e.pointerId);
      const point = this.point(e),
        p = this.placement,
        bw = Math.min(p.oldWidth, p.properties.width),
        bh = Math.min(p.oldHeight, p.properties.height);
      if (
        point.x < p.positionX ||
        point.x > p.positionX + bw ||
        point.y < p.positionY ||
        point.y > p.positionY + bh
      )
        p.setPosition(point.x - bw / 2, point.y - bh / 2);
      this.drag = { id: e.pointerId, point, x: p.positionX, y: p.positionY };
      this.draw();
    });
    this.preview.addEventListener("pointermove", (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const point = this.point(e);
      this.placement.setPosition(
        this.drag.x + point.x - this.drag.point.x,
        this.drag.y + point.y - this.drag.point.y,
      );
      this.draw();
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      this.preview.addEventListener(event, () => {
        this.drag = null;
      });
    this.preview.addEventListener("keydown", (e) => {
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0,
        dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      if ((!dx && !dy) || !this.placement) return;
      e.preventDefault();
      const p = this.placement,
        step = e.shiftKey ? 10 : 1;
      const direction = inversePoint(this.previewMatrix, dx, dy, true);
      p.setPosition(
        p.positionX + direction.x * step,
        p.positionY + direction.y * step,
      );
      this.draw();
    });
    new ResizeObserver(() => {
      if (dialog.open && this.placement) this.draw();
    }).observe(this.preview);
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      this.placement = null;
      this.drag = null;
    });
  }
  show(editing = false) {
    this.editing = editing;
    this.starter.value = "blank";
    this.starter.closest("label").hidden = editing;
    this.placement = null;
    this.error.textContent = "";
    const values = levelProperties(this.world);
    if (!editing) values.name = "Untitled world";
    this.rules.load(this.world);
    for (const [key, input] of Object.entries(this.inputs))
      input.value =
        key === "ambientLight" || key === "modeStrength"
          ? Math.round(values[key] * 100)
          : values[key];
    this.ambientOutput.value = `${this.inputs.ambientLight.value}%`;
    this.strengthOutput.value = `${this.inputs.modeStrength.value}%`;
    this.dialog.querySelector("h2").textContent = editing
      ? "World settings"
      : "New world";
    const mobile = document.body.classList.contains("mobile-layout"),
      box = this.renderer.canvas.getBoundingClientRect();
    const limit = canvasResolutionLimit(box.width, box.height);
    const size = editing
      ? {
          width: Math.round(values.width),
          height: Math.round(values.height),
        }
      : fittedCanvasSize(
          Math.min(limit, this.world.width, this.world.height),
          box.width,
          box.height,
          this.renderer.rotation,
        );
    this.startSize = { width: size.width, height: size.height };
    this.updateScaleSummary();
    this.shortAxis = size.width <= size.height ? "width" : "height";
    for (const [axis, input] of Object.entries(this.axes)) {
      input.value = size[axis];
      input.disabled = mobile && axis !== this.shortAxis;
      input.max = mobile && axis === this.shortAxis ? limit : 512;
      input
        .closest("label")
        .classList.toggle("derived-dimension", input.disabled);
    }
    this.dialog.querySelector("#level-note").textContent = editing
      ? mobile
        ? "The longer dimension follows the drawing area. Position the viewport before applying a resize."
        : "Position the viewport before applying a resize."
      : "The current world remains available in Undo.";
    this.updateScaleSummary();
    this.showFields();
    this.openDialog(this.dialog.id);
  }
  showFields() {
    this.fields.hidden = false;
    this.previewPanel.hidden = true;
    this.submit.textContent =
      this.editing && this.sizeChanged()
        ? "Place resize"
        : this.editing
          ? "Apply changes"
          : "Create world";
  }
  syncDimensions() {
    const short = this.axes[this.shortAxis];
    const longAxis = this.shortAxis === "width" ? "height" : "width";
    if (!this.axes[longAxis].disabled || !short.value) return;
    // Reverting the short side cancels the resize, even if the viewport changed.
    if (
      this.editing &&
      Number(short.value) === this.startSize[this.shortAxis]
    ) {
      this.axes[longAxis].value = this.startSize[longAxis];
      return;
    }
    const box = this.renderer.canvas.getBoundingClientRect();
    const size = fittedCanvasSize(
      Number(short.value),
      box.width,
      box.height,
      this.renderer.rotation,
    );
    this.axes[longAxis].value = Math.max(size.width, size.height);
  }
  dimensions() {
    if (this.editing && !this.sizeChanged()) return { ...this.startSize };
    const width = Number(this.axes.width.value),
      height = Number(this.axes.height.value);
    if (this.axes.width.disabled || this.axes.height.disabled) {
      const box = this.renderer.canvas.getBoundingClientRect();
      const limit = canvasResolutionLimit(box.width, box.height);
      if (Number(this.axes[this.shortAxis].value) > limit)
        throw Error(`Choose 8–${limit} pixels for this screen.`);
    }
    return { width, height };
  }
  sizeChanged() {
    return (
      this.editing &&
      Object.entries(this.axes).some(
        ([axis, input]) => Number(input.value) !== this.startSize[axis],
      )
    );
  }
  values() {
    const scale = validateScale(Number(this.inputs.metersPerPixel.value)),
      size = this.dimensions(),
      ratio = scale / CELL_METERS;
    return validateLevelProperties({
      ...Object.fromEntries(
        Object.entries(this.inputs).map(([key, input]) => [
          key,
          key === "metersPerPixel"
            ? Number(input.value)
            : key === "ambientLight" || key === "modeStrength"
              ? Number(input.value) / 100
              : input.value,
        ]),
      ),
      ...this.rules.values(),
      width: Math.round(size.width),
      height: Math.round(size.height),
      viewOriginX: this.world.viewOriginX,
      viewOriginY: this.world.viewOriginY,
    });
  }
  commit() {
    try {
      const values = this.values();
      const gridChanged =
          values.width !== this.world.width ||
          values.height !== this.world.height,
        scaleChanged = values.metersPerPixel !== this.world.metersPerPixel;
      if (
        this.editing &&
        gridChanged &&
        !this.placement &&
        (this.sizeChanged() ||
          values.width < this.world.width ||
          values.height < this.world.height)
      ) {
        this.placement = new ResizePlacement(this.world, values);
        this.fields.hidden = true;
        this.previewPanel.hidden = false;
        this.submit.textContent = "Apply resize";
        this.renderer.draw();
        this.captureParticles();
        this.draw();
        this.preview.focus();
        return;
      }
      if (this.placement) {
        const p = this.placement;
        this.remember();
        reframeWorld(this.world, {
          width: p.properties.width,
          height: p.properties.height,
          pitch: p.properties.metersPerPixel,
          x: this.world.viewOriginX + p.x * this.world.metersPerPixel,
          y: this.world.viewOriginY + p.y * this.world.metersPerPixel,
          cacheMB: this.renderer.navigation?.settings.get("maxCacheMB") ?? 16,
          predictHidden:
            this.renderer.navigation?.settings.get("predictHidden") ?? true,
        });
        applyLevelMetadata(this.world, {
          ...p.properties,
          viewOriginX: this.world.viewOriginX,
          viewOriginY: this.world.viewOriginY,
        });
        if (scaleChanged) {
          this.renderer.cameraWidth = this.world.width;
          this.renderer.cameraHeight = this.world.height;
          this.renderer.center = {
            x: this.world.width / 2,
            y: this.world.height / 2,
          };
        }
      } else if (this.editing && (gridChanged || scaleChanged)) {
        this.remember();
        reframeWorld(this.world, {
          width: values.width,
          height: values.height,
          pitch: values.metersPerPixel,
          x:
            this.world.viewOriginX +
            (this.world.width * this.world.metersPerPixel -
              values.width * values.metersPerPixel) /
              2,
          y:
            this.world.viewOriginY +
            (this.world.height * this.world.metersPerPixel -
              values.height * values.metersPerPixel) /
              2,
          cacheMB: this.renderer.navigation?.settings.get("maxCacheMB") ?? 16,
          predictHidden:
            this.renderer.navigation?.settings.get("predictHidden") ?? true,
        });
        applyLevelMetadata(this.world, {
          ...values,
          viewOriginX: this.world.viewOriginX,
          viewOriginY: this.world.viewOriginY,
        });
      } else if (!this.editing) {
        const created = createLevel(values);
        created.setGravity(this.world.gravityX, this.world.gravityY);
        if (this.starter.value !== "blank") {
          loadPreset(created, this.starter.value);
          if (values.name !== "Untitled world") created.name = values.name;
        }
        this.remember();
        Object.assign(this.world, created);
      } else {
        if (
          [
            "name",
            "border",
            "background",
            "ambientLight",
            "canvasMode",
            "modeStrength",
            "metersPerPixel",
            "simulationSpeed",
          ].some((key) => values[key] !== this.world[key]) ||
          JSON.stringify(values.mechanics) !==
            JSON.stringify(this.world.mechanics)
        ) {
          this.remember();
          applyLevelMetadata(this.world, values);
        }
      }
      this.world.lastStrikeTick = -1;
      this.world.rebind();
      this.refresh();
      this.closeDialog(this.dialog);
      if (this.editing && scaleChanged) this.zoomed();
    } catch (error) {
      this.error.textContent = error.message;
    }
  }
  updateScaleSummary() {
    const value = Number(this.inputs.metersPerPixel.value),
      width = Number(this.axes.width.value),
      height = Number(this.axes.height.value);
    this.scaleSummary.textContent =
      Number.isFinite(value) && value > 0
        ? `${physicalDistance(width * value)} × ${physicalDistance(height * value)} visible · ${scaleRatio(value)} per pixel`
        : "";
  }
  captureParticles() {
    this.particles.width = this.world.width;
    this.particles.height = this.world.height;
    const context = this.particles.getContext("2d"),
      image = context.createImageData(this.world.width, this.world.height);
    image.data.set(this.renderer.data.data);
    for (let i = 0; i < this.world.length; i++)
      if (!this.world.cells[i]) {
        const background = this.world.backgroundPaint[i],
          o = i * 4;
        image.data[o] = (background >>> 16) & 255;
        image.data[o + 1] = (background >>> 8) & 255;
        image.data[o + 2] = background & 255;
        image.data[o + 3] = background >>> 24;
      }
    writeElasticPixels(this.world, image.data, this.renderer.elasticColors);
    context.putImageData(image, 0, 0);
    this.renderer.drawDynamicPixels(context, { x: 0, y: 0, scale: 1 });
  }
  point(event) {
    const box = this.preview.getBoundingClientRect(),
      ratio = this.preview.width / box.width,
      v = this.viewport,
      point = inversePoint(
        this.previewMatrix,
        (event.clientX - box.left) * ratio,
        (event.clientY - box.top) * ratio,
      );
    return {
      x: (point.x - v.x) / v.scale,
      y: (point.y - v.y) / v.scale,
    };
  }
  draw() {
    const p = this.placement;
    if (!p) return;
    const box = this.preview.getBoundingClientRect(),
      dpr = Math.min(2, devicePixelRatio || 1);
    this.preview.width = Math.max(1, Math.round(box.width * dpr));
    this.preview.height = Math.max(1, Math.round(box.height * dpr));
    const c = this.context,
      padding = 18 * dpr,
      turn = this.renderer.rotation,
      virtualWidth = turn % 2 ? this.preview.height : this.preview.width,
      virtualHeight = turn % 2 ? this.preview.width : this.preview.height,
      scale = Math.min(
        (virtualWidth - 2 * padding) / p.width,
        (virtualHeight - 2 * padding) / p.height,
      );
    this.viewport = {
      x: (virtualWidth - p.width * scale) / 2,
      y: (virtualHeight - p.height * scale) / 2,
      scale,
    };
    c.fillStyle = "#0b1317";
    c.fillRect(0, 0, this.preview.width, this.preview.height);
    this.previewMatrix =
      turn === 1
        ? [0, 1, -1, 0, this.preview.width, 0]
        : turn === 2
          ? [-1, 0, 0, -1, this.preview.width, this.preview.height]
          : turn === 3
            ? [0, -1, 1, 0, 0, this.preview.height]
            : [1, 0, 0, 1, 0, 0];
    c.save();
    c.setTransform(...this.previewMatrix);
    c.translate(this.viewport.x, this.viewport.y);
    c.scale(scale, scale);
    c.imageSmoothingEnabled = false;
    const old = p.oldBox,
      next = p.newBox;
    c.fillStyle = p.properties.background;
    c.fillRect(next.x, next.y, next.width, next.height);
    c.globalAlpha = 0.28;
    c.drawImage(
      this.renderer.worldImage(),
      old.x,
      old.y,
      old.width,
      old.height,
    );
    c.globalAlpha = 1;
    c.save();
    c.beginPath();
    c.rect(next.x, next.y, next.width, next.height);
    c.clip();
    c.fillStyle = p.properties.background;
    c.fillRect(next.x, next.y, next.width, next.height);
    c.drawImage(this.particles, old.x, old.y, old.width, old.height);
    c.restore();
    c.lineWidth = (1.5 * dpr) / scale;
    c.strokeStyle = "#a6d5bd";
    c.strokeRect(next.x, next.y, next.width, next.height);
    c.setLineDash([(4 * dpr) / scale, (4 * dpr) / scale]);
    c.strokeStyle = "#7a959f";
    c.strokeRect(old.x, old.y, old.width, old.height);
    c.setLineDash([]);
    c.strokeStyle = "#dfbb78";
    c.lineWidth = (2 * dpr) / scale;
    c.strokeRect(
      p.positionX,
      p.positionY,
      Math.min(p.oldWidth, next.width),
      Math.min(p.oldHeight, next.height),
    );
    c.restore();
    for (const axis of ["x", "y"]) {
      const input = this.dialog.querySelector(`#resize-${axis}`),
        max = axis === "x" ? p.maxX : p.maxY;
      input.max = max;
      input.value = axis === "x" ? p.positionX : p.positionY;
      input.disabled = !max;
    }
    let kept = 0;
    for (
      let y = Math.max(0, p.y);
      y < Math.min(this.world.height, p.y + next.height);
      y++
    )
      for (
        let x = Math.max(0, p.x);
        x < Math.min(this.world.width, p.x + next.width);
        x++
      )
        if (this.world.cells[y * this.world.width + x]) kept++;
    this.dialog.querySelector("#resize-summary").textContent =
      `${next.width} × ${next.height} px · Keep ${kept.toLocaleString()} particles · Crop ${(this.world.count - kept).toLocaleString()}`;
  }
}
