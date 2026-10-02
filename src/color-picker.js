import { hsvToRgb, rgbToHsv, rgbToHex, parseHex } from "./color.js";
const palette = [
  "#ffffff",
  "#cbd5df",
  "#73838c",
  "#303b43",
  "#101820",
  "#ef6a61",
  "#faad60",
  "#edcd77",
  "#b9dc86",
  "#76c49d",
  "#5cd2cd",
  "#73b8ef",
  "#7184d9",
  "#aa86df",
  "#dd85c9",
  "#c99d80",
];
const storageKey = "sandlab.paint.v1";
export class ColorPicker {
  constructor(state, open) {
    this.state = state;
    this.dialog = document.getElementById("color-dialog");
    this.wheel = document.getElementById("color-wheel");
    this.marker = document.getElementById("wheel-marker");
    this.fields = Object.fromEntries(
      ["hex", "r", "g", "b", "h", "s", "v", "opacity"].map((k) => [
        k,
        document.getElementById("color-" + k),
      ]),
    );
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (parseHex(saved?.color)) state.color = rgbToHex(parseHex(saved.color));
      if (
        Number.isFinite(saved?.opacity) &&
        saved.opacity >= 0 &&
        saved.opacity <= 1
      )
        state.colorOpacity = saved.opacity;
      if (["foreground", "background"].includes(saved?.layer))
        state.colorLayer = saved.layer;
    } catch {
      /* A color preference must never block drawing. */
    }
    this.hsv = rgbToHsv(...parseHex(state.color));
    document.getElementById("paint-color").addEventListener("click", () => {
      this.sync();
      open("color-dialog");
    });
    const layer = document.getElementById("paint-layer");
    layer.value = state.colorLayer;
    layer.addEventListener("change", () => {
      state.colorLayer = layer.value;
      this.persist();
    });
    const eraser = document.getElementById("paint-erase");
    eraser.addEventListener("click", () => {
      state.colorErase = !state.colorErase;
      eraser.setAttribute("aria-pressed", String(state.colorErase));
      eraser.classList.toggle("active", state.colorErase);
    });
    this.fields.hex.addEventListener("input", () => {
      const rgb = parseHex(this.fields.hex.value);
      this.fields.hex.setAttribute("aria-invalid", String(!rgb));
      if (rgb) this.setRgb(rgb, "hex");
    });
    this.fields.hex.addEventListener("blur", () => this.sync());
    for (const k of ["r", "g", "b"])
      this.fields[k].addEventListener("input", () => {
        const rgb = ["r", "g", "b"].map(
          (key) => this.fields[key].valueAsNumber,
        );
        if (rgb.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
          this.setRgb(rgb, k);
      });
    for (const [index, k] of ["h", "s", "v"].entries())
      this.fields[k].addEventListener("input", () => {
        this.hsv[index] = Number(this.fields[k].value) / (index ? 100 : 1);
        state.color = rgbToHex(hsvToRgb(...this.hsv));
        this.sync(k);
        this.persist();
      });
    this.fields.opacity.addEventListener("input", () => {
      state.colorOpacity = Number(this.fields.opacity.value) / 100;
      this.sync("opacity");
      this.persist();
    });
    for (const tab of this.dialog.querySelectorAll("[data-color-tab]"))
      tab.addEventListener("click", () => {
        for (const button of this.dialog.querySelectorAll("[data-color-tab]"))
          button.setAttribute("aria-selected", String(button === tab));
        document.getElementById("color-picker-panel").hidden =
          tab.dataset.colorTab !== "picker";
        document.getElementById("color-palette-panel").hidden =
          tab.dataset.colorTab !== "palette";
      });
    const swatches = document.getElementById("color-palette");
    for (const hex of palette) {
      const button = document.createElement("button");
      button.type = "button";
      button.style.background = hex;
      button.setAttribute("aria-label", hex);
      button.title = hex;
      button.addEventListener("click", () => this.setRgb(parseHex(hex)));
      swatches.append(button);
    }
    const choose = (e) => {
      const rect = this.wheel.getBoundingClientRect(),
        x = (e.clientX - rect.left) / rect.width - 0.5,
        y = (e.clientY - rect.top) / rect.height - 0.5;
      this.hsv[0] = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      this.hsv[1] = Math.min(1, Math.hypot(x, y) * 2);
      state.color = rgbToHex(hsvToRgb(...this.hsv));
      this.sync();
      this.persist();
    };
    this.wheel.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.wheel.setPointerCapture(e.pointerId);
      choose(e);
    });
    this.wheel.addEventListener("pointermove", (e) => {
      if (this.wheel.hasPointerCapture(e.pointerId)) choose(e);
    });
    this.drawWheel();
    this.sync();
  }
  setRgb(rgb, except) {
    const hsv = rgbToHsv(...rgb);
    // Preserve chosen hue at gray/black so the saturation slider stays useful.
    if (!hsv[1]) hsv[0] = this.hsv[0];
    if (!hsv[2]) hsv[1] = this.hsv[1];
    this.hsv = hsv;
    this.state.color = rgbToHex(rgb);
    this.sync(except);
    this.persist();
  }
  persist() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          color: this.state.color,
          opacity: this.state.colorOpacity,
          layer: this.state.colorLayer,
        }),
      );
    } catch {
      /* Optional preference storage. */
    }
  }
  sync(except) {
    const rgb = parseHex(this.state.color),
      [h, s, v] = this.hsv;
    const values = {
      hex: this.state.color,
      r: rgb[0],
      g: rgb[1],
      b: rgb[2],
      h: Math.round(h),
      s: Math.round(s * 100),
      v: Math.round(v * 100),
      opacity: Math.round(this.state.colorOpacity * 100),
    };
    for (const [key, value] of Object.entries(values))
      if (key !== except) this.fields[key].value = value;
    for (const key of ["h", "s", "v", "opacity"])
      document.getElementById("color-" + key + "-value").textContent =
        key === "h" ? `${Math.round(h)}°` : `${values[key]}%`;
    this.dialog.style.setProperty("--color-gray", rgbToHex(hsvToRgb(h, 0, v)));
    this.dialog.style.setProperty(
      "--color-saturated",
      rgbToHex(hsvToRgb(h, 1, v)),
    );
    this.dialog.style.setProperty(
      "--color-bright",
      rgbToHex(hsvToRgb(h, s, 1)),
    );
    this.dialog.style.setProperty("--color-chosen", this.state.color);
    this.fields.hex.setAttribute("aria-invalid", "false");
    const swatch = document.getElementById("paint-color");
    swatch.style.setProperty("--paint-color", this.state.color);
    swatch.setAttribute(
      "aria-label",
      `Paint color ${this.state.color}, ${values.opacity}% opacity`,
    );
    document.getElementById("color-preview").style.background =
      this.state.color;
    document.getElementById("color-preview").style.opacity =
      this.state.colorOpacity;
    document.getElementById("color-preview-label").textContent =
      `${this.state.color.toUpperCase()} · ${values.opacity}%`;
    this.marker.style.left = `${50 + Math.cos((h * Math.PI) / 180) * s * 50}%`;
    this.marker.style.top = `${50 + Math.sin((h * Math.PI) / 180) * s * 50}%`;
    for (const button of document.querySelectorAll("#color-palette button"))
      button.setAttribute(
        "aria-pressed",
        String(button.title === this.state.color),
      );
  }
  drawWheel() {
    const size = 256;
    this.wheel.width = size;
    this.wheel.height = size;
    const ctx = this.wheel.getContext("2d"),
      image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - size / 2) / (size / 2),
          dy = (y + 0.5 - size / 2) / (size / 2),
          s = Math.hypot(dx, dy),
          o = (y * size + x) * 4;
        if (s > 1) continue;
        const rgb = hsvToRgb(
          ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
          s,
          1,
        );
        image.data[o] = rgb[0];
        image.data[o + 1] = rgb[1];
        image.data[o + 2] = rgb[2];
        image.data[o + 3] = 255;
      }
    ctx.putImageData(image, 0, 0);
  }
}
