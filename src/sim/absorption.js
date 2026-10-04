import { MAX_DISSOLVED } from "./mixtures.js";
import { M, materials } from "./materials.js";

export const absorbable = (id) => !!materials[id]?.absorbable;
export const acceptsLiquid = (host, type) =>
  !!materials[host]?.porosity &&
  absorbable(type) &&
  (!materials[host].waterOnly || !!materials[type].waterLike);
const compatible = (a, b) =>
  !a || a === b || (materials[a].waterLike && materials[b].waterLike);
const mixed = (a, b) => (a === M.Brine || b === M.Brine ? M.Brine : b);
const offsets = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
];

// One bounded four-neighbor pass per three ticks. Integer reservoirs use the
// existing particle arrays; no particle objects, flood fills or wet-cell lists.
export function absorb(w, i, x, y) {
  const host = materials[w.cells[i]],
    amount = w.storedAmount[i];
  if (!host.porosity || !host.permeability) return;
  const type = w.storedLiquid[i],
    fluid = materials[type];
  const boiling =
    amount && fluid.waterLike && w.temp[i] > (fluid.dry ?? fluid.boil ?? 100);
  const burning = amount && fluid.ignite && w.temp[i] > fluid.ignite;
  if (amount && fluid.freeze !== undefined && w.temp[i] < fluid.freeze) return;
  const forced =
    amount &&
    (w.cooldown[i] || Math.abs(w.fields.pressure[w.fields.index(x, y)]) > 3);
  if (boiling || burning || forced) {
    if (
      forced &&
      !boiling &&
      !burning &&
      w.random() >=
        host.permeability *
          (1 +
            (w.cooldown[i]
              ? 10
              : Math.abs(w.fields.pressure[w.fields.index(x, y)])))
    )
      return;
    release(
      w,
      i,
      x,
      y,
      boiling
        ? fluid.dryTo !== undefined || w.nutrition[i]
          ? type
          : M.Steam
        : burning
          ? M.Fire
          : type,
    );
    if (boiling && w.storedAmount[i]) w.temp[i] = Math.min(w.temp[i], 100);
    return;
  }
  if ((i + w.tick) % 3 || (w.inParticlePass && w.poreUpdated[i] === w.tick))
    return;
  if (w.random() >= host.permeability) return;
  for (let side = 0; side < 4; side++) {
    const [dx, dy] = offsets[side],
      j = w.relativeIndex(x, y, dx, dy);
    if (j < 0) continue;
    const neighbor = materials[w.cells[j]],
      a = w.storedAmount[i],
      t = w.storedLiquid[i];
    if (
      acceptsLiquid(host.id, neighbor.id) &&
      a < host.porosity &&
      compatible(t, neighbor.id)
    ) {
      takeLiquid(w, i, j);
    } else if (
      a &&
      neighbor.porosity &&
      neighbor.permeability &&
      acceptsLiquid(neighbor.id, t) &&
      compatible(w.storedLiquid[j], t) &&
      (!w.inParticlePass || w.poreUpdated[j] !== w.tick)
    ) {
      if (
        w.dissolvedId[i] &&
        w.dissolvedId[j] &&
        w.dissolvedId[i] !== w.dissolvedId[j]
      )
        continue;
      const b = w.storedAmount[j];
      // Equalize saturation rather than raw amounts, so a large sponge can wet
      // a small soil pore without that soil endlessly pumping liquid back.
      const gradient = a / host.porosity - b / neighbor.porosity;
      if (gradient <= 0 || b >= neighbor.porosity) continue;
      const rate =
        (Math.min(host.permeability, neighbor.permeability) *
          (1 - host.retention * 0.5)) /
        Math.max(1, materials[t].viscosity);
      if (w.random() >= rate) continue;
      const nutrientRoom = w.nutrition[i]
        ? Math.floor(((255 - w.nutrition[j]) * a) / w.nutrition[i])
        : 255;
      const units = Math.min(
        nutrientRoom,
        4,
        a,
        neighbor.porosity - b,
        Math.ceil(gradient * Math.min(host.porosity, neighbor.porosity) * 0.5),
      );
      if (!units) continue;
      transfer(w, i, j, units);
      if (w.inParticlePass) w.poreUpdated[j] = w.tick;
    }
  }
  if (
    w.storedAmount[i] &&
    w.random() <
      ((1 - host.retention) * 0.15) /
        Math.max(1, materials[w.storedLiquid[i]].viscosity)
  ) {
    // Gravity drains exposed downward pores; capillary retention opposes it.
    release(w, i, x, y, w.storedLiquid[i], true);
  }
  hydrate(w, i);
}
// Dry hosts need no scan: available liquids offer one unit to one neighboring
// pore. The receiver stamp also prevents fresh water traversing a whole bed in
// one tick, independent of scan direction. No chunk/source bookkeeping needed.
export function absorbFromLiquid(w, i, x, y) {
  if ((i + w.tick) % 3) return false;
  const type = w.cells[i],
    fluid = materials[type];
  const first = (w.variant[i] + w.tick) & 3;
  for (let side = 0; side < 4; side++) {
    const [dx, dy] = offsets[(side + first) & 3],
      j = w.relativeIndex(x, y, dx, dy);
    if (j < 0) continue;
    const host = materials[w.cells[j]];
    if (
      !host.permeability ||
      !acceptsLiquid(host.id, type) ||
      w.storedAmount[j] >= host.porosity ||
      !compatible(w.storedLiquid[j], type) ||
      (w.inParticlePass && w.poreUpdated[j] === w.tick) ||
      (fluid.freeze !== undefined && w.temp[j] < fluid.freeze) ||
      w.random() >= host.permeability / Math.max(1, fluid.viscosity)
    )
      continue;
    if (takeLiquid(w, j, i)) {
      if (w.inParticlePass) w.poreUpdated[j] = w.tick;
      hydrate(w, j);
      return true;
    }
  }
  return false;
}
function takeLiquid(w, i, j) {
  if (
    (w.dissolvedId[i] &&
      w.dissolvedId[j] &&
      w.dissolvedId[i] !== w.dissolvedId[j]) ||
    w.dissolvedAmount[i] + w.dissolvedAmount[j] > 255
  )
    return false;
  if (w.nutrition[i] + w.nutrition[j] > 255) return false;
  const a = w.storedAmount[i],
    type = w.cells[j],
    food = w.nutrition[j],
    heat = w.temp[j];
  const additive = w.dissolvedId[j],
    solute = w.dissolvedAmount[j];
  w.dissolvedId[j] = w.dissolvedAmount[j] = 0;
  if (!w.transform(j, 0)) {
    w.dissolvedId[j] = additive;
    w.dissolvedAmount[j] = solute;
    return false;
  }
  if (solute) {
    w.dissolvedId[i] = additive;
    w.dissolvedAmount[i] += solute;
  }
  w.temp[i] = (w.temp[i] * (a + 1) + heat) / (a + 2);
  w.storedAmount[i] = a + 1;
  w.storedLiquid[i] = mixed(w.storedLiquid[i], type);
  w.nutrition[i] += food;
  w.wake(i);
  return true;
}
function transfer(w, i, j, units) {
  const a = w.storedAmount[i],
    b = w.storedAmount[j],
    t = w.storedLiquid[i];
  const solute = Math.min(
    Math.floor((w.dissolvedAmount[i] * units) / a),
    MAX_DISSOLVED * materials[w.cells[j]].porosity - w.dissolvedAmount[j],
  );
  if (solute) {
    w.dissolvedId[j] = w.dissolvedId[i];
    w.dissolvedAmount[j] += solute;
    w.dissolvedAmount[i] -= solute;
    if (!w.dissolvedAmount[i]) w.dissolvedId[i] = 0;
  }
  const food = Math.round((w.nutrition[i] * units) / a);
  w.temp[j] = (w.temp[j] * (b + 1) + w.temp[i] * units) / (b + 1 + units);
  w.storedLiquid[j] = mixed(w.storedLiquid[j], t);
  w.storedAmount[j] += units;
  w.storedAmount[i] -= units;
  w.nutrition[i] -= food;
  w.nutrition[j] = Math.min(255, w.nutrition[j] + food);
  if (!w.storedAmount[i]) w.storedLiquid[i] = 0;
  hydrate(w, i);
  hydrate(w, j);
  w.wake(i);
  w.wake(j);
}
function hydrate(w, i) {
  const id = w.cells[i];
  if (id !== M.Dirt && id !== M.Mud && id !== M.Clay && id !== M["Wet Clay"])
    return;
  const amount = materials[w.storedLiquid[i]].waterLike ? w.storedAmount[i] : 0;
  w.moisture[i] = Math.min(255, amount * 80);
}

export function consumeWater(w, i) {
  if (!w.storedAmount[i] || !materials[w.storedLiquid[i]].waterLike)
    return false;
  w.moisture[i] = Math.min(255, w.moisture[i] + 80);
  if (!--w.storedAmount[i]) w.storedLiquid[i] = 0;
  w.wake(i);
  return true;
}
function release(w, i, x, y, output, downwardOnly = false) {
  const hot = output === M.Steam || output === M.Fire;
  for (let side = 0; side < (downwardOnly ? 1 : 4); side++) {
    const [dx, dy] = offsets[hot ? 3 - side : side],
      j = w.relativeIndex(x, y, dx, dy);
    if (j < 0 ? w.border !== "void" : w.cells[j]) continue;
    const amount = w.storedAmount[i],
      food = Math.ceil(w.nutrition[i] / amount);
    if (j >= 0) {
      w.transform(
        j,
        output,
        output === M.Steam ? 120 : output === M.Fire ? 680 : w.temp[i],
      );
      w.nutrition[j] = food;
      if (!hot) {
        const solute = Math.min(
          MAX_DISSOLVED,
          Math.floor(w.dissolvedAmount[i] / amount),
        );
        if (solute) {
          w.dissolvedId[j] = w.dissolvedId[i];
          w.dissolvedAmount[j] = solute;
          w.dissolvedAmount[i] -= solute;
          if (!w.dissolvedAmount[i]) w.dissolvedId[i] = 0;
        }
      }
    }
    w.nutrition[i] -= food;
    w.storedAmount[i]--;
    if (!w.storedAmount[i]) w.storedLiquid[i] = 0;
    if (hot) {
      w.fields.add(x, y, 0.8);
      w.temp[i] = Math.max(90, w.temp[i] - 5);
    }
    hydrate(w, i);
    w.wake(i);
    return true;
  }
  return false;
}

// Destruction/phase changes drain excess before changing the host. Sealed wet
// matter waits for space instead of losing its contents. At most four pixels
// can escape per call, regardless of capacity; editor deletion uses World.set.
export function releaseForChange(w, i, target) {
  const capacity = acceptsLiquid(target, w.storedLiquid[i])
    ? materials[target].porosity
    : 0;
  if (w.storedAmount[i] <= capacity) return true;
  const x = i % w.width,
    y = Math.floor(i / w.width);
  for (let n = 0; n < 4 && w.storedAmount[i] > capacity; n++)
    if (!release(w, i, x, y, w.storedLiquid[i])) break;
  return w.storedAmount[i] <= capacity;
}
