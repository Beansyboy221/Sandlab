// One byte of selection per cell; independent of particle state and undo history.
export class SelectionMask {
  constructor(world) {
    this.revision = 0;
    this.resize(world);
  }
  resize(world) {
    this.width = world.width;
    this.height = world.height;
    this.data = new Uint8Array(this.width * this.height);
    this.count = 0;
    this.box = null;
    this.revision = (this.revision || 0) + 1;
  }
  clear() {
    this.data.fill(0);
    this.count = 0;
    this.box = null;
    this.revision++;
  }
  rectangle(box) {
    this.clear();
    for (let y = box.y; y < box.y + box.height; y++)
      this.data.fill(
        1,
        y * this.width + box.x,
        y * this.width + box.x + box.width,
      );
    this.count = box.width * box.height;
    this.box = box;
  }
  stroke(a, b, radius, erase = false) {
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
    let changed = false;
    for (let step = 0; step <= steps; step++) {
      const cx = Math.floor(a.x + ((b.x - a.x) * step) / steps);
      const cy = Math.floor(a.y + ((b.y - a.y) * step) / steps);
      for (
        let y = Math.max(0, cy - radius);
        y <= Math.min(this.height - 1, cy + radius);
        y++
      )
        for (
          let x = Math.max(0, cx - radius);
          x <= Math.min(this.width - 1, cx + radius);
          x++
        ) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
          const i = y * this.width + x,
            value = erase ? 0 : 1;
          if (this.data[i] === value) continue;
          this.data[i] = value;
          this.count += erase ? -1 : 1;
          changed = true;
        }
    }
    if (changed) {
      this.measure();
      this.revision++;
    }
  }
  measure() {
    if (!this.count) {
      this.box = null;
      return;
    }
    let left = this.width,
      top = this.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.data[y * this.width + x]) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = y;
        }
    this.box = {
      x: left,
      y: top,
      width: right - left + 1,
      height: bottom - top + 1,
    };
  }
  place(clipboard, x, y) {
    this.clear();
    for (let row = 0; row < clipboard.height; row++)
      for (let col = 0; col < clipboard.width; col++) {
        const nx = x + col,
          ny = y + row;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        if (clipboard.mask && !clipboard.mask[row * clipboard.width + col])
          continue;
        this.data[ny * this.width + nx] = 1;
        this.count++;
      }
    this.measure();
  }
}
