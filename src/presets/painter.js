import { M } from "../sim/materials.js";
export function painter(world) {
  const put = (x, y, name) => {
    x = Math.round(x);
    y = Math.round(y);
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      x < world.width &&
      y >= 0 &&
      y < world.height
    )
      world.set(y * world.width + x, M[name]);
  };
  const rect = (x, y, width, height, name) => {
    x = Math.round(x);
    y = Math.round(y);
    for (let yy = y; yy < y + Math.round(height); yy++)
      for (let xx = x; xx < x + Math.round(width); xx++) put(xx, yy, name);
  };
  const line = (x, y, xx, yy, name, r = 1) => {
    const n = Math.ceil(Math.max(Math.abs(xx - x), Math.abs(yy - y)));
    for (let k = 0; k <= n; k++) {
      const a = n ? k / n : 0;
      world.brush(
        x + (xx - x) * a,
        y + (yy - y) * a,
        r,
        M[name],
        "circle",
        true,
      );
    }
  };
  const cup = (x, y, width, height) => {
    rect(x, y, 3, height + 3, "Wall");
    rect(x + width - 3, y, 3, height + 3, "Wall");
    rect(x, y + height, width, 3, "Wall");
    rect(x, y + height + 3, width, 2, "Wall");
  };
  return { put, rect, line, cup };
}
