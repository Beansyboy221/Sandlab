import { materials } from "./sim/materials.js";
export class SelectionOverlay {
  draw(context, viewport, world, selection) {
    if (!selection?.visible) return;
    const previewing = selection.placing || selection.dragging;
    const box = previewing ? selection.preview : selection.box;
    if (!box) return;
    const { x, y, scale } = viewport;
    context.save();
    context.beginPath();
    context.rect(x, y, world.width * scale, world.height * scale);
    context.clip();
    if (previewing) {
      const clip = selection.dragging?.clip || selection.clipboard;
      if (this.clipboard !== clip) {
        this.clipboard = clip;
        this.canvas = document.createElement("canvas");
        this.canvas.width = clip.width;
        this.canvas.height = clip.height;
        const c = this.canvas.getContext("2d"),
          data = c.createImageData(clip.width, clip.height);
        for (let i = 0; i < clip.arrays.cells.length; i++)
          if (clip.arrays.cells[i]) {
            const color = materials[clip.arrays.cells[i]].color,
              o = i * 4;
            data.data[o] = parseInt(color.slice(1, 3), 16);
            data.data[o + 1] = parseInt(color.slice(3, 5), 16);
            data.data[o + 2] = parseInt(color.slice(5, 7), 16);
            data.data[o + 3] = 180;
          }
        c.putImageData(data, 0, 0);
      }
      context.drawImage(
        this.canvas,
        x + box.x * scale,
        y + box.y * scale,
        box.width * scale,
        box.height * scale,
      );
    } else {
      const mask = selection.mask;
      if (this.mask !== mask || this.maskRevision !== mask.revision) {
        this.mask = mask;
        this.maskRevision = mask.revision;
        this.maskCanvas ??= document.createElement("canvas");
        this.maskCanvas.width = mask.width;
        this.maskCanvas.height = mask.height;
        const c = this.maskCanvas.getContext("2d");
        const data = c.createImageData(mask.width, mask.height);
        for (let row = 0; row < mask.height; row++)
          for (let col = 0; col < mask.width; col++) {
            const i = row * mask.width + col;
            if (!mask.data[i]) continue;
            const edge =
              !col ||
              col === mask.width - 1 ||
              !row ||
              row === mask.height - 1 ||
              !mask.data[i - 1] ||
              !mask.data[i + 1] ||
              !mask.data[i - mask.width] ||
              !mask.data[i + mask.width];
            data.data[i * 4] = 152;
            data.data[i * 4 + 1] = 216;
            data.data[i * 4 + 2] = 239;
            data.data[i * 4 + 3] = edge ? 170 : 35;
          }
        c.putImageData(data, 0, 0);
      }
      context.drawImage(
        this.maskCanvas,
        x,
        y,
        world.width * scale,
        world.height * scale,
      );
    }
    if (previewing || selection.origin) {
      context.lineWidth = Math.max(1, window.devicePixelRatio || 1);
      context.strokeStyle =
        selection.dragging && selection.moveBlocked
          ? "#ef9292"
          : previewing
            ? "#f6d690"
            : "#98d8ef";
      context.fillStyle = previewing ? "#f6d6900a" : "#98d8ef12";
      context.setLineDash([5 * context.lineWidth, 3 * context.lineWidth]);
      context.fillRect(
        x + box.x * scale,
        y + box.y * scale,
        box.width * scale,
        box.height * scale,
      );
      context.strokeRect(
        x + box.x * scale,
        y + box.y * scale,
        box.width * scale,
        box.height * scale,
      );
    }
    context.restore();
  }
}
