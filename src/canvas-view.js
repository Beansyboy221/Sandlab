const turns = (value) => ((Math.round(value) % 4) + 4) % 4;
export function orientationTurn(angle) {
  return turns(-angle / 90);
}
export function gravityForTurn(turn) {
  return [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ][turns(turn)];
}
export function canvasResolutionLimit(width, height) {
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return Math.max(
    8,
    Math.floor(Math.min(512 / ratio, Math.sqrt(200000 / ratio))),
  );
}
// Only resolution is chosen. Shape always comes from the available drawing area.
export function fittedCanvasSize(shortSide, width, height, turn = 0) {
  if (turns(turn) % 2) [width, height] = [height, width];
  const short = Math.max(
      8,
      Math.min(canvasResolutionLimit(width, height), Math.round(shortSide)),
    ),
    ratio = Math.max(width, height) / Math.max(1, Math.min(width, height)),
    long = Math.min(512, Math.floor(200000 / short), Math.round(short * ratio));
  return width >= height
    ? { width: long, height: short }
    : { width: short, height: long };
}
// The physical world keeps its coordinate system when a phone rotates. This
// presentation transform counters browser rotation; gravity follows screen-down.
export function canvasView(
  width,
  height,
  worldWidth,
  worldHeight,
  turn,
  zoom,
  center,
  fill = "stretch",
) {
  turn = turns(turn);
  const virtualWidth = turn % 2 ? height : width,
    virtualHeight = turn % 2 ? width : height,
    base = Math.min(virtualWidth / worldWidth, virtualHeight / worldHeight),
    fit = fill === "fit",
    sx = fit ? 1 : virtualWidth / (worldWidth * base),
    sy = fit ? 1 : virtualHeight / (worldHeight * base),
    dx = fit ? (virtualWidth - worldWidth * base) / 2 : 0,
    dy = fit ? (virtualHeight - worldHeight * base) / 2 : 0,
    matrix =
      turn === 0
        ? [sx, 0, 0, sy, dx, dy]
        : turn === 1
          ? [0, sx, -sy, 0, width - dy, dx]
          : turn === 2
            ? [-sx, 0, 0, -sy, width - dx, height - dy]
            : [0, -sx, sy, 0, dy, height - dx];
  return {
    matrix,
    baseWidth: worldWidth * base,
    baseHeight: worldHeight * base,
    viewport: {
      x: (worldWidth * base) / 2 - center.x * base * zoom,
      y: (worldHeight * base) / 2 - center.y * base * zoom,
      scale: base * zoom,
    },
  };
}
export function transformPoint(matrix, x, y) {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
export function inversePoint(matrix, x, y, vector = false) {
  const [a, b, c, d, e, f] = matrix,
    determinant = a * d - b * c;
  if (!vector) {
    x -= e;
    y -= f;
  }
  return { x: (d * x - c * y) / determinant, y: (a * y - b * x) / determinant };
}
