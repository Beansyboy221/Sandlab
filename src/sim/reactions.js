import { applyHeatSource } from "./solvers/thermodynamics.js";
import {
  mixContact,
  diffuseDissolved,
  freezingPoint,
  soluble,
} from "./mixtures.js";
import { reactBubbles } from "./bubbles.js";
import { reactEnergy } from "./energy.js";
import { reactExplosive } from "./ignition.js";
import { materials } from "./materials.js";
import {
  reactContact,
  oxidize,
  contactParticipants,
  etch,
} from "./chemistry.js";
import { changePhase } from "./phase-changes.js";
import { absorb, absorbFromLiquid } from "./absorption.js";
import { conductCharge, reactSpark } from "./solvers/electrodynamics.js";
import { solveMaterialDevice } from "./solvers/material-devices.js";
import { solveBiology } from "./solvers/biology.js";
import { weather } from "./weather.js";
import { burnFuel, reactFire } from "./combustion.js";

const continuousRules = Uint8Array.from(materials, (m) =>
  Number(
    Boolean(
      soluble[m.id] ||
      contactParticipants[m.id] ||
      m.energyRule ||
      m.oxidationRate ||
      m.acidity ||
      m.alkalinity ||
      m.explosive ||
      m.heatSource ||
      m.weather ||
      m.soluble ||
      m.bubble ||
      m.biology ||
      m.flame ||
      m.electricalArc ||
      m.discharge ||
      m.deviceRule,
    ),
  ),
);

export function react(world, i, x, y) {
  const { cells: c, temp: t, life: l, charge: q, cooldown: cd } = world;
  const id = c[i],
    m = materials[id];
  if (cd[i]) {
    cd[i]--;
    if (cd[i]) world.wake(i);
  }
  if (q[i] && world.chargedAt[i] !== world.tick)
    conductCharge(world, i, x, y, m);
  // Stable grains and fluids still exchange heat in World.step. They need a
  // chemistry handler only on a phase threshold, live burn/lifetime, or charge.
  if (
    !continuousRules[id] &&
    !m.absorbable &&
    !world.storedAmount[i] &&
    !(m.burn && (l[i] || t[i] >= m.ignite)) &&
    !(m.lifetime && l[i]) &&
    t[i] <= m.phaseMaximum &&
    t[i] >= m.phaseMinimum
  )
    return;
  if (mixContact(world, i, x, y)) return;
  if (world.dissolvedAmount[i]) diffuseDissolved(world, i, x, y);
  if (m.energyRule) {
    reactEnergy(world, i, x, y, m);
    return;
  }
  if (
    (m.bubble || (m.solvent && materials[world.dissolvedId[i]].foamTo)) &&
    reactBubbles(world, i, x, y)
  )
    return;
  // Contact chemistry precedes phase changes, so a hot water-reactive metal
  // still reacts with water before that water flashes into steam.
  if (contactParticipants[id] && reactContact(world, i, x, y)) return;
  if (m.absorbable && absorbFromLiquid(world, i, x, y)) return;
  if (
    m.porosity &&
    m.permeability &&
    (world.storedAmount[i] || !world.inParticlePass)
  ) {
    absorb(world, i, x, y);
    if (c[i] !== id) return;
  }
  if (
    (t[i] > m.phaseMaximum || t[i] < m.phaseMinimum) &&
    (!m.solvent || t[i] < freezingPoint(world, i) || t[i] > m.phaseMaximum) &&
    changePhase(world, i, x, y, m)
  )
    return;
  if (m.oxidationRate) {
    oxidize(world, i, x, y, m);
    if (c[i] !== id) return;
  }
  if (m.explosive && reactExplosive(world, i, x, y, m)) return;
  if (m.burn && (!m.explosive || m.deflagrates)) {
    burnFuel(world, i, x, y, m);
    if (c[i] !== id || l[i] || t[i] >= m.ignite) return;
  }
  if (m.discharge || m.weather) {
    weather(world, i, x, y);
    return;
  }
  if (m.biology) {
    solveBiology(world, i, x, y, m);
    if (
      c[i] !== id ||
      m.biology.mode === "infect" ||
      m.biology.mode === "colonize"
    )
      return;
  }
  if (m.flame) {
    reactFire(world, i, x, y);
    return;
  }
  if (m.electricalArc) {
    if (reactSpark(world, i, x, y)) return;
  } else if (m.lifetime && l[i] && --l[i] === 0) world.transform(i, 0);
  if (m.heatSource) applyHeatSource(world, i, x, y, m);
  else if (m.acidity || m.alkalinity) etch(world, i, x, y, m);
  else if (m.deviceRule) solveMaterialDevice(world, i, x, y, m);
}
