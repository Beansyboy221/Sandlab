// Bilinear irradiance stencils depend on silhouettes, not flame brightness.
// Cache them by dirty 16-pixel regions; smoke transport belongs to the optical
// field, so moving transparent particles never rebuild these short edge rays.
export class LightReconstruction {
  prepare(f) {
    if (this.field !== f || this.silhouette !== f.silhouette) {
      this.field = f;
      this.silhouette = f.silhouette;
      this.indices = new Uint32Array(f.worldWidth * f.worldHeight * 4);
      this.weights = new Float32Array(this.indices.length);
      f.dirtySilhouette.fill(1);
    }
    this.work = 0;
    const size = f.cellSize,
      width = f.worldWidth,
      height = f.worldHeight;
    for (let chunk = 0; chunk < f.dirtySilhouette.length; chunk++) {
      if (!f.dirtySilhouette[chunk]) continue;
      f.dirtySilhouette[chunk] = 0;
      const left = (chunk % f.silhouetteColumns) * 16,
        top = Math.floor(chunk / f.silhouetteColumns) * 16;
      for (let y = top; y < Math.min(height, top + 16); y++) {
        const gy = (y + 0.5) / size - 0.5,
          y0 = Math.floor(gy),
          fy = gy - y0;
        for (let x = left; x < Math.min(width, left + 16); x++) {
          this.work++;
          const gx = (x + 0.5) / size - 0.5,
            x0 = Math.floor(gx),
            fx = gx - x0;
          const i = y * width + x,
            offset = i * 4;
          let total = 0;
          for (let n = 0; n < 4; n++) {
            const xx = Math.max(0, Math.min(f.width - 1, x0 + (n & 1))),
              yy = Math.max(0, Math.min(f.height - 1, y0 + (n >> 1))),
              sx = Math.min(width - 0.5, (xx + 0.5) * size),
              sy = Math.min(height - 0.5, (yy + 0.5) * size),
              sample = Math.floor(sy) * width + Math.floor(sx);
            this.indices[offset + n] = (yy * f.width + xx) * 3;
            const visible =
              f.silhouette[sample] && !f.silhouette[i]
                ? 0
                : f.trace(sx, sy, x + 0.5, y + 0.5, false, true);
            const weight =
              visible * (n & 1 ? fx : 1 - fx) * (n >> 1 ? fy : 1 - fy);
            this.weights[offset + n] = weight;
            total += weight;
          }
          if (total)
            for (let n = 0; n < 4; n++) this.weights[offset + n] /= total;
        }
      }
    }
  }
}
