import { materials } from "./materials.js";
export function drawMachine(c, w, a) {
  const vehicle = materials[a.material].vehicle;
  if (!vehicle) return false;
  c.save();
  c.translate(a.x, a.y);
  c.rotate(Math.atan2(-w.gravityX, w.gravityY));
  c.fillStyle = materials[a.material].color;
  if (vehicle === "drone") {
    c.fillRect(-3, -0.4, 6, 1);
    c.fillRect(-1.3, -1, 2.6, 2);
    c.fillStyle = "#6f9299";
    c.fillRect(-3.4, -1.2, 1, 1);
    c.fillRect(2.4, -1.2, 1, 1);
    c.fillStyle = w.tick % 2 ? "#c8ece8" : "#6da8ad";
    c.fillRect(-4, -1.5, 2.3, 0.3);
    c.fillRect(1.7, -1.5, 2.3, 0.3);
    c.fillStyle = a.health > 30 ? "#b8ed9e" : "#e57f69";
    c.fillRect(-0.4, 0.5, 0.8, 0.6);
  } else {
    c.fillRect(-3, -1.4, 6, 2.2);
    c.fillRect(-1.5, -2.1, 3, 1);
    c.fillStyle = "#26343c";
    c.fillRect(-2.8, 0.2, 1.5, 1.4);
    c.fillRect(1.3, 0.2, 1.5, 1.4);
    c.fillStyle = "#d1e0e2";
    c.fillRect(-2.3, 0.7, 0.5, 0.5);
    c.fillRect(1.8, 0.7, 0.5, 0.5);
    c.fillStyle = "#ffe6a7";
    const direction =
      Math.cos(a.angle) * w.gravityY - Math.sin(a.angle) * w.gravityX;
    c.fillRect(direction >= 0 ? 2.5 : -3, -0.9, 0.5, 0.6);
  }
  c.restore();
  return true;
}
