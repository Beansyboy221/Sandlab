import { M } from "../sim/materials.js";
import { rayHeading } from "../sim/energy.js";
export function buildDeviceLab(w, id) {
  if (!["logic", "machines"].includes(id)) return false;
  const gx = w.gravityX,
    gy = w.gravityY,
    across = gy ? w.width : w.height,
    down = gx ? w.width : w.height;
  const map = (u, v) => ({
    x: gy * u + gx * v + (gy < 0 || gx < 0 ? w.width - 1 : 0),
    y: -gx * u + gy * v + (gx > 0 || gy < 0 ? w.height - 1 : 0),
  });
  const heading = rayHeading(gy, -gx);
  const put = (u, v, name, facing = heading) => {
    const p = map(u, v),
      i = w.index(Math.round(p.x), Math.round(p.y));
    if (i < 0) return;
    w.set(i, M[name]);
    w.heading[i] = facing;
  };
  if (id === "logic") {
    // Three isolated circuits: AND, rising-edge toggle and a 12-tick delay.
    // Batteries are pulse sources through Copper's shared conductor cooldown.
    const start = Math.max(4, Math.floor(across * 0.28));
    for (const [n, name] of [
      "AND Gate",
      "Toggle Gate",
      "Delay Gate",
    ].entries()) {
      const row = Math.floor(down * (0.25 + n * 0.22));
      put(start, row, "Battery");
      for (let x = 1; x <= 3; x++) put(start + x, row, "Copper");
      put(start + 4, row, name);
      for (let x = 5; x <= 7; x++) put(start + x, row, "Copper");
      put(start + 8, row, "Signal Lamp");
      for (const x of [1, 2, 3, 5, 6, 7]) put(start + x, row + 1, "Wall");
      if (n === 0) {
        put(start + 4, row - 2, "Battery", rayHeading(gx, gy));
        put(start + 4, row - 1, "Copper");
      }
    }
  } else {
    const floor = Math.floor(down * 0.8);
    for (let u = 0; u < across; u++)
      for (let v = floor; v < floor + 3; v++) put(u, v, "Wall");
    for (let u = Math.floor(across * 0.6); u < Math.floor(across * 0.68); u++)
      put(u, floor - 1, "Wall");
    for (const [u, v, name] of [
      [across * 0.25, down * 0.4, "Drone"],
      [across * 0.2, floor - 7, "Rover"],
    ]) {
      const p = map(u, v);
      w.missiles.spawn(p.x, p.y, gy, -gx, M[name]);
    }
  }
  return true;
}
