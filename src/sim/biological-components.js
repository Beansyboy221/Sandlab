// Compiled once per material, never allocated for a particle.
const defaults = {
  mode: "reservoir",
  interval: 4,
  minTemperature: 5,
  maxTemperature: 45,
  lethalMinimum: -273,
  lethalMaximum: 100000,
  hydrationMaximum: 160,
  hydrationYield: 80,
  hydrationMinimum: 32,
  moistureDecayInterval: 128,
  nutrientChance: 0.04,
  nutrientMaximum: 190,
  nutrientDiffusion: 6,
  growthChance: 0.05,
  fedBonus: 0.04,
  growthLimit: 22,
  uprightBias: 0.7,
  waterCost: 8,
  nutrientCost: 4,
  germinationMoisture: 24,
  substrateNutrition: 16,
  photosynthesisChance: 0.06,
  photosynthesisWater: 2,
  photosynthesisNutrition: 2,
  minimumLight: 0.1,
  incubation: 4,
  replicationLimit: 3,
  decompositionNutrition: 8,
  deathTo: 0,
  spentTo: 0,
};
const references = new Set([
  "growthTo",
  "deathTo",
  "spentTo",
  "photosynthesisInput",
  "photosynthesisOutput",
]);
const integers = new Set([
  "interval",
  "hydrationMaximum",
  "hydrationYield",
  "hydrationMinimum",
  "moistureDecayInterval",
  "nutrientMaximum",
  "nutrientDiffusion",
  "growthLimit",
  "waterCost",
  "nutrientCost",
  "germinationMoisture",
  "substrateNutrition",
  "photosynthesisWater",
  "photosynthesisNutrition",
  "incubation",
  "replicationLimit",
  "decompositionNutrition",
]);
const fractions = new Set([
  "nutrientChance",
  "growthChance",
  "fedBonus",
  "uprightBias",
  "photosynthesisChance",
  "minimumLight",
]);
export function compileBiology(input, ids, materials, ownId) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype)
    throw Error("Biology must be plain component data.");
  for (const key of Object.keys(input))
    if (!Object.hasOwn(defaults, key) && !references.has(key))
      throw Error(`Unknown biology property: ${key}`);
  const result = { ...defaults, growthTo: ownId, ...input };
  if (
    !["reservoir", "seed", "shoot", "colonize", "infect"].includes(result.mode)
  )
    throw Error("Unknown biological process.");
  for (const [key, value] of Object.entries(result)) {
    if (references.has(key)) {
      const id = typeof value === "string" ? ids[value] : value;
      if (!Number.isInteger(id) || !materials[id])
        throw Error(`Unknown biology product: ${key}`);
      result[key] = id;
    } else if (key !== "mode") {
      const temperature =
        key.includes("Temperature") || key.startsWith("lethal");
      if (
        !Number.isFinite(value) ||
        value < (temperature ? -273 : 0) ||
        value > (fractions.has(key) ? 1 : temperature ? 100000 : 255) ||
        (integers.has(key) && !Number.isInteger(value))
      )
        throw Error(`Invalid biology property: ${key}`);
    }
  }
  if (
    !result.interval ||
    !result.moistureDecayInterval ||
    !result.incubation ||
    !result.replicationLimit ||
    result.minTemperature > result.maxTemperature ||
    result.lethalMinimum > result.lethalMaximum ||
    result.hydrationMinimum > result.hydrationMaximum ||
    result.waterCost >
      (result.mode === "colonize"
        ? Math.ceil(result.hydrationMinimum / 2)
        : result.mode === "seed"
          ? result.germinationMoisture
          : result.hydrationMinimum) ||
    result.photosynthesisWater > result.hydrationMinimum ||
    (result.photosynthesisInput === undefined) !==
      (result.photosynthesisOutput === undefined)
  )
    throw Error("Conflicting biology conditions.");
  return Object.freeze(result);
}
