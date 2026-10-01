import { M, materials } from "./sim/materials.js";
export class Bloom {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
  }
  draw(context, world, viewport, pixels, intensity = 1) {
    const width = Math.ceil(world.width / 2),
      height = Math.ceil(world.height / 2);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.image = this.ctx.createImageData(width, height);
      this.scratch = new Float32Array(width * height * 3);
      this.source = new Float32Array(width * height * 3);
    }
    const source = this.source,
      scratch = this.scratch,
      out = this.image.data;
    source.fill(0);
    let emitting = false;
    for (let i = 0; i < world.length; i++) {
      const id = world.cells[i];
      if (!id) continue;
      const energy =
        id === M.Fire ||
        id === M.Lightning ||
        id === M.Plasma ||
        id === M.Spark ||
        world.charge[i];
      const strength = energy
        ? 1
        : materials[id].burn && world.life[i]
          ? 0.6
          : Math.min(0.8, Math.max(0, (world.temp[i] - 500) / 1000));
      if (!strength) continue;
      emitting = true;
      const target =
        ((((i / world.width) | 0) >> 1) * width + ((i % world.width) >> 1)) * 3;
      for (let c = 0; c < 3; c++)
        source[target + c] += pixels[i * 4 + c] * strength * 0.4 * intensity;
    }
    if (!emitting) return;
    // Two small separable kernels, independent of browser canvas-filter support.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let d = -2; d <= 2; d++)
            sum +=
              source[
                (y * width + Math.max(0, Math.min(width - 1, x + d))) * 3 + c
              ] * (d === 0 ? 6 : Math.abs(d) === 1 ? 4 : 1);
          scratch[(y * width + x) * 3 + c] = sum / 16;
        }
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let d = -2; d <= 2; d++)
            sum +=
              scratch[
                (Math.max(0, Math.min(height - 1, y + d)) * width + x) * 3 + c
              ] * (d === 0 ? 6 : Math.abs(d) === 1 ? 4 : 1);
          out[o + c] = sum / 12;
        }
        out[o + 3] = 255;
      }
    this.ctx.putImageData(this.image, 0, 0);
    context.save();
    context.globalCompositeOperation = "screen";
    context.imageSmoothingEnabled = true;
    context.drawImage(
      this.canvas,
      viewport.x,
      viewport.y,
      world.width * viewport.scale,
      world.height * viewport.scale,
    );
    context.restore();
  }
}
