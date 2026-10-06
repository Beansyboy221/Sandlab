// Stock calibration is plain data. Generic derivations run once at compilation.
export const stockProfiles = {
  Battery: { pulseEnergy: 6 },

  Water: {
    aqueous: true,
    waterLike: true,
    absorbable: true,
  },
  Stone: {
    acidSolubility: 0.25,
    porosity: 1,
    permeability: 0.001,
    retention: 0.97,
    brittleness: 0.8,
  },
  Wood: {
    acidSolubility: 0.2,
    organic: true,
    alkaliSolubility: 1,
    sparkChance: 0.006,
    combustionGas: "CO2",
    porosity: 3,
    permeability: 0.04,
    retention: 0.95,
    brittleness: 0.5,
    friction: 0.55,
    restitution: 0.06,
    toughness: 8,
  },
  Oil: {
    combustionGas: "CO2",
    absorbable: true,
  },
  Salt: {
    soluble: true,
    freezeDepression: 5,
    viscosityIncrease: 0.15,
    porosity: 1,
    permeability: 0.35,
    retention: 0.7,
    brittleness: 0.85,
  },
  Steam: {
    density: 0.0006,
    buoyancy: -1,
  },
  Smoke: {
    density: 0.001,
    buoyancy: -1,
  },
  Ice: {
    porosity: 0,
    permeability: 0,
    retention: 0,
    brittleness: 0.8,
    friction: 0.035,
    restitution: 0.1,
    toughness: 3,
    compressiveStrength: 4,
  },
  Steel: {
    oxidizeTo: "Rust",
    oxidationRate: 0.0015,
    oxidationColor: "#bf714d",
    acidMetalReactivity: 0.05,
    acidProduct: "Iron Salt",
    halideTo: "Iron Salt",
    porosity: 0,
    permeability: 0,
    retention: 0,
    brittleness: 0.15,
    friction: 0.35,
    restitution: 0.1,
  },
  Glass: {
    porosity: 0,
    permeability: 0,
    retention: 0,
    brittleness: 0.95,
    friction: 0.22,
    restitution: 0.08,
    toughness: 1.8,
    compressiveStrength: 3,
  },
  Dirt: {
    porosity: 3,
    permeability: 0.22,
    retention: 0.92,
    brittleness: 0.4,
  },
  Coal: {
    reducingStrength: 1,
    reductionGas: "CO2",
    sparkChance: 0.025,
    combustionGas: "CO2",
    porosity: 2,
    permeability: 0.35,
    retention: 0.8,
    brittleness: 0.7,
  },
  Ash: {
    porosity: 3,
    permeability: 0.08,
    retention: 0.95,
    brittleness: 0.85,
  },
  Cement: {
    hydratesTo: "Concrete",
  },
  Acid: {
    acidity: 1,
    neutralizedTo: "Water",
  },
  Fuel: {
    combustionGas: "CO2",
    absorbable: true,
  },
  Brine: {
    aqueous: true,
    waterLike: true,
    absorbable: true,
  },
  Mud: {
    porosity: 3,
    permeability: 0.22,
    retention: 0.92,
    brittleness: 0.4,
  },
  Oxygen: {
    density: 0.00143,
    buoyancy: 1,
  },
  Hydrogen: {
    density: 0.00009,
    buoyancy: -1,
    requiresOxygen: true,
    combustionGas: "Steam",
  },
  Methane: {
    density: 0.00066,
    buoyancy: -1,
    requiresOxygen: true,
    combustionGas: "CO2",
  },
  Chlorine: {
    density: 0.0032,
    buoyancy: 1,
    oxidizingStrength: 1,
  },
  Concrete: {
    acidSolubility: 1,
    porosity: 1,
    permeability: 0.004,
    retention: 0.96,
    brittleness: 0.8,
  },
  Ceramic: {
    melt: 1800,
    meltTo: "Molten Ceramic",
    porosity: 1,
    permeability: 0.002,
    retention: 0.98,
    brittleness: 0.95,
    toughness: 2,
  },
  Heater: {
    heatSource: true,
  },
  Cooler: {
    heatSource: true,
  },
  Plant: {
    rooted: true,
    acidSolubility: 0.5,
    organic: true,
    alkaliSolubility: 1,
    combustionGas: "CO2",
    porosity: 2,
    permeability: 0.35,
    retention: 0.99,
    brittleness: 0.2,
    waterOnly: true,
  },
  Wax: {
    organic: true,
    alkaliSolubility: 1,
    combustionGas: "CO2",
  },
  "Liquid Wax": {
    organic: true,
    alkaliSolubility: 1,
    combustionGas: "CO2",
  },
  Seed: {
    organic: true,
    alkaliSolubility: 1,
    combustionGas: "CO2",
    porosity: 1,
    permeability: 0.15,
    retention: 0.99,
    brittleness: 0.3,
    waterOnly: true,
  },
  Cloud: {
    buoyancy: 0,
    dispersion: 0.025,
  },
  Sponge: {
    organic: true,
    alkaliSolubility: 1,
    airPermeability: 0.8,
  },
  Copper: {
    halideTo: "Copper Salt",
    porosity: 0,
    permeability: 0,
    retention: 0,
    brittleness: 0.15,
    friction: 0.35,
    restitution: 0.08,
  },
  Rust: {
    acidProduct: "Iron Salt",
    reductionTo: "Metal Dust",
    reductionTemperature: 700,
  },
  Sodium: {
    waterReactionProduct: "Lye",
  },
  "Liquid Sodium": {
    waterReactionProduct: "Lye",
  },
  Lye: {
    alkalinity: 1,
    neutralizedTo: "Water",
    neutralizationProduct: "Salt",
  },
  "Baking Soda": {
    carbonate: 1,
    alkalinity: 0.5,
    neutralizationProduct: "Salt",
    porosity: 1,
    permeability: 0.06,
    retention: 0.8,
    brittleness: 0.7,
  },
  CO2: {
    density: 0.00198,
    buoyancy: 1,
  },
  Clay: {
    porosity: 2,
    permeability: 0.001,
    retention: 0.99,
    brittleness: 0.35,
  },
  "Wet Clay": {
    porosity: 2,
    permeability: 0.001,
    retention: 0.99,
    brittleness: 0.35,
  },
  Brick: {
    porosity: 2,
    permeability: 0.03,
    retention: 0.96,
    brittleness: 0.9,
    toughness: 2.5,
  },
  Fertilizer: {
    nutritionSoluble: true,
  },
  Rubber: {
    restitution: 0.72,
    friction: 0.65,
    combustionGas: "CO2",
  },
  Nitrogen: {
    density: 0.00117,
    buoyancy: -1,
  },
  Mirror: {
    density: 2.5,
  },
  "Glass Shards": {
    porosity: 1,
    brittleness: 0.95,
  },
  Rope: {
    combustionGas: "CO2",
    porosity: 3,
    permeability: 0.2,
    retention: 0.9,
    brittleness: 0.08,
  },
  Jelly: {
    restitution: 0.25,
    porosity: 1,
    permeability: 0.001,
    retention: 0.98,
    brittleness: 0.02,
  },
  Soap: {
    soluble: true,
    freezeDepression: 2,
    viscosityIncrease: 0.8,
    surfactant: true,
  },
  Bubble: {
    density: 0.001,
    buoyancy: -1,
  },
  Wall: {
    porosity: 0,
    permeability: 0,
    retention: 0,
    brittleness: 0,
    friction: 0.5,
    restitution: 0.05,
  },
  "Stone Gravel": {
    porosity: 1,
    brittleness: 0.75,
  },
  "Brick Fragments": {
    porosity: 2,
    brittleness: 0.8,
  },
  "Molten Rust": {
    acidProduct: "Iron Salt",
  },
  Crystal: {
    toughness: 1.8,
    compressiveStrength: 3,
  },
};

export function applyMaterialProfiles(materials) {
  for (const m of materials) {
    if (m.rigid) {
      m.toughness = m.conductive ? 26 : 6;
      m.compressiveStrength = m.conductive ? 60 : 12;
      if (m.resistance === 1) m.resistance = 0.97;
    }
    Object.assign(m, stockProfiles[m.name]);
    m.paletteCategory = m.device
      ? "devices"
      : m.flora || m.biology?.mode === "shoot" || m.biology?.mode === "seed"
        ? "life"
        : m.category === "special"
          ? "static"
          : m.category;
  }
}
