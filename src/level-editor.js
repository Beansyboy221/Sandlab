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

export class LevelEditor {
  constructor(dialog, world, renderer, { open, close, remember, refresh }) {
    this.dialog = dialog;
    this.world = world;
    this.renderer = renderer;
    this.openDialog = open;
    this.closeDialog = close;
    this.remember = remember;
    this.refresh = refresh;
    this.form = dialog.querySelector("form");
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
    this.resolution = dialog.querySelector("#level-resolution");
    this.preview = dialog.querySelector("#resize-preview");
    this.context = this.preview.getContext("2d", { alpha: false });
    this.particles = document.createElement("canvas");
    this.previewPanel = dialog.querySelector("#resize-panel");
    this.fields = dialog.querySelector("#level-fields");
    this.error = dialog.querySelector("#level-error");
    this.submit = dialog.querySelector("#level-submit");
    this.placement = null;
    this.drag = null;
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.commit();
    });
    this.form.addEventListener("input", () => {
      this.error.textContent = "";
      if (!this.placement)
        this.submit.textContent =
          this.editing && this.sizeChanged()
            ? "Place resize"
            : this.editing
              ? "Apply changes"
              : "Create canvas";
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
    if (!editing) values.name = "Untitled canvas";
    for (const [key, input] of Object.entries(this.inputs))
      input.value =
        key === "ambientLight" || key === "modeStrength"
          ? Math.round(values[key] * 100)
          : values[key];
    this.ambientOutput.value = `${this.inputs.ambientLight.value}%`;
    this.strengthOutput.value = `${this.inputs.modeStrength.value}%`;
    this.dialog.querySelector("h2").textContent = editing
      ? "Canvas properties"
      : "New canvas";
    const mobile = document.body.classList.contains("mobile-layout"),
      box = this.renderer.canvas.getBoundingClientRect();
    this.resolution.closest("label").hidden = !mobile;
    const limit = canvasResolutionLimit(box.width, box.height);
    this.resolution.value = editing
      ? Math.min(this.world.width, this.world.height)
      : Math.min(limit, this.world.width, this.world.height);
    this.startResolution = Number(this.resolution.value);
    this.resolution.max = limit;
    this.dialog.querySelector("#level-note").textContent =
      editing && mobile
        ? "Canvas shape follows the screen. Changing resolution lets you place the kept area before applying it."
        : editing
          ? "Canvas shape follows the drawing area."
          : "The current canvas remains available in Undo.";
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
          : "Create canvas";
  }
  dimensions() {
    if (this.editing && Number(this.resolution.value) === this.startResolution)
      return { width: this.world.width, height: this.world.height };
    const resolution = Number(this.resolution.value);
    if (!Number.isInteger(resolution) || resolution < 8 || resolution > 512)
      throw Error("Choose a whole-pixel resolution between 8 and 512.");
    const box = this.renderer.canvas.getBoundingClientRect(),
      limit = canvasResolutionLimit(box.width, box.height);
    if (document.body.classList.contains("mobile-layout") && resolution > limit)
      throw Error(`Choose 8–${limit} pixels for this screen.`);
    return fittedCanvasSize(
      resolution,
      box.width,
      box.height,
      this.renderer.rotation,
    );
  }
  sizeChanged() {
    return (
      this.editing && Number(this.resolution.value) !== this.startResolution
    );
  }
  values() {
    return validateLevelProperties({
      ...Object.fromEntries(
        Object.entries(this.inputs).map(([key, input]) => [
          key,
          key === "ambientLight" || key === "modeStrength"
            ? Number(input.value) / 100
            : input.value,
        ]),
      ),
      ...this.dimensions(),
    });
  }
  commit() {
    try {
      const values = this.values();
      if (this.editing && this.sizeChanged() && !this.placement) {
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
        const p = this.placement,
          resized = resizeLevel(this.world, p.properties, p.x, p.y);
        this.remember();
        Object.assign(this.world, resized);
      } else if (!this.editing) {
        const created = createLevel(values);
        created.setGravity(this.world.gravityX, this.world.gravityY);
        if (this.starter.value !== "blank") {
          loadPreset(created, this.starter.value);
          if (values.name !== "Untitled canvas") created.name = values.name;
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
          ].some((key) => values[key] !== this.world[key])
        ) {
          this.remember();
          applyLevelMetadata(this.world, values);
        }
      }
      this.world.lastStrikeTick = -1;
      this.refresh();
      this.closeDialog(this.dialog);
    } catch (error) {
      this.error.textContent = error.message;
    }
  }
  captureParticles() {
    this.particles.width = this.world.width;
    this.particles.height = this.world.height;
    const context = this.particles.getContext("2d"),
      image = context.createImageData(this.world.width, this.world.height);
    image.data.set(this.renderer.data.data);
    for (let i = 0; i < this.world.length; i++)
      if (!this.world.cells[i] || materials[this.world.cells[i]].elasticity) {
        const background = this.world.backgroundPaint[i],
          o = i * 4;
        image.data[o] = (background >>> 16) & 255;
        image.data[o + 1] = (background >>> 8) & 255;
        image.data[o + 2] = background & 255;
        image.data[o + 3] = background >>> 24;
      }
    context.putImageData(image, 0, 0);
    this.renderer.drawElastics(context, { x: 0, y: 0, scale: 1 });
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
