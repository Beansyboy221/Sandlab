import { M } from "../sim/materials.js";
import { painter } from "./painter.js";
export function buildExperiment(w, id) {
  const { put, rect, line, cup } = painter(w),
    W = w.width,
    H = w.height;
  const ground = Math.round(H * 0.82);
  if (
    ![
      "storm",
      "garden",
      "foundry",
      "phase",
      "acid",
      "firebreak",
      "absorption",
    ].includes(id)
  )
    return false;
  rect(0, ground, W, H - ground, "Wall");
  if (id === "garden") {
    for (let n = 0; n < 3; n++) {
      const x = Math.round(W * (0.1 + n * 0.28)),
        size = Math.round(W * 0.23);
      cup(x, ground - 12, size, 12);
      rect(x + 3, ground - 8, size - 6, 8, "Dirt");
      for (let yy = ground - 8; yy < ground; yy++)
        for (let xx = x + 3; xx < x + size - 3; xx++) {
          w.moisture[yy * W + xx] = 160;
          w.storedLiquid[yy * W + xx] = M.Water;
          w.storedAmount[yy * W + xx] = 2;
        }
      // Keep irrigation beside the bed: water underneath loose soil displaces it.
      rect(x + 3, ground - 8, 3, 8, "Water");
      for (let xx = x + 8; xx < x + size - 6; xx += 8)
        put(xx, ground - 9, "Seed");
    }
  } else if (id === "absorption") {
    for (let n = 0; n < 2; n++) {
      const x = Math.round(W * (0.12 + n * 0.44)),
        size = Math.round(W * 0.32),
        depth = Math.round(H * 0.24);
      cup(x, ground - depth, size, depth);
      rect(x + 3, ground - 14, size - 6, 14, n ? "Oil" : "Water");
      rect(
        x + Math.round(size * 0.35),
        ground - 20,
        Math.round(size * 0.3),
        20,
        "Sponge",
      );
    }
  } else if (id === "storm") {
    rect(W * 0.32, ground - 12, W * 0.36, 12, "Water");
    line(W * 0.5, ground, W * 0.5, H * 0.48, "Steel", 1);
    // A cold, moist cloud cap above warm rising air forms a mixed-phase storm.
    for (let yy = Math.round(H * 0.12); yy < H * 0.25; yy++)
      for (let xx = Math.round(W * 0.3); xx < W * 0.7; xx++) {
        const t = yy < H * 0.18 ? -15 : 8;
        const i = yy * W + xx;
        w.set(i, M.Cloud, t);
        // This example starts with a mature, charged mixed-phase core over the
        // rod; actual discharge still requires condensate and an updraft.
        if (Math.abs(xx - W * 0.5) < 3 && Math.abs(yy - H * 0.18) < 2)
          w.growth[i] = 119;
      }
    for (let yy = 0; yy < w.fields.height; yy++)
      for (let xx = 0; xx < w.fields.width; xx++) {
        const i = yy * w.fields.width + xx;
        if (xx * 4 > W * 0.3 && xx * 4 < W * 0.7) {
          w.fields.temperature[i] = yy * 4 < H * 0.18 ? -15 : 35;
          w.fields.airflow.velocityY[i] = yy * 4 < H * 0.4 ? -0.22 : 0;
        }
      }
    for (const x of [W * 0.18, W * 0.82]) {
      line(x, ground, x, H * 0.65, "Wood", 1);
      w.brush(x, H * 0.62, 8, M.Plant, "circle", true);
    }
  } else if (id === "foundry") {
    const x = Math.round(W * 0.18),
      y = Math.round(H * 0.48),
      size = Math.round(W * 0.3),
      height = ground - y;
    rect(x, y, 3, height, "Ceramic");
    rect(x + size, y, 3, height, "Ceramic");
    rect(x, y + height - 3, size + 3, 3, "Heater");
    rect(x + 3, y + height - 15, size - 3, 12, "Molten Steel");
    rect(x + 3, y + height - 22, size - 3, 7, "Molten Steel");
    for (let yy = y; yy < ground; yy++)
      for (let xx = x; xx <= x + size + 2; xx++)
        if (w.cells[yy * W + xx] === M.Ceramic) w.temp[yy * W + xx] = 1200;
    cup(W * 0.64, ground - 25, W * 0.22, 25);
    rect(W * 0.64 + 3, ground - 3, W * 0.22 - 6, 3, "Cooler");
    rect(W * 0.64 + 3, ground - 12, W * 0.22 - 6, 9, "Molten Steel");
  } else if (id === "phase") {
    const x = Math.round(W * 0.25),
      y = Math.round(H * 0.3),
      size = Math.round(W * 0.5),
      height = ground - y;
    cup(x, y, size, height);
    rect(x, y, size, 3, "Wall");
    rect(x + 3, ground - 15, size - 6, 15, "Water");
    rect(x + 3, ground - 3, 8, 3, "Heater");
    rect(x + size - 14, y + 3, 10, 3, "Cooler");
  } else if (id === "acid") {
    for (let n = 0; n < 2; n++) {
      const x = Math.round(W * (0.12 + n * 0.44)),
        size = Math.round(W * 0.32);
      cup(x, ground - 45, size, 45);
      rect(x + 3, ground - 30, size - 6, 30, n ? "Water" : "Acid");
      rect(x + size * 0.25, ground - 25, 5, 25, "Wood");
      rect(x + size * 0.7, ground - 25, 5, 25, "Ceramic");
    }
  } else {
    const left = Math.round(W * 0.12),
      right = Math.round(W * 0.88),
      mid = Math.round(W * 0.5);
    rect(left, ground - 5, right - left, 5, "Wood");
    rect(mid - 8, ground - 30, 16, 30, "Ceramic");
    line(left, ground - 6, left + 10, ground - 6, "Fire", 1);
  }
  return true;
}
