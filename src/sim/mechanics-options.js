// These are saved world rules, independent of browser presentation preferences.
export const defaultMechanics = {
  pressureSimulation: true,
  temperatureSimulation: true,
  fragmentParticles: true,
  windStrength: 0,
  windDirection: "right",
  predation: true,
  predatorRange: 72,
  flocking: true,
  flockRange: 40,
  flockMinimum: 3,
  machineMotors: true,
  machineSpeed: 0.35,
  missileHoming: true,
  laserGuidance: true,
  missileHeat: 80,
  missileRange: 256,
  missileBlast: 5,
  missileSpeed: 1,
};

const ranges = {
  windStrength: [0, 2],
  predatorRange: [24, 120],
  flockRange: [24, 80],
  flockMinimum: [2, 8],
  machineSpeed: [0.15, 0.8],
  missileHeat: [40, 800],
  missileRange: [32, 512],
  missileBlast: [2, 10],
  missileSpeed: [0.5, 2],
};
export function validateMechanics(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid world simulation settings.");
  const result = { ...defaultMechanics };
  for (const [key, fallback] of Object.entries(defaultMechanics)) {
    if (value[key] === undefined) continue;
    const item = value[key],
      bounds = ranges[key];
    if (
      typeof fallback === "boolean"
        ? typeof item !== "boolean"
        : key === "windDirection"
          ? !["right", "left", "up", "down"].includes(item)
          : !Number.isFinite(item) ||
            item < bounds[0] ||
            item > bounds[1] ||
            (key === "flockMinimum" && !Number.isInteger(item))
    )
      throw Error(`Invalid world setting: ${key}.`);
    result[key] = item;
  }
  return result;
}
