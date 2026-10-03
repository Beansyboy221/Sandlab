import {
  paletteMaterials,
  materialSearchText,
} from "./sim/material-families.js";
import { isEntity, entityCategory } from "./sim/entity-kinds.js";
import { materialIcon } from "./icons.js";
export class MaterialGroupsPanel {
  constructor(dialog, groups, { open, close, changed }) {
    this.dialog = dialog;
    this.groups = groups;
    this.openDialog = open;
    this.closeDialog = close;
    this.changed = changed;
    this.selector = dialog.querySelector("#group-select");
    this.name = dialog.querySelector("#group-name");
    this.search = dialog.querySelector("#group-search");
    this.grid = dialog.querySelector("#group-materials");
    this.status = dialog.querySelector("#group-status");
    this.remove = dialog.querySelector("#group-delete");
    this.members = new Set();
    this.selector.addEventListener("change", () =>
      this.load(this.selector.value),
    );
    this.search.addEventListener("input", () => this.render());
    dialog.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        const group = this.groups.save(
          this.selector.value || null,
          this.name.value,
          [...this.members],
        );
        this.changed(group.id);
        this.closeDialog(dialog);
      } catch (error) {
        this.status.textContent = error.message;
      }
    });
    this.remove.addEventListener("click", () => {
      try {
        this.groups.delete(this.selector.value);
        this.changed("all");
        this.open();
      } catch (error) {
        this.status.textContent = error.message;
      }
    });
  }
  open(
    id = "",
    entries = this.entries || paletteMaterials,
    kind = this.kind || "materials",
  ) {
    this.entries = entries;
    this.kind = kind;
    this.dialog.querySelector("#groups-heading").textContent =
      kind === "entities" ? "Entity groups" : "Material groups";
    this.search.placeholder =
      kind === "entities" ? "Find an entity…" : "Find a material…";
    this.selector.replaceChildren(new Option("New group", ""));
    for (const group of this.groups.groups)
      this.selector.append(new Option(group.name, group.id));
    this.load(id);
    if (!this.dialog.open) this.openDialog(this.dialog.id);
    this.name.focus();
  }
  load(id) {
    const group = this.groups.get(id);
    this.selector.value = group?.id || "";
    this.name.value = group?.name || "";
    this.members = new Set(group?.materials || []);
    this.search.value = "";
    this.status.textContent = "";
    this.remove.hidden = !group;
    this.render();
  }
  render() {
    const query = this.search.value.trim().toLowerCase();
    this.grid.replaceChildren();
    for (const material of this.entries || paletteMaterials) {
      if (query && !materialSearchText(material).includes(query)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "material";
      button.dataset.material = material.id;
      button.style.setProperty("--color", material.color);
      const swatch = document.createElement("span"),
        name = document.createElement("span");
      swatch.className = "swatch";
      swatch.innerHTML = materialIcon(
        isEntity(material)
          ? entityCategory(material)
          : material.paletteCategory,
      );
      name.className = "material-name";
      name.textContent = material.name;
      button.append(swatch, name);
      const sync = () => {
        button.classList.toggle("selected", this.members.has(material.id));
        button.setAttribute(
          "aria-pressed",
          String(this.members.has(material.id)),
        );
      };
      sync();
      button.addEventListener("click", () => {
        if (this.members.has(material.id)) this.members.delete(material.id);
        else this.members.add(material.id);
        sync();
        this.count();
      });
      this.grid.append(button);
    }
    this.count();
  }
  count() {
    this.dialog.querySelector("#group-count").textContent =
      `${this.members.size} selected`;
  }
}
