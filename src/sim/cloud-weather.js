import { M, materials } from "./materials.js";

// Cloud pixels represent suspended condensate, not a source of infinite water.
// Stagger one 5×5 sample per particle every 16 ticks; no global cloud searches.
export function cloudWeather(w, i, x, y, discharge) {
  const temperature = w.temp[i];
  if (temperature > 100) {
    w.transform(i, M.Steam, temperature);
    w.fields.add(x, y, 0.15);
    return;
  }
  if (((w.tick + i) & 15) !== 0) return;
  let clouds = 0,
    frozen = 0,
    droplets = 0,
    available = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const j = w.index(x + dx, y + dy);
      if (j < 0) continue;
      available++;
      const id = w.cells[j];
      if (id === M.Cloud) {
        clouds++;
        if (w.temp[j] < -8) frozen++;
        else if (w.temp[j] > -3) droplets++;
      } else if (id === M.Ice || id === M.Snow) frozen++;
      else if (id === M.Water && w.temp[j] < 30) droplets++;
    }
  const saturation = Math.max(
    0.25,
    Math.min(
      0.8,
      materials[M.Cloud].rainThreshold + (temperature - 10) * 0.008,
    ),
  );
  const dense = clouds >= 6 && clouds / available >= saturation;
  // Mixed ice/droplet collisions in rising air separate charge; warm rain clouds
  // and cold clouds without liquid water do not automatically become storms.
  w.fields.airflow.sample(w.fields, x, y);
  const updraft = w.fields.windEnabled
    ? Math.max(
        0,
        -w.fields.airflow.x * w.gravityX - w.fields.airflow.y * w.gravityY,
      )
    : 0;
  if (dense && frozen >= 3 && droplets >= 3 && updraft > 0.04) {
    w.growth[i] = Math.min(
      255,
      w.growth[i] + Math.min(24, 2 + Math.floor(updraft * 40)),
    );
    if (w.growth[i] >= 120 && w.lastStrikeTick !== w.tick) {
      w.growth[i] = 0;
      // One discharge per world tick is enforced by the shared lightning tracer.
      discharge(w, x + w.gravityX, y + w.gravityY);
      return;
    }
  } else w.growth[i] = Math.max(0, w.growth[i] - 3);
  // Coalescence takes time and only precipitation on a lower cloud edge falls
  // out; an interior cell never ejects liquid through the rest of the cloud.
  w.moisture[i] =
    dense && temperature < 30
      ? Math.min(255, w.moisture[i] + 2 + Math.floor(clouds / 6))
      : Math.max(0, w.moisture[i] - 4);
  const below = w.relativeIndex(x, y, 0, 1);
  if (w.moisture[i] >= 96 && below >= 0 && !w.cells[below]) {
    w.transform(i, temperature < -5 ? M.Snow : M.Water, temperature);
    w.fields.add(x, y, -0.15);
    const tile = w.fields.index(x, y);
    if (w.fields.temperatureEnabled) w.fields.temperature[tile] += 0.5;
  }
}
