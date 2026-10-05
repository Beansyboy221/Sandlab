import { stepParticles } from "./particle-pass.js";
import {
  preparePhysics,
  stepRigidBodies,
  stepElastics,
  stepAgents,
  stepDevices,
  stepFragments,
} from "./physics.js";

// Fixed order: field transport, signal propagation, local contacts, mechanics,
// agents, fragmentation, then sound. Renderers never advance these systems.
export function advanceSimulation(w) {
  const profile = w.profile;
  profile.begin();
  w.tick++;
  w.sound.tick = w.tick;
  w.fields.configure(w.mechanics);
  preparePhysics(w);
  w.fields.border = w.border;
  w.fields.update(w);
  w.fields.beginForceSample();
  profile.mark(0);
  w.circuits.world = w;
  w.circuits.step();
  profile.mark(1);
  stepParticles(w);
  profile.mark(2);
  stepRigidBodies(w);
  profile.mark(3);
  stepElastics(w);
  profile.mark(4);
  stepAgents(w);
  profile.mark(5);
  stepDevices(w);
  profile.mark(6);
  stepFragments(w);
  profile.mark(7);
  w.sound.step(w);
  profile.mark(8);
}
