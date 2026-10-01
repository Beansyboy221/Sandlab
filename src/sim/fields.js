// Pressure lives on a coarse grid: diffusion stays inexpensive regardless of particle count.
export class Fields {
  constructor(width, height) {
    this.scale = 4;
    this.width = Math.ceil(width / 4);
    this.height = Math.ceil(height / 4);
    this.pressure = new Float32Array(this.width * this.height);
    this.next = new Float32Array(this.pressure.length);
  }
  index(x, y) {
    return (y >> 2) * this.width + (x >> 2);
  }
  add(x, y, value) {
    if (
      !Number.isFinite(value) ||
      x < 0 ||
      y < 0 ||
      x >= this.width * 4 ||
      y >= this.height * 4
    )
      return;
    const i = this.index(x, y);
    this.pressure[i] = Math.max(-80, Math.min(80, this.pressure[i] + value));
  }
  update() {
    const { width: w, height: h, pressure: p, next: n } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        n[i] =
          (p[i] * 0.56 +
            ((x ? p[i - 1] : 0) +
              (x < w - 1 ? p[i + 1] : 0) +
              (y ? p[i - w] : 0) +
              (y < h - 1 ? p[i + w] : 0)) *
              0.105) *
          0.95;
      }
    this.pressure = n;
    this.next = p;
  }
  clear() {
    this.pressure.fill(0);
    this.next.fill(0);
  }
}
