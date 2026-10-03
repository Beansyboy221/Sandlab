import { shortcutAction, bindingsFor, formatChord } from "./shortcuts.js";

export class PlayerControls {
  constructor(container, world, state, settings) {
    this.settings = settings;
    this.container = container;
    this.world = world;
    this.state = state;
    this.keys = new Set();
    this.heldKeys = new Map();
    this.enabled = true;
    this.touchMove = 0;
    this.gamepadMove = 0;
    this.gamepadCrouch = false;
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
    this.joystick = joystick;
    let active = null;
    const move = (e) => {
      if (active !== e.pointerId) return;
      const b = joystick.getBoundingClientRect(),
        x = Math.max(
          -1,
          Math.min(1, (e.clientX - b.x - b.width / 2) / (b.width * 0.32)),
        ),
        y = Math.max(
          -1,
          Math.min(1, (e.clientY - b.y - b.height / 2) / (b.height * 0.32)),
        );
      this.touchMove = Math.abs(x) < 0.15 ? 0 : x;
      this.touchCrouch = y > 0.55;
      if (y < -0.65 && !this.upHeld) this.jump = true;
      this.upHeld = y < -0.65;
      nub.style.transform = `translate(${x * b.width * 0.27}px,${y * b.height * 0.27}px)`;
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
    this.cancelJoystick = () => {
      const id = active;
      active = null;
      this.touchMove = 0;
      this.touchCrouch = this.upHeld = false;
      this.world.stickmen.controls.move = 0;
      this.world.stickmen.controls.crouch = false;
      nub.style.transform = "";
      if (id !== null && joystick.hasPointerCapture(id))
        joystick.releasePointerCapture(id);
    };
    const end = (e) => {
      if (e.pointerId === active) this.cancelJoystick();
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      joystick.addEventListener(type, end);
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          !this.world.stickmen.player ||
          !this.enabled ||
          document.querySelector("dialog[open]") ||
          (e.target.closest("button") &&
            [" ", "Enter"].includes(e.key) &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            !e.shiftKey) ||
          e.target.closest("input,textarea,select,[contenteditable]")
        )
          return;
        const action = shortcutAction(e, this.settings?.get("shortcuts"));
        if (
          !["playerLeft", "playerRight", "playerJump", "playerCrouch"].includes(
            action,
          )
        )
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat || this.heldKeys.has(e.code)) return;
        if (action === "playerJump") this.jump = true;
        this.heldKeys.set(e.code, action);
        this.keys.add(action);
      },
      true,
    );
    window.addEventListener("keyup", (e) => {
      const action = this.heldKeys.get(e.code);
      if (!action) return;
      this.heldKeys.delete(e.code);
      if (![...this.heldKeys.values()].includes(action))
        this.keys.delete(action);
    });
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    this.layoutObserver = new ResizeObserver(() => this.layout());
    this.layoutObserver.observe(container);
    this.dock = document.querySelector(".toolbox");
    if (this.dock) this.layoutObserver.observe(this.dock);
    settings?.subscribe((keys) => {
      if (
        keys.includes("shortcuts") ||
        keys.some((key) => key.startsWith("joystick"))
      ) {
        this.reset();
        this.layout();
      }
    });
    this.layout();
    this.sync();
  }
  layout() {
    if (!this.joystick) return;
    const size = this.settings?.get("joystickSize") ?? 82,
      side = this.settings?.get("joystickSide") ?? "left",
      inset = this.settings?.get("joystickInset") ?? 18,
      raise = this.settings?.get("joystickRaise") ?? 0;
    this.panel.dataset.joystickSide = side;
    const box = this.container.getBoundingClientRect(),
      dock = this.dock?.getBoundingClientRect();
    let bottom = 12,
      edge = inset,
      freeWidth = box.width,
      freeHeight = box.height;
    if (
      dock?.width &&
      dock.height &&
      dock.bottom > box.top &&
      dock.top < box.bottom
    ) {
      if (document.body.classList.contains("dock-side")) {
        freeWidth = Math.max(0, dock.left - box.left);
        if (side === "right") edge = Math.max(edge, box.right - dock.left + 8);
      } else {
        freeHeight = Math.max(0, dock.top - box.top);
        bottom = Math.max(bottom, box.bottom - dock.top + 10);
      }
    }
    // An expanded landscape dock can leave less than one touch target of canvas.
    // Hide the joystick until it closes rather than intercepting its buttons.
    const hidden = freeWidth < size + 24 || freeHeight < size + 80;
    if (hidden && !this.joystick.hidden) this.reset();
    this.joystick.hidden = hidden;
    this.panel.style.setProperty("--joystick-size", `${size}px`);
    this.panel.style.setProperty(
      "--joystick-inset",
      `${Math.max(0, Math.min(edge, box.width - size - 12))}px`,
    );
    this.panel.style.setProperty(
      "--joystick-bottom",
      `${Math.max(12, Math.min(bottom + raise, box.height - size - 68))}px`,
    );
  }
  reset() {
    this.cancelJoystick?.();
    this.keys.clear();
    this.heldKeys.clear();
    this.gamepadMove = 0;
    this.gamepadCrouch = false;
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
    const bindings = this.settings?.get("shortcuts");
    if (this.hintBindings !== bindings || !this.toggle.title) {
      this.hintBindings = bindings;
      const hints = [
        "playerLeft",
        "playerRight",
        "playerJump",
        "playerCrouch",
      ].flatMap((id) => bindingsFor(id, bindings).map(formatChord));
      this.toggle.title = hints.length
        ? `Player keys: ${hints.join(", ")}`
        : "Add player keyboard bindings in Settings → Keyboard.";
    }
  }
  update() {
    this.sync();
    const control = this.world.stickmen.controls;
    control.move = this.enabled
      ? this.touchMove ||
        this.gamepadMove ||
        Number(this.keys.has("playerRight")) -
          Number(this.keys.has("playerLeft"))
      : 0;
    control.crouch =
      this.enabled &&
      (this.touchCrouch || this.gamepadCrouch || this.keys.has("playerCrouch"));
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
