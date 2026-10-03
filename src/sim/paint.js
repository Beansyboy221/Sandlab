import { brushFootprint, inBrushCircle } from "../brush-geometry.js";
// Colors are packed RGBA overlays. Foreground overlays travel with particles;
// background overlays belong to fixed canvas coordinates.
export const paintFields = ["pigment", "backgroundPaint"];
export function rgba(rgb, alpha = 1) {
  return (
    ((Math.round(Math.max(0, Math.min(1, alpha)) * 255) << 24) |
      (rgb & 0xffffff)) >>>
    0
  );
}
export function compositePaint(bottom, top) {
  const a = (top >>> 24) / 255,
    b = (bottom >>> 24) / 255;
  if (!a) return bottom;
  if (a === 1 || !b) return top;
  const opacity = a + b * (1 - a);
  let rgb = 0;
  for (const shift of [16, 8, 0]) {
    const channel = Math.round(
      (((top >>> shift) & 255) * a + ((bottom >>> shift) & 255) * b * (1 - a)) /
        opacity,
    );
    rgb |= channel << shift;
  }
  return rgba(rgb, opacity);
}
export function beginColorStroke(w) {
  w.paintStroke = (w.paintStroke + 1) >>> 0;
  if (!w.paintStroke) {
    w.paintMark.fill(0);
    w.backgroundMark.fill(0);
    w.paintStroke = 1;
  }
}
export function paintBrush(
  w,
  x,
  y,
  radius,
  shape,
  layer,
  color,
  opacity,
  erase = false,
) {
  if (
    ![x, y, radius, color, opacity].every(Number.isFinite) ||
    !["foreground", "background"].includes(layer)
  )
    return;
  if (radius < 0) return;
  const background = layer === "background",
    field = background ? w.backgroundPaint : w.pigment,
    marks = background ? w.backgroundMark : w.paintMark,
    overlay = rgba(color, opacity),
    cx = Math.round(x),
    cy = Math.round(y);
  if (!erase && !overlay) return;
  const footprint = brushFootprint(radius);
  for (let oy = footprint.low; oy <= footprint.high; oy++)
    for (let ox = footprint.low; ox <= footprint.high; ox++) {
      if (shape === "circle" && !inBrushCircle(footprint, ox, oy)) continue;
      const nx = cx + ox,
        ny = cy + oy;
      if (nx < 0 || nx >= w.width || ny < 0 || ny >= w.height) continue;
      const i = ny * w.width + nx;
      if (
        (!background && !w.cells[i]) ||
        (w.paintStroke && marks[i] === w.paintStroke)
      )
        continue;
      field[i] = erase ? 0 : compositePaint(field[i], overlay);
      marks[i] = w.paintStroke;
    }
}
