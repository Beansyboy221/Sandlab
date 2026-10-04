import { materials } from "./materials.js";
export const AIR_DAMPING = 0.945;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Compile once: pore losses and elastic deformation dissipate sound; dense,
// nonporous surfaces reflect it. No material names or per-cell authoring objects.
export function acousticTraits(m) {
  const pores = (m.porosity || 0) / ((m.porosity || 0) + 5);
  const softness = clamp((m.elasticity || 0) * 3 + pores, 0, 1);
  return {
    density: Math.max(0.1, m.density || 1),
    brittle: m.brittleness || 0,
    friction: m.friction ?? 0.4,
    viscosity: Math.max(1, m.viscosity || 1),
    softness,
    ring: clamp((m.conductivity || 0) * (1 - pores) * (1 - softness), 0, 1),
    loss: clamp(
      0.012 +
        pores * 0.5 * (0.3 + (m.permeability || 0) * 0.7) +
        softness * 0.07,
      0.012,
      0.5,
    ),
  };
}
export const acousticMaterials = materials.map(acousticTraits);
export const absorption = Float32Array.from(acousticMaterials, (m) => m.loss);
