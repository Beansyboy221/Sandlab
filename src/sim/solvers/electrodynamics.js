import { materials } from "../materials.js";
import { arcGap } from "../sparks.js";
import { conducts } from "../oxidation.js";

export function conductCharge(world, i, x, y, m) {
  const { cells: c, temp: t, charge: q, cooldown: cd } = world;
  if (!conducts(world, i)) {
    q[i] = 0;
    return;
  }
  if (q[i] === 6 && m.conductive) arcGap(world, i, x, y);
  q[i]--;
  t[i] += 1.5;
  const propagate = (j) => {
    if (conducts(world, j) && !cd[j]) {
      q[j] = 6;
      cd[j] = 18;
      world.chargedAt[j] = world.tick;
    }
  };
  world.eachNeighbor(x, y, propagate);
  if (m.rigid) world.rigid.connections.each(i, propagate);
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
      t[j] += 30;
      wetSpark = true;
      if (!world.residue[i] && conducts(world, j) && !cd[j]) {
        q[j] = 6;
        cd[j] = 18;
        world.chargedAt[j] = world.tick;
      }
    } else if (!world.residue[i] && conducts(world, j) && !cd[j]) {
      q[j] = 6;
      cd[j] = 18;
      world.chargedAt[j] = world.tick;
    } else if (materials[c[j]].ignite) t[j] += 30;
  });
  if (wetSpark) {
    world.transform(i, world.residue[i] || 0, 100);
    return true;
  }

  return false;
}
