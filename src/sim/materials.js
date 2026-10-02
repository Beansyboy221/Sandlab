import { energyMaterials } from "./energy-materials.js";
const definitions = [
  ["Empty", "none", "#111b20", 0, {}],
  [
    "Sand",
    "powder",
    "#dfbb78",
    1.65,
    {
      melt: 1700,
      meltTo: "Glass",
      conductivity: 0.09,
    },
  ],
  [
    "Water",
    "liquid",
    "#489de0",
    1,
    {
      freeze: 0,
      freezeTo: "Ice",
      boil: 100,
      boilTo: "Steam",
      conductivity: 0.24,
      conductive: true,
    },
  ],
  [
    "Stone",
    "solid",
    "#7c8991",
    3,
    {
      melt: 1200,
      meltTo: "Lava",
      resistance: 0.96,
      conductivity: 0.12,
    },
  ],
  [
    "Wood",
    "solid",
    "#a7784c",
    0.8,
    {
      ignite: 280,
      burn: 150,
      residue: "Ash",
      conductivity: 0.025,
    },
  ],
  [
    "Fire",
    "energy",
    "#ffad42",
    -0.2,
    {
      temperature: 680,
      lifetime: 45,
      lifetimeVariation: 0.15,
    },
  ],
  [
    "Oil",
    "liquid",
    "#bca54c",
    0.78,
    {
      ignite: 220,
      burn: 100,
      viscosity: 2,
      conductivity: 0.03,
    },
  ],
  [
    "Salt",
    "powder",
    "#e5ded3",
    2.1,
    {
      melt: 800,
      meltTo: "Molten salt",
    },
  ],
  [
    "Steam",
    "gas",
    "#a6becb",
    -0.3,
    {
      temperature: 125,
      condense: 92,
      condenseTo: "Water",
      conductivity: 0.08,
    },
  ],
  [
    "Smoke",
    "gas",
    "#65677b",
    -0.15,
    {
      temperature: 150,
      lifetime: 400,
    },
  ],
  [
    "Ice",
    "solid",
    "#a7dbea",
    0.92,
    {
      temperature: -12,
      melt: 2,
      meltTo: "Water",
      conductivity: 0.18,
    },
  ],
  [
    "Steel",
    "solid",
    "#a8b3bf",
    7.8,
    {
      conductive: true,
      conductivity: 0.48,
      melt: 1450,
      meltTo: "Molten steel",
      resistance: 0.98,
    },
  ],
  [
    "Glass",
    "solid",
    "#638d93",
    2.5,
    {
      conductivity: 0.035,
      melt: 1700,
      meltTo: "Molten glass",
      resistance: 1,
    },
  ],
  ["Dirt", "powder", "#947052", 1.5, {}],
  [
    "Coal",
    "powder",
    "#555767",
    1.35,
    {
      ignite: 380,
      burn: 240,
      residue: "Ash",
    },
  ],
  [
    "Gunpowder",
    "powder",
    "#818170",
    1.3,
    {
      ignite: 180,
      explosive: 3,
      pressureTrigger: 7,
      burn: 30,
      deflagrates: true,
      selfOxidizing: true,
      burnPressure: 0.6,
      sparkChance: 0.18,
      residue: "Ash",
    },
  ],
  ["Ash", "powder", "#aaa0a1", 0.6, {}],
  [
    "Snow",
    "powder",
    "#e2edf0",
    0.35,
    {
      temperature: -15,
      melt: 1,
      meltTo: "Water",
      conductivity: 0.02,
    },
  ],
  ["Cement", "powder", "#b8b6a1", 1.8, {}],
  [
    "Steel powder",
    "powder",
    "#96a6b7",
    5,
    {
      conductive: true,
      conductivity: 0.4,
      melt: 1450,
      meltTo: "Molten steel",
    },
  ],
  [
    "Acid",
    "liquid",
    "#b8dc63",
    1.1,
    {
      conductivity: 0.2,
      conductive: true,
      aqueous: true,
      acidic: true,
      absorbable: true,
    },
  ],
  [
    "Lava",
    "liquid",
    "#ff6638",
    2.8,
    {
      temperature: 1350,
      freeze: 700,
      freezeTo: "Stone",
      viscosity: 4,
      conductivity: 0.2,
    },
  ],
  [
    "Mercury",
    "liquid",
    "#bcc8d5",
    13.5,
    {
      conductive: true,
      conductivity: 0.4,
      viscosity: 2,
    },
  ],
  [
    "Kerosene",
    "liquid",
    "#de8d65",
    0.7,
    {
      ignite: 210,
      burn: 100,
    },
  ],
  [
    "Brine",
    "liquid",
    "#67b6c5",
    1.2,
    {
      conductive: true,
      conductivity: 0.3,
      freeze: -20,
      freezeTo: "Ice",
      dry: 108,
      dryTo: "Salt",
    },
  ],
  [
    "Mud",
    "liquid",
    "#887354",
    1.7,
    {
      viscosity: 6,
      boil: 110,
      boilTo: "Dirt",
    },
  ],
  [
    "Molten steel",
    "liquid",
    "#ffc170",
    6.5,
    {
      temperature: 1550,
      freeze: 1430,
      freezeTo: "Steel",
      conductive: true,
      conductivity: 0.45,
      viscosity: 3,
    },
  ],
  [
    "Molten salt",
    "liquid",
    "#e6bc8a",
    1.9,
    {
      temperature: 850,
      freeze: 750,
      freezeTo: "Salt",
      conductive: true,
      conductivity: 0.25,
    },
  ],
  ["Oxygen", "gas", "#8ebfae", 0.03, {}],
  [
    "Hydrogen",
    "gas",
    "#859fd9",
    -0.6,
    {
      ignite: 560,
      explosive: 10,
      burn: 30,
    },
  ],
  [
    "Methane",
    "gas",
    "#b992b8",
    -0.25,
    {
      ignite: 450,
      explosive: 8,
      burn: 40,
    },
  ],
  [
    "Chlorine",
    "gas",
    "#a2b760",
    0.05,
    {
      corrosive: true,
    },
  ],
  [
    "Concrete",
    "solid",
    "#929b92",
    2.6,
    {
      resistance: 0.88,
      conductivity: 0.09,
      melt: 1500,
      meltTo: "Lava",
    },
  ],
  [
    "Mica",
    "solid",
    "#a26c89",
    2,
    {
      resistance: 1,
      conductivity: 0.002,
    },
  ],
  [
    "Ceramic",
    "solid",
    "#d0b9a6",
    3,
    {
      resistance: 1,
      conductivity: 0.015,
    },
  ],
  [
    "Spark",
    "energy",
    "#fff1a6",
    -0.1,
    {
      temperature: 700,
      lifetime: 10,
      lifetimeVariation: 0.3,
    },
  ],
  [
    "Plasma",
    "energy",
    "#df93f8",
    -0.5,
    {
      temperature: 5000,
      lifetime: 65,
    },
  ],
  [
    "TNT",
    "solid",
    "#cb6466",
    1.6,
    {
      ignite: 200,
      explosive: 25,
      pressureTrigger: 6,
      ignitionDelay: 45,
    },
  ],
  [
    "Heater",
    "special",
    "#fa8660",
    99,
    {
      temperature: 900,
      resistance: 1,
    },
  ],
  [
    "Cooler",
    "special",
    "#66d4df",
    99,
    {
      temperature: -100,
      resistance: 1,
    },
  ],
  [
    "Fan",
    "special",
    "#8bbdc8",
    99,
    {
      resistance: 1,
    },
  ],
  [
    "Clone",
    "special",
    "#b49be1",
    99,
    {
      resistance: 1,
    },
  ],
  [
    "Void",
    "special",
    "#67617f",
    99,
    {
      resistance: 1,
    },
  ],
  [
    "Plant",
    "solid",
    "#78b579",
    0.6,
    {
      ignite: 230,
      burn: 65,
      residue: "Ash",
    },
  ],
  [
    "Wax",
    "solid",
    "#e8cf9e",
    0.9,
    {
      melt: 60,
      meltTo: "Liquid wax",
      ignite: 260,
      burn: 170,
      conductivity: 0.02,
    },
  ],
  [
    "Liquid wax",
    "liquid",
    "#d9b97c",
    0.85,
    {
      temperature: 80,
      freeze: 50,
      freezeTo: "Wax",
      ignite: 180,
      burn: 170,
      viscosity: 4,
      conductivity: 0.02,
    },
  ],
  ["Seed", "powder", "#c7b777", 1.1, { ignite: 230, burn: 40, residue: "Ash" }],
  [
    "Lightning",
    "energy",
    "#c8dcff",
    -1,
    { lifetime: 9, temperature: 1800, movable: false },
  ],
  ["Storm", "special", "#879bbc", 99, { resistance: 1 }],
  ["Cloud", "gas", "#a4b4c3", -0.12, { lifetime: 700 }],
  [
    "Furnace",
    "special",
    "#ffb176",
    99,
    { temperature: 1800, resistance: 1, heatSource: true },
  ],
  [
    "Sponge",
    "solid",
    "#e6c06c",
    0.7,
    {
      ignite: 260,
      burn: 150,
      residue: "Ash",
      conductivity: 0.02,
      resistance: 0.15,
    },
  ],
  [
    "Copper",
    "solid",
    "#d39165",
    8.9,
    {
      conductive: true,
      conductivity: 0.62,
      resistance: 0.93,
      melt: 1085,
      meltTo: "Molten copper",
      oxidizeTo: "Patina",
      oxidationRate: 0.0008,
    },
  ],
  [
    "Molten copper",
    "liquid",
    "#ffbc77",
    8,
    {
      temperature: 1150,
      conductive: true,
      conductivity: 0.55,
      viscosity: 3,
      freeze: 1060,
      freezeTo: "Copper",
    },
  ],
  [
    "Patina",
    "solid",
    "#58b5a0",
    5,
    {
      conductivity: 0.02,
      resistance: 0.75,
      melt: 1085,
      meltTo: "Molten copper",
    },
  ],
  [
    "Rust",
    "powder",
    "#bf714d",
    3.1,
    {
      conductivity: 0.025,
      resistance: 0.1,
      melt: 1550,
      meltTo: "Molten steel",
    },
  ],
  [
    "Sodium",
    "powder",
    "#e1d4bd",
    0.97,
    {
      conductive: true,
      conductivity: 0.32,
      melt: 98,
      meltTo: "Liquid sodium",
      reactsWithWater: true,
    },
  ],
  [
    "Liquid sodium",
    "liquid",
    "#f1dd99",
    0.92,
    {
      temperature: 120,
      conductive: true,
      conductivity: 0.3,
      freeze: 90,
      freezeTo: "Sodium",
      reactsWithWater: true,
    },
  ],
  [
    "Lye",
    "liquid",
    "#8bced1",
    1.15,
    {
      conductivity: 0.25,
      conductive: true,
      alkaline: true,
      aqueous: true,
      corrodesOrganic: true,
    },
  ],
  [
    "Vinegar",
    "liquid",
    "#d9bd92",
    1.02,
    {
      conductivity: 0.18,
      acidic: true,
      aqueous: true,
      absorbable: true,
      waterLike: true,
      boil: 102,
      boilTo: "Steam",
      freeze: -4,
      freezeTo: "Ice",
    },
  ],
  ["Baking soda", "powder", "#e5e7ce", 1.4, { carbonate: true }],
  [
    "Carbon dioxide",
    "gas",
    "#71989b",
    0.12,
    { conductivity: 0.025, suppressesFlame: true },
  ],
  [
    "Clay",
    "powder",
    "#bc8f7b",
    1.8,
    { bake: 650, bakeTo: "Brick", conductivity: 0.1 },
  ],
  [
    "Wet clay",
    "liquid",
    "#987766",
    1.9,
    { viscosity: 8, conductivity: 0.16, dry: 110, dryTo: "Clay" },
  ],
  [
    "Brick",
    "solid",
    "#c76e58",
    2.4,
    { resistance: 0.96, conductivity: 0.07, melt: 1650, meltTo: "Lava" },
  ],
  ["Fertilizer", "powder", "#c4a77b", 1.3, {}],
  [
    "Nutrient water",
    "liquid",
    "#6eaa72",
    1.08,
    {
      conductivity: 0.24,
      conductive: true,
      aqueous: true,
      absorbable: true,
      waterLike: true,
      nutrition: 96,
      dry: 110,
      dryTo: "Fertilizer",
      freeze: -2,
      freezeTo: "Ice",
    },
  ],
  [
    "Rubber",
    "elastic",
    "#766983",
    1.1,
    {
      elasticity: 0.18,
      damping: 0.94,
      tearAt: 5,
      conductivity: 0.005,
      resistance: 0.8,
      ignite: 350,
      burn: 220,
      residue: "Ash",
      organic: true,
    },
  ],
  [
    "Sulfur",
    "powder",
    "#e6d65d",
    2,
    {
      ignite: 230,
      burn: 90,
      residue: "Sulfur dioxide",
      combustionGas: "Sulfur dioxide",
    },
  ],
  ["Sulfur dioxide", "gas", "#b9c589", 0.18, { conductivity: 0.03 }],
  [
    "Nitrogen",
    "gas",
    "#92a5c7",
    -0.04,
    {
      conductivity: 0.025,
      suppressesFlame: true,
      condense: -200,
      condenseTo: "Liquid nitrogen",
    },
  ],
  [
    "Liquid nitrogen",
    "liquid",
    "#b1e3e9",
    0.81,
    { temperature: -196, conductivity: 0.22, boil: -190, boilTo: "Nitrogen" },
  ],
  ...energyMaterials,
  [
    "Rope",
    "elastic",
    "#cda77b",
    0.9,
    {
      elasticity: 0.24,
      damping: 0.94,
      tearAt: 3.5,
      conductivity: 0.025,
      ignite: 270,
      burn: 120,
      residue: "Ash",
      organic: true,
    },
  ],
  [
    "Jelly",
    "elastic",
    "#cf83b4",
    1.05,
    {
      elasticity: 0.08,
      damping: 0.88,
      tearAt: 6,
      conductivity: 0.12,
      melt: 75,
      meltTo: "Water",
      freeze: -3,
      freezeTo: "Ice",
      organic: true,
    },
  ],
  ["Soap", "powder", "#d9c9ec", 0.7, { conductivity: 0.03 }],
  [
    "Soapy water",
    "liquid",
    "#94c7da",
    1.01,
    {
      aqueous: true,
      waterLike: true,
      absorbable: true,
      conductive: true,
      conductivity: 0.2,
      viscosity: 2,
      boil: 100,
      boilTo: "Steam",
      freeze: -2,
      freezeTo: "Ice",
    },
  ],
  [
    "Bubble",
    "gas",
    "#bbdfed",
    -0.45,
    {
      conductivity: 0.01,
      lifetime: 220,
      lifetimeVariation: 0.35,
      bubble: true,
    },
  ],
  [
    "Sulfurous acid",
    "liquid",
    "#b5c978",
    1.03,
    { acidic: true, aqueous: true, conductive: true, conductivity: 0.2 },
  ],
  [
    "Carbon dioxide foam",
    "gas",
    "#e7edd2",
    -0.18,
    {
      lifetime: 100,
      lifetimeVariation: 0.3,
      conductivity: 0.06,
      bubble: true,
      suppressesFlame: true,
    },
  ],
  [
    "Molten glass",
    "liquid",
    "#efb98f",
    2.3,
    {
      temperature: 1750,
      viscosity: 6,
      conductivity: 0.1,
      freeze: 1650,
      freezeTo: "Glass",
    },
  ],
];
// Historical acid slots stay readable in old saves, but are never palette entries.
for (const id of [59, 91]) {
  definitions[id] = [...definitions[20]];
  definitions[id][4] = {
    ...definitions[20][4],
    deprecated: true,
    canonicalId: 20,
  };
}
definitions.push(
  [
    "Wall",
    "static",
    "#b7c2cb",
    99,
    { static: true, resistance: 1, conductivity: 0.08 },
  ],
  ["Rubble", "powder", "#8d8b82", 2.4, { melt: 1200, meltTo: "Lava" }],
  [
    "Wood chips",
    "powder",
    "#bc8c58",
    0.55,
    {
      organic: true,
      ignite: 280,
      burn: 90,
      residue: "Ash",
      combustionGas: "Carbon dioxide",
    },
  ],
);
export const M = Object.create(null);
export const materials = definitions.map(
  ([name, category, color, density, properties], id) => {
    if (!properties.deprecated) M[name] = id;
    return {
      id,
      name,
      category,
      color,
      density,
      conductivity: 0.04,
      resistance: 0,
      viscosity: 1,
      temperature: 20,
      movable: !["static", "special"].includes(category),
      rigid: category === "solid",
      friction: 0.4,
      restitution: 0.08,
      gas: category === "gas" || category === "energy",
      ...properties,
    };
  },
);
for (const m of materials)
  for (const field of [
    "meltTo",
    "freezeTo",
    "boilTo",
    "condenseTo",
    "residue",
    "oxidizeTo",
    "bakeTo",
    "dryTo",
    "combustionGas",
  ])
    if (m[field]) m[field] = M[m[field]];
// Palette groups describe the dominant behavior; category remains the engine's movement behavior.
export const categories = [
  "all",
  "powder",
  "liquid",
  "gas",
  "solid",
  "static",
  "elastic",
  "life",
  "explosive",
  "energy",
  "devices",
  "fiction",
];
export const categoryLabels = {
  all: "All",
  powder: "Powders",
  liquid: "Liquids",
  gas: "Gases",
  solid: "Solids",
  static: "Static",
  elastic: "Elastics",
  life: "Life",
  explosive: "Explosives",
  energy: "Energy",
  devices: "Devices",
  fiction: "Fiction",
};
for (const m of materials)
  m.paletteCategory = m.fiction
    ? "fiction"
    : m.explosive
      ? "explosive"
      : ["Plant", "Seed", "Nutrient water"].includes(m.name)
        ? "life"
        : m.category === "special"
          ? "devices"
          : m.category;

for (const name of ["Heater", "Cooler"]) materials[M[name]].heatSource = true;

for (const name of ["Steel", "Steel powder"])
  Object.assign(materials[M[name]], {
    oxidizeTo: M.Rust,
    oxidationRate: 0.0015,
  });
for (const name of ["Water", "Brine"])
  Object.assign(materials[M[name]], {
    aqueous: true,
    waterLike: true,
    absorbable: true,
  });
materials[M["Acid"]].acidic = true;
for (const name of ["Wood", "Plant", "Seed", "Sponge", "Wax", "Liquid wax"])
  materials[M[name]].organic = true;

for (const name of ["Hydrogen", "Methane"])
  materials[M[name]].requiresOxygen = true;

materials[M.Coal].sparkChance = 0.025;
materials[M.Wood].sparkChance = 0.006;

// Ambient air is implicit. Real gases share buoyancy and pressure rules, with
// their own chemistry and products; fiction remains explicitly categorized.
materials[M.Hydrogen].combustionGas = M.Steam;
materials[M.Methane].combustionGas = M["Carbon dioxide"];
materials[M.Kerosene].combustionGas = M["Carbon dioxide"];
for (const name of [
  "Oil",
  "Wood",
  "Coal",
  "Rubber",
  "Rope",
  "Plant",
  "Wax",
  "Liquid wax",
  "Seed",
])
  materials[M[name]].combustionGas ??= M["Carbon dioxide"];
materials[M.Sponge].airPermeability = 0.8;

export const canonicalMaterial = (id) => materials[id]?.canonicalId ?? id;
// Toughness is impact energy per exposed cell, separate from chemical resistance.
for (const m of materials)
  if (m.rigid) {
    m.toughness = m.conductive ? 26 : 9;
    if ([M.Stone, M.Concrete, M.Brick, M.Ceramic, M.Mica].includes(m.id))
      m.breakInto = M.Rubble;
    if (m.id === M.Glass) {
      m.toughness = 1.8;
      m.breakInto = M["Glass dust"];
    }
    if (m.id === M.Ice) {
      m.toughness = 3;
      m.breakInto = M.Snow;
    }
    if (m.id === M.Wood) {
      m.toughness = 10;
      m.breakInto = M["Wood chips"];
    }
    if (m.id === M.Steel) m.breakInto = M["Steel powder"];
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

// Compiled thresholds skip phase handlers at stable temperatures. The handler
// retains transition precedence, latent contents, vent checks and pressure.
for (const m of materials) {
  m.phaseMinimum = Math.max(m.freeze ?? -Infinity, m.condense ?? -Infinity);
  m.phaseMaximum = Math.min(
    m.dry ?? Infinity,
    m.bake ?? Infinity,
    m.melt ?? Infinity,
    m.boil ?? Infinity,
  );
}
