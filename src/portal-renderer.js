const pairColors = [
  [102, 221, 238],
  [246, 175, 92],
  [176, 149, 251],
  [143, 218, 134],
  [245, 144, 186],
  [139, 175, 251],
];
const unlinked = [139, 134, 163];
export const portalHandleRadius = (scale) =>
  Math.max(8, Math.min(13, scale * 2.5));

export function portalColor(portals, id) {
  const shape = portals.shapes.get(id);
  if (!shape?.link || !portals.shapes.has(shape.link)) return unlinked;
  return pairColors[
    Math.floor((Math.min(id, shape.link) - 1) / 2) % pairColors.length
  ];
}

export function drawPortalLinks(c, v, world, visible, drag) {
  if (!visible && !drag) return;
  const portals = world.portals;
  portals.ensure();
  c.save();
  c.lineWidth = Math.max(1, v.scale * 0.3);
  c.font = `${Math.max(11, Math.min(16, v.scale * 3))}px system-ui`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  let shown = 0;
  for (const shape of portals.shapes.values()) {
    if (++shown > 128) break;
    const rgb = portalColor(portals, shape.id),
      color = `rgb(${rgb.join(",")})`;
    const x = v.x + shape.x * v.scale,
      y = v.y + shape.y * v.scale;
    const other = portals.shapes.get(shape.link);
    if (other && shape.id < other.id) {
      c.strokeStyle = color;
      c.globalAlpha = 0.25;
      c.setLineDash([4 * v.scale, 3 * v.scale]);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(v.x + other.x * v.scale, v.y + other.y * v.scale);
      c.stroke();
    }
    c.setLineDash([]);
    c.globalAlpha = 1;
    c.fillStyle = "#111920dc";
    c.strokeStyle = color;
    const radius = portalHandleRadius(v.scale);
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = color;
    c.fillText(String(shape.id), x, y);
  }
  if (drag) {
    const source = portals.shapes.get(drag.source),
      target = portals.shapes.get(drag.target);
    if (source) {
      c.globalAlpha = 1;
      c.strokeStyle = target && target !== source ? "#a6e7bd" : "#e1d1ad";
      c.lineWidth = Math.max(2, v.scale * 0.6);
      c.setLineDash([5 * v.scale, 3 * v.scale]);
      c.beginPath();
      c.moveTo(v.x + source.x * v.scale, v.y + source.y * v.scale);
      c.lineTo(
        v.x + (target?.x ?? drag.point.x) * v.scale,
        v.y + (target?.y ?? drag.point.y) * v.scale,
      );
      c.stroke();
    }
  }
  c.restore();
}
