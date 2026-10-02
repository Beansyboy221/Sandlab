import { materials } from "./sim/materials.js";
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
    this.inputs = Object.fromEntries(
      ["name", "width", "height", "border", "background"].map((key) => [
        key,
        dialog.querySelector(`#level-${key}`),
      ]),
    );
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
      p.setPosition(p.positionX + dx * step, p.positionY + dy * step);
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
    this.placement = null;
    this.error.textContent = "";
    const values = levelProperties(this.world);
    if (!editing) values.name = "Untitled canvas";
    for (const [key, input] of Object.entries(this.inputs))
      input.value = values[key];
    this.dialog.querySelector("h2").textContent = editing
      ? "Canvas properties"
      : "New canvas";
    this.dialog.querySelector("#level-note").textContent = editing
      ? "Resizing lets you place the kept area before applying changes."
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
  sizeChanged() {
    return (
      Number(this.inputs.width.value) !== this.world.width ||
      Number(this.inputs.height.value) !== this.world.height
    );
  }
  values() {
    return validateLevelProperties(
      Object.fromEntries(
        Object.entries(this.inputs).map(([key, input]) => [
          key,
          key === "width" || key === "height"
            ? Number(input.value)
            : input.value,
        ]),
      ),
    );
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
        this.remember();
        Object.assign(this.world, created);
      } else {
        if (
          ["name", "border", "background"].some(
            (key) => values[key] !== this.world[key],
          )
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
      v = this.viewport;
    return {
      x: ((event.clientX - box.left) * ratio - v.x) / v.scale,
      y: ((event.clientY - box.top) * ratio - v.y) / v.scale,
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
      scale = Math.min(
        (this.preview.width - 2 * padding) / p.width,
        (this.preview.height - 2 * padding) / p.height,
      );
    this.viewport = {
      x: (this.preview.width - p.width * scale) / 2,
      y: (this.preview.height - p.height * scale) / 2,
      scale,
    };
    c.fillStyle = "#0b1317";
    c.fillRect(0, 0, this.preview.width, this.preview.height);
    c.save();
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
