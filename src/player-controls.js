export class PlayerControls {
  constructor(container, world, state) {
    this.world = world;
    this.state = state;
    this.keys = new Set();
    this.enabled = true;
    this.touchMove = 0;
    this.touchCrouch = false;
    this.jump = false;
    this.panel = document.createElement("div");
    this.panel.className = "player-controls";
    this.panel.hidden = true;
    this.panel.innerHTML = `<div class="player-hud"><span id="player-status"></span><button id="player-control-toggle" type="button">Release controls</button></div><div class="player-touch"><div class="player-joystick" role="group" aria-label="Player joystick: left and right to move, up to jump, down to crouch"><span></span></div></div>`;
    container.append(this.panel);
    this.status = this.panel.querySelector("#player-status");
    this.toggle = this.panel.querySelector("#player-control-toggle");
    this.toggle.addEventListener("click", () => {
      this.enabled = !this.enabled;
      this.reset();
      this.sync();
    });
    const joystick = this.panel.querySelector(".player-joystick"),
      nub = joystick.querySelector("span");
    let active = null;
    const move = (e) => {
      if (active !== e.pointerId) return;
      const b = joystick.getBoundingClientRect(),
        x = Math.max(-1, Math.min(1, (e.clientX - b.x - b.width / 2) / 26)),
        y = Math.max(-1, Math.min(1, (e.clientY - b.y - b.height / 2) / 26));
      this.touchMove = Math.abs(x) < 0.15 ? 0 : x;
      this.touchCrouch = y > 0.55;
      if (y < -0.65 && !this.upHeld) this.jump = true;
      this.upHeld = y < -0.65;
      nub.style.transform = `translate(${x * 22}px,${y * 22}px)`;
    };
    joystick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active !== null) return;
      active = e.pointerId;
      joystick.setPointerCapture(active);
      move(e);
    });
    joystick.addEventListener("pointermove", move);
    const end = (e) => {
      if (e.pointerId !== active) return;
      active = null;
      this.touchMove = 0;
      this.touchCrouch = this.upHeld = false;
      this.world.stickmen.controls.move = 0;
      this.world.stickmen.controls.crouch = false;
      nub.style.transform = "";
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      joystick.addEventListener(type, end);
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          !this.world.stickmen.player ||
          !this.enabled ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          document.querySelector("dialog[open]") ||
          e.target.closest("input,textarea,select,[contenteditable]")
        )
          return;
        if (!["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(e.code)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat && ["KeyW", "Space"].includes(e.code)) this.jump = true;
        this.keys.add(e.code);
      },
      true,
    );
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    this.sync();
  }
  reset() {
    this.keys.clear();
    this.touchMove = 0;
    this.touchCrouch = this.upHeld = this.jump = false;
    this.world.stickmen.controls.move = 0;
    this.world.stickmen.controls.jump = false;
    this.world.stickmen.controls.crouch = false;
  }
  sync() {
    const a = this.world.stickmen.player;
    if (!a && !this.previousPlayer) return;
    if (this.previousPlayer !== a) {
      this.reset();
      this.previousPlayer = a;
      if (a) this.enabled = true;
    }
    this.panel.hidden = !a;
    this.panel.classList.toggle("released", !this.enabled);
    const status = a
      ? `Player · ${Math.round(a.health)}%${this.state.paused ? " · Paused" : ""}`
      : "";
    if (this.status.textContent !== status) this.status.textContent = status;
    this.toggle.textContent = this.enabled
      ? "Release controls"
      : "Take control";
    this.toggle.setAttribute("aria-pressed", String(this.enabled));
    this.toggle.title =
      "WASD to move/crouch, Space or W to jump. P pauses the simulation.";
  }
  update() {
    this.sync();
    const control = this.world.stickmen.controls;
    control.move = this.enabled
      ? this.touchMove ||
        Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"))
      : 0;
    control.crouch =
      this.enabled && (this.touchCrouch || this.keys.has("KeyS"));
    if (
      this.enabled &&
      this.jump &&
      !this.state.paused &&
      this.world.stickmen.player
    )
      control.jump = true;
    this.jump = false;
  }
}
