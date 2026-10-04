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
