import { M } from "../sim/materials.js";
import { painter } from "./painter.js";
export function buildMaterialLab(w, id) {
  if (id !== "reactions" && id !== "pottery") return false;
  const { rect, put } = painter(w),
    W = w.width,
    H = w.height;
  const ground = Math.round(H * 0.82);
  rect(0, ground, W, H - ground, "Wall");
  if (id === "reactions") {
    const size = Math.round(W * 0.23),
      depth = Math.round(H * 0.24);
    for (let n = 0; n < 3; n++) {
      const x = Math.round(W * (0.08 + n * 0.3)),
        top = ground - depth;
      rect(x, top, 3, depth + 3, "Ceramic");
      rect(x + size - 3, top, 3, depth + 3, "Ceramic");
      rect(x, ground, size, 3, "Ceramic");
      if (n === 0) {
        rect(x + 3, ground - 14, size - 6, 14, "Water");
        put(x + Math.round(size * 0.5), ground - 15, "Sodium");
      } else if (n === 1) {
        rect(x + 3, ground - 13, size - 6, 13, "Acid");
        rect(x + 7, ground - 16, size - 14, 3, "Baking soda");
      } else {
        rect(x + 3, ground - 12, size - 6, 12, "Acid");
        rect(
          x + Math.round(size * 0.4),
          ground - 20,
          Math.max(3, Math.round(size * 0.2)),
          20,
          "Rust",
        );
      }
    }
  } else {
    const x = Math.round(W * 0.17),
      size = Math.round(W * 0.66),
      depth = Math.round(H * 0.22);
    rect(x, ground - depth, 3, depth + 3, "Ceramic");
    rect(x + size - 3, ground - depth, 3, depth + 3, "Ceramic");
    rect(x, ground, size, 3, "Ceramic");
    rect(x + 3, ground - 3, size - 6, 3, "Heater");
    for (let n = 0; n < 5; n++) {
      const left = x + 7 + n * Math.round((size - 14) / 5);
      rect(
        left,
        ground - 10,
        Math.max(3, Math.round((size - 24) / 5)),
        7,
        "Clay",
      );
      // Spaced wet patches leave steam escape channels during the drying stage.
      for (let dx = 0; dx < Math.max(3, Math.round((size - 24) / 5)); dx += 4)
        put(left + dx, ground - depth + 4, "Wet clay");
    }
    // A preheated chamber warms the complete slab before the lower heater fires
    // it. Cold dry clay otherwise pulls its wet surface below the drying point.
    for (let yy = ground - depth; yy < ground; yy++)
      for (let xx = x + 3; xx < x + size - 3; xx++) {
        const i = yy * W + xx;
        if (w.cells[i] === M.Clay || w.cells[i] === M["Wet clay"])
          w.temp[i] = 130;
        w.fields.temperature[w.fields.index(xx, yy)] = 130;
      }
  }
  return true;
}
