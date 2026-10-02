import { M } from "../sim/materials.js";
export function buildMissileRange(world, id) {
  if (id !== "missiles") return false;
  const { width: w, height: h } = world;
  // Indestructible targets stay in place in every gravity orientation.
  const x = Math.floor(w * 0.78),
    y = Math.floor(h * 0.45);
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const i = world.index(x + dx, y + dy);
      if (i >= 0) world.set(i, M.Heater, 400);
    }
  for (let n = 0; n < 3; n++)
    world.missiles.spawn(w * 0.16, h * (0.27 + n * 0.18), 1, 0);
  return true;
}
