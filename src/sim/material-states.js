// These are configurations of physical states, not per-particle behaviors.
// State slots remain stable for old saves; all runtime coefficients compile once.
export const materialModels = {
  Water: {
    frozen: ["Ice"],
    gas: ["Steam"],
    fragment: ["Snow"],
    legacy: ["Brine", "Soapy Water"],
  },
  Dirt: { legacy: ["Mud"] },
  Clay: { legacy: ["Wet Clay"] },
  Wood: { fragment: ["Sawdust"] },
  Stone: { liquid: ["Lava"], fragment: ["Stone Gravel"] },
  Steel: {
    liquid: ["Molten Steel"],
    fragment: ["Metal Dust"],
    oxide: ["Rust"],
  },
  Copper: { liquid: ["Molten Copper"], fragment: ["Copper Granules"] },
  Glass: { liquid: ["Molten Glass"], fragment: ["Glass Shards"] },
  Crystal: { liquid: ["Molten Crystal"], fragment: ["Crystal Shards"] },
  Mirror: { liquid: ["Molten Mirror"], fragment: ["Mirror Shards"] },
  Concrete: { liquid: ["Molten Concrete"], fragment: ["Concrete Fragments"] },
  Brick: { liquid: ["Molten Brick"], fragment: ["Brick Fragments"] },
  Ceramic: { liquid: ["Molten Ceramic"], fragment: ["Ceramic Fragments"] },
  Salt: { liquid: ["Molten Salt"] },
  Sodium: { liquid: ["Liquid Sodium"] },
  Wax: { liquid: ["Liquid Wax"], fragment: ["Wax Shavings"] },
  Nitrogen: { liquid: ["Liquid Nitrogen"] },
  Glue: { liquid: ["Liquid Glue"] },
  Sponge: { fragment: ["Sponge Crumbs"] },
  Rubber: { fragment: ["Rubber Crumbs"] },
  Rope: { fragment: ["Rope Fibers"] },
  Jelly: { liquid: ["Jelly Drops"], frozen: ["Frozen Jelly"] },
};

export function registerMaterialStates(definitions) {
  const byName = new Map(definitions.map((d) => [d[0], d]));
  for (const [base, states] of Object.entries(materialModels)) {
    const bulk = byName.get(base);
    if (!bulk) throw Error(`Missing base material ${base}`);
    for (const [state, names] of Object.entries(states))
      for (const name of names) {
        const d = byName.get(name);
        if (!d) throw Error(`Missing ${base} state ${name}`);
        Object.assign(d[4], { baseMaterial: base, materialState: state });
      }
    if (states.fragment) bulk[4].fragmentTo = states.fragment[0];
    if (states.liquid && bulk[4].melt !== undefined)
      bulk[4].meltTo = states.liquid[0];
  }
}

const chemistry = [
  "acidity",
  "alkalinity",
  "carbonate",
  "neutralizationProduct",
  "neutralizedTo",
  "acidMetalReactivity",
  "acidSolubility",
  "alkaliSolubility",
  "acidProduct",
  "halideTo",
  "waterReactionProduct",
  "reactsWithWater",
  "aqueous",
  "waterLike",
  "absorbable",
  "waterOnly",
  "conductive",
  "conductivity",
  "soluble",
  "freezeDepression",
  "viscosityIncrease",
  "surfactant",
  "organic",
  "requiresOxygen",
  "oxidationRate",
  "oxidationColor",
  "oxidizeTo",
];
const fragmentComponents = [
  "conductive",
  "conductivity",
  "resistance",
  "friction",
  "restitution",
  "brittleness",
  "porosity",
  "retention",
  "ignite",
  "burn",
  "residue",
  "combustionGas",
  "selfOxidizing",
  "sparkChance",
  "burnPressure",
  "surfaceArea",
  "lightAbsorption",
  "lightReflectivity",
  "refractiveIndex",
  "opticalDispersion",
  "melt",
  "meltTo",
  "bake",
  "bakeTo",
];

// Explicit state data wins over inherited components. Carriers/topology are never
// inherited: a grain has no rigid pose, spring constraints or circuit behavior.
export function compileStateProfiles(materials, definitions) {
  for (const m of materials) {
    m.baseMaterial ??= m.canonicalId ?? m.id;
    m.materialState ??= "bulk";
  }
  for (const m of materials) {
    const base = materials[m.baseMaterial];
    if (base.baseMaterial !== base.id)
      throw Error(`Nested base material for ${m.name}`);
    if (
      m.id === base.id ||
      m.retired ||
      ["legacy", "assembly"].includes(m.materialState)
    )
      continue;
    const explicit = definitions[m.id][4];
    const keys =
      m.materialState === "fragment"
        ? [...chemistry, ...fragmentComponents]
        : chemistry;
    for (const key of keys)
      if (!(key in explicit) && base[key] !== undefined) m[key] = base[key];
    for (const key of [
      "soundAbsorption",
      "soundDispersion",
      "soundTransmission",
    ])
      if (!(key in explicit)) delete m[key];
    if (m.category !== "liquid") {
      m.absorbable = false;
      m.aqueous = false;
      m.waterLike = false;
    }
    if (m.materialState === "fragment") {
      // Grain density is the same substance; voids between grains are empty cells.
      if (definitions[m.id][3] === undefined) m.density = base.density;
      m.fragment = true;
      m.surfaceArea = explicit.surfaceArea ?? 2.4;
      m.permeability =
        explicit.permeability ?? Math.max(base.permeability, 0.35);
      m.paletteCategory = m.category;
    }
  }
  for (const m of materials) {
    if (m.rigid && m.baseMaterial !== m.id && m.materialState !== "legacy")
      m.fragmentTo ??= materials[m.baseMaterial].fragmentTo;
    if (m.fragmentTo !== undefined) {
      if (materials[m.fragmentTo].baseMaterial !== m.baseMaterial)
        throw Error(`Fracture changes substance for ${m.name}`);
      if (m.rigid && !m.rooted) m.breakInto = m.fragmentTo;
    }
    if (m.materialState === "fragment") {
      const base = materials[m.baseMaterial];
      if (base.melt !== undefined && !("melt" in definitions[m.id][4])) {
        m.melt = base.melt;
        m.meltTo = base.meltTo;
      }
    }
  }
}

export function validatePhysicalTransitions(materials) {
  for (const m of materials) {
    if (m.retired || m.materialState === "legacy") continue;
    for (const key of ["meltTo", "freezeTo", "boilTo", "condenseTo"]) {
      const target = materials[m[key]];
      if (target?.id && target.baseMaterial !== m.baseMaterial)
        throw Error(`Physical transition changes substance: ${m.name}.${key}`);
    }
  }
}
