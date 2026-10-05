// Recipes describe appearance only; this renderer reads state and never updates it.
export function drawEntitySprite(
  c,
  recipe,
  materialColor,
  tick,
  health,
  direction = 1,
) {
  for (const part of recipe) {
    c.fillStyle = part.cycle
      ? tick % part.cycle.period
        ? part.cycle.other
        : part.cycle.zero
      : part.health
        ? health > part.health.threshold
          ? part.health.above
          : part.health.below
        : part.color === "material"
          ? materialColor
          : part.color;
    if (part.shape === "rect") {
      const [x, y, width, height] = part.bounds;
      c.fillRect(
        direction < 0 && part.reverseX !== undefined ? part.reverseX : x,
        y,
        width,
        height,
      );
    } else {
      c.beginPath();
      for (let n = 0; n < part.points.length; n++) {
        const [x, y] = part.points[n];
        if (n) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      c.fill();
    }
  }
}
