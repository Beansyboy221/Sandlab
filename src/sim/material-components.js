// Stock configurations select reusable mechanisms; these are authoring data,
// not rules executed against individual particles or IDs.
export const stockComponents = {
  Empty: { oxidizer: true },
  Dirt: {
    growthSubstrate: true,
    poreHydration: 80,
    nutrientTint: true,
    biology: { mode: "reservoir" },
  },
  Mud: {
    growthSubstrate: true,
    poreHydration: 80,
    nutrientTint: true,
    initialMoisture: 220,
    initialLiquid: "Water",
    initialLiquidAmount: 2,
    dryHostTo: "Dirt",
    mixtureCarrier: "Dirt",
    biology: { mode: "reservoir" },
  },
  Clay: { poreHydration: 80 },
  "Wet Clay": {
    poreHydration: 80,
    initialLiquid: "Water",
    initialLiquidAmount: 1,
    dryHostTo: "Clay",
    mixtureCarrier: "Clay",
  },
  Plant: {
    initialMoisture: 80,
    nutrientTint: true,
    biologicalHost: true,
    decomposable: true,
    biology: {
      mode: "shoot",
      photosynthesisInput: "CO2",
      photosynthesisOutput: "Oxygen",
    },
  },
  Seed: {
    biologicalHost: true,
    biology: { mode: "seed", growthTo: "Plant", growthChance: 0.06 },
  },
  Fungus: {
    biologicalHost: true,
    biology: {
      mode: "colonize",
      interval: 8,
      maxTemperature: 40,
      lethalMinimum: -10,
      lethalMaximum: 60,
      hydrationMinimum: 16,
      waterCost: 4,
      deathTo: "Dirt",
    },
  },
  Virus: {
    biology: {
      mode: "infect",
      interval: 8,
      lethalMinimum: -10,
      lethalMaximum: 60,
      spentTo: "Sawdust",
    },
  },
  Wood: { decomposable: true },
  Sawdust: { decomposable: true },
  Fertilizer: { nutrientValue: 64 },
  Water: {
    solvent: true,
    retainsDissolved: true,
    nutritionResidue: "Fertilizer",
  },
  Ice: {
    retainsDissolved: true,
    restoresLiquid: true,
    lightAbsorption: 0.88,
    lightReflectivity: 0.12,
  },
  Oxygen: { oxidizer: true },
  Salt: { oxidationCatalyst: true },
  Fire: { flame: true, oxidizer: true, plumePassage: true, lightEmission: 1 },
  Smoke: {
    lightScatter: 1,
    smokeCarrier: true,
    plumePassage: true,
    lightAbsorption: 0.03,
    lightReflectivity: 0,
  },
  Spark: { electricalArc: true, lightEmission: 1.1 },
  Portal: { portal: true },
  Brine: { mixtureCarrier: "Water", initialDissolved: "Salt", mixPriority: 1 },
  "Soapy Water": { mixtureCarrier: "Water", initialDissolved: "Soap" },
  Rover: { debrisTo: "Metal Dust" },
  Drone: { debrisTo: "Metal Dust" },
  Clone: { deviceRule: "replicate", spawnChance: 0.3 },
  Void: { deviceRule: "sink" },
  Fan: { airSourceRange: 14, airSourceStrength: 0.4 },
  Lightning: { discharge: true, directed: true, lightEmission: 1.6 },
  Cloud: {
    rainTo: "Water",
    frozenRainTo: "Snow",
    vaporTo: "Steam",
    dischargeTo: "Lightning",
  },
  Soap: { foamTo: "Bubble" },
  Glass: {
    renderStyle: "glass",
    lightAbsorption: 0.015,
    lightReflectivity: 0.04,
    refractiveIndex: 1.52,
    opticalDispersion: 0.025,
    soundTransmission: 0.18,
  },
  Mirror: {
    lightAbsorption: 0.04,
    lightReflectivity: 0.96,
    soundDispersion: 0.02,
  },
  Sponge: { soundDispersion: 0.7, surfacePattern: "pores" },
  Lamp: { lightAbsorption: 0, lightReflectivity: 0 },
  Mercury: {
    lightAbsorption: 0.98,
    lightReflectivity: 0.02,
    refractiveIndex: 1,
    opticalDispersion: 0,
  },
  Lava: {
    lightAbsorption: 0.98,
    lightReflectivity: 0.02,
    refractiveIndex: 1,
    opticalDispersion: 0,
  },
  Steel: { acidGas: "Hydrogen" },
  "Baking Soda": { neutralizationGas: "CO2" },
  Sodium: { waterReactionGas: "Hydrogen" },
  "Liquid Sodium": { waterReactionGas: "Hydrogen" },
  Uranium: { energyRule: "decay", emissionHeat: 8, emissionAirHeat: 0.5 },
  Antimatter: {
    annihilationRadius: 5,
    annihilationTo: "Fire",
    annihilationTemperature: 2500,
    annihilationLifetime: 14,
  },
};
export const stockSolverProducts = {
  flame: "Fire",
  smoke: "Smoke",
  ash: "Ash",
  spark: "Spark",
  vapor: "Steam",
  photon: "Photon",
  discharge: "Lightning",
  boundary: "Wall",
  defaultProjectile: "Seeking Missile",
};
export function configureComponents(definitions) {
  for (const d of definitions) Object.assign(d[4], stockComponents[d[0]]);
}
export function resolveSolverProducts(products, ids) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(products).map(([key, name]) => {
        if (ids[name] === undefined)
          throw Error(`Unknown solver product: ${name}`);
        return [key, ids[name]];
      }),
    ),
  );
}
