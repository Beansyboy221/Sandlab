import { drawCircuits } from "./sim/circuit-renderer.js";
import { LightOverlay } from "./lighting-renderer.js";
import { drawMissiles } from "./sim/missile-renderer.js";
import { canvasView, transformPoint, inversePoint } from "./canvas-view.js";
import { drawRigidBodies } from "./sim/rigid-renderer.js";
import { drawStickmen } from "./sim/stickman-renderer.js";
import { drawElasticBodies, drawBubbles } from "./sim/elastic-renderer.js";
import { drawGesturePreview } from "./drawing-gesture.js";
import { SelectionOverlay } from "./selection-overlay.js";
import { Bloom } from "./bloom.js";
import { materials, M } from "./sim/materials.js";
const colors = materials.map((m) => [
  parseInt(m.color.slice(1, 3), 16),
  parseInt(m.color.slice(3, 5), 16),
  parseInt(m.color.slice(5, 7), 16),
]);
function heatColor(t) {
  if (t < 20) {
    const v = Math.min(1, (20 - t) / 120);
    return [40 + 30 * v, 90 + 90 * v, 145 + 100 * v];
  }
  const v = Math.min(1, (t - 20) / 1400);
  return [
    50 + 205 * Math.min(1, v * 2),
    90 + 100 * Math.max(0, v - 0.45),
    120 * (1 - v) + 30,
  ];
}
const heatColors = Array.from({ length: 1601 }, (_, i) => heatColor(i - 100));
export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
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
    this.center = { x: world.width / 2, y: world.height / 2 };
    this.cameraWidth = world.width;
    this.cameraHeight = world.height;
    this.selectionOverlay = new SelectionOverlay();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  drawElastics(context, viewport) {
    drawElasticBodies(context, this.world, viewport, this.elasticColors);
    drawRigidBodies(context, this.world, viewport, this.elasticColors);
    drawStickmen(context, this.world, viewport);
    drawMissiles(context, this.world, viewport);
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
    this.drawElastics(this.compositeContext, { x: 0, y: 0, scale: 1 });
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
      this.zoom,
      this.center,
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
    const box = this.canvas.getBoundingClientRect(),
      ratio = this.canvas.width / box.width,
      point = inversePoint(this.view.matrix, dx * ratio, dy * ratio, true);
    this.center.x -= point.x / this.viewport.scale;
    this.center.y -= point.y / this.viewport.scale;
    this.updateViewport();
  }
  resetView() {
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
    const f = this.world.fields;
    c.strokeStyle = "#b8f0eea0";
    c.lineWidth = Math.max(1, v.scale * 0.45);
    c.beginPath();
    for (let y = 6; y < this.world.height; y += 12)
      for (let x = 6; x < this.world.width; x += 12) {
        if (f.blocks(this.world.cells[y * this.world.width + x])) continue;
        f.airflow.sample(f, x, y);
        const speed = Math.hypot(f.airflow.x, f.airflow.y);
        if (speed < 0.04) continue;
        const dx = f.airflow.x / speed,
          dy = f.airflow.y / speed;
        const length = Math.min(7, 2 + speed * 3) * v.scale;
        const sx = v.x + x * v.scale,
          sy = v.y + y * v.scale;
        const ex = sx + dx * length,
          ey = sy + dy * length;
        c.moveTo(sx, sy);
        c.lineTo(ex, ey);
        c.moveTo(
          ex - dx * 2 * v.scale - dy * v.scale,
          ey - dy * 2 * v.scale + dx * v.scale,
        );
        c.lineTo(ex, ey);
        c.lineTo(
          ex - dx * 2 * v.scale + dy * v.scale,
          ey - dy * 2 * v.scale - dx * v.scale,
        );
      }
    c.stroke();
  }
  draw() {
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
    if (this.background !== this.world.background) {
      this.background = this.world.background;
      this.backgroundRGB = [1, 3, 5].map((start) =>
        parseInt(this.background.slice(start, start + 2), 16),
      );
    }
    const [bgR, bgG, bgB] = this.backgroundRGB;
    const { cells, temp, life, variant, charge, fields, width, height, tick } =
        this.world,
      p = this.data.data;
    const pressure = this.mode === "pressure",
      thermal = this.mode === "heat",
      echo = this.mode === "echo",
      wind = this.mode === "wind";
    for (let i = 0; i < cells.length; i++) {
      const id = cells[i],
        o = i * 4,
        x = i % width,
        y = (i / width) | 0;
      const backdrop = this.world.backgroundPaint[i],
        backAlpha = (backdrop >>> 24) / 255;
      const cellBgR =
          bgR * (1 - backAlpha) + ((backdrop >>> 16) & 255) * backAlpha,
        cellBgG = bgG * (1 - backAlpha) + ((backdrop >>> 8) & 255) * backAlpha,
        cellBgB = bgB * (1 - backAlpha) + (backdrop & 255) * backAlpha;
      let r = cellBgR,
        g = cellBgG,
        b = cellBgB;
      if (id) {
        const base = thermal
          ? heatColors[Math.max(0, Math.min(1600, Math.round(temp[i]) + 100))]
          : colors[id];
        const shade = (variant[i] / 255 - 0.5) * 22;
        r = base[0] + shade;
        g = base[1] + shade;
        b = base[2] + shade;
        if (!thermal) {
          const pigment = this.world.pigment[i],
            opacity = (pigment >>> 24) / 255;
          if (opacity) {
            r =
              r * (1 - opacity) + (((pigment >>> 16) & 255) + shade) * opacity;
            g = g * (1 - opacity) + (((pigment >>> 8) & 255) + shade) * opacity;
            b = b * (1 - opacity) + ((pigment & 255) + shade) * opacity;
          }
          if (
            id === M.Fire ||
            id === M.Spark ||
            id === M.Lightning ||
            (materials[id].glow &&
              (materials[id].circuit !== "lamp" || life[i]))
          ) {
            const flicker =
              ((variant[i] + tick * 17) % 70) * (materials[id].glow ? 0.4 : 1);
            r += flicker;
            g += flicker * 0.65;
            b += flicker * 0.3;
          } else if (temp[i] > 450) {
            const glow = Math.min(1, (temp[i] - 450) / 1300);
            r = r * (1 - glow) + 255 * glow;
            g = g * (1 - glow) + 100 * glow;
          }
          if (
            id === M.Steam ||
            id === M.Smoke ||
            materials[id].category === "gas"
          ) {
            r = r * 0.67 + cellBgR * 0.33;
            g = g * 0.67 + cellBgG * 0.33;
            b = b * 0.67 + cellBgB * 0.33;
          }
          if (
            (id === M.Dirt || id === M.Mud || id === M.Plant) &&
            this.world.nutrition[i]
          ) {
            const nutrition = this.world.nutrition[i] / 255;
            g += nutrition * 28;
            r -= nutrition * 12;
          }
          if (id === M.Sponge) {
            const amount = this.world.storedAmount[i] / 48,
              liquid = colors[this.world.storedLiquid[i]];
            r = r * (1 - amount * 0.65) + liquid[0] * amount * 0.65;
            g = g * (1 - amount * 0.65) + liquid[1] * amount * 0.65;
            b = b * (1 - amount * 0.65) + liquid[2] * amount * 0.65;
            if (variant[i] < 60) {
              r *= 0.75;
              g *= 0.75;
              b *= 0.75;
            }
          }
          if (id === M.Glass) {
            r *= 0.66;
            g *= 0.76;
            b *= 0.79;
          }
          if (materials[id].burn && life[i] > 0) {
            const ember = 0.35 + ((variant[i] + tick * 7) % 40) / 100;
            r = r * (1 - ember) + 235 * ember;
            g = g * (1 - ember) + 75 * ember;
            b *= 1 - ember;
          }
          if (charge[i]) {
            r = 240;
            g = 230;
            b = 139;
          }
        }
      } else if (!backdrop && x % 20 === 0 && y % 20 === 0) {
        const dot = bgR + bgG + bgB > 400 ? -13 : 13;
        r += dot;
        g += dot;
        b += dot;
      }
      if (thermal && !id) {
        const air =
          heatColors[
            Math.max(
              0,
              Math.min(
                1600,
                Math.round(fields.temperature[fields.index(x, y)]) + 100,
              ),
            )
          ];
        r = air[0];
        g = air[1];
        b = air[2];
      }
      if (pressure) {
        const force = fields.pressure[fields.index(x, y)],
          a = Math.min(0.9, Math.abs(force) / 12);
        r = r * (1 - a) + (force < 0 ? 75 : 230) * a;
        g = g * (1 - a) + 103 * a;
        b = b * (1 - a) + (force < 0 ? 230 : 130) * a;
      }
      if (wind) {
        fields.airflow.sample(fields, x, y);
        const speed = Math.min(
          1,
          Math.hypot(fields.airflow.x, fields.airflow.y) / 1.5,
        );
        r = r * 0.4 + 48 * speed;
        g = g * 0.4 + 198 * speed;
        b = b * 0.4 + 224 * speed;
      }
      if (echo) {
        const wave = this.world.sound.wave[fields.index(x, y)],
          glow = Math.min(1, Math.abs(wave) * 2.5);
        r = r * 0.22 + (wave < 0 ? 86 : 61) * glow;
        g = g * 0.22 + (wave < 0 ? 113 : 224) * glow;
        b = b * 0.22 + (wave < 0 ? 241 : 204) * glow;
      }
      if (materials[id].elasticity || materials[id].rigid) {
        const colorOffset = i * 3;
        this.elasticColors[colorOffset] = r;
        this.elasticColors[colorOffset + 1] = g;
        this.elasticColors[colorOffset + 2] = b;
        // Elastic skins use continuous positions in their own vector pass.
        r = cellBgR;
        g = cellBgG;
        b = cellBgB;
      }
      p[o] = r;
      p[o + 1] = g;
      p[o + 2] = b;
      p[o + 3] = 255;
    }
    if (this.mode === "normal")
      this.lighting.update(this.world, this.lightBounces);
    this.ctx.putImageData(this.data, 0, 0);
    if (this.mode === "normal") {
      drawBubbles(this.ctx, this.world);
      drawCircuits(this.ctx, this.world);
    }
    const c = this.context,
      v = this.viewport;
    c.fillStyle = "#10191e";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    c.setTransform(...this.view.matrix);
    c.drawImage(this.buffer, v.x, v.y, width * v.scale, height * v.scale);
    this.drawElastics(c, v);
    if (this.mode === "normal") this.lighting.draw(c, this.world, v);
    if (wind) this.drawAirflow(c, v);
    if (this.bloom && this.mode === "normal")
      this.glow.draw(
        c,
        this.world,
        v,
        p,
        this.bloomIntensity,
        this.elasticColors,
      );
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
    drawGesturePreview(c, v, this.world, this.gesture);
    if (this.cursor && this.brushOutline) {
      const { x, y, radius, shape, erase, selection } = this.cursor;
      c.strokeStyle = erase ? "#ef9292" : selection ? "#98d8ef" : "#f6e3bd";
      c.fillStyle = erase ? "#ef929211" : selection ? "#98d8ef12" : "#f6e3bd09";
      c.lineWidth = 1.3 * (window.devicePixelRatio || 1);
      c.beginPath();
      if (shape === "square")
        c.rect(
          v.x + (x - radius) * v.scale,
          v.y + (y - radius) * v.scale,
          2 * radius * v.scale,
          2 * radius * v.scale,
        );
      else
        c.arc(
          v.x + x * v.scale,
          v.y + y * v.scale,
          (radius + 0.5) * v.scale,
          0,
          Math.PI * 2,
        );
      c.fill();
      c.stroke();
    }
    c.restore();
  }
}
