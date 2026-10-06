// Compile optical and acoustic traits once, keeping transport loops data-only.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function applyPerceptionProfiles(materials) {
  for (const m of materials) {
    const liquid = m.category === "liquid";
    const opaque = Boolean(m.id && !m.gas && !liquid && m.circuit !== "lamp");
    m.lightReflectivity ??=
      !m.id || m.gas || m.circuit === "lamp"
        ? 0
        : liquid
          ? 0.02
          : m.conductive
            ? 0.25
            : 0.12;
    m.lightAbsorption ??= opaque ? 1 - m.lightReflectivity : liquid ? 0.01 : 0;
    m.refractiveIndex ??= liquid ? 1.33 : 1;
    m.opticalDispersion ??= liquid ? 0.008 : 0;
    m.lightTransmission = Math.max(
      0,
      1 - m.lightAbsorption - m.lightReflectivity,
    );
    m.occludesLight = m.lightTransmission < 0.001;
    m.reflectsLight = m.lightReflectivity > 0;
    m.refractsLight = m.refractiveIndex !== 1;
    const pores = m.porosity / (m.porosity + 5),
      softness = clamp((m.elasticity || 0) * 3 + pores, 0, 1);
    m.soundAbsorption ??= clamp(
      0.012 + pores * 0.5 * (0.3 + m.permeability * 0.7) + softness * 0.07,
      0.012,
      0.5,
    );
    m.soundDispersion ??=
      !m.id || m.gas
        ? 0
        : m.category === "powder"
          ? 0.35
          : m.elasticity
            ? 0.25
            : m.static
              ? 0.02
              : liquid
                ? 0.04
                : 0.12;
    m.soundTransmission ??=
      !m.id || m.gas
        ? 1
        : m.static
          ? m.airPermeability || 0
          : liquid
            ? 0.35
            : clamp(
                0.035 / Math.sqrt(m.density) + pores * m.permeability,
                0.005,
                0.8,
              );
  }
}
