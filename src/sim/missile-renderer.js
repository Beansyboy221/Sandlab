import { drawMachine } from "./machine-renderer.js";
export function drawMissiles(c, w, view) {
  if (!w.missiles.items.length) return;
  c.save();
  c.translate(view.x, view.y);
  c.scale(view.scale, view.scale);
  for (const a of w.missiles.items) {
    if (drawMachine(c, w, a)) continue;
    c.save();
    c.translate(a.x, a.y);
    c.rotate(a.angle);
    c.fillStyle = "#d9dee2";
    c.beginPath();
    c.moveTo(2.6, 0);
    c.lineTo(0.8, -0.9);
    c.lineTo(-2, -0.9);
    c.lineTo(-2, 0.9);
    c.lineTo(0.8, 0.9);
    c.closePath();
    c.fill();
    c.fillStyle = "#d78269";
    c.fillRect(-2.1, -1.4, 1, 2.8);
    c.fillStyle = w.tick % 3 ? "#f4c477" : "#e58861";
    c.beginPath();
    c.moveTo(-2, -0.6);
    c.lineTo(-4.1, 0);
    c.lineTo(-2, 0.6);
    c.fill();
    c.restore();
  }
  c.restore();
}
