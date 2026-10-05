import { brushFootprint } from "./brush-geometry.js";
import {
  PerformanceCounters,
  renderingStages,
} from "./performance-counters.js";
import { drawStreamlines } from "./airflow-view.js";
import { drawCircuits } from "./render/circuit-renderer.js";
import { drawPortalLinks } from "./portal-renderer.js";
import { LightOverlay } from "./lighting-renderer.js";
import { drawMissiles } from "./render/missile-renderer.js";
import { canvasView, transformPoint, inversePoint } from "./canvas-view.js";
import { drawStickmen } from "./render/stickman-renderer.js";
import { writeElasticPixels } from "./render/elastic-renderer.js";
import { drawBubbles } from "./render/bubble-renderer.js";
import { drawGesturePreview } from "./drawing-gesture.js";
import { SelectionOverlay } from "./selection-overlay.js";
import { Bloom } from "./bloom.js";
import { writeMaterialPixels } from "./render/material-pixels.js";
export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.profile = new PerformanceCounters(renderingStages);
    this.context = canvas.getContext("2d", { alpha: false });
    this.buffer = document.createElement("canvas");
    this.composite = document.createElement("canvas");
    this.compositeContext = this.composite.getContext("2d");
    this.buffer.width = world.width;
    this.buffer.height = world.height;
    this.ctx = this.buffer.getContext("2d", { alpha: false });
    this.data = this.ctx.createImageData(world.width, world.height);
    this.elasticColors = new Uint8ClampedArray(world.length * 3);
    this.mode = "normal";
    this.grid = false;
    this.bloom = true;
    this.bloomIntensity = 1;
    this.displayQuality = 2;
    this.brushOutline = true;
    this.background = "";
    this.glow = new Bloom();
    this.lighting = new LightOverlay();
    this.lightBounces = 0.1;
    this.cursor = null;
    this.zoom = 1;
    this.rotation = 0;
    this.fill = "stretch";
    this.center = { x: world.width / 2, y: world.height / 2 };
    this.cameraWidth = world.width;
    this.cameraHeight = world.height;
    this.selectionOverlay = new SelectionOverlay();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  drawDynamicPixels(context, viewport, timed = false) {
    drawStickmen(context, this.world, viewport);
    drawMissiles(context, this.world, viewport);
    if (timed) this.profile.mark(4);
  }
  worldImage() {
    if (
      this.composite.width !== this.world.width ||
      this.composite.height !== this.world.height
    ) {
      this.composite.width = this.world.width;
      this.composite.height = this.world.height;
    }
    if (this.mode === "normal" && !this.lighting.shade)
      this.lighting.update(this.world, this.lightBounces);
    this.compositeContext.drawImage(this.buffer, 0, 0);
    if (this.mode === "normal")
      this.lighting.draw(this.compositeContext, this.world, {
        x: 0,
        y: 0,
        scale: 1,
      });
    return this.composite;
  }
  resize() {
    const box = this.canvas.getBoundingClientRect(),
      dpr = Math.min(this.displayQuality, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(box.width * dpr);
    this.canvas.height = Math.round(box.height * dpr);
    this.context.imageSmoothingEnabled = false;
    if (
      this.cameraWidth !== this.world.width ||
      this.cameraHeight !== this.world.height
    ) {
      this.cameraWidth = this.world.width;
      this.cameraHeight = this.world.height;
      this.zoom = 1;
      this.center = { x: this.world.width / 2, y: this.world.height / 2 };
    }
    this.updateViewport();
  }
  updateViewport() {
    this.view = canvasView(
      this.canvas.width,
      this.canvas.height,
      this.world.width,
      this.world.height,
      this.rotation,
      this.navigation ? 1 : this.zoom,
      this.center,
      this.fill,
    );
    this.viewport = this.view.viewport;
  }
  project(x, y) {
    const v = this.viewport;
    return transformPoint(
      this.view.matrix,
      v.x + x * v.scale,
      v.y + y * v.scale,
    );
  }
  zoomAt(factor, clientX, clientY) {
    if (this.navigation)
      return this.navigation.zoomAt(factor, clientX, clientY);
    const anchor = this.point(clientX, clientY),
      box = this.canvas.getBoundingClientRect(),
      ratio = this.canvas.width / box.width;
    this.zoom = Math.max(1, Math.min(12, this.zoom * factor));
    this.updateViewport();
    const point = inversePoint(
      this.view.matrix,
      (clientX - box.left) * ratio,
      (clientY - box.top) * ratio,
    );
    this.center = {
      x: anchor.x - (point.x - this.view.baseWidth / 2) / this.viewport.scale,
      y: anchor.y - (point.y - this.view.baseHeight / 2) / this.viewport.scale,
    };
    if (this.zoom === 1)
      this.center = { x: this.world.width / 2, y: this.world.height / 2 };
    this.updateViewport();
  }
  panBy(dx, dy) {
    if (this.navigation) return this.navigation.panBy(dx, dy);
    const box = this.canvas.getBoundingClientRect(),
      ratio = this.canvas.width / box.width,
      point = inversePoint(this.view.matrix, dx * ratio, dy * ratio, true);
    this.center.x -= point.x / this.viewport.scale;
    this.center.y -= point.y / this.viewport.scale;
    this.updateViewport();
  }
  resetView() {
    if (this.navigation) return this.navigation.reset();
    this.zoom = 1;
    this.center = { x: this.world.width / 2, y: this.world.height / 2 };
    this.updateViewport();
  }
  point(clientX, clientY) {
    const b = this.canvas.getBoundingClientRect(),
      dpr = Math.min(this.displayQuality, window.devicePixelRatio || 1);
    if (
      this.cameraWidth !== this.world.width ||
      this.cameraHeight !== this.world.height ||
      this.canvas.width !== Math.round(b.width * dpr) ||
      this.canvas.height !== Math.round(b.height * dpr)
    )
      this.resize();
    const v = this.viewport,
      s = this.canvas.width / b.width,
      point = inversePoint(
        this.view.matrix,
        (clientX - b.left) * s,
        (clientY - b.top) * s,
      );
    return { x: (point.x - v.x) / v.scale, y: (point.y - v.y) / v.scale };
  }
  drawAirflow(c, v) {
    drawStreamlines(c, v, this.world);
  }
  draw() {
    const profile = this.profile;
    profile.begin();
    this.world.portals.ensure();
    if (
      this.buffer.width !== this.world.width ||
      this.buffer.height !== this.world.height
    ) {
      this.buffer.width = this.world.width;
      this.buffer.height = this.world.height;
      this.data = this.ctx.createImageData(this.world.width, this.world.height);
      this.elasticColors = new Uint8ClampedArray(this.world.length * 3);
      this.resize();
    }
    writeMaterialPixels(this);
    const { width, height } = this.world,
      p = this.data.data,
      wind = this.mode === "wind";
    profile.mark(0);
    if (this.mode === "normal")
      this.lighting.update(this.world, this.lightBounces);
    profile.mark(1);
    writeElasticPixels(this.world, this.data.data, this.elasticColors);
    profile.mark(2);
    this.ctx.putImageData(this.data, 0, 0);
    if (this.mode === "normal") {
      drawBubbles(this.ctx, this.world);
      drawCircuits(this.ctx, this.world);
    }
    profile.mark(3);
    // Geometry is rasterized once at world resolution, then enlarged together
    // with material pixels. Continuous joints/poses still drive the animation.
    this.drawDynamicPixels(this.ctx, { x: 0, y: 0, scale: 1 }, true);
    const c = this.context,
      v = this.viewport;
    c.fillStyle = "#10191e";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    c.setTransform(...this.view.matrix);
    c.beginPath();
    c.rect(v.x, v.y, width * v.scale, height * v.scale);
    c.clip();
    c.drawImage(this.buffer, v.x, v.y, width * v.scale, height * v.scale);
    profile.mark(3);
    if (this.mode === "normal") this.lighting.draw(c, this.world, v);
    profile.mark(5);
    if (wind) this.drawAirflow(c, v);
    profile.mark(6);
    if (this.bloom && this.mode === "normal")
      this.glow.draw(
        c,
        this.world,
        v,
        p,
        this.bloomIntensity,
        this.elasticColors,
      );
    profile.mark(7);
    if (this.grid) {
      c.strokeStyle = "#ffffff10";
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= width; x += 10) {
        c.moveTo(v.x + x * v.scale, v.y);
        c.lineTo(v.x + x * v.scale, v.y + height * v.scale);
      }
      for (let y = 0; y <= height; y += 10) {
        c.moveTo(v.x, v.y + y * v.scale);
        c.lineTo(v.x + width * v.scale, v.y + y * v.scale);
      }
      c.stroke();
    }
    this.selectionOverlay.draw(c, v, this.world, this.selection);
    drawPortalLinks(c, v, this.world, this.showPortalLinks, this.portalDrag);
    drawGesturePreview(c, v, this.world, this.gesture);
    if (this.cursor && this.brushOutline) {
      const { x, y, radius, shape, erase, selection } = this.cursor;
      const footprint = brushFootprint(radius),
        cx = Math.floor(x) + 0.5 + footprint.center,
        cy = Math.floor(y) + 0.5 + footprint.center,
        extent = footprint.diameter / 2;
      c.strokeStyle = erase ? "#ef9292" : selection ? "#98d8ef" : "#f6e3bd";
      c.fillStyle = erase ? "#ef929211" : selection ? "#98d8ef12" : "#f6e3bd09";
      c.lineWidth = 1.3 * (window.devicePixelRatio || 1);
      c.beginPath();
      if (shape === "square")
        c.rect(
          v.x + (cx - extent) * v.scale,
          v.y + (cy - extent) * v.scale,
          footprint.diameter * v.scale,
          footprint.diameter * v.scale,
        );
      else
        c.arc(
          v.x + cx * v.scale,
          v.y + cy * v.scale,
          extent * v.scale,
          0,
          Math.PI * 2,
        );
      c.fill();
      c.stroke();
    }
    c.restore();
    profile.mark(8);
  }
}
