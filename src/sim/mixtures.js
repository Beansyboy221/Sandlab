import { materials } from "./materials.js";

// One carrier plus one dissolved ingredient per cell. Amounts count whole
// source pixels, so mixing, pore transfer and separation conserve ingredients.
// Different neighboring solutions retain their own additives; work is local.
export const mixtureFields = ["dissolvedId", "dissolvedAmount"];
export const MAX_DISSOLVED = 4;
export const soluble = Uint8Array.from(materials, (m) => Number(!!m.soluble));
// Chemical dissolution can carry attacked material without making it water-soluble.
export const dissolvable = Uint8Array.from(materials, (m) =>
  Number(!!m.soluble || m.acidSolubility > 0 || m.alkaliSolubility > 0),
);
export const mixtureBase = Uint8Array.from(
  materials,
  (m) => m.mixtureCarrier ?? m.id,
);
// Retired combined presets carry migration data; the solver has no named cases.
export function migrateMixture(w, i, old = w.cells[i]) {
  const m = materials[old];
  w.cells[i] = mixtureBase[w.cells[i]];
  if (m.initialDissolved !== undefined) {
    w.dissolvedId[i] = m.initialDissolved;
    w.dissolvedAmount[i] ||= 1;
  }
  if (m.initialLiquidAmount && !w.storedAmount[i]) {
    w.storedLiquid[i] = m.initialLiquid;
    w.storedAmount[i] = m.initialLiquidAmount;
    w.moisture[i] = Math.min(255, w.storedAmount[i] * (m.poreHydration || 0));
  }
  const fluid = materials[w.storedLiquid[i]];
  if (fluid.initialDissolved !== undefined) {
    w.dissolvedId[i] = fluid.initialDissolved;
    w.dissolvedAmount[i] ||= w.storedAmount[i];
    w.storedLiquid[i] = fluid.mixtureCarrier;
  }
}
export function canDissolve(w, i, additive) {
  return (
    materials[w.cells[i]].solvent &&
    soluble[additive] &&
    (!w.dissolvedId[i] || w.dissolvedId[i] === additive) &&
    w.dissolvedAmount[i] < MAX_DISSOLVED
  );
}
export function addDissolved(w, i, additive, amount = 1) {
  w.dissolvedId[i] = additive;
  w.dissolvedAmount[i] += amount;
  w.wake(i);
}
export function mixContact(w, i, x, y) {
  const id = w.cells[i];
  if (!soluble[id]) return false;
  for (let d = 0; d < 4; d++) {
    const j = w.relativeIndex(
      x,
      y,
      d === 0 ? -1 : d === 1 ? 1 : 0,
      d === 2 ? -1 : d === 3 ? 1 : 0,
    );
    if (j < 0) continue;
    const host = materials[id].solvent ? i : j,
      source = materials[id].solvent ? j : i;
    if (!canDissolve(w, host, w.cells[source])) continue;
    const ingredient = w.cells[source],
      heat = w.temp[source];
    if (!w.transform(source, 0)) continue;
    addDissolved(w, host, ingredient);
    w.temp[host] = (w.temp[host] + heat) * 0.5;
    return true;
  }
  return false;
}
export function retainsMixture(id) {
  return materials[id].retainsDissolved || !!materials[id].porosity;
}
export function releaseDissolved(w, i) {
  if (!w.dissolvedAmount[i]) return true;
  const x = i % w.width,
    y = Math.floor(i / w.width);
  for (let d = 0; d < 4; d++) {
    const j = w.relativeIndex(
      x,
      y,
      d === 0 ? -1 : d === 1 ? 1 : 0,
      d === 2 ? -1 : d === 3 ? 1 : 0,
    );
    if (j < 0 || w.cells[j]) continue;
    w.set(j, w.dissolvedId[i], w.temp[i]);
    if (!--w.dissolvedAmount[i]) w.dissolvedId[i] = 0;
    w.wake(i);
    break;
  }
  return !w.dissolvedAmount[i];
}
export function effectiveDensity(w, i) {
  const m = materials[w.cells[i]],
    amount = w.dissolvedAmount[i];
  // Dissolved solids add mass and displace volume; pores store liquid separately.
  const wetDensity =
    m.density +
    (w.storedAmount[i]
      ? (0.3 * materials[w.storedLiquid[i]].density * w.storedAmount[i]) /
        Math.max(1, m.porosity)
      : 0);
  return amount
    ? (wetDensity + materials[w.dissolvedId[i]].density * amount) /
        (1 + amount * 0.65)
    : wetDensity;
}
export function effectiveViscosity(w, i) {
  const m = materials[w.cells[i]];
  return (
    m.viscosity *
    (1 +
      w.dissolvedAmount[i] *
        (materials[w.dissolvedId[i]].viscosityIncrease || 0))
  );
}
export function freezingPoint(w, i) {
  return (
    (materials[w.cells[i]].freeze ?? 0) -
    w.dissolvedAmount[i] * (materials[w.dissolvedId[i]].freezeDepression || 0)
  );
}
export function dissolvedMass(w, i) {
  return w.dissolvedAmount[i]
    ? w.dissolvedAmount[i] * materials[w.dissolvedId[i]].density
    : 0;
}

export function diffuseDissolved(w, i, x, y) {
  if (
    !materials[w.cells[i]].solvent ||
    w.dissolvedAmount[i] < 2 ||
    (i + w.tick) % 6
  )
    return;
  const d = (w.tick / 6 + w.variant[i]) & 3;
  const j = w.relativeIndex(
    x,
    y,
    d === 0 ? -1 : d === 1 ? 1 : 0,
    d === 2 ? -1 : d === 3 ? 1 : 0,
  );
  if (
    j < 0 ||
    !canDissolve(w, j, w.dissolvedId[i]) ||
    w.dissolvedAmount[i] <= w.dissolvedAmount[j] + 1
  )
    return;
  addDissolved(w, j, w.dissolvedId[i]);
  if (!--w.dissolvedAmount[i]) w.dissolvedId[i] = 0;
  w.wake(i);
}
