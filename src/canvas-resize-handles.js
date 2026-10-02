import { levelProperties } from "./level-properties.js";
import { resizeLevel } from "./level.js";
const handles = [
  ["nw", "top left corner", 0, 0],
  ["n", "top edge", 0.5, 0],
  ["ne", "top right corner", 1, 0],
  ["e", "right edge", 1, 0.5],
  ["se", "bottom right corner", 1, 1],
  ["s", "bottom edge", 0.5, 1],
  ["sw", "bottom left corner", 0, 1],
  ["w", "left edge", 0, 0.5],
];
const clamp = (n) => Math.max(8, Math.min(512, Math.round(n)));
// Offsets anchor the opposite edge. Moving left/top inward crops that side;
// moving it outward adds empty space without scaling a single particle.
export function draggedCanvasSize(
  width,
  height,
  direction,
  dx,
  dy,
  aspect = false,
) {
  const horizontal = direction.includes("w") || direction.includes("e"),
    vertical = direction.includes("n") || direction.includes("s");
  let nextWidth = horizontal
      ? clamp(width + (direction.includes("w") ? -dx : dx))
      : width,
    nextHeight = vertical
      ? clamp(height + (direction.includes("n") ? -dy : dy))
      : height;
  if (aspect && horizontal && vertical) {
    const scale =
      Math.abs(nextWidth / width - 1) >= Math.abs(nextHeight / height - 1)
        ? nextWidth / width
        : nextHeight / height;
    const bounded = Math.max(
      Math.max(8 / width, 8 / height),
      Math.min(
        scale,
        512 / width,
        512 / height,
        Math.sqrt(200000 / (width * height)),
      ),
    );
    nextWidth = Math.round(width * bounded);
    nextHeight = Math.round(height * bounded);
  }
  if (nextWidth * nextHeight > 200000) {
    if (horizontal) nextWidth = Math.floor(200000 / nextHeight);
    else nextHeight = Math.floor(200000 / nextWidth);
  }
  return {
    width: nextWidth,
    height: nextHeight,
    x: direction.includes("w") ? width - nextWidth : 0,
    y: direction.includes("n") ? height - nextHeight : 0,
  };
}
export class CanvasResizeHandles {
  constructor(
    host,
    world,
    renderer,
    { begin, end, remember, refresh, properties },
  ) {
    Object.assign(this, {
      host,
      world,
      renderer,
      begin,
      end,
      remember,
      refresh,
    });
    this.layer = document.createElement("div");
    this.layer.className = "canvas-resize-handles";
    this.preview = document.createElement("div");
    this.preview.className = "canvas-resize-outline";
    this.preview.hidden = true;
    this.label = document.createElement("span");
    this.preview.append(this.label);
    this.buttons = handles.map(([direction, name]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "canvas-resize-handle";
      button.dataset.resizeHandle = direction;
      button.setAttribute("aria-label", `Resize canvas ${name}`);
      button.title = `Drag ${name} to resize; Enter opens canvas properties`;
      button.addEventListener("pointerdown", (e) => this.start(e, direction));
      button.addEventListener("pointermove", (e) => this.move(e));
      button.addEventListener("pointerup", (e) => this.finish(e, true));
      button.addEventListener("pointercancel", (e) => this.finish(e, false));
      button.addEventListener("lostpointercapture", (e) =>
        this.finish(e, false),
      );
      button.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          properties();
        }
      });
      this.layer.append(button);
      return button;
    });
    this.layer.append(this.preview);
    host.append(this.layer);
    document.addEventListener(
      "keydown",
      (e) => {
        if (this.drag && e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.finish({ pointerId: this.drag.id }, false);
        }
      },
      true,
    );
    window.addEventListener("blur", () => {
      if (this.drag) this.finish({ pointerId: this.drag.id }, false);
    });
    new ResizeObserver(() => this.update()).observe(host);
    this.update();
  }
  projection() {
    const box = this.renderer.canvas.getBoundingClientRect(),
      parent = this.host.getBoundingClientRect(),
      ratio = this.renderer.canvas.width / box.width,
      v = this.renderer.viewport;
    return {
      x: box.left - parent.left + v.x / ratio,
      y: box.top - parent.top + v.y / ratio,
      scale: v.scale / ratio,
      width: parent.width,
      height: parent.height,
    };
  }
  update() {
    if (this.drag || document.body.classList.contains("mobile-layout")) return;
    const p = this.projection(),
      key = [
        p.x,
        p.y,
        p.scale,
        p.width,
        p.height,
        this.world.width,
        this.world.height,
      ].join(":");
    if (key === this.lastProjection) return;
    this.lastProjection = key;
    handles.forEach(([, , x, y], n) => {
      const left = p.x + x * this.world.width * p.scale,
        top = p.y + y * this.world.height * p.scale,
        button = this.buttons[n];
      button.hidden =
        left < -1 || top < -1 || left > p.width + 1 || top > p.height + 1;
      button.style.left = `${Math.max(8, Math.min(p.width - 8, left))}px`;
      button.style.top = `${Math.max(8, Math.min(p.height - 8, top))}px`;
    });
  }
  start(e, direction) {
    if (
      e.button !== 0 ||
      this.drag ||
      document.body.classList.contains("mobile-layout")
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    this.renderer.resize();
    this.drag = {
      id: e.pointerId,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      projection: this.projection(),
      properties: levelProperties(this.world),
      restore: this.begin(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    this.layer.classList.add("resizing");
    this.preview.hidden = false;
    this.move(e);
  }
  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const p = d.projection;
    d.result = draggedCanvasSize(
      d.properties.width,
      d.properties.height,
      d.direction,
      (e.clientX - d.startX) / p.scale,
      (e.clientY - d.startY) / p.scale,
      e.shiftKey,
    );
    const r = d.result;
    this.preview.style.left = `${p.x + r.x * p.scale}px`;
    this.preview.style.top = `${p.y + r.y * p.scale}px`;
    this.preview.style.width = `${r.width * p.scale}px`;
    this.preview.style.height = `${r.height * p.scale}px`;
    this.label.textContent = `${r.width} × ${r.height} px`;
  }
  finish(e, apply) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.preview.hidden = true;
    this.layer.classList.remove("resizing");
    try {
      const r = d.result;
      if (
        apply &&
        (r.width !== d.properties.width || r.height !== d.properties.height)
      ) {
        const resized = resizeLevel(
          this.world,
          { ...d.properties, width: r.width, height: r.height },
          r.x,
          r.y,
        );
        this.remember();
        Object.assign(this.world, resized);
        this.refresh();
      }
    } finally {
      this.end(d.restore);
      this.lastProjection = null;
      this.update();
    }
  }
}
