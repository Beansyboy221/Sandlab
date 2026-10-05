import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
export function dropScene(gx = 0, gy = 1) {
  const w = new World(128, 128);
  w.setGravity(gx, gy);
  const index = (u, v) => {
    const x = gy * u + gx * v + (gy < 0 || gx < 0 ? 127 : 0),
      y = -gx * u + gy * v + (gx > 0 || gy < 0 ? 127 : 0);
    return y * 128 + x;
  };
  for (let x = 0; x < 128; x++) w.set(index(x, 105), M.Wall);
  for (let y = 76; y < 105; y++)
    for (let x = 14; x < 114; x++) w.set(index(x, y), M.Ash);
  for (let y = 35; y <= 51; y++) {
    const half = Math.floor((51 - y) / 2);
    for (let x = 64 - half; x <= 64 + half; x++) w.set(index(x, y), M.Steel);
  }
  return w;
}
export function throwScene() {
  const w = new World(128, 112);
  for (let x = 0; x < 128; x++) w.set(96 * 128 + x, M.Wall);
  for (let y = 20; y < 96; y++) w.set(y * 128 + 78, M.Wood);
  for (const x of [77, 79])
    for (let n = 0; n < 7; n++)
      for (const y of [20 + n, 89 + n]) w.set(y * 128 + x, M.Wall);
  for (let x = 27; x <= 43; x++) {
    const half = Math.floor((43 - x) / 2);
    for (let y = 48 - half; y <= 48 + half; y++) w.set(y * 128 + x, M.Steel);
  }
  w.environment.sample = () => {
    w.environment.x = w.environment.y = 0;
  };
  return w;
}
