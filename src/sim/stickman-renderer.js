import { links } from "./stickman-body.js";
export function drawStickmen(context, world, view) {
  if (!world.stickmen.bodies.length) return;
  context.save();
  context.translate(view.x, view.y);
  context.scale(view.scale, view.scale);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 1.2;
  const player = world.stickmen.player;
  for (const a of world.stickmen.bodies) {
    const hot = a.heat.some((t) => t > 180);
    context.strokeStyle = hot ? "#ef965f" : a.alive ? a.color : "#8f9390";
    context.beginPath();
    for (let k = 0; k < links.length; k++)
      if (a.bonds[k]) {
        const [u, v] = links[k];
        context.moveTo(a.x[u], a.y[u]);
        context.lineTo(a.x[v], a.y[v]);
      }
    context.stroke();
    context.beginPath();
    context.arc(a.x[0], a.y[0], 1.65, 0, Math.PI * 2);
    context.stroke();
    if (a.alive) {
      context.fillStyle = a.color;
      context.fillRect(a.x[0] - 0.65, a.y[0] - 0.25, 0.4, 0.4);
      context.fillRect(a.x[0] + 0.3, a.y[0] - 0.25, 0.4, 0.4);
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
