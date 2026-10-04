import { materials, M } from "./materials.js";
export const AIR_DAMPING = 0.945;
export const absorption = Float32Array.from(materials, (m) =>
  m.id === M.Sponge
    ? 0.45
    : m.category === "powder"
      ? 0.08
      : m.category === "liquid"
        ? 0.025
        : 0.012,
);
