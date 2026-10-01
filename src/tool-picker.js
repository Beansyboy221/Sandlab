import { icon } from "./icons.js";

export class ToolPicker {
  constructor(select, tools) {
    this.select = select;
    this.tools = tools;
    this.button = document.createElement("button");
    this.button.id = "tool-picker-toggle";
    this.button.className = "brush-tool tool-picker-toggle";
    this.button.type = "button";
    this.button.setAttribute("aria-haspopup", "listbox");
    this.button.setAttribute("aria-controls", "tool-picker-menu");
    this.button.setAttribute("aria-expanded", "false");
    this.menu = document.createElement("div");
    this.menu.id = "tool-picker-menu";
    this.menu.className = "tool-picker-menu";
    this.menu.setAttribute("role", "listbox");
    this.menu.setAttribute("aria-label", "Drawing tools");
    this.menu.hidden = true;
    this.options = tools.map(([value, name, symbol]) => {
      const option = document.createElement("button");
      option.type = "button";
      option.tabIndex = -1;
      option.dataset.toolOption = value;
      option.setAttribute("role", "option");
      option.innerHTML = icon(symbol);
      const label = document.createElement("span");
      label.textContent = name;
      option.append(label);
      option.addEventListener("click", () => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        this.close();
      });
      this.menu.append(option);
      return option;
    });
    select.after(this.button);
    document.body.append(this.menu);
    select.hidden = true;
    select.setAttribute("aria-hidden", "true");
    this.button.addEventListener("click", () =>
      this.menu.hidden ? this.open() : this.close(),
    );
    this.button.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        this.open();
      } else if (!this.menu.hidden) this.key(e);
    });
    this.menu.addEventListener("keydown", (e) => this.key(e));
    document.addEventListener("pointerdown", (e) => {
      if (
        !this.menu.hidden &&
        !this.menu.contains(e.target) &&
        !this.button.contains(e.target)
      )
        this.close(false);
    });
    window.addEventListener("resize", () => this.close(false));
    select.addEventListener("change", () => this.sync(select.value));
    this.sync(select.value || tools[0][0]);
  }
  sync(value) {
    const tool = this.tools.find((tool) => tool[0] === value) || this.tools[0];
    this.button.innerHTML = icon(tool[2]);
    const label = document.createElement("span");
    label.textContent = tool[1];
    this.button.append(label);
    const arrow = document.createElement("span");
    arrow.className = "tool-picker-arrow";
    arrow.innerHTML = icon("chevron");
    this.button.append(arrow);
    this.button.setAttribute("aria-label", `Tool: ${tool[1]}`);
    for (const option of this.options)
      option.setAttribute(
        "aria-selected",
        String(option.dataset.toolOption === tool[0]),
      );
  }
  open() {
    this.menu.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    const rect = this.button.getBoundingClientRect(),
      box = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, rect.left))}px`;
    const above = rect.top - box.height - 8,
      below = rect.bottom + 8;
    this.menu.style.top = `${Math.max(8, Math.min(innerHeight - box.height - 8, above >= 8 ? above : below))}px`;
    this.options
      .find((option) => option.getAttribute("aria-selected") === "true")
      .focus({ preventScroll: true });
  }
  close(focus = true) {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    if (focus) this.button.focus({ preventScroll: true });
  }
  key(event) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === "Tab") {
      this.close();
      return;
    }
    let index = this.options.indexOf(document.activeElement);
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[
      event.key
    ];
    if (offset !== undefined || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? this.options.length - 1
            : (index + offset + this.options.length) % this.options.length;
      this.options[index].focus();
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key !== " "
    ) {
      const key = event.key.toLowerCase();
      for (let n = 1; n <= this.tools.length; n++) {
        const target = (index + n + this.tools.length) % this.tools.length;
        if (this.tools[target][1].toLowerCase().startsWith(key)) {
          event.preventDefault();
          this.options[target].focus();
          break;
        }
      }
    }
  }
}
