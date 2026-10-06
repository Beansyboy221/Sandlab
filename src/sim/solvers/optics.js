import { energize } from "../electrical-energy.js";
import { materials, solverProducts } from "../materials.js";
import {
  bendLight,
  reflectedLight,
  spectralIndex,
  spectrumPigment,
  opticalNormal,
} from "../../optical-transport.js";
const response = new Float64Array(3),
  normal = new Float64Array(2);
const neighbors = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [-2, 0],
  [0, -2],
  [0, 2],
  [2, 0],
  [-2, -1],
  [-2, 1],
  [2, -1],
  [2, 1],
  [-1, -2],
  [1, -2],
  [-1, 2],
  [1, 2],
];
function births(w) {
  if (w.energyBudgetTick !== w.tick) {
    w.energyBudgetTick = w.tick;
    w.energyBirths = 0;
    w.energyReactions = 0;
  }
  if (w.energyBirths >= 64) return false;
  w.energyBirths++;
  return true;
}
function heading(x, y) {
  return (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
}
function setDirection(w, i, dx, dy) {
  w.velocityX[i] = dx;
  w.velocityY[i] = dy;
  w.heading[i] = heading(dx, dy);
}
function markBand(w, i, band, energy) {
  w.growth[i] = band;
  w.moisture[i] = Math.max(1, Math.min(255, Math.floor(energy)));
  w.pigment[i] = spectrumPigment(band);
}
function spawnPacket(w, i, band, energy, dx, dy, life) {
  if (energy < 2) return false;
  const x = i % w.width,
    y = Math.floor(i / w.width);
  for (const [ox, oy] of neighbors) {
    const j = w.index(x + ox, y + oy);
    const between = w.index(x + Math.round(ox / 2), y + Math.round(oy / 2));
    if (
      j >= 0 &&
      !w.cells[j] &&
      between >= 0 &&
      !materials[w.cells[between]].occludesLight
    ) {
      if (!births(w)) return false;
      w.set(j, solverProducts.photon, 20, Math.min(120, life));
      markBand(w, j, band, energy);
      setDirection(w, j, dx, dy);
      return true;
    }
  }
  return false;
}
function splitWhite(w, i, energy, dx, dy) {
  const part = Math.floor(energy / 7);
  let remaining = energy;
  for (let band = 2; band <= 7; band++)
    if (spawnPacket(w, i, band, part, dx, dy, w.life[i])) remaining -= part;
  markBand(w, i, 1, remaining);
}
export function moveOpticalRay(w, i, x, y, m) {
  let dx = w.velocityX[i],
    dy = w.velocityY[i];
  if (!dx && !dy) {
    const angle = (w.heading[i] * Math.PI) / 4;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
  }
  let px = x + 0.5 + w.offsetX[i],
    py = y + 0.5 + w.offsetY[i],
    medium = materials[0],
    lastSurface = i,
    moved = 0;
  let band = w.growth[i] || (m.ray === "laser" ? 1 : 0),
    energy = w.moisture[i] || 255;
  // Rays pass through occupied transparent cells without replacing their host;
  // both interface traversal and packet births have fixed world-wide budgets.
  for (
    let traversed = 0;
    moved < m.speed && traversed < m.speed + 32;
    traversed++
  ) {
    const tx =
        Math.abs(dx) > 1e-7
          ? (dx > 0 ? Math.floor(px) + 1 - px : px - Math.floor(px)) /
            Math.abs(dx)
          : Infinity,
      ty =
        Math.abs(dy) > 1e-7
          ? (dy > 0 ? Math.floor(py) + 1 - py : py - Math.floor(py)) /
            Math.abs(dy)
          : Infinity,
      distance = Math.min(tx, ty) + 1e-5;
    const oldX = Math.floor(px),
      oldY = Math.floor(py);
    px += dx * distance;
    py += dy * distance;
    let nx = Math.floor(px),
      ny = Math.floor(py),
      j = w.index(nx, ny);
    if (j < 0) {
      w.transform(i, 0);
      return;
    }
    if (j === i) return;
    if (w.border === "looping") {
      const xx = j % w.width,
        yy = Math.floor(j / w.width);
      px += xx - nx;
      py += yy - ny;
      nx = xx;
      ny = yy;
    }
    if (Math.abs(tx - ty) < 1e-7) {
      const a = w.index(oldX + Math.sign(dx), oldY),
        b = w.index(oldX, oldY + Math.sign(dy));
      if (
        a >= 0 &&
        b >= 0 &&
        materials[w.cells[a]].occludesLight &&
        materials[w.cells[b]].occludesLight
      )
        j = a;
    }
    const target = materials[w.cells[j]];
    if (target.portal) {
      setDirection(w, i, dx, dy);
      w.teleport(i, j, dx, dy);
      return;
    }
    if (target.absorbMatter || target.deviceRule === "sink") {
      w.transform(i, 0);
      return;
    }
    if (target.id && target.id !== m.id) {
      const absorbed = (target.lightAbsorption * energy) / 255;
      w.temp[j] = Math.min(
        6000,
        w.temp[j] + (m.absorptionHeat || 1) * absorbed,
      );
      if (target.photoelectric && absorbed > 0) {
        energize(w, j, Math.min(6, absorbed));
      }
    }
    if (target.id !== medium.id) {
      const surface = target.id ? j : lastSurface;
      opticalNormal(w, materials, surface, dx, dy, normal);
      if (target.id && target.lightTransmission < 0.001) {
        const reflected = energy * target.lightReflectivity;
        if (reflected < 2 || target.photoelectric) {
          w.transform(i, 0);
          return;
        }
        reflectedLight(dx, dy, normal[0], normal[1], response);
        dx = response[0];
        dy = response[1];
        // Rough surfaces scatter an incident laser into weaker photon packets;
        // smooth reflectors preserve its coherent direction and material type.
        if (target.friction > 0.3 && target.lightReflectivity < 0.5) {
          const angle =
            Math.atan2(dy, dx) + (w.random() - 0.5) * target.friction * Math.PI;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          if (m.ray === "laser")
            w.transform(i, solverProducts.photon, 20, w.life[i]);
        }
        markBand(w, i, band, reflected);
        setDirection(w, i, dx, dy);
        return;
      }
      if (target.id && target.lightReflectivity > 0.01) {
        reflectedLight(dx, dy, normal[0], normal[1], response);
        spawnPacket(
          w,
          i,
          band,
          energy * target.lightReflectivity,
          response[0],
          response[1],
          w.life[i],
        );
        energy *= 1 - target.lightReflectivity;
      }
      if (!band && target.opticalDispersion > 0.01) {
        splitWhite(w, i, energy, dx, dy);
        energy = w.moisture[i];
        band = w.growth[i];
      }
      const from = spectralIndex(medium, band),
        to = spectralIndex(target, band);
      if (Math.abs(from - to) > 0.001) {
        bendLight(dx, dy, normal[0], normal[1], from, to, response);
        dx = response[0];
        dy = response[1];
        if (response[2]) {
          setDirection(w, i, dx, dy);
          markBand(w, i, band, energy);
          return;
        }
      }
      medium = target;
      lastSurface = j;
    }
    energy *= 1 - target.lightAbsorption;
    if (energy < 2) {
      w.transform(i, 0);
      return;
    }
    if (!target.id) {
      w.swap(i, j);
      i = j;
      x = nx;
      y = ny;
      moved++;
      w.offsetX[i] = Math.max(-0.49, Math.min(0.49, px - x - 0.5));
      w.offsetY[i] = Math.max(-0.49, Math.min(0.49, py - y - 0.5));
      setDirection(w, i, dx, dy);
      markBand(w, i, band, energy);
    } else if (w.life[i] > 1) w.life[i]--;
  }
  if (!moved) w.transform(i, 0);
}
