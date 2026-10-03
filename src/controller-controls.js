import { GamepadState } from "./gamepad-state.js";
export class ControllerControls {
  constructor(input, renderer, player, settings, actions) {
    Object.assign(this, { input, renderer, player, settings, actions });
    this.pad = new GamepadState();
    this.position = { x: 0.5, y: 0.5 };
    this.mode = "auto";
    this.cursor = document.createElement("div");
    this.cursor.className = "controller-cursor";
    this.cursor.hidden = true;
    this.cursor.setAttribute("aria-hidden", "true");
    this.hud = document.createElement("button");
    this.hud.className = "controller-hud";
    this.hud.type = "button";
    this.hud.hidden = true;
    this.hud.addEventListener("click", () => this.toggleMode());
    renderer.canvas.parentElement.append(this.cursor, this.hud);
    this.armed = false;
    this.focused = true;
    window.addEventListener("blur", () => {
      this.focused = false;
      this.reset();
    });
    window.addEventListener("focus", () => {
      this.focused = true;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    settings.subscribe((keys) => {
      if (keys.some((k) => k.startsWith("controller"))) this.reset();
    });
  }
  get playing() {
    return (
      this.mode !== "sandbox" &&
      !!this.player.world.stickmen.player &&
      this.player.enabled
    );
  }
  toggleMode() {
    this.reset();
    this.mode = this.playing ? "sandbox" : "auto";
  }
  point() {
    const box = this.renderer.canvas.getBoundingClientRect();
    return {
      x: box.left + this.position.x * box.width,
      y: box.top + this.position.y * box.height,
      box,
    };
  }
  stroke(type, erase = false) {
    const p = this.point();
    this.input.controllerPointer(type, p.x, p.y, erase);
  }
  reset() {
    if (this.drawing) this.stroke("pointercancel", this.erasing);
    this.drawing = false;
    this.armed = false;
    this.player.gamepadMove = 0;
    this.player.gamepadCrouch = false;
    this.upHeld = false;
    this.cursor.hidden = true;
  }
  menuScope() {
    const dialog = document.querySelector("dialog[open]");
    if (dialog) return dialog;
    const toolMenu = document.getElementById("tool-picker-menu");
    if (!toolMenu.hidden) return toolMenu;
    if (this.navigation === "palette") {
      const palette = document.getElementById("palette");
      if (
        palette.getBoundingClientRect().width &&
        this.actions.paletteVisible()
      )
        return palette;
      this.navigation = null;
    }
    return null;
  }
  navigate(scope, pressed) {
    const options = Array.from(
      scope.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),[role="option"]',
      ),
    ).filter((e) => !e.hidden && e.getClientRects().length);
    if (!options.length) return;
    let index = options.indexOf(document.activeElement);
    const delta =
      pressed[12] || pressed[14] ? -1 : pressed[13] || pressed[15] ? 1 : 0;
    if (delta) {
      const focused = options[index];
      if (
        focused?.matches("input[type=range],select") &&
        (pressed[14] || pressed[15])
      ) {
        if (focused.tagName === "SELECT")
          focused.selectedIndex = Math.max(
            0,
            Math.min(focused.options.length - 1, focused.selectedIndex + delta),
          );
        else
          focused.value = Math.max(
            +focused.min,
            Math.min(
              +focused.max,
              +focused.value + delta * (+focused.step || 1),
            ),
          );
        focused.dispatchEvent(new Event("input", { bubbles: true }));
        focused.dispatchEvent(new Event("change", { bubbles: true }));
      } else options[(index + delta + options.length) % options.length].focus();
    }
    if (pressed[0]) {
      const focus = options.includes(document.activeElement)
        ? document.activeElement
        : options[0];
      focus.focus();
      focus.click();
      if (scope.id === "palette" && focus.matches(".material"))
        this.navigation = null;
    }
    if (pressed[1]) {
      if (scope.matches("dialog"))
        scope.querySelector(".dialog-close")?.click();
      else if (scope.id === "tool-picker-menu") this.actions.closeTools();
      else {
        this.actions.togglePalette();
        this.navigation = null;
      }
    }
  }
  update(elapsed) {
    let pads;
    try {
      pads = navigator.getGamepads?.();
    } catch {}
    const device =
      pads &&
      Array.from(pads).find(
        (p) => p?.connected !== false && p?.mapping === "standard",
      );
    const first = this.pad.poll(
      this.settings.get("controller") && this.focused ? device : null,
      this.settings.get("controllerDeadzone"),
    );
    this.hud.hidden = !this.pad.connected;
    if (!this.pad.connected) {
      this.reset();
      return;
    }
    if (first) this.reset();
    const { held, pressed, axes } = this.pad;
    const scope = this.menuScope();
    const text = this.playing ? "Controller · Player" : "Controller · Sandbox";
    if (this.hud.textContent !== text) this.hud.textContent = text;
    this.hud.title =
      "Back/View switches player and sandbox control. Settings → Controller lists bindings.";
    if (scope) {
      this.reset();
      this.navigate(scope, pressed);
      return;
    }
    if (
      document.activeElement?.matches("input,textarea,select,[contenteditable]")
    ) {
      this.reset();
      return;
    }
    if (pressed[8]) this.toggleMode();
    if ((pressed[4] && held[5]) || (pressed[5] && held[4])) {
      this.reset();
      this.actions.settings();
      return;
    }
    if (pressed[9]) {
      this.reset();
      this.actions.pause();
    }
    if (pressed[2]) {
      this.reset();
      this.actions.togglePalette();
      if (this.actions.paletteVisible()) this.navigation = "palette";
      return;
    }
    if (pressed[3]) {
      this.reset();
      this.actions.openTools();
      return;
    }
    if (this.playing) {
      if (this.drawing) this.reset();
      this.player.gamepadMove = axes[0] || Number(held[15]) - Number(held[14]);
      this.player.gamepadCrouch = axes[1] > 0.55 || !!held[13];
      if (pressed[0] || pressed[12] || (axes[1] < -0.65 && !this.upHeld))
        this.player.jump = true;
      this.upHeld = axes[1] < -0.65;
      this.cursor.hidden = true;
      return;
    }
    this.player.gamepadMove = 0;
    this.player.gamepadCrouch = false;
    this.upHeld = false;
    if (
      Array.from(this.input.pointers.keys()).some(
        (id) => id !== this.input.controllerId,
      )
    ) {
      this.reset();
      return;
    }
    const p = this.point();
    const speed =
      this.settings.get("controllerCursorSpeed") *
      Math.min(p.box.width, p.box.height) *
      0.8;
    const dt = Math.min(50, elapsed) / 1000;
    this.position.x = Math.max(
      0,
      Math.min(
        1,
        this.position.x + (axes[0] * speed * dt) / Math.max(1, p.box.width),
      ),
    );
    this.position.y = Math.max(
      0,
      Math.min(
        1,
        this.position.y + (axes[1] * speed * dt) / Math.max(1, p.box.height),
      ),
    );
    if (axes[2] || axes[3])
      this.renderer.panBy(-axes[2] * 360 * dt, -axes[3] * 360 * dt);
    if (pressed[10] || pressed[11]) {
      const center = this.point();
      this.renderer.zoomAt(pressed[11] ? 1.2 : 1 / 1.2, center.x, center.y);
    }
    if (pressed[12] || pressed[13])
      this.input.state.setRadius(
        this.input.state.radius + (pressed[12] ? 0.5 : -0.5),
      );
    if (pressed[4] || pressed[5] || pressed[14] || pressed[15]) {
      this.reset();
      this.actions.cycleMaterial(pressed[4] || pressed[14] ? -1 : 1);
    }
    const erasing = !!(held[6] || held[1]),
      active = erasing || held[7] || held[0];
    if (!active) this.armed = true;
    if (
      this.drawing &&
      active &&
      !this.input.pointers.has(this.input.controllerId)
    )
      this.armed = false;
    if (
      this.drawing &&
      (!active ||
        this.erasing !== erasing ||
        !this.input.pointers.has(this.input.controllerId))
    ) {
      this.stroke("pointerup", this.erasing);
      this.drawing = false;
    }
    if (active && this.armed) {
      this.erasing = erasing;
      this.stroke(this.drawing ? "pointermove" : "pointerdown", erasing);
      this.drawing = true;
    } else if (!active) {
      const center = this.point();
      this.input.hover(this.renderer.point(center.x, center.y));
    }
    const center = this.point(),
      parent = this.renderer.canvas.parentElement.getBoundingClientRect();
    this.cursor.hidden = false;
    this.cursor.style.left = `${center.x - parent.left}px`;
    this.cursor.style.top = `${center.y - parent.top}px`;
  }
}
