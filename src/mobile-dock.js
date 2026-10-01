export class MobileDock {
  constructor(toolbox) {
    this.toolbox = toolbox;
    this.media = matchMedia(
      "(max-width: 700px), (max-height: 500px) and (pointer: coarse)",
    );
    this.handle = document.createElement("button");
    this.handle.id = "controls-toggle";
    this.handle.className = "controls-toggle";
    this.handle.type = "button";
    this.handle.setAttribute("aria-controls", "drawing-controls");
    toolbox.id = "drawing-controls";
    toolbox.prepend(this.handle);
    this.handle.addEventListener("click", () =>
      this.setExpanded(!toolbox.classList.contains("expanded")),
    );
    let start = null,
      moved = false;
    this.handle.addEventListener("pointerdown", (e) => {
      start = e.clientY;
      moved = false;
      this.handle.setPointerCapture(e.pointerId);
    });
    this.handle.addEventListener("pointermove", (e) => {
      if (start !== null && Math.abs(e.clientY - start) > 18) {
        this.setExpanded(e.clientY < start);
        moved = true;
      }
    });
    this.handle.addEventListener("pointerup", () => {
      start = null;
    });
    this.handle.addEventListener("pointercancel", () => {
      start = null;
    });
    this.handle.addEventListener(
      "click",
      (e) => {
        if (moved) {
          e.stopImmediatePropagation();
          moved = false;
        }
      },
      true,
    );
    const update = () => {
      document.body.classList.toggle("mobile-layout", this.media.matches);
      this.setExpanded(false);
    };
    this.media.addEventListener("change", update);
    update();
  }
  setExpanded(expanded) {
    this.toolbox.classList.toggle("expanded", expanded);
    this.handle.setAttribute("aria-expanded", String(expanded));
    this.handle.setAttribute(
      "aria-label",
      expanded ? "Collapse drawing controls" : "Expand drawing controls",
    );
    this.handle.textContent = expanded ? "⌄  Controls" : "⌃  Controls";
    // Canvas stays in place as the panel opens, preserving finger-to-cell coordinates.
  }
  toolChanged(tool) {
    if (this.media.matches && tool !== "paint") this.setExpanded(true);
  }
  toggleFocus() {
    const focused = document.body.classList.toggle("canvas-focus");
    this.setExpanded(false);
    return focused;
  }
}
