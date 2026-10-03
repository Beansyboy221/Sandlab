import { fragmentMaterials } from "./fragment-materials.js";
import { deviceMaterials } from "./device-materials.js";
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
      meltTo: "Molten Salt",
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
      meltTo: "Molten Steel",
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
      meltTo: "Molten Glass",
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
    "Steel Powder",
    "powder",
    "#96a6b7",
    5,
    {
      conductive: true,
      conductivity: 0.4,
      melt: 1450,
      meltTo: "Molten Steel",
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
    "Molten Steel",
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
    "Molten Salt",
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
    "none",
    "#111b20",
    0,
    { deprecated: true, retired: true, replacement: "Ceramic" },
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
    "none",
    "#111b20",
    0,
    { deprecated: true, retired: true, replacement: "Fire" },
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
      meltTo: "Liquid Wax",
      ignite: 260,
      burn: 170,
      conductivity: 0.02,
    },
  ],
  [
    "Liquid Wax",
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
    "none",
    "#111b20",
    0,
    { deprecated: true, retired: true, replacement: "Heater" },
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
      meltTo: "Molten Copper",
      oxidizeTo: "Patina",
      oxidationRate: 0.0008,
    },
  ],
  [
    "Molten Copper",
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
      meltTo: "Molten Copper",
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
      meltTo: "Molten Steel",
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
      meltTo: "Liquid Sodium",
      reactsWithWater: true,
    },
  ],
  [
    "Liquid Sodium",
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
  ["Baking Soda", "powder", "#e5e7ce", 1.4, { carbonate: true }],
  [
    "CO2",
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
    "Wet Clay",
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
    "Nutrient Water",
    "none",
    "#111b20",
    0,
    { deprecated: true, retired: true, replacement: "Water" },
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
      residue: "Smoke",
      combustionGas: "Smoke",
    },
  ],
  [
    "Sulfur Dioxide",
    "none",
    "#111b20",
    0,
    { deprecated: true, retired: true, replacement: "Smoke" },
  ],
  [
    "Nitrogen",
    "gas",
    "#92a5c7",
    -0.04,
    {
      conductivity: 0.025,
      suppressesFlame: true,
      condense: -200,
      condenseTo: "Liquid Nitrogen",
    },
  ],
  [
    "Liquid Nitrogen",
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
    "Soapy Water",
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
    "Carbon Dioxide Foam",
    "none",
    "#111b20",
    0,
    { deprecated: true, retired: true, replacement: "CO2" },
  ],
  [
    "Molten Glass",
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
    "Wood Chips",
    "powder",
    "#bc8c58",
    0.55,
    {
      organic: true,
      ignite: 280,
      burn: 90,
      residue: "Ash",
      combustionGas: "CO2",
    },
  ],
  ["Stickman", "life", "#dec49b", 1, { actor: "ai", movable: false }],
  ["Player", "life", "#82d4e8", 1, { actor: "player", movable: false }],
  ["Cat", "life", "#d9aa78", 0.5, { actor: "cat", movable: false }],
  ["Rabbit", "life", "#e4d4c4", 0.3, { actor: "rabbit", movable: false }],
  ["Fish", "life", "#e5ad68", 0.2, { actor: "fish", movable: false }],
  ["Bird", "life", "#9ac9bd", 0.2, { actor: "bird", movable: false }],
  ["Wolf", "life", "#a7b4c2", 0.8, { actor: "wolf", movable: false }],
  ["Shark", "life", "#7fa7bf", 0.5, { actor: "shark", movable: false }],
  [
    "Heat-Seeking Missile",
    "special",
    "#e5b985",
    3,
    {
      device: true,
      projectile: true,
      guidance: "heat",
      directed: true,
      movable: false,
    },
  ],
);
definitions.push([
  "Lamp",
  "special",
  "#ffe4ad",
  2,
  { movable: false, lightEmission: 1.4, glow: 0.65, resistance: 0.7 },
]);
definitions.push(...deviceMaterials, ...fragmentMaterials);
export const M = Object.create(null);
export const materials = definitions.map(
  ([name, category, color, density, properties], id) => {
    const displayName = name.replace(/\b[a-z]/g, (letter) =>
      letter.toUpperCase(),
    );
    if (!properties.deprecated) M[name] = M[displayName] = id;
    return {
      id,
      name: displayName,
      category,
      color,
      density,
      // Fractions: pore volume, connected flow paths, and brittle impact response.
      porosity: category === "powder" ? 0.3 : 0,
      permeability: category === "powder" ? 0.35 : 0,
      brittleness:
        category === "solid"
          ? 0.5
          : category === "powder"
            ? 0.7
            : category === "elastic"
              ? 0.1
              : 0,
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
  "energy",
];
export const categoryLabels = {
  all: "All",
  powder: "Powders",
  liquid: "Liquids",
  gas: "Gases",
  solid: "Solids",
  static: "Static",
  elastic: "Elastics",
  life: "Plants",
  energy: "Energy",
  devices: "Devices",
};
for (const m of materials)
  m.paletteCategory = m.device
    ? "devices"
    : ["Plant", "Seed"].includes(m.name)
      ? "life"
      : m.category === "special"
        ? "static"
        : m.category;

for (const name of ["Heater", "Cooler"]) materials[M[name]].heatSource = true;

for (const name of ["Steel", "Steel Powder"])
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
for (const name of ["Wood", "Plant", "Seed", "Sponge", "Wax", "Liquid Wax"])
  materials[M[name]].organic = true;

for (const name of ["Hydrogen", "Methane"])
  materials[M[name]].requiresOxygen = true;

materials[M.Coal].sparkChance = 0.025;
materials[M.Wood].sparkChance = 0.006;

// Ambient air is implicit. Real gases share buoyancy and pressure rules, with
// their own chemistry and products. Palette grouping never changes physical rules.
materials[M.Hydrogen].combustionGas = M.Steam;
materials[M.Methane].combustionGas = M["CO2"];
materials[M.Kerosene].combustionGas = M["CO2"];
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

// Packed fine grains can retain liquid even when their pore volume is large.
// Permeability describes connected pores, rather than gas transparency.
for (const [name, porosity, permeability, brittleness] of [
  ["Sand", 0.4, 0.7, 0.8],
  ["Dirt", 0.45, 0.22, 0.4],
  ["Clay", 0.5, 0.001, 0.35],
  ["Ash", 0.65, 0.08, 0.85],
  ["Snow", 0.7, 0.65, 0.7],
  ["Salt", 0.3, 0.35, 0.85],
  ["Baking Soda", 0.35, 0.06, 0.7],
  ["Rubble", 0.45, 0.9, 0.75],
  ["Stone Gravel", 0.45, 0.9, 0.75],
  ["Brick Rubble", 0.45, 0.8, 0.8],
  ["Glass Shards", 0.35, 0.75, 0.95],
  ["Wood Chips", 0.6, 0.65, 0.35],
  ["Coal", 0.35, 0.35, 0.7],
  ["Sponge", 0.95, 0.9, 0.1],
  ["Wood", 0.4, 0.04, 0.35],
  ["Stone", 0.1, 0.001, 0.65],
  ["Concrete", 0.15, 0.004, 0.65],
  ["Brick", 0.25, 0.03, 0.75],
  ["Ceramic", 0.1, 0.002, 0.85],
  ["Glass", 0, 0, 0.95],
  ["Ice", 0, 0, 0.8],
  ["Steel", 0, 0, 0.08],
  ["Copper", 0, 0, 0.08],
  ["Rubber", 0, 0, 0.03],
  ["Jelly", 0.1, 0.001, 0.02],
  ["Rope", 0.5, 0.2, 0.08],
  ["Wall", 0, 0, 0],
])
  Object.assign(materials[M[name]], { porosity, permeability, brittleness });

export const canonicalMaterial = (id) => materials[id]?.canonicalId ?? id;
// Toughness is impact energy per exposed cell, separate from chemical resistance.
for (const m of materials)
  if (m.rigid) {
    m.toughness = m.conductive ? 26 : 9;
    if ([M.Stone, M.Concrete, M.Brick, M.Ceramic].includes(m.id))
      m.breakInto = M.Rubble;
    if (m.id === M.Glass) {
      m.toughness = 1.8;
      m.breakInto = M["Glass Shards"];
    }
    if (m.id === M.Ice) {
      m.toughness = 3;
      m.breakInto = M.Snow;
    }
    if (m.id === M.Wood) {
      m.toughness = 10;
      m.breakInto = M["Wood Chips"];
    }
    if (m.id === M.Steel) m.breakInto = M["Steel Powder"];
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

// Reserved slots keep historical numeric saves readable without retaining old
// behavior or making removed materials available to the palette or reactions.
for (const m of materials)
  if (m.retired) {
    const id = m.id,
      retiredName = m.name,
      canonicalId = M[m.replacement];
    if (canonicalId === undefined)
      throw Error(`Unknown replacement for ${retiredName}`);
    Object.assign(m, materials[canonicalId], {
      id,
      name: retiredName,
      deprecated: true,
      retired: true,
      canonicalId,
    });
  }

for (const [from, to] of Object.entries({
  Wood: "Wood Chips",
  Stone: "Stone Gravel",
  Steel: "Steel Powder",
  Copper: "Copper Granules",
  Glass: "Glass Shards",
  Mirror: "Glass Shards",
  Ice: "Snow",
  Rubber: "Rubber Crumbs",
  Jelly: "Jelly Drops",
  Rope: "Rope Fibers",
  Wax: "Wax Shavings",
  Brick: "Brick Rubble",
  Ceramic: "Brick Rubble",
  Concrete: "Brick Rubble",
}))
  if (M[from] !== undefined) {
    materials[M[from]].fragmentTo = M[to];
    materials[M[to]].fragment = true;
  }
