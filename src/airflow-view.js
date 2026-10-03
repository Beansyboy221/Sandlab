// Direction colors follow an eight-sector optical-flow wheel. Linear octant
// ratios avoid per-pixel atan2/HSV conversion and allocate no render objects.
const wheel = [
  [245, 82, 75],
  [240, 190, 60],
  [132, 231, 96],
  [62, 223, 204],
  [74, 145, 245],
  [130, 92, 243],
  [223, 86, 226],
  [246, 87, 149],
];
export function flowColor(vx, vy, target) {
  const ax = Math.abs(vx),
    ay = Math.abs(vy),
    speed = Math.hypot(vx, vy);
  let sector, mix;
  if (ax >= ay) {
    mix = ay / (ax || 1);
    sector = vx >= 0 ? (vy >= 0 ? 0 : 7) : vy >= 0 ? 3 : 4;
  } else {
    mix = ax / (ay || 1);
    sector = vy >= 0 ? (vx >= 0 ? 1 : 2) : vx >= 0 ? 6 : 5;
  }
  if ((sector & 1) === 1) mix = 1 - mix;
  const a = wheel[sector],
    b = wheel[(sector + 1) & 7],
    strength = Math.min(1, speed / 1.5);
  target.flowR = (a[0] + (b[0] - a[0]) * mix) * strength;
  target.flowG = (a[1] + (b[1] - a[1]) * mix) * strength;
  target.flowB = (a[2] + (b[2] - a[2]) * mix) * strength;
}
export function drawStreamlines(context, view, world) {
  const f = world.fields,
    phase = (world.tick % 30) / 30;
  context.strokeStyle = "#e5f6f0a0";
  context.lineWidth = Math.max(1, view.scale * 0.35);
  context.beginPath();
  // A fixed seed grid and five short segments bound visualization work.
  const stride = Math.max(12, Math.ceil(Math.sqrt(world.length / 600)));
  for (let sy = 6; sy < world.height; sy += stride)
    for (let sx = 6; sx < world.width; sx += stride) {
      let x = sx,
        y = sy,
        started = false;
      for (let n = 0; n < 5; n++) {
        const i = world.index(Math.floor(x), Math.floor(y));
        if (i < 0 || f.blocks(world.cells[i]) > 0.5) break;
        f.airflow.sample(f, x, y);
        const speed = Math.hypot(f.airflow.x, f.airflow.y);
        if (speed < 0.03) break;
        const step = n === 0 ? phase * 3 : 2;
        const dx = (f.airflow.x / speed) * step,
          dy = (f.airflow.y / speed) * step;
        // Check both halves so a segment cannot jump a one-pixel wall.
        const middle = world.index(
            Math.floor(x + dx * 0.5),
            Math.floor(y + dy * 0.5),
          ),
          end = world.index(Math.floor(x + dx), Math.floor(y + dy));
        if (
          middle < 0 ||
          end < 0 ||
          f.blocks(world.cells[middle]) > 0.5 ||
          f.blocks(world.cells[end]) > 0.5
        )
          break;
        x += dx;
        y += dy;
        const px = view.x + x * view.scale,
          py = view.y + y * view.scale;
        if (!started) {
          context.moveTo(px, py);
          started = true;
        } else context.lineTo(px, py);
      }
    }
  context.stroke();
}
