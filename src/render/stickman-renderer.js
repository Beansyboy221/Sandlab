import { distanceRatio } from "../sim/world-units.js";
import { actorProfile } from "../sim/creature-profiles.js";
function ellipseBetween(c, a, u, v, thickness) {
  const dx = a.x[v] - a.x[u],
    dy = a.y[v] - a.y[u];
  c.beginPath();
  c.ellipse(
    (a.x[u] + a.x[v]) / 2,
    (a.y[u] + a.y[v]) / 2,
    Math.max(0.5, Math.hypot(dx, dy) / 2 + 0.5),
    thickness,
    Math.atan2(dy, dx),
    0,
    Math.PI * 2,
  );
  c.fill();
}
function ears(c, a, w, length) {
  const gx = w.gravityX,
    gy = w.gravityY;
  for (const side of [-1, 1]) {
    const x = a.x[0] + gy * side * 0.65,
      y = a.y[0] - gx * side * 0.65;
    c.beginPath();
    c.moveTo(x - gy * 0.45, y + gx * 0.45);
    c.lineTo(x - gx * length, y - gy * length);
    c.lineTo(x + gy * 0.45, y - gx * 0.45);
    c.closePath();
    c.fill();
  }
}
export function drawStickmen(context, world, view) {
  if (!world.stickmen.bodies.length) return;
  context.save();
  context.translate(view.x, view.y);
  context.scale(view.scale, view.scale);
  context.lineCap = "round";
  context.lineJoin = "round";
  const player = world.stickmen.player;
  for (const a of world.stickmen.bodies) {
    const p = actorProfile(a.material, world),
      human = p.appearance.humanoid;
    const hot = a.heat.some((t) => t > 180);
    const color = hot ? "#ef965f" : a.alive ? a.color : "#8f9390";
    context.strokeStyle = context.fillStyle = color;
    context.lineWidth = (human ? 1.2 : 0.8) * distanceRatio(world);
    context.beginPath();
    for (let k = 0; k < p.links.length; k++)
      if (a.bonds[k]) {
        const [u, v] = p.links[k];
        context.moveTo(a.x[u], a.y[u]);
        context.lineTo(a.x[v], a.y[v]);
      }
    context.stroke();
    if (!human && a.bonds[1])
      ellipseBetween(context, a, 1, 2, p.appearance.torsoThickness);
    if (!human && a.bonds[0]) ellipseBetween(context, a, 0, 1, 0.7);
    context.beginPath();
    context.arc(
      a.x[0],
      a.y[0],
      p.headRadius + 0.3 * distanceRatio(world),
      0,
      Math.PI * 2,
    );
    if (human) context.stroke();
    else context.fill();
    if (!human && p.appearance.ears) ears(context, a, world, p.appearance.ears);
    if (p.appearance.fin && a.bonds[1] && a.bonds[2]) {
      context.beginPath();
      context.moveTo(a.x[1], a.y[1]);
      context.lineTo(a.x[3], a.y[3]);
      context.lineTo(a.x[2], a.y[2]);
      context.closePath();
      context.fill();
    }
    if (
      p.appearance.tail &&
      a.bonds[4] &&
      a.bonds[5] &&
      a.bonds[6] &&
      a.bonds[7]
    ) {
      context.beginPath();
      context.moveTo(a.x[2], a.y[2]);
      context.lineTo(a.x[5], a.y[5]);
      context.lineTo(a.x[6], a.y[6]);
      context.closePath();
      context.fill();
    }
    if (p.appearance.beak && a.bonds[2]) {
      ellipseBetween(context, a, 1, 3, 0.7);
      const gx = world.gravityX,
        gy = world.gravityY;
      context.beginPath();
      context.moveTo(
        a.x[0] + gy * a.direction * 0.8,
        a.y[0] - gx * a.direction * 0.8,
      );
      context.lineTo(
        a.x[0] + gy * a.direction * 2,
        a.y[0] - gx * a.direction * 2,
      );
      context.lineTo(a.x[0] + gx * 0.5, a.y[0] + gy * 0.5);
      context.closePath();
      context.fill();
    }
    if (a.alive) {
      context.fillStyle = human ? a.color : "#18252b";
      context.fillRect(a.x[0] - 0.55, a.y[0] - 0.25, 0.45, 0.45);
      if (human) context.fillRect(a.x[0] + 0.3, a.y[0] - 0.25, 0.4, 0.4);
    }
    if (a === player) {
      context.fillStyle = a.color;
      context.beginPath();
      context.moveTo(a.x[0] - 1, a.y[0] - 4);
      context.lineTo(a.x[0] + 1, a.y[0] - 4);
      context.lineTo(a.x[0], a.y[0] - 3);
      context.fill();
    }
  }
  context.restore();
}
