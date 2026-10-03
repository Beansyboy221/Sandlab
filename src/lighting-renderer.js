import { Lighting } from "./lighting.js";
export class LightOverlay {
  constructor() {
    this.field = new Lighting();
    this.mask = document.createElement("canvas");
    this.glow = document.createElement("canvas");
    this.maskContext = this.mask.getContext("2d", { alpha: false });
    this.glowContext = this.glow.getContext("2d", { alpha: false });
    this.frame = 0;
  }
  update(w, bounces) {
    // The low-resolution optical field updates at half the display rate. Changes
    // to dimensions and bounce settings apply immediately; paused drawing still
    // refreshes every other frame, without tying light to simulation ticks.
    let changed = false;
    if (
      this.world !== w ||
      this.width !== w.width ||
      this.height !== w.height ||
      this.bounces !== bounces ||
      ++this.frame % 2 === 0
    ) {
      changed = this.field.update(w, bounces);
      this.world = w;
      this.width = w.width;
      this.height = w.height;
      this.bounces = bounces;
    }
    if (this.mask.width !== w.width || this.mask.height !== w.height) {
      this.mask.width = this.glow.width = w.width;
      this.mask.height = this.glow.height = w.height;
      this.shade = this.maskContext.createImageData(w.width, w.height);
      this.halo = this.glowContext.createImageData(w.width, w.height);
    }
    const ambient =
      w.canvasMode === "solar" ? w.environment.light : (w.ambientLight ?? 1);
    if (!changed && this.ambient === ambient) return;
    this.ambient = ambient;
    const f = this.field,
      cellSize = f.cellSize;
    // Reconstruct smooth irradiance at particle resolution. Ordinary bilinear
    // scaling mixes a lit wall with its dark back face; reject samples crossing
    // an actual particle silhouette instead of blurring the shadow mask.
    for (let y = 0; y < w.height; y++) {
      const gy = (y + 0.5) / cellSize - 0.5,
        y0 = Math.floor(gy),
        fy = gy - y0;
      for (let x = 0; x < w.width; x++) {
        const gx = (x + 0.5) / cellSize - 0.5,
          x0 = Math.floor(gx),
          fx = gx - x0;
        const i = y * w.width + x;
        let r = 0,
          g = 0,
          b = 0,
          weight = 0;
        for (let n = 0; n < 4; n++) {
          const xx = Math.max(0, Math.min(f.width - 1, x0 + (n & 1)));
          const yy = Math.max(0, Math.min(f.height - 1, y0 + (n >> 1)));
          const sx = Math.min(w.width - 0.5, (xx + 0.5) * cellSize);
          const sy = Math.min(w.height - 0.5, (yy + 0.5) * cellSize);
          const sample = Math.floor(sy) * w.width + Math.floor(sx);
          if (!f.transmission[sample] && f.transmission[i]) continue;
          const j = (yy * f.width + xx) * 3;
          const visible =
            f.light[j] || f.light[j + 1] || f.light[j + 2]
              ? f.trace(sx, sy, x + 0.5, y + 0.5)
              : 1;
          if (!visible) continue;
          const a = (n & 1 ? fx : 1 - fx) * (n >> 1 ? fy : 1 - fy);
          r += f.light[j] * a * visible;
          g += f.light[j + 1] * a * visible;
          b += f.light[j + 2] * a * visible;
          weight += a;
        }
        if (weight) {
          r /= weight;
          g /= weight;
          b /= weight;
        }
        const energy = f.particleEmission[i];
        if (energy) {
          const tile =
            (Math.floor(y / cellSize) * f.width + Math.floor(x / cellSize)) * 3;
          r = Math.max(r, energy * f.emitColor[tile]);
          g = Math.max(g, energy * f.emitColor[tile + 1]);
          b = Math.max(b, energy * f.emitColor[tile + 2]);
        }
        this.shade.data[i * 4] = Math.min(1, ambient + r) * 255;
        this.shade.data[i * 4 + 1] = Math.min(1, ambient + g) * 255;
        this.shade.data[i * 4 + 2] = Math.min(1, ambient + b) * 255;
        this.halo.data[i * 4] = Math.min(9, r * 5);
        this.halo.data[i * 4 + 1] = Math.min(9, g * 5);
        this.halo.data[i * 4 + 2] = Math.min(9, b * 5);
        this.shade.data[i * 4 + 3] = this.halo.data[i * 4 + 3] = 255;
      }
    }
    this.maskContext.putImageData(this.shade, 0, 0);
    this.glowContext.putImageData(this.halo, 0, 0);
  }
  draw(c, w, v) {
    c.save();
    c.beginPath();
    c.rect(v.x, v.y, w.width * v.scale, w.height * v.scale);
    c.clip();
    // The field is already smooth; keep particle-sized shadow edges crisp.
    c.imageSmoothingEnabled = false;
    c.globalCompositeOperation = "multiply";
    c.drawImage(this.mask, v.x, v.y, w.width * v.scale, w.height * v.scale);
    c.globalCompositeOperation = "screen";
    c.drawImage(this.glow, v.x, v.y, w.width * v.scale, w.height * v.scale);
    c.restore();
  }
}
