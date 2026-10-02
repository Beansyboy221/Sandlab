// A drawing pause owns only its temporary stop. An already-paused world or an
// explicit playback change must never be resumed by releasing a pointer.
export class DrawingPause {
  constructor(state, settings, setPaused) {
    this.state = state;
    this.settings = settings;
    this.setPaused = setPaused;
    this.pointers = new Set();
    this.resume = false;
  }
  get active() {
    return this.pointers.size > 0;
  }
  begin(pointerId) {
    if (!this.active) {
      this.resume = !this.state.paused;
      this.releaseMode = this.settings.get("solidDrawRelease");
    }
    this.pointers.add(pointerId);
    this.setPaused(true);
  }
  end(pointerId, canceled = false) {
    if (!this.pointers.delete(pointerId) || this.active) return;
    this.finish(canceled);
  }
  hold() {
    this.resume = false;
  }
  finish(canceled) {
    const resume = this.resume && (canceled || this.releaseMode === "resume");
    this.resume = false;
    if (resume) this.setPaused(false);
  }
  cancel() {
    if (!this.active) return;
    this.pointers.clear();
    this.finish(true);
  }
}
