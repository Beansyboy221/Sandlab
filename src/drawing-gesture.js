import { brushFootprint } from "./brush-geometry.js";
// Geometry is shared by the preview and the committed stroke.
export function gesturePath(context, gesture) {
  const { start: a, end: b, kind } = gesture;
  context.beginPath();
  if (kind === "line") {
    context.moveTo(a.x + 0.5, a.y + 0.5);
    context.lineTo(b.x + 0.5, b.y + 0.5);
  } else if (kind === "square")
    context.rect(
      Math.min(a.x, b.x) + 0.5,
      Math.min(a.y, b.y) + 0.5,
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y),
    );
  else
    context.arc(
      a.x + 0.5,
      a.y + 0.5,
      Math.hypot(b.x - a.x, b.y - a.y),
      0,
      Math.PI * 2,
    );
}
export function stampGesture(gesture, radius, stamp) {
  const { start: a, end: b, kind } = gesture;
  const spacing = Math.max(1, radius * 0.5);
  function line(x1, y1, x2, y2) {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / spacing));
    for (let i = 0; i <= n; i++)
      stamp(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n);
  }
  if (kind === "line") line(a.x, a.y, b.x, b.y);
  else if (kind === "square") {
    line(a.x, a.y, b.x, a.y);
    line(b.x, a.y, b.x, b.y);
    line(b.x, b.y, a.x, b.y);
    line(a.x, b.y, a.x, a.y);
  } else {
    const r = Math.hypot(b.x - a.x, b.y - a.y),
      n = Math.max(12, Math.ceil((2 * Math.PI * r) / spacing));
    for (let i = 0; i < n; i++) {
      const angle = (i * 2 * Math.PI) / n;
      stamp(a.x + Math.cos(angle) * r, a.y + Math.sin(angle) * r);
    }
  }
}
export function drawGesturePreview(context, viewport, world, gesture) {
  if (!gesture) return;
  context.save();
  context.beginPath();
  context.rect(
    viewport.x,
    viewport.y,
    world.width * viewport.scale,
    world.height * viewport.scale,
  );
  context.clip();
  context.translate(viewport.x, viewport.y);
  context.scale(viewport.scale, viewport.scale);
  const footprint = brushFootprint(gesture.radius);
  context.translate(footprint.center, footprint.center);
  gesturePath(context, gesture);
  context.strokeStyle = gesture.erase ? "#ef929288" : "#f6e3bd88";
  context.lineWidth = footprint.diameter;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
  context.restore();
}
