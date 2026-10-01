import { M } from "../sim/materials.js";
import { painter } from "./painter.js";
export function buildMaterialLab(w, id) {
  if (id !== "reactions" && id !== "pottery") return false;
  const { rect, put } = painter(w),
    W = w.width,
    H = w.height;
  const ground = Math.round(H * 0.82);
  rect(0, ground, W, H - ground, "Stone");
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
        rect(x + 3, ground - 13, size - 6, 13, "Vinegar");
        rect(x + 7, ground - 16, size - 14, 3, "Baking soda");
      } else {
        rect(x + 3, ground - 12, size - 6, 12, "Vinegar");
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
      rect(
        left,
        ground - 11,
        Math.max(3, Math.round((size - 24) / 5)),
        1,
        "Wet clay",
      );
    }
    // Kiln starts warm, rather than allowing the liquid clay to level before firing.
    for (let i = 0; i < w.length; i++)
      if (w.cells[i] === M["Wet clay"]) w.temp[i] = 130;
  }
  return true;
}
