export function applyMaterialProfiles(materials, M) {
  // Density is positive mass per volume; buoyancy is a separate response to
  // implicit ambient air. Historical signed gas values encoded both at once.
  for (const [name, density] of [
    ["Steam", 0.0006],
    ["Smoke", 0.001],
    ["Oxygen", 0.00143],
    ["Hydrogen", 0.00009],
    ["Methane", 0.00066],
    ["Chlorine", 0.0032],
    ["Nitrogen", 0.00117],
    ["CO2", 0.00198],
    ["Cloud", 0.001],
    ["Bubble", 0.001],
  ]) {
    materials[M[name]].density = density;
    materials[M[name]].buoyancy = density > 0.0012 ? 1 : -1;
  }
  materials[M.Plant].rooted = true;
  materials[M.Cloud].buoyancy = 0;
  materials[M.Cloud].dispersion = 0.025;
  materials[M.Mirror].density = materials[M.Glass].density;
  Object.assign(materials[M.Salt], {
    soluble: true,
    freezeDepression: 5,
    viscosityIncrease: 0.15,
  });
  Object.assign(materials[M.Soap], {
    soluble: true,
    freezeDepression: 2,
    viscosityIncrease: 0.8,
    surfactant: true,
  });

  for (const m of materials)
    m.paletteCategory = m.device
      ? "devices"
      : m.flora || ["Plant", "Seed"].includes(m.name)
        ? "life"
        : m.category === "special"
          ? "static"
          : m.category;

  for (const name of ["Heater", "Cooler"]) materials[M[name]].heatSource = true;

  for (const name of ["Steel"])
    Object.assign(materials[M[name]], {
      oxidizeTo: M.Rust,
      oxidationRate: 0.0015,
      oxidationColor: "#bf714d",
    });
  for (const name of ["Water", "Brine"])
    Object.assign(materials[M[name]], {
      aqueous: true,
      waterLike: true,
      absorbable: true,
    });
  Object.assign(materials[M.Acid], {
    acidic: true,
    acidity: 1,
    neutralizedTo: M.Water,
  });
  Object.assign(materials[M.Lye], {
    alkalinity: 1,
    neutralizedTo: M.Water,
    neutralizationProduct: M.Salt,
  });
  Object.assign(materials[M["Baking Soda"]], {
    alkalinity: 0.5,
    carbonate: 1,
    neutralizationProduct: M.Salt,
  });
  Object.assign(materials[M.Steel], {
    acidMetalReactivity: 0.05,
    acidProduct: M["Iron Salt"],
    halideTo: M["Iron Salt"],
  });
  Object.assign(materials[M.Copper], { halideTo: M["Copper Salt"] });
  Object.assign(materials[M.Rust], {
    acidProduct: M["Iron Salt"],
    reductionTo: M["Metal Dust"],
    reductionTemperature: 700,
  });
  materials[M["Molten Rust"]].acidProduct = M["Iron Salt"];
  Object.assign(materials[M.Chlorine], { oxidizingStrength: 1 });
  Object.assign(materials[M.Coal], {
    reducingStrength: 1,
    reductionGas: M.CO2,
  });
  for (const name of ["Sodium", "Liquid Sodium"])
    materials[M[name]].waterReactionProduct = M.Lye;
  materials[M.Cement].hydratesTo = M.Concrete;
  materials[M.Fertilizer].nutritionSoluble = true;
  for (const [name, solubility] of [
    ["Stone", 0.25],
    ["Concrete", 1],
    ["Wood", 0.2],
    ["Plant", 0.5],
  ])
    materials[M[name]].acidSolubility = solubility;
  // Fired ceramic has its own melt, rather than borrowing stone's liquid identity.
  materials[M.Ceramic].melt = 1800;
  materials[M.Ceramic].meltTo = M["Molten Ceramic"];
  for (const name of ["Wood", "Plant", "Seed", "Sponge", "Wax", "Liquid Wax"])
    Object.assign(materials[M[name]], { organic: true, alkaliSolubility: 1 });

  for (const name of ["Hydrogen", "Methane"])
    materials[M[name]].requiresOxygen = true;

  materials[M.Coal].sparkChance = 0.025;
  materials[M.Wood].sparkChance = 0.006;

  // Ambient air is implicit. Real gases share buoyancy and pressure rules, with
  // their own chemistry and products. Palette grouping never changes physical rules.
  materials[M.Hydrogen].combustionGas = M.Steam;
  materials[M.Methane].combustionGas = M["CO2"];
  materials[M.Fuel].combustionGas = M["CO2"];
  for (const name of [
    "Oil",
    "Wood",
    "Coal",
    "Rubber",
    "Rope",
    "Plant",
    "Wax",
    "Liquid Wax",
    "Seed",
  ])
    materials[M[name]].combustionGas ??= M["CO2"];
  materials[M.Sponge].airPermeability = 0.8;

  // Storage and free-fluid percolation share these properties. Fine clay holds
  // water strongly, coarse sand drains, and sponge has a much larger reservoir.
  for (const [name, porosity, permeability, retention, brittleness] of [
    ["Dirt", 3, 0.22, 0.92, 0.4],
    ["Mud", 3, 0.22, 0.92, 0.4],
    ["Clay", 2, 0.001, 0.99, 0.35],
    ["Wet Clay", 2, 0.001, 0.99, 0.35],
    ["Ash", 3, 0.08, 0.95, 0.85],
    ["Snow", 2, 0.65, 0.65, 0.7],
    ["Salt", 1, 0.35, 0.7, 0.85],
    ["Baking Soda", 1, 0.06, 0.8, 0.7],
    ["Stone Gravel", 1, 0.9, 0.25, 0.75],
    ["Brick Fragments", 2, 0.8, 0.65, 0.8],
    ["Glass Shards", 1, 0.75, 0.2, 0.95],
    ["Sawdust", 4, 0.3, 0.94, 0.65],
    ["Coal", 2, 0.35, 0.8, 0.7],
    ["Wood", 3, 0.04, 0.95, 0.5],
    ["Stone", 1, 0.001, 0.97, 0.8],
    ["Concrete", 1, 0.004, 0.96, 0.8],
    ["Brick", 2, 0.03, 0.96, 0.9],
    ["Ceramic", 1, 0.002, 0.98, 0.95],
    ["Glass", 0, 0, 0, 0.95],
    ["Ice", 0, 0, 0, 0.8],
    ["Steel", 0, 0, 0, 0.15],
    ["Copper", 0, 0, 0, 0.15],
    ["Jelly", 1, 0.001, 0.98, 0.02],
    ["Rope", 3, 0.2, 0.9, 0.08],
    ["Plant", 2, 0.35, 0.99, 0.2],
    ["Seed", 1, 0.15, 0.99, 0.3],
    ["Wall", 0, 0, 0, 0],
  ])
    Object.assign(materials[M[name]], {
      porosity,
      permeability,
      retention,
      brittleness,
    });
  for (const name of ["Oil", "Fuel"]) materials[M[name]].absorbable = true;
  for (const name of ["Plant", "Seed"]) materials[M[name]].waterOnly = true;

  // Toughness is impact energy per exposed cell, separate from chemical resistance.
  for (const m of materials)
    if (m.rigid) {
      m.toughness = m.conductive ? 26 : 6;
      m.compressiveStrength = m.conductive ? 60 : 12;
      if (m.id === M.Brick || m.id === M.Ceramic) {
        m.toughness = m.id === M.Brick ? 2.5 : 2;
      }
      if (m.id === M.Glass || m.id === M.Crystal) {
        m.toughness = 1.8;
        m.compressiveStrength = 3;
      }
      if (m.id === M.Ice) {
        m.toughness = 3;
        m.compressiveStrength = 4;
      }
      if (m.id === M.Wood) {
        m.toughness = 8;
      }
      if (m.resistance === 1) m.resistance = 0.97;
    }

  // Sliding friction and impact bounce are distinct from chemical resistance.
  for (const [name, friction, restitution] of [
    ["Ice", 0.035, 0.1],
    ["Glass", 0.22, 0.08],
    ["Wood", 0.55, 0.06],
    ["Steel", 0.35, 0.1],
    ["Copper", 0.35, 0.08],
    ["Wall", 0.5, 0.05],
  ])
    Object.assign(materials[M[name]], { friction, restitution });
}
