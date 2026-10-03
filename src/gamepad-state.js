export function stickAxis(value, deadzone = 0.18) {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.min(1, Math.abs(value));
  return magnitude <= deadzone
    ? 0
    : (Math.sign(value) * (magnitude - deadzone)) / (1 - deadzone);
}
// Reusable buffers keep polling cheap; edge presses prevent held menu/pause
// buttons from firing every display frame. Unsupported mappings are ignored.
export class GamepadState {
  constructor() {
    this.axes = new Float32Array(4);
    this.held = new Uint8Array(17);
    this.pressed = new Uint8Array(17);
    this.index = null;
  }
  poll(pad, deadzone = 0.18) {
    const valid = pad && pad.connected !== false && pad.mapping === "standard";
    const first = valid && this.index !== pad.index;
    this.connected = !!valid;
    this.index = valid ? pad.index : null;
    for (let n = 0; n < 4; n++)
      this.axes[n] = valid ? stickAxis(pad.axes?.[n] || 0, deadzone) : 0;
    for (let n = 0; n < 17; n++) {
      const b = valid && pad.buttons?.[n];
      const held = Number(!!b && (b.pressed || b.value > 0.35));
      this.pressed[n] = Number(!first && held && !this.held[n]);
      this.held[n] = held;
    }
    return first;
  }
}
