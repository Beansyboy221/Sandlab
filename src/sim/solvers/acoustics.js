// The headless wave kernel shares barriers with listener occlusion; playback
// consumes emitted events separately and never advances this field.
export function stepAcousticField(sound, w) {
  sound.tick = w.tick;
  if (w.tick % 12 === 0) {
    const air = w.fields.airflow;
    for (let i = (w.tick / 12) % 32; i < sound.wave.length; i += 32) {
      const speed = Math.hypot(air.velocityX[i], air.velocityY[i]);
      if (speed > 0.8)
        sound.emit(
          "swoosh",
          (i % sound.width) * 4 + 2,
          Math.floor(i / sound.width) * 4 + 2,
          Math.min(0.22, (speed - 0.6) * 0.12),
        );
    }
  }
  if (!sound.active) return;
  if (
    sound.absorptionTick === undefined ||
    sound.absorptionTick < 0 ||
    w.tick % 6 === 0
  )
    sound.rebuildAbsorption(w);
  const {
    width: width,
    height: height,
    wave: p,
    previous: prev,
    next: n,
  } = sound;
  const f = sound,
    loop = w.border === "looping",
    solid = w.border === "solid";
  let peak = 0;
  // Leapfrog wave equation; closed edges use a zero normal derivative to
  // reflect waves. Void edges absorb; looping edges connect to the other side.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const left = x ? i - 1 : loop ? i + width - 1 : -1,
        right = x < width - 1 ? i + 1 : loop ? i - x : -1;
      const up = y ? i - width : loop ? i + (height - 1) * width : -1,
        down = y < height - 1 ? i + width : loop ? x : -1;
      let flux = 0;
      if (left >= 0) flux += (p[left] - p[i]) * f.horizontal[left];
      else if (!solid) flux -= p[i];
      if (right >= 0) flux += (p[right] - p[i]) * f.horizontal[i];
      else if (!solid) flux -= p[i];
      if (up >= 0) flux += (p[up] - p[i]) * f.vertical[up];
      else if (!solid) flux -= p[i];
      if (down >= 0) flux += (p[down] - p[i]) * f.vertical[i];
      else if (!solid) flux -= p[i];
      n[i] = Math.max(
        -4,
        Math.min(
          4,
          (2 * p[i] - prev[i] + flux * (0.22 - sound.dispersion[i] * 0.035)) *
            sound.damping[i],
        ),
      );
      peak = Math.max(peak, Math.abs(n[i]), Math.abs(p[i]));
    }
  sound.previous = p;
  sound.wave = n;
  sound.next = prev;
  if (peak < 0.0005 || w.tick - sound.lastEmission > 180) {
    sound.wave.fill(0);
    sound.previous.fill(0);
    sound.active = false;
  }
}
