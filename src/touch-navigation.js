const point = (event) => ({ x: event.clientX, y: event.clientY });

// A short grace period distinguishes a drawing touch from the first half of a
// two-finger gesture. A navigation session owns all touches until the last lifts.
export class TouchNavigation {
  constructor(renderer, drawing, graceMs = 100) {
    this.renderer = renderer;
    this.drawing = drawing;
    this.graceMs = graceMs;
    this.touches = new Map();
    this.pending = null;
    this.timer = null;
    this.active = null;
    this.navigating = false;
    this.blocked = false;
    this.previous = null;
  }
  sample() {
    const [a, b] = this.touches.values();
    return b
      ? {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          distance: Math.hypot(b.x - a.x, b.y - a.y),
        }
      : null;
  }
  clearPending() {
    clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
  beginDrawing() {
    if (!this.pending || this.navigating || this.blocked) return;
    const event = this.pending;
    this.clearPending();
    this.active = event.pointerId;
    this.drawing.down(event);
  }
  down(event) {
    this.touches.set(event.pointerId, point(event));
    if (this.blocked) return;
    if (this.touches.size >= 2) {
      this.clearPending();
      if (!this.navigating) this.drawing.cancel();
      this.active = null;
      this.navigating = true;
      this.previous = this.sample();
      return;
    }
    if (this.navigating) return;
    this.pending = event;
    this.timer = setTimeout(() => this.beginDrawing(), this.graceMs);
  }
  move(event) {
    if (!this.touches.has(event.pointerId)) return;
    this.touches.set(event.pointerId, point(event));
    if (this.blocked) return;
    if (this.navigating) {
      const next = this.sample(),
        previous = this.previous;
      if (next && previous) {
        if (previous.distance >= 8 && next.distance >= 8)
          this.renderer.zoomAt(
            next.distance / previous.distance,
            previous.x,
            previous.y,
          );
        this.renderer.panBy(next.x - previous.x, next.y - previous.y);
      }
      this.previous = next;
      return;
    }
    if (
      this.pending &&
      Math.hypot(
        event.clientX - this.pending.clientX,
        event.clientY - this.pending.clientY,
      ) >= 4
    )
      this.beginDrawing();
    if (this.active === event.pointerId) this.drawing.move(event);
  }
  end(event) {
    if (!this.touches.has(event.pointerId)) return;
    if (!this.navigating && !this.blocked) {
      if (event.type === "pointerup") this.beginDrawing();
      else this.clearPending();
      if (this.active === event.pointerId) this.drawing.up(event);
    }
    this.touches.delete(event.pointerId);
    this.active = null;
    this.previous = this.sample();
    if (!this.touches.size) {
      this.clearPending();
      this.navigating = this.blocked = false;
    }
  }
  cancel() {
    this.clearPending();
    this.active = null;
    this.previous = null;
    // Drain existing fingers after a tool/dialog change; don't restart a stroke
    // merely because a pointer is still held on the canvas.
    this.blocked = this.touches.size > 0;
  }
}
