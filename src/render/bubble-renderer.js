import { materials } from "../sim/materials.js";

export function drawBubbles(ctx, w) {
  ctx.beginPath();
  let count = 0;
  for (let i = 0; i < w.length && count < 3000; i++)
    if (materials[w.cells[i]].bubble) {
      const x = (i % w.width) + 0.5,
        y = Math.floor(i / w.width) + 0.5,
        r = 0.65 + (w.variant[i] / 255) * 0.6;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      count++;
    }
  if (count) {
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = "#e1f5ff";
    ctx.stroke();
  }
}
