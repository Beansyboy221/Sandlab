import { icon } from "./icons.js";
import {
  shortcutDefinitions,
  bindingsFor,
  chordFromEvent,
  bindingConflict,
  formatChord,
} from "./shortcuts.js";

export class ShortcutPanel {
  constructor(panel, settings, dialog) {
    this.settings = settings;
    this.controls = [];
    this.pending = null;
    const heading = panel.querySelector("h3");
    const header = document.createElement("div");
    header.className = "bindings-heading";
    const add = document.createElement("button");
    add.id = "add-keyboard-binding";
    add.className = "icon-button";
    add.type = "button";
    add.innerHTML = icon("plus");
    add.setAttribute("aria-label", "Add keyboard binding");
    add.title = "Add keyboard binding";
    heading.replaceWith(header);
    header.append(heading, add);
    this.status = document.createElement("p");
    this.status.className = "binding-status";
    this.status.setAttribute("role", "status");
    this.createAdder(panel);
    this.list = document.createElement("div");
    this.list.className = "binding-list";
    panel.append(this.status, this.list);
    add.addEventListener("click", () => this.openAdder());
    const reset = document.createElement("button");
    reset.id = "reset-shortcuts";
    reset.className = "quiet-button";
    reset.textContent = "Reset keyboard shortcuts";
    reset.addEventListener("click", () => {
      this.cancel();
      settings.set("shortcuts", {});
      this.status.textContent = "Default shortcuts restored.";
    });
    panel.append(reset);
    dialog.addEventListener("close", () => this.cancel());
    settings.subscribe((keys) => {
      if (keys.includes("shortcuts")) {
        this.cancel();
        this.render();
      }
    });
    this.render();
  }
  createAdder(panel) {
    this.adder = document.createElement("div");
    this.adder.className = "binding-adder";
    this.adder.hidden = true;
    const label = document.createElement("label");
    label.textContent = "Action";
    this.actions = document.createElement("select");
    this.actions.id = "binding-action";
    this.actions.setAttribute("aria-label", "New binding action");
    label.append(this.actions);
    this.newKey = document.createElement("button");
    this.newKey.id = "new-binding-key";
    this.newKey.className = "binding-button";
    this.newKey.textContent = "Set key";
    this.newKey.addEventListener("click", () => {
      const action = shortcutDefinitions.find(
        (a) => a.id === this.actions.value,
      );
      const control = { action, slot: -1, button: this.newKey };
      this.begin(control);
    });
    this.newKey.addEventListener("keydown", (e) => {
      if (this.pending?.button === this.newKey) this.capture(e, this.pending);
    });
    this.newKey.addEventListener("blur", () => {
      if (this.pending?.button === this.newKey) this.cancel(false);
    });
    this.actions.addEventListener("change", () => this.cancel(false));
    const cancel = document.createElement("button");
    cancel.className = "icon-button";
    cancel.innerHTML = icon("close");
    cancel.setAttribute("aria-label", "Cancel adding binding");
    cancel.addEventListener("click", () => this.cancel());
    this.adder.append(label, this.newKey, cancel);
    panel.append(this.adder);
  }
  openAdder() {
    this.cancel(false);
    const overrides = this.settings.get("shortcuts");
    this.actions.replaceChildren();
    for (const action of shortcutDefinitions)
      if (bindingsFor(action.id, overrides).length < 2)
        this.actions.append(new Option(action.label, action.id));
    const unbound = shortcutDefinitions.find(
      (a) => !bindingsFor(a.id, overrides).length,
    );
    if (unbound) this.actions.value = unbound.id;
    this.adder.hidden = false;
    this.actions.focus();
  }
  cancel(closeAdder = true) {
    this.pending = null;
    this.status.textContent = "";
    if (closeAdder) this.adder.hidden = true;
    this.syncCapture();
  }
  begin(control) {
    this.pending = control;
    this.status.textContent = `Press keys for ${control.action.label}.`;
    this.syncCapture();
  }
  capture(e, control) {
    if (this.pending !== control) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.key === "Escape" && control.action.id !== "escape")
      return this.cancel();
    const chord = chordFromEvent(e);
    if (!chord) return;
    const { action, slot } = control,
      overrides = this.settings.get("shortcuts");
    const conflict = bindingConflict(chord, action.id, overrides);
    if (conflict) {
      this.status.textContent = `Already assigned to ${conflict.label}. Remove or change that binding first.`;
      return;
    }
    const bindings = [...bindingsFor(action.id, overrides)];
    if (bindings.some((key, index) => index !== slot && key === chord)) {
      this.status.textContent = "This action already uses those keys.";
      return;
    }
    if (slot < 0) bindings.push(chord);
    else bindings[slot] = chord;
    this.save(action.id, bindings);
    this.status.textContent = `${action.label}: ${formatChord(chord)}.`;
    document
      .getElementById(
        `binding-${action.id}-${slot < 0 ? bindings.length - 1 : slot}`,
      )
      ?.focus();
  }
  save(id, bindings) {
    this.cancel();
    this.settings.set("shortcuts", {
      ...this.settings.get("shortcuts"),
      [id]: bindings,
    });
  }
  syncCapture() {
    for (const control of this.controls) {
      const capturing = this.pending === control;
      control.button.textContent = capturing
        ? "Press keys…"
        : formatChord(control.chord);
      control.button.classList.toggle("capturing", capturing);
    }
    const adding = this.pending?.button === this.newKey;
    this.newKey.textContent = adding ? "Press keys…" : "Set key";
    this.newKey.classList.toggle("capturing", adding);
  }
  render() {
    this.list.replaceChildren();
    this.controls = [];
    for (const action of shortcutDefinitions) {
      const bindings = bindingsFor(action.id, this.settings.get("shortcuts"));
      for (let slot = 0; slot < bindings.length; slot++) {
        const row = document.createElement("div"),
          label = document.createElement("span");
        row.className = "binding-row";
        label.textContent = action.label;
        const pair = document.createElement("div");
        pair.className = "binding-pair";
        const button = document.createElement("button"),
          clear = document.createElement("button");
        button.id = `binding-${action.id}-${slot}`;
        button.className = "binding-button";
        button.setAttribute(
          "aria-label",
          `Change ${action.label} binding ${slot + 1}`,
        );
        clear.className = "binding-clear";
        clear.innerHTML = icon("trash");
        clear.setAttribute(
          "aria-label",
          `Remove ${action.label} binding ${slot + 1}`,
        );
        const control = { action, slot, button, clear, chord: bindings[slot] };
        button.addEventListener("click", () => this.begin(control));
        button.addEventListener("keydown", (e) => this.capture(e, control));
        button.addEventListener("blur", () => {
          if (this.pending === control) this.cancel(false);
        });
        clear.addEventListener("click", () => {
          const remaining = [
            ...bindingsFor(action.id, this.settings.get("shortcuts")),
          ];
          remaining.splice(slot, 1);
          this.save(action.id, remaining);
          this.status.textContent = `${action.label} binding removed.`;
          document.getElementById("add-keyboard-binding").focus();
        });
        this.controls.push(control);
        pair.append(button, clear);
        row.append(label, pair);
        this.list.append(row);
      }
    }
    this.syncCapture();
  }
}
