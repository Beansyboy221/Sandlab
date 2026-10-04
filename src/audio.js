import { AudioOutput } from "./audio-output.js";
import { physicalVoice, synthesizeVoice } from "./audio-voices.js";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
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
        Math.pow(
          Math.hypot(source.x - listener.x, source.y - listener.y) /
            Math.max(1, Math.max(width, renderer.canvas.height) * 0.28),
          2,
        )),
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
      if (keys.includes("audioOutput"))
        this.output?.configure(settings.get("audioOutput"));
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
        this.output = new AudioOutput(
          c,
          this.master,
          this.settings.get("audioOutput"),
        );
        // Safari's playback route uses the media speaker rather than an ambient
        // session; feature-detect it without relying on a browser/user-agent name.
        try {
          if (navigator.audioSession) navigator.audioSession.type = "playback";
        } catch {}
        this.buffers = new Map();
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
    if (!events.length || this.active.size >= 24) {
      events.length = 0;
      return;
    }
    events.sort((a, b) => b.strength - a.strength);
    const player = this.world.stickmen.player || null;
    const box = this.renderer.canvas.getBoundingClientRect();
    const listener = player
      ? { x: player.x[0], y: player.y[0] }
      : this.renderer.point(box.left + box.width / 2, box.top + box.height / 2);
    const acoustics = this.world.sound;
    this.world.fields.rebuildBarriers(this.world);
    if (this.world.tick - (acoustics.absorptionTick ?? -1000) >= 6)
      acoustics.rebuildAbsorption(this.world);
    acoustics.listener.prepare(this.world, listener.x, listener.y);
    let count = 0;
    for (const e of events) {
      if (count >= 8 || this.active.size >= 24) break;
      if (this.world.tick - e.tick > 8) continue;
      const position = soundPosition(e, this.renderer, player);
      const transport = acoustics.listener.sample(e.x, e.y);
      if (!this.settings.get("audioOcclusion")) {
        transport.gain = 1;
        transport.cutoff = 16000;
        transport.clarity = 1;
      }
      if (!this.settings.get("audioEcho")) transport.reflections = [];
      position.gain *= transport.gain;
      this.play(e, position, transport);
      count++;
    }
    events.length = 0;
  }
  play(
    e,
    position,
    transport = { cutoff: 16000, clarity: 1, reflections: [] },
  ) {
    const c = this.context,
      v = physicalVoice(e);
    if (!v) return;
    const start = c.currentTime;
    const variant = this.played % 3,
      key = v.key + ":" + variant;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const samples = synthesizeVoice(v, c.sampleRate, variant);
      buffer = c.createBuffer(
        1,
        samples.length + Math.ceil(c.sampleRate * 0.42),
        c.sampleRate,
      );
      buffer.getChannelData(0).set(samples);
      if (this.buffers.size >= 96)
        this.buffers.delete(this.buffers.keys().next().value);
      this.buffers.set(key, buffer);
    }
    const rate =
      v.family === "vocal"
        ? 1
        : clamp(v.frequency / (v.family === "impact" ? 900 : 700), 0.3, 2);
    const duration = v.duration / rate;
    const gain = c.createGain(),
      pan = c.createStereoPanner(),
      muffle = c.createBiquadFilter();
    const peak = Math.min(0.22, e.strength * 0.2) * position.gain * v.volume;
    gain.gain.value = peak;
    pan.pan.value = position.pan;
    muffle.type = "lowpass";
    muffle.Q.value = 0.65;
    muffle.frequency.value = transport.cutoff;
    gain.connect(pan);
    pan.connect(muffle);
    muffle.connect(this.master);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    const nodes = [source, gain, pan, muffle];
    let tail = 0;
    if (e.strength > 0.12)
      for (const reflection of transport.reflections) {
        const delay = c.createDelay(0.4),
          wet = c.createGain(),
          soften = c.createBiquadFilter();
        delay.delayTime.value = reflection.delay;
        wet.gain.value = reflection.gain;
        soften.type = "lowpass";
        soften.frequency.value = Math.min(3200, transport.cutoff);
        soften.Q.value = 0.5;
        pan.connect(delay);
        delay.connect(wet);
        wet.connect(soften);
        soften.connect(this.master);
        nodes.push(delay, wet, soften);
        tail = Math.max(tail, reflection.delay);
      }
    // A silent buffer tail retains delayed nodes until their finite taps finish;
    // no feedback loop can sustain a room's reverb indefinitely.
    source.loop = false;
    const voice = { gain };
    this.active.add(voice);
    this.played++;
    this.lastVoices.push({
      kind: e.kind,
      pan: position.pan,
      mass: e.mass,
      frequency: v.frequency,
      gain: peak,
      cutoff: transport.cutoff,
      clarity: transport.clarity,
      reflections: transport.reflections.length,
    });
    if (this.lastVoices.length > 24) this.lastVoices.shift();
    source.start(start);
    source.stop(start + duration + tail + 0.02);
    source.onended = () => {
      this.active.delete(voice);
      for (const node of nodes) node.disconnect();
    };
  }
}
