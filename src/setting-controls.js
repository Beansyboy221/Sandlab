export class SettingControls {
  constructor(settings, prefix = "setting") {
    this.settings = settings;
    this.prefix = prefix;
    this.controls = new Map();
  }
  createControl(field) {
    const label = document.createElement("label"),
      text = document.createElement("span");
    label.className = `setting-row setting-${field.type}`;
    text.textContent = field.label;
    const input = document.createElement(
      field.type === "select" ? "select" : "input",
    );
    input.id = `${this.prefix}-${field.key}`;
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
  syncControls() {
    for (const [key, { field, input, output, label }] of this.controls) {
      const value = this.settings.get(key);
      if (field.type === "toggle") input.checked = value;
      else input.value = value;
      input.disabled = !!field.depends && !this.settings.get(field.depends);
      label.classList.toggle("setting-disabled", input.disabled);
      if (output)
        output.value = `${field.displayScale ? Math.round(value * field.displayScale) : value}${field.suffix || ""}`;
    }
  }
}
