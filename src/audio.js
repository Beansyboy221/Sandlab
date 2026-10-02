const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const voices = {
  grain: { duration: 0.045, frequency: 1900, noise: 1, tone: 0 },
  impact: { duration: 0.18, frequency: 180, noise: 0.65, tone: 0.4 },
  fizz: { duration: 0.25, frequency: 4200, noise: 1, tone: 0 },
  melt: { duration: 0.3, frequency: 500, noise: 0.35, tone: 0.22 },
  boil: { duration: 0.16, frequency: 900, noise: 0.65, tone: 0.18 },
  explosion: { duration: 0.6, frequency: 100, noise: 1, tone: 0.45 },
  crackle: { duration: 0.055, frequency: 2800, noise: 1, tone: 0 },
  chirp: { duration: 0.12, frequency: 2100, noise: 0.04, tone: 0.25 },
  splash: { duration: 0.12, frequency: 1500, noise: 1, tone: 0.08 },
};
export function soundPosition(event, renderer, player = null) {
  const source = renderer.project(event.x, event.y);
  const listener = player
    ? renderer.project(player.x[0], player.y[0])
    : { x: renderer.canvas.width / 2, y: renderer.canvas.height / 2 };
  const width = renderer.canvas.width;
  return {
    pan: clamp((source.x - listener.x) / (width * 0.35), -1, 1),
    gain:
      1 /
      (1 +
        Math.hypot(source.x - listener.x, source.y - listener.y) /
          Math.max(1, width * 0.45)),
  };
}
export class GameAudio {
  constructor(world, renderer, settings, playerControls) {
    this.world = world;
    this.renderer = renderer;
    this.settings = settings;
    this.playerControls = playerControls;
    this.context = null;
    this.active = new Set();
    this.played = 0;
    this.lastVoices = [];
    const unlock = () => {
      if (settings.get("sound")) this.unlock();
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    window.addEventListener("keyup", unlock, { capture: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.silence();
    });
    settings.subscribe((keys) => {
      if (keys.includes("sound") && !settings.get("sound")) this.silence();
      if (this.master)
        this.master.gain.setTargetAtTime(
          settings.get("sound") ? settings.get("volume") : 0,
          this.context.currentTime,
          0.03,
        );
    });
  }
  unlock() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!this.context) {
      try {
        const c = (this.context = new Context());
        this.master = c.createGain();
        this.master.gain.value = this.settings.get("volume");
        const limiter = c.createDynamicsCompressor();
        limiter.threshold.value = -15;
        limiter.knee.value = 15;
        limiter.ratio.value = 8;
        this.master.connect(limiter);
        limiter.connect(c.destination);
        this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const data = this.noise.getChannelData(0);
        let seed = 17421;
        for (let i = 0; i < data.length; i++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          data[i] = (seed >>> 0) / 2147483648 - 1;
        }
      } catch {
        this.context = null;
        return;
      }
    }
    if (this.context.state !== "running") this.context.resume().catch(() => {});
  }
  silence() {
    for (const voice of this.active)
      voice.gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.01);
    this.world.sound.events.length = 0;
  }
  update(paused) {
    if (paused && !this.wasPaused) this.silence();
    this.wasPaused = paused;
    const events = this.world.sound.events;
    if (
      paused ||
      document.hidden ||
      !this.settings.get("sound") ||
      !this.context ||
      this.context.state !== "running"
    ) {
      events.length = 0;
      return;
    }
    events.sort((a, b) => b.strength - a.strength);
    const player = this.playerControls.enabled
      ? this.world.stickmen.player
      : null;
    const box = this.renderer.canvas.getBoundingClientRect();
    const listener = player
      ? { x: player.x[0], y: player.y[0] }
      : this.renderer.point(box.left + box.width / 2, box.top + box.height / 2);
    let count = 0;
    for (const e of events) {
      if (count >= 8 || this.active.size >= 24) break;
      if (this.world.tick - e.tick > 8) continue;
      const position = soundPosition(e, this.renderer, player);
      let walls = 0;
      const samples = Math.min(
        48,
        Math.ceil(Math.hypot(e.x - listener.x, e.y - listener.y)),
      );
      for (let n = 1; n < samples; n++) {
        const i = this.world.index(
          Math.floor(e.x + ((listener.x - e.x) * n) / samples),
          Math.floor(e.y + ((listener.y - e.y) * n) / samples),
        );
        if (i >= 0 && this.world.fields.blocks(this.world.cells[i]) > 0.9)
          walls++;
      }
      position.gain *= Math.max(0.2, Math.pow(0.8, walls));
      this.play(e, position);
      count++;
    }
    events.length = 0;
  }
  play(e, position) {
    const c = this.context,
      v = voices[e.kind];
    if (!v) return;
    const start = c.currentTime,
      duration = v.duration,
      frequency = v.frequency / Math.pow(Math.max(0.5, e.mass), 0.22);
    const gain = c.createGain(),
      pan = c.createStereoPanner(),
      filter = c.createBiquadFilter();
    pan.pan.value = position.pan;
    filter.type =
      e.kind === "fizz" || e.kind === "grain" ? "highpass" : "lowpass";
    filter.frequency.value = frequency;
    const peak = Math.min(0.18, e.strength * 0.11) * position.gain;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peak),
      start + 0.005,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    const noise = c.createBufferSource(),
      noiseGain = c.createGain();
    noise.buffer = this.noise;
    noiseGain.gain.value = v.noise;
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start(start);
    let echo = null,
      echoGain = null;
    if (e.strength > 0.15 && this.world.border === "solid") {
      // One quiet first reflection gives impacts room without a large reverb
      // graph. Propagation and internal reflections are visible in Echolocation.
      const distance = Math.min(
        e.x,
        e.y,
        this.world.width - e.x,
        this.world.height - e.y,
      );
      echo = c.createDelay(0.4);
      echo.delayTime.value = Math.max(0.035, Math.min(0.25, distance / 400));
      echoGain = c.createGain();
      echoGain.gain.value = 0.14;
      pan.connect(echo);
      echo.connect(echoGain);
      echoGain.connect(this.master);
    }
    noise.stop(start + duration + (echo?.delayTime.value || 0));
    let tone = null,
      toneGain = null;
    if (v.tone) {
      tone = c.createOscillator();
      toneGain = c.createGain();
      toneGain.gain.value = v.tone;
      tone.frequency.setValueAtTime(frequency, start);
      tone.frequency.exponentialRampToValueAtTime(
        e.kind === "chirp" ? frequency * 1.8 : frequency * 0.35,
        start + duration,
      );
      tone.connect(toneGain);
      toneGain.connect(filter);
      tone.start(start);
      tone.stop(start + duration);
    }
    const voice = { gain };
    this.active.add(voice);
    this.played++;
    this.lastVoices.push({
      kind: e.kind,
      pan: position.pan,
      mass: e.mass,
      frequency,
      gain: peak,
    });
    if (this.lastVoices.length > 24) this.lastVoices.shift();
    noise.onended = () => {
      this.active.delete(voice);
      noise.disconnect();
      noiseGain.disconnect();
      tone?.disconnect();
      toneGain?.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan.disconnect();
      echo?.disconnect();
      echoGain?.disconnect();
    };
  }
}
