// Raster occupancy handles contacts; this separate pass shows the true continuous
// body positions, so rigid shapes rotate without becoming loose powder pixels.
export function drawRigidBodies(ctx, w, viewport, colors) {
  if (!w.rigid.locations.size) return;
  if (w.rigid.dirty) w.rigid.rebuild();
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    viewport.x,
    viewport.y,
    w.width * viewport.scale,
    w.height * viewport.scale,
  );
  ctx.clip();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.scale, viewport.scale);
  for (const body of w.rigid.bodies) {
    const pose = w.rigid.pose(body);
    if (!pose) continue;
    const shifts = w.border === "looping" ? [-1, 0, 1] : [0];
    for (const sx of shifts)
      for (const sy of shifts) {
        const x = pose.x + sx * w.width,
          y = pose.y + sy * w.height;
        if (
          x + body.radius + 1 < 0 ||
          x - body.radius - 1 > w.width ||
          y + body.radius + 1 < 0 ||
          y - body.radius - 1 > w.height
        )
          continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(pose.angle);
        for (const id of body.ids) {
          const i = w.rigid.locations.get(id);
          if (i === undefined) continue;
          const offset = i * 3;
          ctx.fillStyle = `rgb(${colors[offset]},${colors[offset + 1]},${colors[offset + 2]})`;
          ctx.fillRect(
            w.restX[i] - body.lx - 0.51,
            w.restY[i] - body.ly - 0.51,
            1.02,
            1.02,
          );
        }
        ctx.restore();
      }
  }
  ctx.restore();
}
