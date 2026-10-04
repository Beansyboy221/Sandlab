import test from "node:test";
import assert from "node:assert/strict";
import { voiceProfiles, synthesizeVoice } from "../src/audio-voices.js";
import { soundKinds } from "../src/sim/acoustics.js";

test("every acoustic event has deterministic finite foley with clean endpoints and distinct variants", () => {
  for (const kind of soundKinds) {
    assert.ok(voiceProfiles[kind]);
    const a = synthesizeVoice(kind, 24000, 0),
      b = synthesizeVoice(kind, 24000, 1);
    assert.ok(a.every((v) => Number.isFinite(v) && Math.abs(v) <= 1));
    assert.equal(Math.abs(a[0]), 0);
    assert.equal(Math.abs(a.at(-1)), 0);
    assert.ok(a.some((v) => Math.abs(v) > 0.01));
    assert.deepEqual(synthesizeVoice(kind, 24000, 0), a);
    assert.notDeepEqual(a, b);
  }
});

import { physicalVoice } from "../src/audio-voices.js";
import { materials, M } from "../src/sim/materials.js";
import { acousticTraits } from "../src/sim/acoustic-properties.js";
test("physical impacts respond to mass, brittleness, elastic softness and conductivity", () => {
  const event = { kind: "impact", mass: 1, strength: 0.5 };
  const glass = physicalVoice({ ...event, material: M.Glass });
  const rubber = physicalVoice({ ...event, material: M.Rubber });
  const steel = physicalVoice({ ...event, material: M.Steel });
  assert.ok(glass.brightness > rubber.brightness);
  assert.ok(steel.ring > rubber.ring);
  assert.ok(
    physicalVoice({ ...event, mass: 40, material: M.Steel }).frequency <
      steel.frequency,
  );
  assert.ok(
    acousticTraits(materials[M.Sponge]).loss >
      acousticTraits(materials[M.Steel]).loss,
  );
  // New definitions need no sound-effect registration.
  const soft = { ...materials[M.Glass], elasticity: 0.3, porosity: 20 };
  assert.ok(
    physicalVoice({ ...event, material: soft }).brightness < glass.brightness,
  );
});
test("flow viscosity suppresses bubbling and pressure/heat shape reaction excitation", () => {
  const flow = { kind: "slosh", mass: 1, strength: 0.5 };
  const water = physicalVoice({ ...flow, material: M.Water }),
    lava = physicalVoice({ ...flow, material: M.Lava });
  assert.ok(water.ring > lava.ring);
  assert.ok(water.frequency > lava.frequency);
  const reaction = {
    kind: "fizz",
    mass: 1,
    strength: 0.5,
    pressure: 1,
    heat: 0,
    gas: 1,
  };
  const small = physicalVoice(reaction),
    large = physicalVoice({ ...reaction, pressure: 20 });
  assert.ok(large.duration > small.duration);
  assert.ok(large.frequency < small.frequency);
  assert.ok(
    physicalVoice({ ...reaction, heat: 600 }).frequency > small.frequency,
  );
  assert.notDeepEqual(
    synthesizeVoice(water, 24000),
    synthesizeVoice(lava, 24000),
  );
});
