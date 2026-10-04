// Reusable procedural foley: colored noise, droplets and damped resonances.
// Build samples once per voice variant; no per-particle audio graphs or assets.
export const voiceProfiles = {
  grain: { duration: 0.09, frequency: 1800, volume: 0.6 },
  impact: { duration: 0.28, frequency: 170, volume: 0.85 },
  fizz: { duration: 0.38, frequency: 4200, volume: 0.55 },
  melt: { duration: 0.2, frequency: 650, volume: 0.25 },
  boil: { duration: 0.3, frequency: 850, volume: 0.65 },
  explosion: { duration: 0.7, frequency: 85, volume: 1 },
  crackle: { duration: 0.085, frequency: 2700, volume: 0.45 },
  chirp: { duration: 0.16, frequency: 2100, volume: 0.35 },
  splash: { duration: 0.38, frequency: 1300, volume: 0.8 },
  slosh: { duration: 0.4, frequency: 750, volume: 0.55 },
  swoosh: { duration: 0.32, frequency: 950, volume: 0.45 },
};
export function synthesizeVoice(kind, sampleRate, variant = 0) {
  const profile = voiceProfiles[kind];
  if (!profile) return null;
  const data = new Float32Array(Math.ceil(profile.duration * sampleRate));
  let seed =
      17421 + variant * 7919 + Object.keys(voiceProfiles).indexOf(kind) * 997,
    low = 0,
    previous = 0,
    phase = 0;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const white = (seed >>> 0) / 2147483648 - 1,
      t = i / sampleRate,
      u = t / profile.duration;
    low = low * 0.94 + white * 0.06;
    const high = white - previous;
    previous = white;
    const attack = Math.min(1, t / 0.004),
      decay = Math.pow(1 - u, 2);
    let value = 0;
    switch (kind) {
      case "grain":
        value =
          (high * 0.22 + white * 0.2) *
          Math.exp(-t * 42) *
          (0.5 + 0.5 * Math.sin(t * 730 + variant));
        break;
      case "impact":
        value =
          low * 2.2 * Math.exp(-t * 16) +
          Math.sin(t * profile.frequency * 6.283) * Math.exp(-t * 24) * 0.38 +
          high * 0.12 * Math.exp(-t * 90);
        break;
      case "explosion":
        phase += (6.283 * (38 + 85 * Math.exp(-t * 12))) / sampleRate;
        value =
          low * 4 * Math.exp(-t * 5) +
          Math.sin(phase) * Math.exp(-t * 9) * 0.5 +
          white * 0.18 * Math.exp(-t * 35);
        break;
      case "fizz":
        value =
          high *
          0.22 *
          (0.45 + 0.55 * Math.pow(Math.sin(t * 410 + variant), 4)) *
          Math.sin(Math.PI * u);
        break;
      case "crackle":
        value =
          high * 0.42 * Math.exp(-t * 75) +
          white * 0.14 * Math.exp(-Math.pow((t - 0.028) / 0.004, 2));
        break;
      case "chirp":
        phase += (6.283 * (1800 + variant * 55 + 1400 * Math.sin(Math.PI * u))) / sampleRate;
        value = Math.sin(phase) * Math.sin(Math.PI * u) * 0.6;
        break;
      case "melt":
        value =
          low * 0.8 * decay +
          Math.sin(t * (650 + variant * 120) * 6.283) *
            Math.exp(-t * 28) *
            0.09;
        break;
      case "swoosh":
        value =
          (low * 3.5 + white * 0.12) * Math.pow(Math.sin(Math.PI * u), 1.5);
        break;
      default: {
        const splash = kind === "splash",
          slosh = kind === "slosh";
        value =
          (low * (splash ? 2.6 : 2) + white * (splash ? 0.14 : 0.025)) *
          (slosh ? Math.sin(Math.PI * u) : decay);
        // Several pitched water cavities pop into shorter, downward chirps.
        for (let bubble = 0; bubble < 4; bubble++) {
          const age = t - (bubble * 0.055 + variant * 0.006);
          if (age >= 0) {
            const f = 450 + bubble * 230 + variant * 95;
            value +=
              Math.sin(6.283 * f * (age - age * age * 1.8)) *
              Math.exp(-age * 36) *
              0.13;
          }
        }
      }
    }
    data[i] = Math.max(-1, Math.min(1, value * attack));
  }
  // Every sample ends at zero, avoiding clicks and quiet indefinite tails.
  for (let i = Math.max(0, data.length - 256); i < data.length; i++)
    data[i] *= (data.length - 1 - i) / 256;
  return data;
}
