// Resize/scale is a one-time finite-volume remap, not a new tick traversal.
// Area weights preserve integrated field deviations when the domain expands.
function remap(source, target, sw, sh, tw, th, x, y, ambient = 0) {
  for (let ty = 0; ty < th; ty++)
    for (let tx = 0; tx < tw; tx++) {
      const left = tx * 4 + x,
        top = ty * 4 + y;
      let value = ambient;
      for (let sy = Math.floor(top / 4); sy <= Math.floor((top + 3) / 4); sy++)
        for (
          let sx = Math.floor(left / 4);
          sx <= Math.floor((left + 3) / 4);
          sx++
        ) {
          if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
          const area =
            Math.max(
              0,
              Math.min(left + 4, sx * 4 + 4) - Math.max(left, sx * 4),
            ) *
            Math.max(0, Math.min(top + 4, sy * 4 + 4) - Math.max(top, sy * 4));
          value += ((source[sy * sw + sx] - ambient) * area) / 16;
        }
      target[ty * tw + tx] = value;
    }
}
export function transferWorldFields(world, next, x, y) {
  const a = world.fields,
    b = next.fields;
  remap(a.pressure, b.pressure, a.width, a.height, b.width, b.height, x, y);
  remap(
    a.temperature,
    b.temperature,
    a.width,
    a.height,
    b.width,
    b.height,
    x,
    y,
    a.ambientTemperature,
  );
  const old = world.sound,
    sound = next.sound;
  for (const key of ["wave", "previous"])
    remap(
      old[key],
      sound[key],
      old.width,
      old.height,
      sound.width,
      sound.height,
      x,
      y,
    );
  sound.active = old.active;
  sound.tick = old.tick;
  sound.lastEmission = old.lastEmission;
  sound.emitted = old.emitted;
  sound.events = old.events
    .map((event) => ({ ...event, x: event.x - x, y: event.y - y }))
    .filter(
      (event) =>
        event.x >= 0 &&
        event.y >= 0 &&
        event.x < next.width &&
        event.y < next.height,
    );
}
