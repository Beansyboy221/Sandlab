import { reactFoam } from "./foam.js";
import { reactBubbles } from "./bubbles.js";
import { reactEnergy } from "./energy.js";
import { arcGap } from "./sparks.js";
import { reactExplosive } from "./ignition.js";
import { M, materials } from "./materials.js";
import { reactContact, oxidize, dissolveOrganic } from "./chemistry.js";
import { changePhase } from "./phase-changes.js";
import { absorb } from "./absorption.js";
import { grow } from "./biology.js";
import { weather } from "./weather.js";
import { burnFuel, reactFire } from "./combustion.js";

export function react(world, i, x, y) {
  const { cells: c, temp: t, life: l, charge: q, cooldown: cd } = world;
  const id = c[i],
    m = materials[id];
  if (cd[i]) cd[i]--;
  if (q[i] && world.chargedAt[i] !== world.tick) {
    if (q[i] === 6 && m.conductive) arcGap(world, i, x, y);
    q[i]--;
    t[i] += 1.5;
    world.eachNeighbor(x, y, (j) => {
      if (materials[c[j]].conductive && !cd[j]) {
        q[j] = 6;
        cd[j] = 18;
        world.chargedAt[j] = world.tick;
      }
    });
  }
  if (m.energyRule) {
    reactEnergy(world, i, x, y, m);
    return;
  }
  if (reactFoam(world, i, x, y)) return;
  if (reactBubbles(world, i, x, y)) return;
  // Contact chemistry precedes phase changes, so a hot water-reactive metal
  // still reacts with water before that water flashes into steam.
  if (reactContact(world, i, x, y) || changePhase(world, i, x, y, m)) return;
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
    if (!l[i] || --l[i] === 0) {
      world.transform(i, world.residue[i] || 0, 120);
      return;
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
      return;
    }
  } else if (m.lifetime && l[i] && --l[i] === 0) world.transform(i, 0);
  if (m.heatSource) {
    t[i] = m.temperature;
    world.eachNeighbor(x, y, (j) => {
      if (c[j]) t[j] += (t[i] - t[j]) * 0.12;
    });
  } else if (id === M.Acid) {
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
  } else if (id === M.Void)
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
