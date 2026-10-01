import { M, materials } from "./materials.js";

// One stroke per elastic material fills small gaps between stretched cells.
export function drawElasticBodies(ctx, w) {
  if (!w.elastic.locations.size) return;
  ctx.lineWidth = 1.15;
  ctx.lineCap = "round";
  for (const name of ["Rope", "Rubber", "Jelly"]) {
    const id = M[name];
    ctx.beginPath();
    for (const i of w.elastic.locations.values()) {
      if (w.cells[i] !== id) continue;
      const x = (i % w.width) + w.offsetX[i] + 0.5,
        y = Math.floor(i / w.width) + w.offsetY[i] + 0.5;
      for (let d = 0; d < 4; d++) {
        const j = w.elastic.locations.get(w.elastic.bonds[d][i]);
        if (j === undefined) continue;
        const nx = (j % w.width) + w.offsetX[j] + 0.5,
          ny = Math.floor(j / w.width) + w.offsetY[j] + 0.5;
        if (Math.abs(nx - x) > 8 || Math.abs(ny - y) > 8) continue;
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
      }
    }
    ctx.strokeStyle = materials[id].color;
    ctx.stroke();
  }
}
export function drawBubbles(ctx, w) {
  ctx.beginPath();
  let count = 0;
  for (let i = 0; i < w.length && count < 3000; i++)
    if (w.cells[i] === M.Bubble) {
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
