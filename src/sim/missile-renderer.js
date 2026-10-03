import { materials } from "./materials.js";
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
    c.fillStyle = materials[a.material].color;
    c.fillRect(-2.1, -1.4, 1, 2.8);
    c.fillStyle = w.tick % 3 ? "#f4c477" : "#e58861";
    c.beginPath();
    c.moveTo(-2, -0.6);
    c.lineTo(-4.1, 0);
    c.lineTo(-2, 0.6);
    c.fill();
    c.restore();
  }
  const cursor = w.missiles.guidance.cursor;
  if (
    cursor &&
    w.missiles.items.some((a) => materials[a.material].guidance === "laser")
  ) {
    c.strokeStyle = "#8de1b5";
    c.lineWidth = 0.5;
    c.beginPath();
    c.arc(cursor.x, cursor.y, 3, 0, Math.PI * 2);
    c.moveTo(cursor.x - 5, cursor.y);
    c.lineTo(cursor.x - 2, cursor.y);
    c.moveTo(cursor.x + 2, cursor.y);
    c.lineTo(cursor.x + 5, cursor.y);
    c.moveTo(cursor.x, cursor.y - 5);
    c.lineTo(cursor.x, cursor.y - 2);
    c.moveTo(cursor.x, cursor.y + 2);
    c.lineTo(cursor.x, cursor.y + 5);
    c.stroke();
  }
  c.restore();
}
