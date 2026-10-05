import { thermalFieldValue } from "./thermodynamics.js";

// Shared face stencils transport pressure and heat in one allocation-free pass;
// thermodynamics owns heat calculations, atmosphere owns momentum and pressure.
export function stepAtmosphere(fields, world) {
  fields.stressWrites = 0;
  if (world) fields.configure(world.mechanics);
  if (fields.lastBorder !== fields.border) {
    fields.obstaclesDirty = true;
    fields.lastBorder = fields.border;
  }
  if (world) fields.rebuildBarriers(world);
  fields.airflow.step(fields, world);
  const {
    width: w,
    height: h,
    pressure: p,
    next: n,
    temperature: t,
    nextTemperature: nt,
  } = fields;
  const loop = fields.border === "looping",
    solid = fields.border === "solid";
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        left = x ? i - 1 : loop ? i + w - 1 : -1,
        right = x < w - 1 ? i + 1 : loop ? i - x : -1,
        up = y ? i - w : loop ? i + (h - 1) * w : -1,
        down = y < h - 1 ? i + w : loop ? x : -1;
      let pressureFlux = 0,
        heatFlux = 0,
        divergence = 0,
        heatAdvection = 0,
        incoming = 0;
      // No per-cell arrays or closures in the diffusion loop.
      for (let direction = 0; direction < 4; direction++) {
        const j =
            direction === 0
              ? left
              : direction === 1
                ? right
                : direction === 2
                  ? up
                  : down,
          permeability =
            j < 0
              ? solid
                ? 0
                : 1
              : direction === 0
                ? fields.horizontal[j]
                : direction === 1
                  ? fields.horizontal[i]
                  : direction === 2
                    ? fields.vertical[j]
                    : fields.vertical[i];
        const flow =
          direction === 0
            ? -(left < 0
                ? fields.airflow.west[y]
                : fields.airflow.velocityX[left])
            : direction === 1
              ? fields.airflow.velocityX[i]
              : direction === 2
                ? -(up < 0
                    ? fields.airflow.north[x]
                    : fields.airflow.velocityY[up])
                : fields.airflow.velocityY[i];
        divergence += flow;
        if (flow < 0) {
          incoming += -flow / 4;
          heatAdvection +=
            (-flow / 4) * ((j < 0 ? fields.ambientTemperature : t[j]) - t[i]);
        }
        pressureFlux += ((j < 0 ? 0 : p[j]) - p[i]) * permeability;
        heatFlux +=
          ((j < 0 ? fields.ambientTemperature : t[j]) - t[i]) * permeability;
      }
      n[i] = fields.pressureEnabled
        ? Math.max(
            -80,
            Math.min(
              80,
              (p[i] + pressureFlux * 0.025 - divergence * 0.55) * 0.999,
            ),
          )
        : 0;
      nt[i] = thermalFieldValue(
        t[i],
        heatFlux,
        heatAdvection,
        incoming,
        fields.temperatureEnabled,
      );
    }
  fields.pressure = n;
  fields.next = p;
  fields.temperature = nt;
  fields.nextTemperature = t;
}
