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
export function reactEnergy(w, i, x, y, m) {
  if (m.energyRule === "ray") {
    if (!w.life[i] || --w.life[i] === 0) w.transform(i, 0);
  } else if (m.energyRule === "gravity") {
    w.fields.add(x, y, m.force);
    if (m.absorbMatter)
      w.eachNeighbor(x, y, (j) => {
        if (materials[w.cells[j]].movable) w.transform(j, 0);
      });
  } else if (m.energyRule === "uranium") {
    if (w.random() < m.emissionChance) {
      w.temp[i] = Math.min(6000, w.temp[i] + 8);
      w.fields.heat(x, y, 0.5);
    }
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
      w.transform(target, 0);
      w.transform(i, 0);
      w.explode(x, y, 5);
      w.transform(i, M.Fire, 2500, 14);
    }
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
export function moveRay(w, i, x, y, m) {
  const [dx, dy] = rayDirections[w.heading[i]],
    sound = m.ray === "sound";
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
      else w.transform(i, 0);
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
      w.transform(i, 0);
      return;
    }
    if (sound) {
      w.fields.add(j % w.width, Math.floor(j / w.width), 1.8);
      if (target.id === M.Sponge) {
        w.transform(i, 0);
        return;
      }
      if (
        target.id === M.Glass &&
        w.fields.pressure[
          w.fields.index(j % w.width, Math.floor(j / w.width))
        ] > 3.5
      )
        w.transform(j, M["Glass Shards"], w.temp[j]);
      if (
        target.static ||
        ["solid", "elastic", "powder"].includes(target.category)
      ) {
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
        w.transform(i, 0);
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
        w.transform(i, 0);
        return;
      }
      if (w.life[i] > 1) w.life[i]--;
    }
    x = j % w.width;
    y = Math.floor(j / w.width);
  }
  // A completely filled transparent volume has no cell available to represent a ray.
  if (!moved) w.transform(i, 0);
}
