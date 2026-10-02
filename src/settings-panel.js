import { settingGroups } from "./settings.js";
import { ShortcutPanel } from "./shortcut-panel.js";
export class SettingsPanel {
  constructor(dialog, settings) {
    this.dialog = dialog;
    this.settings = settings;
    this.controls = new Map();
    this.tabs = [];
    this.panels = [];
    const nav = dialog.querySelector(".settings-tabs"),
      body = dialog.querySelector(".settings-panels");
    for (const group of settingGroups) {
      const tab = document.createElement("button"),
        panel = document.createElement("section");
      tab.id = `settings-tab-${group.id}`;
      tab.textContent = group.name;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", `settings-panel-${group.id}`);
      panel.id = `settings-panel-${group.id}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      const heading = document.createElement("h3");
      heading.textContent = group.name;
      panel.append(heading);
      for (const field of group.fields) {
        if (field.type === "bindings")
          new ShortcutPanel(panel, settings, dialog);
        else panel.append(this.createControl(field));
      }
      if (group.id === "performance") {
        const note = document.createElement("p");
        note.className = "settings-note";
        note.textContent =
          "Reduced quality lowers display resolution without changing the simulation.";
        panel.append(note);
      }
      const mechanicNotes = {
        wildlife:
          "Cats and Wolves hunt on land; Sharks hunt Fish in water. Prey flee visible threats. Turning this off keeps creatures moving without hunting.",
        devices:
          "Missiles launch along your stroke and seek hot exposed material. With heat seeking off, they fly straight. Obstacles still stop them.",
        player:
          "Push up to jump and down to crouch. Position follows screen orientation. The joystick hides when expanded controls leave too little canvas; close them to play.",
      };
      if (mechanicNotes[group.id]) {
        const note = document.createElement("p");
        note.className = "settings-note";
        note.textContent = mechanicNotes[group.id];
        panel.append(note);
      }
      if (group.id === "audio") {
        const note = document.createElement("p");
        note.className = "settings-note";
        note.textContent =
          "Sound starts after your first tap or keypress. Stereo follows the screen, or your player while controlling one. Echolocation also works with sound muted.";
        panel.append(note);
      }
      if (group.id === "brush") {
        const note = document.createElement("p");
        note.className = "settings-note";
        note.textContent =
          "Draw pauses the simulation while you shape a solid. Choose Stay paused to build more before pressing Play. Worlds already paused stay paused.";
        panel.append(note);
      }
      if (group.id === "storage") {
        const note = document.createElement("p");
        note.className = "settings-note";
        note.textContent =
          "Autosave runs while playing and when you leave. Named saves and exports are always available.";
        panel.append(note);
      }
      tab.addEventListener("click", () => this.select(group.id));
      nav.append(tab);
      body.append(panel);
      this.tabs.push(tab);
      this.panels.push(panel);
    }
    nav.addEventListener("keydown", (e) => {
      const current = this.tabs.indexOf(document.activeElement);
      if (current < 0) return;
      let next;
      if (["ArrowRight", "ArrowDown"].includes(e.key))
        next = (current + 1) % this.tabs.length;
      else if (["ArrowLeft", "ArrowUp"].includes(e.key))
        next = (current + this.tabs.length - 1) % this.tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = this.tabs.length - 1;
      if (next === undefined) return;
      e.preventDefault();
      this.tabs[next].click();
      this.tabs[next].focus();
      this.tabs[next].scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    dialog
      .querySelector("#reset-settings")
      .addEventListener("click", () => settings.reset());
    settings.subscribe(() => this.sync());
    this.select("rendering");
    this.sync();
  }
  createControl(field) {
    const label = document.createElement("label"),
      text = document.createElement("span");
    label.className = `setting-row setting-${field.type}`;
    text.textContent = field.label;
    const input = document.createElement(
      field.type === "select" ? "select" : "input",
    );
    input.id = `setting-${field.key}`;
    label.htmlFor = input.id;
    if (field.type === "select")
      for (const [value, name] of field.options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = name;
        input.append(option);
      }
    else if (field.type === "toggle") input.type = "checkbox";
    else {
      input.type = "range";
      input.min = field.min;
      input.max = field.max;
      input.step = field.step;
    }
    const output =
      field.type === "range" ? document.createElement("output") : null;
    if (output) {
      const control = document.createElement("span");
      control.className = "setting-range-control";
      output.htmlFor = input.id;
      control.append(input, output);
      label.append(text, control);
    } else label.append(text, input);
    input.addEventListener(field.type === "range" ? "input" : "change", () => {
      const value =
        field.type === "toggle"
          ? input.checked
          : typeof field.default === "number"
            ? Number(input.value)
            : input.value;
      this.settings.set(field.key, value);
    });
    this.controls.set(field.key, { field, input, output, label });
    return label;
  }
  select(id) {
    this.tabs.forEach((tab, index) => {
      const active = settingGroups[index].id === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      this.panels[index].hidden = !active;
    });
  }
  sync() {
    for (const [key, { field, input, output, label }] of this.controls) {
      const value = this.settings.get(key);
      if (field.type === "toggle") input.checked = value;
      else input.value = value;
      input.disabled = !!field.depends && !this.settings.get(field.depends);
      label.classList.toggle("setting-disabled", input.disabled);
      if (output)
        output.value = `${field.displayScale ? Math.round(value * field.displayScale) : value}${field.suffix || ""}`;
    }
    this.dialog.querySelector("#settings-storage-status").textContent = this
      .settings.saved
      ? "Preferences saved on this browser."
      : "Preferences apply now. Browser storage is unavailable.";
  }
}
