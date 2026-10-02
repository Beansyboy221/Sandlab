import { reactFoam } from "./foam.js";
import { reactBubbles } from "./bubbles.js";
import { reactEnergy } from "./energy.js";
import { arcGap } from "./sparks.js";
import { reactExplosive } from "./ignition.js";
import { M, materials } from "./materials.js";
import {
  reactContact,
  oxidize,
  dissolveOrganic,
  contactParticipants,
} from "./chemistry.js";
import { changePhase } from "./phase-changes.js";
import { absorb } from "./absorption.js";
import { grow } from "./biology.js";
import { weather } from "./weather.js";
import { burnFuel, reactFire } from "./combustion.js";

const continuousRules = Uint8Array.from(materials, (m) =>
  Number(
    Boolean(
      contactParticipants[m.id] ||
      m.energyRule ||
      m.oxidizeTo ||
      m.corrodesOrganic ||
      m.explosive ||
      m.heatSource ||
      [
        M["Carbon dioxide foam"],
        M.Soap,
        M.Bubble,
        M["Soapy water"],
        M.Sponge,
        M.Lightning,
        M.Storm,
        M.Cloud,
        M.Plant,
        M.Seed,
        M.Dirt,
        M.Mud,
        M.Fire,
        M.Plasma,
        M.Spark,
        M.Acid,
        M.Void,
        M.Clone,
      ].includes(m.id),
    ),
  ),
);

export function react(world, i, x, y) {
  const { cells: c, temp: t, life: l, charge: q, cooldown: cd } = world;
  const id = c[i],
    m = materials[id];
  if (cd[i]) cd[i]--;
  if (q[i] && world.chargedAt[i] !== world.tick) conduct(world, i, x, y, m);
  // Stable grains and fluids still exchange heat in World.step. They need a
  // chemistry handler only on a phase threshold, live burn/lifetime, or charge.
  if (
    !continuousRules[id] &&
    !(m.burn && (l[i] || t[i] >= m.ignite)) &&
    !(m.lifetime && l[i]) &&
    t[i] <= m.phaseMaximum &&
    t[i] >= m.phaseMinimum
  )
    return;
  if (m.energyRule) {
    reactEnergy(world, i, x, y, m);
    return;
  }
  if (id === M["Carbon dioxide foam"] && reactFoam(world, i, x, y)) return;
  if (
    (id === M.Soap || id === M.Bubble || id === M["Soapy water"]) &&
    reactBubbles(world, i, x, y)
  )
    return;
  // Contact chemistry precedes phase changes, so a hot water-reactive metal
  // still reacts with water before that water flashes into steam.
  if (contactParticipants[id] && reactContact(world, i, x, y)) return;
  if (
    (t[i] > m.phaseMaximum || t[i] < m.phaseMinimum) &&
    changePhase(world, i, x, y, m)
  )
    return;
  if (m.oxidizeTo) {
    oxidize(world, i, x, y, m);
    if (c[i] !== id) return;
  }
  if (m.corrodesOrganic) {
    dissolveOrganic(world, i, x, y);
    if (c[i] !== id) return;
  }
  if (m.explosive && reactExplosive(world, i, x, y, m)) return;
  if (id === M.Sponge) absorb(world, i, x, y);
  if (m.burn && (!m.explosive || m.deflagrates)) {
    burnFuel(world, i, x, y, m);
    if (c[i] !== id || l[i] || t[i] >= m.ignite) return;
  }
  if (id === M.Lightning || id === M.Storm || id === M.Cloud) {
    weather(world, i, x, y);
    return;
  }
  if (id === M.Plant || id === M.Seed || id === M.Dirt || id === M.Mud)
    grow(world, i, x, y);
  if (id === M.Fire) {
    reactFire(world, i, x, y);
    return;
  }
  if (id === M.Plasma || id === M.Spark) {
    if (transientEnergy(world, i, x, y, id)) return;
  } else if (m.lifetime && l[i] && --l[i] === 0) world.transform(i, 0);
  if (m.heatSource) heatSource(world, i, x, y, m);
  else if (id === M.Acid) etch(world, i, x, y);
  else if (id === M.Void || id === M.Clone) device(world, i, x, y, id);
}

// Keep neighbor callbacks in the uncommon handlers. The main dispatcher then
// avoids allocating a closure context for every grain of settled sand or water.
function conduct(world, i, x, y, m) {
  const { cells: c, temp: t, charge: q, cooldown: cd } = world;
  if (q[i] === 6 && m.conductive) arcGap(world, i, x, y);
  q[i]--;
  t[i] += 1.5;
  const propagate = (j) => {
    if (materials[c[j]].conductive && !cd[j]) {
      q[j] = 6;
      cd[j] = 18;
      world.chargedAt[j] = world.tick;
    }
  };
  world.eachNeighbor(x, y, propagate);
  if (m.rigid) world.rigid.connections.each(i, propagate);
}
function transientEnergy(world, i, x, y, id) {
  const { cells: c, temp: t, life: l, charge: q, cooldown: cd } = world;
  if (!l[i] || --l[i] === 0) {
    world.transform(i, world.residue[i] || 0, 120);
    return true;
  }
  if (id === M.Plasma) t[i] = 5000;
  let wetSpark = false;
  world.eachNeighbor(x, y, (j) => {
    if (materials[c[j]].waterLike) {
      t[j] += id === M.Plasma ? 200 : 30;
      if (id === M.Spark) {
        wetSpark = true;
        if (!world.residue[i] && materials[c[j]].conductive && !cd[j]) {
          q[j] = 6;
          cd[j] = 18;
          world.chargedAt[j] = world.tick;
        }
      }
    } else if (
      id === M.Spark &&
      !world.residue[i] &&
      materials[c[j]].conductive &&
      !cd[j]
    ) {
      q[j] = 6;
      cd[j] = 18;
      world.chargedAt[j] = world.tick;
    } else if (materials[c[j]].ignite) t[j] += id === M.Plasma ? 200 : 30;
  });
  if (wetSpark) {
    world.transform(i, world.residue[i] || 0, 100);
    return true;
  }

  return false;
}
function heatSource(world, i, x, y, m) {
  const { cells: c, temp: t } = world;
  t[i] = m.temperature;
  world.eachNeighbor(x, y, (j) => {
    if (c[j]) t[j] += (t[i] - t[j]) * 0.12;
  });
}
function etch(world, i, x, y) {
  const { cells: c, temp: t } = world;
  // Strong acid etches susceptible mineral/organic surfaces slowly. Glass,
  // oils, water, and unrelated devices do not vanish on contact. Metals and
  // carbonates react through the product-aware contact registry above.
  if (world.random() < 0.025) {
    let target = -1;
    world.eachNeighbor(x, y, (j) => {
      if (
        target < 0 &&
        (c[j] === M.Stone || c[j] === M.Concrete || materials[c[j]].organic)
      )
        target = j;
    });
    if (target >= 0) {
      world.transform(target, 0);
      world.transform(i, M.Water, t[i]);
    }
  }
}
function device(world, i, x, y, id) {
  const c = world.cells;
  if (id === M.Void)
    world.eachNeighbor(x, y, (j) => {
      if (c[j] && c[j] !== M.Void) world.transform(j, 0);
    });
  else if (id === M.Clone) {
    world.eachNeighbor(x, y, (j) => {
      if (
        !world.clone[i] &&
        c[j] &&
        ["powder", "liquid", "gas"].includes(materials[c[j]].category)
      )
        world.clone[i] = c[j];
      if (!c[j] && world.clone[i] && world.random() < 0.3)
        world.transform(j, world.clone[i]);
    });
  }
}
