import { M, materials } from "./materials.js";

export const rayDirections = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
export function rayHeading(dx, dy) {
  if (!dx && !dy) return 0;
  return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
}
function budget(w, key, limit) {
  if (w.energyBudgetTick !== w.tick) {
    w.energyBudgetTick = w.tick;
    w.energyBirths = 0;
    w.energyReactions = 0;
  }
  if (w[key] >= limit) return false;
  w[key]++;
  return true;
}
function emitRays(w, x, y, id, count) {
  const start = Math.floor(w.random() * 8);
  for (let n = 0; n < 8 && count; n++) {
    const heading = (start + n) % 8,
      [dx, dy] = rayDirections[heading],
      j = w.index(x + dx, y + dy);
    if (j < 0 || w.cells[j]) continue;
    if (!budget(w, "energyBirths", 128)) break;
    w.set(j, id);
    if (id !== M.Neutron) w.heading[j] = heading;
    count--;
  }
}
export function reactEnergy(w, i, x, y, m) {
  if (m.energyRule === "ray") {
    if (!w.life[i] || --w.life[i] === 0) w.set(i, 0);
  } else if (m.energyRule === "aura") {
    if (!w.life[i] || --w.life[i] === 0) {
      w.set(i, m.aura > 0 ? M.Smoke : 0, m.aura > 0 ? 120 : 20);
      return;
    }
    w.temp[i] = m.temperature;
    w.eachNeighbor(x, y, (j) => {
      if (w.cells[i] !== m.id || !w.cells[j]) return;
      const neighbor = materials[w.cells[j]];
      if (neighbor.aura && neighbor.aura * m.aura < 0) {
        w.set(i, M.Steam, 120);
        w.set(j, M.Steam, 120);
        w.fields.add(x, y, 1);
        return;
      }
      if (!neighbor.heatSource)
        w.temp[j] = Math.max(-250, Math.min(6000, w.temp[j] + m.aura));
      if (m.aura < 0 && w.cells[j] === M.Fire)
        w.life[j] = Math.max(1, w.life[j] - 8);
    });
  } else if (m.energyRule === "gravity") {
    w.fields.add(x, y, m.force);
    if (m.absorbMatter)
      w.eachNeighbor(x, y, (j) => {
        if (materials[w.cells[j]].movable) w.set(j, 0);
      });
  } else if (m.energyRule === "uranium") {
    if (w.random() < m.emissionChance) emitRays(w, x, y, M.Neutron, 1);
  } else if (m.energyRule === "antimatter") {
    let target = -1;
    w.eachNeighbor(x, y, (j) => {
      const other = materials[w.cells[j]];
      if (
        target < 0 &&
        other.id &&
        other.id !== m.id &&
        other.category !== "special" &&
        other.category !== "energy"
      )
        target = j;
    });
    if (target >= 0 && budget(w, "energyReactions", 32)) {
      w.set(target, 0);
      w.set(i, 0);
      w.explode(x, y, 5);
      w.set(i, M.Plasma, 5000, 14);
    }
  } else if (m.energyRule === "fairy") {
    let consumed = false;
    w.eachNeighbor(x, y, (j) => {
      if (
        ![M.Plant, M.Seed].includes(w.cells[j]) ||
        w.temp[j] < 5 ||
        w.temp[j] > 45
      )
        return;
      if (w.cells[j] === M.Seed) w.set(j, M.Plant, w.temp[j]);
      w.moisture[j] = Math.min(255, w.moisture[j] + 80);
      w.nutrition[j] = Math.min(255, w.nutrition[j] + 120);
      consumed = true;
    });
    if (consumed) w.set(i, M.Light, 20, 18);
  }
}
function reflect(w, i, x, y, dx, dy) {
  // The first blocked axis estimates the surface normal for diagonal impacts.
  if (dx && dy) {
    const side = w.index(x + dx, y);
    if (side < 0 || w.cells[side]) dx = -dx;
    else dy = -dy;
  } else {
    dx = -dx;
    dy = -dy;
  }
  w.heading[i] = rayHeading(dx, dy);
}
function fission(w, j, x, y) {
  if (!budget(w, "energyReactions", 32)) return;
  w.set(j, M.Metal, 900);
  w.fields.add(x, y, 12);
  emitRays(w, x, y, M.Neutron, 3);
}
export function moveRay(w, i, x, y, m) {
  const [dx, dy] = rayDirections[w.heading[i]],
    sound = m.ray === "sound",
    neutron = m.ray === "neutron";
  let moved = 0,
    traversed = 0;
  // Transparent matter occupies the same grid as rays. Skip its cells without
  // overwriting it; cap penetration work even in entirely filled looping worlds.
  while (moved < m.speed && traversed++ < m.speed + 16) {
    const nx = x + dx,
      ny = y + dy,
      j = w.index(nx, ny);
    if (j < 0) {
      if (sound && w.border === "solid") reflect(w, i, x, y, dx, dy);
      else w.set(i, 0);
      return;
    }
    if (j === i) return;
    const target = materials[w.cells[j]];
    if (!target.id) {
      w.swap(i, j);
      i = j;
      x = j % w.width;
      y = Math.floor(j / w.width);
      moved++;
      if (sound) w.fields.add(x, y, 0.28);
      continue;
    }
    if (
      target.absorbMatter ||
      target.id === M.Void ||
      target.category === "special"
    ) {
      w.set(i, 0);
      return;
    }
    if (neutron) {
      if (target.id === M.Uranium) {
        w.set(i, 0);
        fission(w, j, j % w.width, Math.floor(j / w.width));
        return;
      }
      if (target.id === M.Sponge) {
        w.temp[j] = Math.min(6000, w.temp[j] + 5);
        w.set(i, 0);
        return;
      }
      w.temp[j] = Math.min(6000, w.temp[j] + 8);
    } else if (sound) {
      w.fields.add(j % w.width, Math.floor(j / w.width), 1.8);
      if (target.id === M.Sponge) {
        w.set(i, 0);
        return;
      }
      if (
        target.id === M.Glass &&
        w.fields.pressure[
          w.fields.index(j % w.width, Math.floor(j / w.width))
        ] > 3.5
      )
        w.set(j, M["Glass dust"], w.temp[j]);
      if (target.category === "solid" || target.category === "powder") {
        reflect(w, i, x, y, dx, dy);
        w.life[i] = Math.max(1, w.life[i] - 4);
        return;
      }
    } else {
      if (target.reflectLight) {
        reflect(w, i, x, y, dx, dy);
        return;
      }
      if (target.photoelectric) {
        w.charge[j] = 6;
        w.cooldown[j] = 18;
        w.chargedAt[j] = w.tick;
        w.temp[j] = Math.min(6000, w.temp[j] + (m.absorptionHeat || 1));
        w.set(i, 0);
        return;
      }
      const transparent =
        target.id === M.Glass ||
        target.category === "gas" ||
        target.waterLike ||
        target.category === "energy";
      w.temp[j] = Math.min(
        6000,
        w.temp[j] + (m.absorptionHeat || 1) * (transparent ? 0.08 : 1),
      );
      if (!transparent) {
        w.set(i, 0);
        return;
      }
      if (w.life[i] > 1) w.life[i]--;
    }
    x = j % w.width;
    y = Math.floor(j / w.width);
  }
  // A completely filled transparent volume has no cell available to represent a ray.
  if (!moved) w.set(i, 0);
}
