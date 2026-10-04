// Grid-based devices remain ordinary registry entries for saves and simulation,
// while the browser separates constructed objects from substances.
export function isEntity(m) {
  return !!(m.actor || m.projectile || m.device || m.photoelectric);
}
export function entityCategory(m) {
  if (m.actor)
    return ["ai", "player"].includes(m.actor) ? "characters" : "creatures";
  if (m.projectile) return m.vehicle ? "vehicles" : "missiles";
  return "devices";
}
export const entityCategories = [
  "all",
  "characters",
  "creatures",
  "missiles",
  "vehicles",
  "devices",
];
export const entityLabels = {
  all: "All",
  characters: "Characters",
  creatures: "Wildlife",
  missiles: "Missiles",
  vehicles: "Vehicles",
  devices: "Electrical",
};
