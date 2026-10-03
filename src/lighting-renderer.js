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
    if (
      this.world !== w ||
      this.width !== w.width ||
      this.height !== w.height ||
      this.bounces !== bounces ||
      ++this.frame % 2 === 0
    ) {
      this.field.update(w, bounces);
      this.world = w;
      this.width = w.width;
      this.height = w.height;
      this.bounces = bounces;
    }
    if (
      this.mask.width !== this.field.width ||
      this.mask.height !== this.field.height
    ) {
      this.mask.width = this.glow.width = this.field.width;
      this.mask.height = this.glow.height = this.field.height;
      this.shade = this.maskContext.createImageData(
        this.field.width,
        this.field.height,
      );
      this.halo = this.glowContext.createImageData(
        this.field.width,
        this.field.height,
      );
    }
    const ambient =
      w.canvasMode === "solar" ? w.environment.light : (w.ambientLight ?? 1);
    for (let i = 0; i < this.field.length; i++) {
      for (let c = 0; c < 3; c++) {
        const light = this.field.light[i * 3 + c];
        this.shade.data[i * 4 + c] = Math.min(1, ambient + light) * 255;
        this.halo.data[i * 4 + c] = Math.min(9, light * 5);
      }
      this.shade.data[i * 4 + 3] = this.halo.data[i * 4 + 3] = 255;
    }
    this.maskContext.putImageData(this.shade, 0, 0);
    this.glowContext.putImageData(this.halo, 0, 0);
  }
  draw(c, w, v) {
    c.save();
    c.beginPath();
    c.rect(v.x, v.y, w.width * v.scale, w.height * v.scale);
    c.clip();
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = "multiply";
    c.drawImage(this.mask, v.x, v.y, w.width * v.scale, w.height * v.scale);
    c.globalCompositeOperation = "screen";
    c.drawImage(this.glow, v.x, v.y, w.width * v.scale, w.height * v.scale);
    c.restore();
  }
}
