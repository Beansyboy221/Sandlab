// A bounded artistic subsurface layer affects only occupied opaque pixels;
// it never becomes a light source or leaks irradiance through a wall.
export class LightSkin {
  apply(field, shade, ambient) {
    if (!field.opaqueCount) return;
    const data = shade.data,
      width = field.worldWidth,
      height = field.worldHeight;
    if (!this.scratch || this.scratch.length !== data.length)
      this.scratch = new Uint8ClampedArray(data.length);
    const base = Math.round(Math.min(1, ambient) * 255),
      bias = base * 0.6;
    for (let pass = 0; pass < 2; pass++) {
      this.scratch.set(data);
      for (let n = 0; n < field.opaqueCount; n++) {
        const i = field.opaqueIndices[n];
        const x = i % width,
          y = Math.floor(i / width);
        const offset = i * 4;
        let r = data[offset],
          g = data[offset + 1],
          b = data[offset + 2];
        if (r === 255 && g === 255 && b === 255) continue;
        for (let d = 0; d < 4; d++) {
          const xx = x + (d === 0 ? -1 : d === 1 ? 1 : 0),
            yy = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = (yy * width + xx) * 4,
            nr = bias + data[j] * 0.4,
            ng = bias + data[j + 1] * 0.4,
            nb = bias + data[j + 2] * 0.4;
          if (nr > r) r = nr;
          if (ng > g) g = ng;
          if (nb > b) b = nb;
        }
        this.scratch[offset] = r;
        this.scratch[offset + 1] = g;
        this.scratch[offset + 2] = b;
      }
      data.set(this.scratch);
    }
  }
}
