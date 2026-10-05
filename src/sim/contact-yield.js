import { materials } from "./materials.js";
import { fractureLimits } from "./body-stress.js";
import { cuttingFraction, fractureWork } from "./fracture-energy.js";

export function yieldContact(solver, i, j, energy, breakCell) {
  if (!solver.grains || j < 0) return 0;
  const w = solver.world,
    source = materials[w.cells[i]],
    target = materials[w.cells[j]];
  let cost = 0;
  const cutting =
    target.rigid &&
    !target.static &&
    target.breakInto !== undefined &&
    materials[target.breakInto].category === "powder";
  if (cutting) {
    const resistance = target.toughness / cuttingFraction(target);
    if (
      source.toughness / cuttingFraction(source) <= resistance ||
      solver.work.impactStressSamples >= fractureLimits.impactSamples
    )
      return 0;
    cost = fractureWork(w, j, true);
  } else if (target.category !== "powder" || target.rigid || !target.movable)
    return 0;
  const spent = solver.grains.find(j, energy, cost);
  if (!spent) return 0;
  if (cutting) {
    solver.work.impactStressSamples++;
    breakCell(solver, j, cost + 1e-6, true);
  }
  return solver.grains.move() ? spent : 0;
}
