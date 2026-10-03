// Exact particle-grid visibility, shared by shadow edges and image reconstruction.
export function traceParticles(f, sx, sy, tx, ty, surfaceTile = false) {
  let x = Math.floor(sx),
    y = Math.floor(sy);
  const endX = Math.floor(tx),
    endY = Math.floor(ty);
  if (x === endX && y === endY) return 1;
  const left = Math.min(x, endX),
    right = Math.max(x, endX) + 1;
  const top = Math.min(y, endY),
    bottom = Math.max(y, endY) + 1;
  if (
    left >= 0 &&
    top >= 0 &&
    right <= f.worldWidth &&
    bottom <= f.worldHeight
  ) {
    const stride = f.worldWidth + 1,
      p = f.occluders;
    if (
      p[bottom * stride + right] -
        p[top * stride + right] -
        p[bottom * stride + left] +
        p[top * stride + left] ===
      (f.transmission[y * f.worldWidth + x] < 1 ? 1 : 0) +
        (f.transmission[endY * f.worldWidth + endX] < 1 ? 1 : 0)
    )
      return 1;
  }
  const dx = tx - sx,
    dy = ty - sy;
  const stepX = dx > 0 ? 1 : -1,
    stepY = dy > 0 ? 1 : -1;
  const deltaX = dx ? Math.abs(1 / dx) : Infinity;
  const deltaY = dy ? Math.abs(1 / dy) : Infinity;
  let nextX = dx ? (stepX > 0 ? x + 1 - sx : sx - x) * deltaX : Infinity;
  let nextY = dy ? (stepY > 0 ? y + 1 - sy : sy - y) * deltaY : Infinity;
  let visible = 1;
  // Grid DDA visits each crossed pixel once, with no allocations or recursion.
  while (x !== endX || y !== endY) {
    // An endpoint on a grid corner belongs to the destination cell. Never
    // step beyond it (negative-direction rays can otherwise overshoot).
    if (Math.min(nextX, nextY) >= 1 - 1e-10) break;
    if (Math.abs(nextX - nextY) < 1e-10) {
      const a = f.particleIndex(x + stepX, y),
        b = f.particleIndex(x, y + stepY);
      if (a >= 0 && b >= 0 && !f.transmission[a] && !f.transmission[b])
        return 0;
      x += stepX;
      y += stepY;
      nextX += deltaX;
      nextY += deltaY;
    } else if (nextX < nextY) {
      x += stepX;
      nextX += deltaX;
    } else {
      y += stepY;
      nextY += deltaY;
    }
    // A surface receives light, but the ray never goes through it.
    if (x === endX && y === endY) break;
    const i = f.particleIndex(x, y);
    if (i < 0) return 0;
    if (
      !f.transmission[i] &&
      surfaceTile &&
      Math.floor(x / f.cellSize) === Math.floor(endX / f.cellSize) &&
      Math.floor(y / f.cellSize) === Math.floor(endY / f.cellSize)
    )
      return visible;
    visible *= f.transmission[i];
    if (visible < 0.01) return 0;
  }
  return visible;
}
