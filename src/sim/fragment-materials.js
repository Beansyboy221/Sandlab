// Fine debris is a state of its parent substance, with only shape-dependent overrides.
export const fragmentMaterials = [
  [
    "Sawdust",
    "powder",
    "#bd9269",
    undefined,
    {
      burn: 65,
      ignite: 230,
      porosity: 4,
      permeability: 0.3,
      retention: 0.94,
      brittleness: 0.65,
      conductivity: 0.015,
      airPermeability: 0.7,
    },
  ],
  [
    "Stone Gravel",
    "powder",
    "#a29d92",
    undefined,
    { permeability: 0.9, retention: 0.25 },
  ],
  ["Copper Granules", "powder", "#c78e6e", undefined, {}],
  ["Rubber Crumbs", "powder", "#766983", undefined, { burn: 300 }],
  [
    "Jelly Drops",
    "liquid",
    "#d58daf",
    1.05,
    { viscosity: 12, freeze: 55, freezeTo: "Jelly" },
  ],
  ["Rope Fibers", "powder", "#b79e75", undefined, {}],
  ["Wax Shavings", "powder", "#dfcb96", undefined, {}],
  [
    "Brick Fragments",
    "powder",
    "#be9a86",
    undefined,
    { permeability: 0.8, retention: 0.65 },
  ],
];
