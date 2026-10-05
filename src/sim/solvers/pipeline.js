import { stepParticles } from "./particle-pass.js";

// Fixed order: field transport, signal propagation, local contacts, mechanics,
// agents, fragmentation, then sound. Renderers never advance these systems.
export function advanceSimulation(w) {
  const profile = w.profile;
  profile.begin();
  w.portals.world = w;
  w.elastic.world = w;
  w.rigid.world = w;
  w.tick++;
  w.sound.tick = w.tick;
  w.fields.configure(w.mechanics);
  w.environment.world = w;
  w.environment.update(true);
  w.fields.border = w.border;
  w.fields.update(w);
  w.fields.beginForceSample();
  profile.mark(0);
  w.circuits.world = w;
  w.circuits.step();
  profile.mark(1);
  stepParticles(w);
  profile.mark(2);
  w.rigid.step();
  profile.mark(3);
  w.elastic.step();
  profile.mark(4);
  w.stickmen.world = w;
  w.stickmen.step();
  profile.mark(5);
  w.missiles.world = w;
  w.missiles.step();
  profile.mark(6);
  w.fragments.world = w;
  w.fragments.step();
  profile.mark(7);
  w.sound.step(w);
  profile.mark(8);
}
