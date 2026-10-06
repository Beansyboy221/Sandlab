import { materials } from "./materials.js";

// Pressure uses normalized kPa; velocities convert to distance/second for drag.
// Loads are sampled on exposed faces, not applied once per occupied interior.
const AIR_DENSITY_KG_M3 = 1.225;
export function surfaceLoad(fields, world, i, vx, vy) {
  fields.forceX =
    fields.forceY =
    fields.surfaceStress =
    fields.dragX =
    fields.dragY =
      0;
  if (!fields.windEnabled && !fields.pressureEnabled) return;
  const m = materials[world.cells[i]],
    x = i % world.width,
    y = Math.floor(i / world.width);
  const velocityScale = world.metersPerPixel * 60;
  const center = fields.pressure[fields.index(x, y)];
  for (let d = 0; d < 4; d++) {
    const dx = d === 0 ? -1 : d === 1 ? 1 : 0;
    const dy = d === 2 ? -1 : d === 3 ? 1 : 0;
    const j = world.index(x + dx, y + dy);
    if (j >= 0 && fields.blocks(world.cells[j]) >= 0.95) continue;
    if (fields.pressureEnabled) {
      const pressure = fields.sample(
        Math.floor((x + dx * 4) / 4),
        Math.floor((y + dy * 4) / 4),
      );
      fields.forceX -= dx * pressure;
      fields.forceY -= dy * pressure;
      fields.surfaceStress = Math.max(
        fields.surfaceStress,
        Math.abs(pressure - center),
      );
    }
    if (!fields.windEnabled || !m.dragCoefficient) continue;
    fields.airflow.sample(fields, x + dx * 4, y + dy * 4);
    const incoming = -(
      (fields.airflow.x - vx) * dx +
      (fields.airflow.y - vy) * dy
    );
    if (incoming <= 0) continue;
    const pressure =
      (0.5 *
        AIR_DENSITY_KG_M3 *
        (incoming * velocityScale) ** 2 *
        m.dragCoefficient) /
      1000;
    fields.dragX -= dx * pressure;
    fields.dragY -= dy * pressure;
  }
  fields.forceX += fields.dragX;
  fields.forceY += fields.dragY;
}
