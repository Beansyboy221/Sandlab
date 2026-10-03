// Engine radius is the half-span between outer cell centers. UI size is the
// full pixel diameter. Even diameters center between cells; odd sizes on one.
export const brushDiameter = (radius) =>
  Math.max(1, Math.round(radius * 2 + 1));
export const brushRadius = (diameter) =>
  (Math.max(1, Math.round(diameter)) - 1) / 2;
const footprints = [];
export function brushFootprint(radius) {
  const diameter = brushDiameter(radius);
  if (footprints[diameter]) return footprints[diameter];
  const low = -Math.floor((diameter - 1) / 2),
    high = low + diameter - 1,
    center = (low + high) / 2;
  const footprint = Object.freeze({
    diameter,
    low,
    high,
    center,
    circleSquared: ((diameter - 1) / 2) ** 2 + (diameter % 2 ? 0 : 0.25),
  });
  // Normal UI footprints are reused; oversized scripted stamps don't grow a cache.
  if (diameter <= 61) footprints[diameter] = footprint;
  return footprint;
}
export function inBrushCircle(footprint, x, y) {
  x -= footprint.center;
  y -= footprint.center;
  return x * x + y * y <= footprint.circleSquared;
}
