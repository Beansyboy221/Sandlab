import { SettingControls } from "./setting-controls.js";
import { worldSettingGroups } from "./settings.js";
import { defaultMechanics } from "./sim/mechanics-options.js";

export class WorldRulesPanel extends SettingControls {
  constructor(container) {
    const draft = {
      values: {},
      get(key) {
        return this.values[key];
      },
      set(key, value) {
        this.values[key] = value;
      },
    };
    super(draft, "world-setting");
    for (const group of worldSettingGroups) {
      const section = document.createElement("details"),
        heading = document.createElement("summary"),
        fields = document.createElement("div");
      section.className = "world-setting-group";
      section.open = group.id === "simulation";
      heading.textContent =
        group.id === "performance" ? "Fragmentation" : group.name;
      fields.className = "world-rule-fields";
      for (const field of group.fields)
        fields.append(this.createControl(field));
      fields.addEventListener("input", (event) => {
        if (event.target.type === "range") this.syncControls();
      });
      fields.addEventListener("change", () => this.syncControls());
      section.append(heading, fields);
      container.append(section);
    }
  }
  load(world) {
    this.settings.values = {
      ...world.mechanics,
      simulationSpeed: world.simulationSpeed,
    };
    this.syncControls();
  }
  values() {
    return {
      simulationSpeed: this.settings.get("simulationSpeed"),
      mechanics: Object.fromEntries(
        Object.keys(defaultMechanics).map((key) => [
          key,
          this.settings.get(key),
        ]),
      ),
    };
  }
}
