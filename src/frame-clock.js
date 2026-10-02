export const FRAME_INTERVAL = 1000 / 60;
const ROUNDING_TOLERANCE = 0.01;

// Keep the display cadence independent of a 60/90/120/144 Hz screen.
// Simulation uses fixed steps; missed steps are dropped instead of bursting.
export class FrameClock {
  constructor(now) {
    this.reset(now);
  }
  reset(now) {
    this.lastRender = now;
    this.lastFrame = now;
    this.resetSimulation();
  }
  resetSimulation() {
    this.accumulator = 0;
    this.droppedTicks = 0;
  }
  takeFrame(now) {
    const sinceRender = now - this.lastRender;
    if (sinceRender + ROUNDING_TOLERANCE < FRAME_INTERVAL) return 0;
    // Preserve fractional cadence without accumulating refresh-rate drift.
    const periods = Math.floor(
      (sinceRender + ROUNDING_TOLERANCE) / FRAME_INTERVAL,
    );
    this.lastRender += periods * FRAME_INTERVAL;
    const elapsed = Math.max(0, now - this.lastFrame);
    this.lastFrame = now;
    return elapsed;
  }
  takeTick(elapsed, speed, paused) {
    if (paused) {
      this.resetSimulation();
      return false;
    }
    this.accumulator += elapsed * Math.max(0, Math.min(1, speed));
    const due = Math.floor(
      (this.accumulator + ROUNDING_TOLERANCE) / FRAME_INTERVAL,
    );
    if (!due) return false;
    this.accumulator = Math.max(0, this.accumulator - due * FRAME_INTERVAL);
    this.droppedTicks += due - 1;
    return true;
  }
}
