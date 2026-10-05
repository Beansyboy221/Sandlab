export { moveParticle } from "./particle-motion.js";
export { canMove, tryMove } from "./particle-contacts.js";
export { explode } from "./blast.js";

// Mechanics has several scheduled phases so local chemistry, agents and field
// transport retain their seeded order without another full-grid traversal.
export function preparePhysics(w) {
  w.portals.world = w;
  w.elastic.world = w;
  w.rigid.world = w;
  w.environment.world = w;
  w.environment.update(true);
}

export function setGravity(w, x, y) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    Math.abs(x) + Math.abs(y) !== 1
  )
    return;
  if (w.gravityX === x && w.gravityY === y) return;
  w.gravityX = x;
  w.gravityY = y;
  w.motionStamp.fill(w.tick + 1);
}

export function stepRigidBodies(w) {
  w.rigid.step();
}

export function stepElastics(w) {
  w.elastic.step();
}

export function stepAgents(w) {
  // Agent decisions and constrained anatomy currently share an integration
  // pass; behavior-specific algorithms stay in their existing bounded modules.
  w.stickmen.world = w;
  w.stickmen.step();
}

export function stepDevices(w) {
  w.missiles.world = w;
  w.missiles.step();
}

export function stepFragments(w) {
  w.fragments.world = w;
  w.fragments.step();
}
