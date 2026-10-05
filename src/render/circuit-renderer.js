import { circuitOutput } from "../sim/circuits.js";
import { materials } from "../sim/materials.js";
export function drawCircuits(c, w) {
  for (const i of w.circuits.locations) {
    const m = materials[w.cells[i]],
      x = i % w.width,
      y = Math.floor(i / w.width);
    const on =
      circuitOutput(m, w.life[i]) ||
      ((m.circuit === "lamp" || m.circuit === "fan") && w.life[i]);
    // One-cell devices retain a clear lit/dim status even at low canvas resolution.
    c.fillStyle = on ? "#fff3b1" : m.color;
    c.globalAlpha = on ? 0.85 : 0.5;
    c.fillRect(x, y, 1, 1);
  }
  c.globalAlpha = 1;
}
