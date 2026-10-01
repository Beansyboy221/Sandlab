export const defaultLevel = Object.freeze({
  name: "Untitled canvas",
  border: "solid",
  background: "#111b20",
});
export const borderTypes = ["solid", "looping", "void"];
export function validateCanvasSize(width, height) {
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
    throw Error("Invalid canvas properties.");
  return {
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
  };
}
export function validateLevelProperties(value) {
  validateCanvasSize(value.width, value.height);
  return {
    ...validateLevelMetadata(value),
    width: value.width,
    height: value.height,
  };
}
export function applyLevelMetadata(world, metadata) {
  const values = validateLevelMetadata(metadata),
    changed = world.border !== values.border;
  Object.assign(world, values);
  world.fields.border = values.border;
  if (changed) world.motionStamp.fill(world.tick + 1);
}
