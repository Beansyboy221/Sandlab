// Motion configuration, independent of guidance/collision solver code.
export const projectileDefaults = Object.freeze({
  lifetime: 480,
  initialSpeed: 0.65,
  turnRate: 0.065,
  momentumRetention: 0.8,
  thrust: 0.2,
  airDrag: 0.015,
  forceCap: 0.08,
  gravityCoupling: 0.05,
});
