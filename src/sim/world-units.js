// One active grid cell is one displayed viewport pixel. Spatial pitch changes
// with zoom; the solver tick stays fixed and mass follows physical pixel area.
export const CELL_METERS = 0.125;
export const SLICE_DEPTH_METERS = 1;
export const MASS_UNIT_KG = 1000 * CELL_METERS ** 2 * SLICE_DEPTH_METERS;
export const MAX_GRID_AXIS = 512;
export const MAX_GRID_CELLS = 200000;

export function validateScale(value = CELL_METERS) {
  const level = Math.log2(value / CELL_METERS);
  if (
    !Number.isFinite(value) ||
    value < 0.03125 ||
    value > 8 ||
    Math.abs(level - Math.round(level)) > 1e-8
  )
    throw Error("Choose a zoom level from 1.5625% to 400%.");
  return value;
}
export const distanceRatio = (world) =>
  CELL_METERS / (world.metersPerPixel ?? CELL_METERS);

export function validateGridSize(width, height, metersPerPixel = CELL_METERS) {
  validateScale(metersPerPixel);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 8 ||
    height < 8 ||
    width > MAX_GRID_AXIS ||
    height > MAX_GRID_AXIS ||
    width * height > MAX_GRID_CELLS
  )
    throw Error(
      "This world exceeds the simulation budget. Reduce viewport size (up to 512 pixels per axis and 200,000 total).",
    );
}

export const pixelMassKg = (density, metersPerPixel) =>
  density * 1000 * validateScale(metersPerPixel) ** 2 * SLICE_DEPTH_METERS;
