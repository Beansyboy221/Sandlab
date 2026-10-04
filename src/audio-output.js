// One bounded output chain, independent of the number of active voices.
export class AudioOutput {
  constructor(context, input, mode = "auto") {
    this.context = context;
    this.portable =
      globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.highpass = context.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.Q.value = 0.5;
    this.presence = context.createBiquadFilter();
    this.presence.type = "peaking";
    this.presence.frequency.value = 1600;
    this.presence.Q.value = 0.7;
    this.compressor = context.createDynamicsCompressor();
    this.makeup = context.createGain();
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -5;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    input.connect(this.highpass);
    this.highpass.connect(this.presence);
    this.presence.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.limiter);
    this.limiter.connect(context.destination);
    this.configure(mode);
  }
  configure(mode) {
    this.speakers = mode === "speakers" || (mode === "auto" && this.portable);
    const c = this.compressor,
      now = this.context.currentTime;
    this.highpass.frequency.setTargetAtTime(this.speakers ? 90 : 10, now, 0.03);
    this.presence.gain.setTargetAtTime(this.speakers ? 3 : 0, now, 0.03);
    this.makeup.gain.setTargetAtTime(this.speakers ? 2.2 : 1, now, 0.03);
    c.threshold.value = this.speakers ? -28 : -15;
    c.knee.value = this.speakers ? 20 : 15;
    c.ratio.value = this.speakers ? 4 : 8;
    c.attack.value = 0.006;
    c.release.value = 0.15;
  }
}
