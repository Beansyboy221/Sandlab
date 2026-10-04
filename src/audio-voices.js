import {
  acousticMaterials,
  acousticTraits,
} from "./sim/acoustic-properties.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const families = {
  grain: "impact",
  impact: "impact",
  melt: "flow",
  splash: "flow",
  slosh: "flow",
  fizz: "pressure",
  boil: "pressure",
  explosion: "pressure",
  crackle: "pressure",
  swoosh: "flow",
  chirp: "vocal",
};
// Event names classify the physical excitation, not a material-specific effect.
// Quantized parameters share buffers; pitch remains continuous at playback.
export function physicalVoice(e) {
  const m =
    typeof e.material === "object"
      ? acousticTraits(e.material)
      : acousticMaterials[e.material ?? 0] || acousticMaterials[0];
  const target = acousticMaterials[e.contact];
  const contactSoftness = target
    ? Math.max(m.softness, target.softness)
    : m.softness;
  const mass = clamp(e.mass || m.density, 0.1, 100);
  const pressure = Math.abs(
    e.pressure ?? (e.kind === "explosion" ? e.strength * 12 : e.strength),
  );
  const heat = Math.abs(e.heat || 0);
  const gas = Math.abs(e.gas || 0);
  const family = families[e.kind];
  if (!family) return null;
  const brightness =
    family === "impact"
      ? clamp(
          0.15 + m.brittle * 0.65 + m.friction * 0.15 - contactSoftness * 0.4,
          0.05,
          0.95,
        )
      : family === "pressure"
        ? clamp(
            0.25 +
              Math.log1p(heat) * 0.07 +
              gas * 0.12 -
              Math.log1p(pressure) * 0.12,
            0.05,
            0.95,
          )
        : clamp(
            0.6 / Math.sqrt(m.viscosity) + (e.kind === "swoosh" ? 0.2 : 0),
            0.05,
            0.95,
          );
  const ring =
    family === "impact"
      ? m.ring * (1 - contactSoftness)
      : family === "flow" && e.kind !== "swoosh"
        ? 0.4 / Math.sqrt(m.viscosity)
        : 0;
  const duration =
    family === "impact"
      ? 0.12 + m.ring * 0.35 + m.softness * 0.1
      : family === "pressure"
        ? 0.16 + Math.min(0.5, pressure * 0.035 + gas * 0.04)
        : 0.35;
  const frequency =
    family === "impact"
      ? (180 + m.brittle * 1400 + m.ring * 600) / Math.pow(mass, 0.18)
      : family === "pressure"
        ? (700 + heat * 0.8 + gas * 250) / (1 + pressure * 0.25)
        : 700 / Math.pow(m.density * m.viscosity, 0.2);
  const b = Math.round(brightness * 4),
    r = Math.round(ring * 4),
    d = Math.round(duration * 10);
  return {
    family,
    brightness: b / 4,
    ring: r / 4,
    duration: d / 10,
    frequency: clamp(frequency, 60, 4000),
    volume: clamp(1 - contactSoftness * 0.5, 0.3, 1),
    key: `${family}:${b}:${r}:${d}`,
  };
}
// Compatibility for developer tools; runtime always supplies a physical event.
export const voiceProfiles = Object.fromEntries(
  Object.keys(families).map((kind) => [
    kind,
    physicalVoice({ kind, strength: 0.2, mass: 1 }),
  ]),
);
export function synthesizeVoice(input, sampleRate, variant = 0) {
  const v = typeof input === "string" ? voiceProfiles[input] : input;
  if (!v) return null;
  const samples = new Float32Array(Math.ceil(v.duration * sampleRate));
  let seed = 17421 + variant * 7919,
    low = 0,
    previous = 0,
    phase = 0;
  for (let i = 0; i < samples.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const white = (seed >>> 0) / 2147483648 - 1;
    low += 0.06 * (white - low);
    const high = white - previous;
    previous = white;
    const t = i / sampleRate,
      u = t / v.duration;
    const attack = Math.min(1, t / 0.004),
      decay = Math.pow(1 - u, 2);
    const noise = low * (3 - v.brightness * 2) + high * v.brightness * 0.3;
    let value;
    if (v.family === "impact") {
      value =
        noise * Math.exp(-t * 35) +
        v.ring * Math.sin(t * 900 * Math.PI * 2) * decay * 0.55;
      value +=
        (1 - v.brightness) *
        Math.sin(t * 160 * Math.PI * 2) *
        Math.exp(-t * 24) *
        0.4;
    } else if (v.family === "pressure") {
      phase += (2 * Math.PI * (80 + 180 * Math.exp(-t * 15))) / sampleRate;
      value =
        noise * decay * (0.55 + 0.45 * Math.sin(t * 650 + variant) ** 4) +
        Math.sin(phase) * (1 - v.brightness) * decay * 0.4;
    } else if (v.family === "vocal") {
      phase +=
        (2 * Math.PI * (1800 + variant * 55 + 1400 * Math.sin(Math.PI * u))) / sampleRate;
      value = Math.sin(phase) * Math.sin(Math.PI * u) * 0.6;
    } else {
      value = noise * Math.sin(Math.PI * u) ** 1.5;
      // Flow excites damped cavity resonances; viscosity suppresses bubbling.
      for (let bubble = 0; bubble < 4; bubble++) {
        const q = t - bubble * 0.055;
        if (q > 0)
          value +=
            v.ring *
            Math.sin(
              (2 * Math.PI * (450 + 230 * bubble + 95 * variant) * q) /
                (1 + 8 * q),
            ) *
            Math.exp(-q * 36);
      }
    }
    samples[i] = clamp(
      value * attack * Math.min(1, (samples.length - 1 - i) / 256),
      -1,
      1,
    );
  }
  return samples;
}
