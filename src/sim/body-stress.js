import { cellMass } from "./mechanical-mass.js";
import { materials } from "./materials.js";

export const fractureLimits = Object.freeze({
  airSamples: 64,
  impactSamples: 128,
});

// Sample actual pressure traction, never body speed or age. Gravity alone
// cannot fracture a freely falling body; concentrated air loads can bend it.
export function airStress(solver, body, p) {
  const w = solver.world;
  if (
    !body.edges.length ||
    (w.tick + body.ids[0]) % 16 ||
    solver.work.airStressSamples >= fractureLimits.airSamples
  )
    return;
  solver.work.airStressSamples++;
  const i = solver.locations.get(body.edges[(w.tick * 17) % body.edges.length]);
  if (i === undefined) return;
  const m = materials[w.cells[i]];
  if (!m.brittleness || !m.breakInto) return;
  const rx = (i % w.width) + 0.5 + w.offsetX[i] - p.x,
    ry = Math.floor(i / w.width) + 0.5 + w.offsetY[i] - p.y;
  w.fields.surfaceForce(w, i, p.vx - p.omega * ry, p.vy + p.omega * rx);
  const fraction = cellMass(w, i) / body.mass;
  const unevenDrag = Math.hypot(
    w.fields.dragX - (body.dragX || 0) * fraction,
    w.fields.dragY - (body.dragY || 0) * fraction,
  );
  // A slender span amplifies bending from differential traction. Uniform drag
  // is common acceleration and does not create artificial internal tension.
  const leverage = Math.min(
    16,
    Math.max(1, (body.radius * body.radius) / Math.max(1, body.volume)),
  );
  const stress = w.fields.surfaceStress + unevenDrag * leverage;
  const strength = m.compressiveStrength * (1.4 - m.brittleness);
  if (stress > strength) solver.queueFracture(i, (stress - strength) * 0.03);
}

// Share a finite impact energy budget with immediately adjacent tissue. Never
// recurse from one fracture to another or walk the whole contacting body.
export function impactStress(solver, i, energy) {
  solver.queueFracture(i, energy * 0.5);
  const w = solver.world;
  if (
    i < 0 ||
    !materials[w.cells[i]].rigid ||
    materials[w.cells[i]].brittleness < 0.7
  )
    return;
  const owner = solver.bodyOf.get(w.elasticId[i]),
    x = i % w.width,
    y = Math.floor(i / w.width);
  let count = 0;
  const radius = 2;
  for (let pass = 0; pass < 2; pass++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if ((!dx && !dy) || Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (solver.work.impactStressSamples >= fractureLimits.impactSamples)
          return;
        solver.work.impactStressSamples++;
        const j = w.index(x + dx, y + dy);
        if (j < 0 || !owner || solver.bodyOf.get(w.elasticId[j]) !== owner)
          continue;
        if (!pass) count++;
        else if (count) solver.queueFracture(j, (energy * 0.5) / count);
      }
}
