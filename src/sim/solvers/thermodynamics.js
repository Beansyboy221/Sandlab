import { thermalCapacity } from "../thermal-capacity.js";
import { materials, materialTables } from "../materials.js";

export function transferHeat(world, i, j) {
  if (world.mechanics.temperatureSimulation === false || !world.cells[j])
    return;
  const transfer =
    (world.temp[i] - world.temp[j]) *
    materialTables.heatTransfer[
      world.cells[i] * materials.length + world.cells[j]
    ];
  const a = thermalCapacity(world, i),
    b = thermalCapacity(world, j);
  const energy = (transfer * 2) / (1 / a + 1 / b);
  world.temp[i] -= energy / a;
  world.temp[j] += energy / b;
}

export function exchangeParticleHeat(world, i, x, y) {
  const w = world.width;
  if (
    world.mechanics.temperatureSimulation !== false &&
    (i + world.tick) % 3 === 0
  ) {
    const right = world.index(x + 1, y),
      below = world.index(x, y + 1);
    if (right >= 0) world.transferHeat(i, right);
    if (below >= 0) world.transferHeat(i, below);
    if (materials[world.cells[i]].rigid)
      for (let d = 0; d < 2; d++) {
        const j = world.rigid.locations.get(world["bond" + d][i]);
        // Cardinal rest links remain physical neighbors after rotation.
        // Grid-adjacent pairs already exchange heat through the normal pass.
        if (
          j !== undefined &&
          Math.abs((i % w) - (j % w)) +
            Math.abs(Math.floor(i / w) - Math.floor(j / w)) !==
            1
        )
          world.transferHeat(i, j);
      }
    world.fields.exchange(world, i, x, y);
  }
}

export function exchangeWithAir(fields, world, i, x, y) {
  if (!fields.temperatureEnabled) return;
  const fi = fields.index(x, y),
    m = materials[world.cells[i]],
    heat =
      (world.temp[i] - fields.temperature[fi]) *
      (m.heatSource ? 0.08 : m.gas ? 0.015 : 0.003);
  const capacity = thermalCapacity(world, i);
  let energy = m.heatSource ? heat : heat / (1 / capacity + 1 / 16);
  energy = Math.max(
    (-273 - fields.temperature[fi]) * 16,
    Math.min((6000 - fields.temperature[fi]) * 16, energy),
  );
  if (!m.heatSource) world.temp[i] -= energy / capacity;
  // The coarse tile's normalized ambient heat capacity is explicit. Equal and
  // opposite energy fluxes avoid density-dependent loss at the particle boundary.
  fields.temperature[fi] += energy / 16;
  fields.add(x, y, heat * 0.0005);
}

export function thermalFieldValue(
  temperature,
  flux,
  advection,
  incoming,
  enabled,
) {
  return enabled
    ? Math.max(
        -273,
        Math.min(
          6000,
          temperature +
            flux * 0.03 +
            advection * Math.min(0.5, 0.75 / (incoming || 1)),
        ),
      )
    : temperature;
}

export function depositHeat(fields, x, y, amount) {
  if (
    !fields.temperatureEnabled ||
    !Number.isFinite(amount) ||
    x < 0 ||
    y < 0 ||
    x >= fields.width * 4 ||
    y >= fields.height * 4
  )
    return;
  const i = fields.index(x, y),
    before = fields.temperature[i];
  fields.temperature[i] = Math.max(-273, Math.min(6000, before + amount));
  fields.add(x, y, (fields.temperature[i] - before) * 0.025);
}

export function applyHeatSource(world, i, x, y, m) {
  const { cells: c, temp: t } = world;
  t[i] = m.temperature;
  world.eachNeighbor(x, y, (j) => {
    if (c[j]) t[j] += (t[i] - t[j]) * 0.12;
  });
}
