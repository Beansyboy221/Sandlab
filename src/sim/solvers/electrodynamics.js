import { materials } from "../materials.js";
import { arcGap } from "../sparks.js";
import { conducts } from "../oxidation.js";
import {
  energize,
  pulseAmount,
  receptive,
  deliverCharge,
} from "../electrical-energy.js";
import { thermalCapacity, addThermalEnergy } from "../thermal-capacity.js";

export function conductCharge(world, i, x, y, m) {
  const q = world.charge;
  if (!conducts(world, i)) {
    addThermalEnergy(world, i, world.electricalEnergy[i]);
    world.electricalEnergy[i] = q[i] = 0;
    return;
  }
  // Each pulse transports once; its remaining six-tick signal is cosmetic.
  if (q[i] === 6) {
    let energy = world.electricalEnergy[i] || pulseAmount(world, i);
    // Legacy saves/manual source injection carry no energy field yet.
    world.electricalEnergy[i] = energy;
    if (m.conductive) arcGap(world, i, x, y);
    energy = world.electricalEnergy[i];
    const loss = Math.min(
      energy,
      (Math.max(0.015, m.electricalResistance) * pulseAmount(world, i)) / 6,
    );
    energy -= loss;
    addThermalEnergy(world, i, loss);
    const targets =
      world.electricalTargets || (world.electricalTargets = new Int32Array(12));
    let count = 0;
    const collect = (j) => {
      if (!receptive(world, j)) return;
      for (let n = 0; n < count; n++) if (targets[n] === j) return;
      if (count < targets.length) targets[count++] = j;
    };
    world.eachNeighbor(x, y, collect);
    if (m.rigid) world.rigid.connections.each(i, collect);
    if (count && energy > 1e-6) {
      const share = energy / count;
      for (let n = 0; n < count; n++) deliverCharge(world, targets[n], share);
    } else addThermalEnergy(world, i, energy);
    world.electricalEnergy[i] = 0;
  }
  q[i]--;
}
export function reactSpark(world, i, x, y) {
  const { cells: c, temp: t, life: l, charge: q, cooldown: cd } = world;
  if (!l[i] || --l[i] === 0) {
    world.transform(i, world.residue[i] || 0, 120);
    return true;
  }
  let wetSpark = false;
  world.eachNeighbor(x, y, (j) => {
    if (materials[c[j]].waterLike) {
      sparkHeat(world, i, j);
      wetSpark = true;
      if (!world.residue[i] && conducts(world, j) && !cd[j]) {
        transferSpark(world, i, j);
      }
    } else if (!world.residue[i] && conducts(world, j) && !cd[j]) {
      transferSpark(world, i, j);
    } else if (materials[c[j]].ignite) sparkHeat(world, i, j);
  });
  if (wetSpark) {
    world.transform(i, world.residue[i] || 0, 100);
    return true;
  }

  return false;
}

function transferSpark(world, source, target) {
  const energy = world.electricalEnergy[source];
  if (energize(world, target, energy)) world.electricalEnergy[source] = 0;
}

function sparkHeat(world, source, target) {
  const capacity = thermalCapacity(world, source),
    other = thermalCapacity(world, target);
  const energy = Math.min(
    30 * other,
    (Math.max(0, world.temp[source] - world.temp[target]) * capacity * other) /
      (capacity + other),
  );
  addThermalEnergy(world, target, energy);
  addThermalEnergy(world, source, -energy);
}
