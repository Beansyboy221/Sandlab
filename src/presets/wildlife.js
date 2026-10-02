import { M } from "../sim/materials.js";
export function buildWildlife(world, id) {
  if (id !== "wildlife") return false;
  const { width: w, height: h, gravityX: gx, gravityY: gy } = world;
  const across = gy ? w : h,
    down = gx ? w : h;
  const map = (u, v) => ({
    x: gy * u + gx * v + (gy < 0 || gx < 0 ? w - 1 : 0),
    y: -gx * u + gy * v + (gx > 0 || gy < 0 ? h - 1 : 0),
  });
  const put = (u, v, id) => {
    const p = map(u, v),
      i = world.index(Math.round(p.x), Math.round(p.y));
    if (i >= 0) world.set(i, id);
  };
  const floor = Math.floor(down * 0.74),
    left = Math.floor(across * 0.58),
    right = Math.floor(across * 0.96);
  for (let u = 0; u < across; u++)
    for (let v = down - 3; v < down; v++) put(u, v, M.Wall);
  for (let u = 0; u <= left; u++)
    for (let v = floor; v < down - 3; v++) put(u, v, M.Wall);
  for (let v = Math.floor(down * 0.54); v < down - 3; v++)
    for (let b = 0; b < 3; b++) {
      put(left + b, v, M.Wall);
      put(right + b, v, M.Wall);
    }
  for (let u = left + 3; u < right; u++)
    for (let v = Math.floor(down * 0.6); v < down - 3; v++) put(u, v, M.Water);
  if (across >= 90 && down >= 45) {
    for (const [u, v, m] of [
      [across * 0.16, floor - 1, M.Cat],
      [across * 0.37, floor - 1, M.Rabbit],
      [across * 0.76, down * 0.75, M.Fish],
      [across * 0.44, down * 0.28, M.Bird],
    ]) {
      const p = map(u, v);
      world.stickmen.spawn(p.x, p.y, m);
    }
  }
  return true;
}
