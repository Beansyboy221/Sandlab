// Browser preferences override these defaults; standalone worlds use the same
// rules without a UI dependency. Transient controls are not embedded in saves.
export const defaultMechanics = {
  windSimulation: true,
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
