import { LightSkin } from "./light-skin.js";
import { Lighting } from "./lighting.js";
import { LightReconstruction } from "./light-reconstruction.js";
export class LightOverlay {
  constructor() {
    this.field = new Lighting();
    this.reconstruction = new LightReconstruction();
    this.skin = new LightSkin();
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
    const flash = this.field.flash;
    if (!changed && this.ambient === ambient && this.flash === flash) return;
    this.ambient = ambient;
    this.flash = flash;
    const f = this.field,
      cellSize = f.cellSize;
    this.reconstruction.prepare(f);
    const { indices, weights } = this.reconstruction;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const i = y * w.width + x;
        let r = 0,
          g = 0,
          b = 0;
        for (let n = 0; n < 4; n++) {
          const offset = i * 4 + n,
            j = indices[offset],
            a = weights[offset];
          r += f.light[j] * a;
          g += f.light[j + 1] * a;
          b += f.light[j + 2] * a;
        }
        const energy = f.particleEmission[i];
        if (energy) {
          const tile =
            (Math.floor(y / cellSize) * f.width + Math.floor(x / cellSize)) * 3;
          r = Math.max(r, energy * f.emitColor[tile]);
          g = Math.max(g, energy * f.emitColor[tile + 1]);
          b = Math.max(b, energy * f.emitColor[tile + 2]);
        }
        this.shade.data[i * 4] = Math.min(1, ambient + flash * 0.82 + r) * 255;
        this.shade.data[i * 4 + 1] =
          Math.min(1, ambient + flash * 0.9 + g) * 255;
        this.shade.data[i * 4 + 2] = Math.min(1, ambient + flash + b) * 255;
        this.halo.data[i * 4] = Math.min(9, r * 5);
        this.halo.data[i * 4 + 1] = Math.min(9, g * 5);
        this.halo.data[i * 4 + 2] = Math.min(9, b * 5);
        this.shade.data[i * 4 + 3] = this.halo.data[i * 4 + 3] = 255;
      }
    }
    this.skin.apply(f, this.shade, ambient + flash);
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
