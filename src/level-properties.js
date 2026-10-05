import { canvasModes } from "./sim/canvas-modes.js";
import {
  CELL_METERS,
  validateScale,
  validateGridSize,
} from "./sim/world-units.js";
import {
  defaultMechanics,
  validateMechanics,
} from "./sim/mechanics-options.js";
export const defaultLevel = Object.freeze({
  name: "Untitled world",
  border: "solid",
  background: "#111b20",
  ambientLight: 1,
  canvasMode: "normal",
  modeStrength: 1,
  metersPerPixel: CELL_METERS,
  viewOriginX: 0,
  viewOriginY: 0,
  simulationSpeed: 1,
  mechanics: Object.freeze({ ...defaultMechanics }),
});
export const borderTypes = ["solid", "looping", "void"];
export function validateCanvasSize(
  width,
  height,
  metersPerPixel = CELL_METERS,
) {
  if (metersPerPixel !== CELL_METERS) {
    validateGridSize(width, height, metersPerPixel);
    return;
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 8 ||
    height < 8 ||
    width > 512 ||
    height > 512 ||
    width * height > 200000
  )
    throw Error("Choose 8–512 pixels per axis, up to 200,000 pixels in total.");
}
export function validateLevelMetadata(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 120 ||
    !borderTypes.includes(value.border) ||
    typeof value.background !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(value.background)
  )
    throw Error("Invalid world properties.");
  const ambientLight =
    value.ambientLight === undefined
      ? defaultLevel.ambientLight
      : value.ambientLight;
  if (
    typeof ambientLight !== "number" ||
    !Number.isFinite(ambientLight) ||
    ambientLight < 0 ||
    ambientLight > 1
  )
    throw Error("Choose an ambient light level between 0% and 100%.");
  const canvasMode =
      value.canvasMode === undefined ? "normal" : value.canvasMode,
    modeStrength = value.modeStrength === undefined ? 1 : value.modeStrength;
  if (
    !canvasModes.some(([id]) => id === canvasMode) ||
    !Number.isFinite(modeStrength) ||
    modeStrength < 0 ||
    modeStrength > 2
  )
    throw Error("Invalid canvas mode or strength.");
  return {
    viewOriginX: validateOrigin(value.viewOriginX),
    viewOriginY: validateOrigin(value.viewOriginY),
    metersPerPixel: validateScale(value.metersPerPixel),
    simulationSpeed: validateSimulationSpeed(value.simulationSpeed),
    mechanics: validateMechanics(value.mechanics),
    canvasMode,
    modeStrength,
    ambientLight,
    name: value.name.trim(),
    border: value.border,
    background: value.background.toLowerCase(),
  };
}
export function levelProperties(world) {
  return {
    name: world.name,
    width: world.width,
    height: world.height,
    border: world.border,
    background: world.background,
    ambientLight: world.ambientLight,
    canvasMode: world.canvasMode,
    modeStrength: world.modeStrength,
    metersPerPixel: world.metersPerPixel,
    viewOriginX: world.viewOriginX,
    viewOriginY: world.viewOriginY,
    simulationSpeed: world.simulationSpeed,
    mechanics: { ...world.mechanics },
  };
}
export function validateLevelProperties(value) {
  validateCanvasSize(value.width, value.height, value.metersPerPixel);
  return {
    ...validateLevelMetadata(value),
    width: value.width,
    height: value.height,
  };
}
export function applyLevelMetadata(world, metadata) {
  const values = validateLevelMetadata(metadata),
    changed =
      world.border !== values.border ||
      world.canvasMode !== values.canvasMode ||
      world.modeStrength !== values.modeStrength;
  const oldMode = world.canvasMode;
  Object.assign(world, values);
  if (oldMode === "solar" && values.canvasMode !== "solar")
    world.fields.ambientTemperature = 20;
  if (world.environment) {
    world.environment.world = world;
    world.environment.update();
    if (oldMode !== values.canvasMode && values.canvasMode === "planet")
      for (let i = 0; i < world.length; i++) world.environment.seed(i);
  }
  world.fields.border = values.border;
  world.fields.configure(world.mechanics);
  if (changed) world.motionStamp.fill(world.tick + 1);
}

export function validateSimulationSpeed(value = 1) {
  if (![0.25, 0.5, 1].includes(value))
    throw Error("Invalid world playback speed.");
  return value;
}

function validateOrigin(value = 0) {
  if (!Number.isFinite(value) || Math.abs(value) > 1e5)
    throw Error("Invalid viewport position.");
  return value;
}
