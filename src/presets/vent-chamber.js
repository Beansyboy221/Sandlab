import { M } from "../sim/materials.js";
// A supported burning bed and one-pixel outlet make pressure-driven flow visible.
export function buildVentChamber(w) {
  const cw = Math.min(60, w.width - 6),
    ch = Math.min(40, w.height - 6);
  const left = Math.floor((w.width - cw) * 0.4),
    top = Math.floor((w.height - ch) * 0.5);
  const right = left + cw - 1,
    bottom = top + ch - 1;
  const vent = top + 2;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const i = y * w.width + x;
      if (
        (x === left || x === right || y === top || y === bottom) &&
        !(x === right && y === vent)
      )
        w.set(i, M.Wall);
      else if (
        y >= bottom - Math.min(6, Math.floor(ch / 5)) &&
        y < bottom &&
        x > left + 3 &&
        x < right - 3
      ) {
        w.set(i, M.Coal);
        w.life[i] = 450;
        w.temp[i] = 650;
      }
    }
}
