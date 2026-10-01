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
    const note = document.createElement("p");
    note.className = "settings-note";
    note.textContent =
      "Choose a binding, then press the new keys. Escape cancels. Use × to remove a binding. On phones, connect a keyboard to rebind keys.";
    this.status = document.createElement("p");
    this.status.className = "binding-status";
    this.status.setAttribute("role", "status");
    panel.append(note, this.status);
    for (const action of shortcutDefinitions) {
      const row = document.createElement("div"),
        label = document.createElement("span"),
        keys = document.createElement("div");
      row.className = "binding-row";
      label.textContent = action.label;
      keys.className = "binding-keys";
      for (let slot = 0; slot < 2; slot++) {
        const pair = document.createElement("div"),
          button = document.createElement("button"),
          clear = document.createElement("button");
        pair.className = "binding-pair";
        button.id = `binding-${action.id}-${slot}`;
        button.className = "binding-button";
        clear.className = "binding-clear";
        clear.textContent = "×";
        clear.setAttribute(
          "aria-label",
          `Remove ${action.label} binding ${slot + 1}`,
        );
        const control = { action, slot, button, clear };
        button.addEventListener("click", () => {
          this.pending = control;
          this.status.textContent = `Press new keys for ${action.label}.`;
          this.sync();
        });
        button.addEventListener("keydown", (e) => this.capture(e, control));
        button.addEventListener("blur", () => {
          if (this.pending === control) this.cancel();
        });
        clear.addEventListener("click", () => {
          const bindings = [
            ...bindingsFor(action.id, settings.get("shortcuts")),
          ];
          bindings.splice(slot, 1);
          this.save(action.id, bindings);
          this.status.textContent = `${action.label} binding removed.`;
        });
        pair.append(button, clear);
        keys.append(pair);
        this.controls.push(control);
      }
      row.append(label, keys);
      panel.append(row);
    }
    const reset = document.createElement("button");
    reset.id = "reset-shortcuts";
    reset.className = "quiet-button";
    reset.textContent = "Reset keyboard shortcuts";
    reset.addEventListener("click", () => {
      this.pending = null;
      settings.set("shortcuts", {});
      this.status.textContent = "Default shortcuts restored.";
      this.sync();
    });
    panel.append(reset);
    dialog.addEventListener("close", () => this.cancel());
    settings.subscribe(() => this.sync());
    this.sync();
  }
  cancel() {
    this.pending = null;
    this.status.textContent = "";
    this.sync();
  }
  capture(e, control) {
    if (this.pending !== control) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.key === "Escape") return this.cancel();
    const chord = chordFromEvent(e);
    if (!chord) return;
    const { action, slot } = control,
      overrides = this.settings.get("shortcuts"),
      conflict = bindingConflict(chord, action.id, overrides);
    if (conflict) {
      this.status.textContent = `Already assigned to ${conflict.label}. Choose another key or remove that binding first.`;
      return;
    }
    const bindings = [...bindingsFor(action.id, overrides)];
    if (bindings.some((key, index) => index !== slot && key === chord)) {
      this.status.textContent = "This action already uses those keys.";
      return;
    }
    bindings[slot] = chord;
    // Allow the second button to fill an action that currently has no keys.
    this.save(action.id, bindings.filter(Boolean));
    this.status.textContent = `${action.label}: ${formatChord(chord)}.`;
  }
  save(id, bindings) {
    this.pending = null;
    this.settings.set("shortcuts", {
      ...this.settings.get("shortcuts"),
      [id]: bindings,
    });
    this.sync();
  }
  sync() {
    for (const control of this.controls) {
      const { action, slot, button, clear } = control,
        chord = bindingsFor(action.id, this.settings.get("shortcuts"))[slot],
        capturing = this.pending === control;
      button.textContent = capturing
        ? "Press keys…"
        : chord
          ? formatChord(chord)
          : "Add keys";
      button.setAttribute(
        "aria-label",
        `${action.label} binding ${slot + 1}: ${button.textContent}`,
      );
      button.classList.toggle("capturing", capturing);
      clear.disabled = !chord;
    }
  }
}
