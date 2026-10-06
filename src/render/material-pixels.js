import { materials } from "../sim/materials.js";
import { oxideColors } from "../sim/oxidation.js";
import { flowColor } from "../airflow-view.js";
import { portalColor } from "../portal-renderer.js";

const colors = materials.map((m) => [
  parseInt(m.color.slice(1, 3), 16),
  parseInt(m.color.slice(3, 5), 16),
  parseInt(m.color.slice(5, 7), 16),
]);
function heatColor(t) {
  if (t < 20) {
    const v = Math.min(1, (20 - t) / 120);
    return [40 + 30 * v, 90 + 90 * v, 145 + 100 * v];
  }
  const v = Math.min(1, (t - 20) / 1400);
  return [
    50 + 205 * Math.min(1, v * 2),
    90 + 100 * Math.max(0, v - 0.45),
    120 * (1 - v) + 30,
  ];
}
const heatColors = Array.from({ length: 1601 }, (_, i) => heatColor(i - 100));

export function writeMaterialPixels(renderer) {
  if (renderer.background !== renderer.world.background) {
    renderer.background = renderer.world.background;
    renderer.backgroundRGB = [1, 3, 5].map((start) =>
      parseInt(renderer.background.slice(start, start + 2), 16),
    );
  }
  const [bgR, bgG, bgB] = renderer.backgroundRGB;
  const { cells, temp, life, variant, charge, fields, width, height, tick } =
      renderer.world,
    p = renderer.data.data;
  const pressure = renderer.mode === "pressure",
    thermal = renderer.mode === "heat",
    echo = renderer.mode === "echo",
    wind = renderer.mode === "wind";
  for (let i = 0; i < cells.length; i++) {
    const id = cells[i],
      o = i * 4,
      x = i % width,
      y = (i / width) | 0;
    const backdrop = renderer.world.backgroundPaint[i],
      backAlpha = (backdrop >>> 24) / 255;
    const cellBgR =
        bgR * (1 - backAlpha) + ((backdrop >>> 16) & 255) * backAlpha,
      cellBgG = bgG * (1 - backAlpha) + ((backdrop >>> 8) & 255) * backAlpha,
      cellBgB = bgB * (1 - backAlpha) + (backdrop & 255) * backAlpha;
    let r = cellBgR,
      g = cellBgG,
      b = cellBgB;
    if (id) {
      const base = thermal
        ? heatColors[Math.max(0, Math.min(1600, Math.round(temp[i]) + 100))]
        : materials[id].portal
          ? portalColor(renderer.world.portals, renderer.world.portalId[i])
          : colors[id];
      const shade = (variant[i] / 255 - 0.5) * 22;
      r = base[0] + shade;
      g = base[1] + shade;
      b = base[2] + shade;
      if (!thermal) {
        const oxide = renderer.world.oxidationLevel[i] / 255;
        if (oxide) {
          r += (oxideColors[id][0] + shade - r) * oxide;
          g += (oxideColors[id][1] + shade - g) * oxide;
          b += (oxideColors[id][2] + shade - b) * oxide;
        }
        const pigment = renderer.world.pigment[i],
          opacity = (pigment >>> 24) / 255;
        if (opacity) {
          r = r * (1 - opacity) + (((pigment >>> 16) & 255) + shade) * opacity;
          g = g * (1 - opacity) + (((pigment >>> 8) & 255) + shade) * opacity;
          b = b * (1 - opacity) + ((pigment & 255) + shade) * opacity;
        }
        if (
          materials[id].flame ||
          materials[id].electricalArc ||
          materials[id].discharge ||
          (materials[id].glow && (materials[id].circuit !== "lamp" || life[i]))
        ) {
          const flicker =
            ((variant[i] + tick * 17) % 70) * (materials[id].glow ? 0.4 : 1);
          r += flicker;
          g += flicker * 0.65;
          b += flicker * 0.3;
        } else if (temp[i] > 450) {
          const glow = Math.min(1, (temp[i] - 450) / 1300);
          r = r * (1 - glow) + 255 * glow;
          g = g * (1 - glow) + 100 * glow;
        }
        if (materials[id].category === "gas") {
          r = r * 0.67 + cellBgR * 0.33;
          g = g * 0.67 + cellBgG * 0.33;
          b = b * 0.67 + cellBgB * 0.33;
        }
        if (materials[id].nutrientTint && renderer.world.nutrition[i]) {
          const nutrition = renderer.world.nutrition[i] / 255;
          g += nutrition * 28;
          r -= nutrition * 12;
        }
        if (renderer.world.storedAmount[i]) {
          const amount =
              renderer.world.storedAmount[i] / materials[id].porosity,
            liquid = colors[renderer.world.storedLiquid[i]];
          r = r * (1 - amount * 0.65) + liquid[0] * amount * 0.65;
          g = g * (1 - amount * 0.65) + liquid[1] * amount * 0.65;
          b = b * (1 - amount * 0.65) + liquid[2] * amount * 0.65;
          if (materials[id].surfacePattern === "pores" && variant[i] < 60) {
            r *= 0.75;
            g *= 0.75;
            b *= 0.75;
          }
        }
        if (renderer.world.dissolvedAmount[i]) {
          const additive = colors[renderer.world.dissolvedId[i]],
            blend = Math.min(0.3, renderer.world.dissolvedAmount[i] * 0.06);
          r += (additive[0] - r) * blend;
          g += (additive[1] - g) * blend;
          b += (additive[2] - b) * blend;
        }
        if (materials[id].renderStyle === "glass") {
          r *= 0.66;
          g *= 0.76;
          b *= 0.79;
        }
        if (materials[id].burn && life[i] > 0) {
          const ember = 0.35 + ((variant[i] + tick * 7) % 40) / 100;
          r = r * (1 - ember) + 235 * ember;
          g = g * (1 - ember) + 75 * ember;
          b *= 1 - ember;
        }
        if (charge[i]) {
          r = 240;
          g = 230;
          b = 139;
        }
      }
    } else if (!backdrop && x % 20 === 0 && y % 20 === 0) {
      const dot = bgR + bgG + bgB > 400 ? -13 : 13;
      r += dot;
      g += dot;
      b += dot;
    }
    if (thermal && !id) {
      const air =
        heatColors[
          Math.max(
            0,
            Math.min(
              1600,
              Math.round(fields.temperature[fields.index(x, y)]) + 100,
            ),
          )
        ];
      r = air[0];
      g = air[1];
      b = air[2];
    }
    if (pressure) {
      const force = fields.pressure[fields.index(x, y)],
        a = Math.min(0.9, Math.abs(force) / 12);
      r = r * (1 - a) + (force < 0 ? 75 : 230) * a;
      g = g * (1 - a) + 103 * a;
      b = b * (1 - a) + (force < 0 ? 230 : 130) * a;
    }
    if (wind) {
      fields.airflow.sample(fields, x, y);
      flowColor(fields.airflow.x, fields.airflow.y, renderer);
      r = r * 0.35 + renderer.flowR;
      g = g * 0.35 + renderer.flowG;
      b = b * 0.35 + renderer.flowB;
      if (fields.blocks(id) > 0.5) {
        const fi = fields.forceGradient(x, y);
        const stress = Math.min(
          0.95,
          (Math.abs(fields.gradientX[fi]) + Math.abs(fields.gradientY[fi])) /
            14,
        );
        const suction =
          (fields.pressure[fi] || fields.gradientPressure[fi]) < 0;
        r = r * (1 - stress) + (suction ? 140 : 255) * stress;
        g = g * (1 - stress) + (suction ? 104 : 175) * stress;
        b = b * (1 - stress) + (suction ? 245 : 75) * stress;
      }
    }
    if (echo) {
      const wave = renderer.world.sound.wave[fields.index(x, y)],
        glow = Math.min(1, Math.abs(wave) * 2.5);
      r = r * 0.22 + (wave < 0 ? 86 : 61) * glow;
      g = g * 0.22 + (wave < 0 ? 113 : 224) * glow;
      b = b * 0.22 + (wave < 0 ? 241 : 204) * glow;
    }
    if (materials[id].elasticity || materials[id].rigid) {
      const colorOffset = i * 3;
      renderer.elasticColors[colorOffset] = r;
      renderer.elasticColors[colorOffset + 1] = g;
      renderer.elasticColors[colorOffset + 2] = b;
      // Occupied body cells share the exact material/collision pixel surface.
    }
    p[o] = r;
    p[o + 1] = g;
    p[o + 2] = b;
    p[o + 3] = 255;
  }
}
