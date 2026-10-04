import { materials } from "./materials.js";

export const fractureLimits = Object.freeze({
  airSamples: 64,
  impactSamples: 128,
});

// Air loads act most strongly on long, thin, brittle shapes. This is a coarse
// estimate of bending stress, not fatigue caused by uniform gravity itself.
export function airStress(solver, body, p) {
  if (body.radius < 5 || body.ids.length / (body.radius * body.radius) > 0.8)
    return;
  const speed2 = p.vx * p.vx + p.vy * p.vy;
  if (speed2 < 0.5) return;
  const w = solver.world;
  if (
    (w.tick + body.ids[0]) % 16 ||
    !body.edges.length ||
    solver.work.airStressSamples >= fractureLimits.airSamples
  )
    return;
  solver.work.airStressSamples++;
  const n = (w.tick * 17) % body.edges.length,
    i = solver.locations.get(body.edges[n]);
  if (i === undefined) return;
  const m = materials[w.cells[i]];
  if (m.brittleness < 0.7 || !m.breakInto) return;
  const leverage = Math.min(2, body.radius / 10);
  solver.queueFracture(i, speed2 * m.density * m.brittleness * leverage * 0.09);
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
