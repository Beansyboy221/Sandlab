import { icon } from "./icons.js";

// Compare fitted canvas area rather than relying on phone or material names.
export function mobilePlacement(width, height, worldWidth, worldHeight) {
  const landscape = width > height;
  const sideScale = Math.min(
    (width - 132) / worldWidth,
    (height - 8) / worldHeight,
  );
  const bottomScale = Math.min(
    (width - 8) / worldWidth,
    (height - 66) / worldHeight,
  );
  return {
    landscape,
    side: landscape && sideScale > bottomScale,
    alignLeft: landscape && worldHeight > worldWidth,
  };
}

export class MobileDock {
  constructor(toolbox, world, renderer) {
    this.toolbox = toolbox;
    this.world = world;
    this.renderer = renderer;
    this.manualFocus = false;
    this.landscapeExit = false;
    this.media = matchMedia(
      "(max-width: 700px), (max-height: 500px) and (pointer: coarse)",
    );
    this.handle = document.createElement("button");
    this.handle.id = "controls-toggle";
    this.handle.className = "controls-toggle";
    this.handle.type = "button";
    this.handle.setAttribute("aria-controls", "drawing-controls");
    this.handle.innerHTML =
      '<span class="dock-grip" aria-hidden="true"></span>';
    toolbox.id = "drawing-controls";
    toolbox.prepend(this.handle);
    this.exit = document.createElement("button");
    this.exit.id = "mobile-exit-focus";
    this.exit.type = "button";
    this.exit.className = "icon-button";
    this.exit.setAttribute("aria-label", "Exit fullscreen");
    this.exit.title = "Exit fullscreen";
    this.exit.innerHTML = icon("close");
    document.body.append(this.exit);
    this.exit.addEventListener("click", () => this.setFocus(false));
    this.handle.addEventListener("click", () =>
      this.setExpanded(!toolbox.classList.contains("expanded")),
    );
    let start = null,
      moved = false;
    this.handle.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      this.handle.setPointerCapture(e.pointerId);
    });
    this.handle.addEventListener("pointermove", (e) => {
      if (!start) return;
      const delta = document.body.classList.contains("dock-side")
        ? e.clientX - start.x
        : e.clientY - start.y;
      if (Math.abs(delta) > 18) {
        this.setExpanded(delta < 0);
        moved = true;
      }
    });
    for (const event of ["pointerup", "pointercancel"])
      this.handle.addEventListener(event, () => {
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
    this.media.addEventListener("change", () => this.layout());
    window.addEventListener("resize", () => this.layout());
    window.visualViewport?.addEventListener("resize", () => this.layout());
    this.setExpanded(false);
    this.layout();
  }
  layout() {
    const mobile = this.media.matches;
    const landscape = mobile && innerWidth > innerHeight;
    const orientationChanged =
      this.landscape !== undefined && this.landscape !== landscape;
    if (!landscape) this.landscapeExit = false;
    this.landscape = landscape;
    document.body.classList.toggle("mobile-layout", mobile);
    document.body.classList.toggle(
      "canvas-focus",
      this.manualFocus || (landscape && !this.landscapeExit),
    );
    const focused = document.body.classList.contains("canvas-focus");
    const availableHeight = innerHeight - (focused ? 0 : 82);
    const placement = mobilePlacement(
      innerWidth,
      availableHeight,
      this.world.width,
      this.world.height,
    );
    const side = mobile && landscape && placement.side;
    if (orientationChanged || this.side !== side) this.setExpanded(false);
    this.side = side;
    document.body.classList.toggle("dock-side", side);
    this.toolbox.style.setProperty(
      "--side-panel-width",
      `${Math.min(300, innerWidth * 0.4)}px`,
    );
    this.renderer.alignLeft =
      mobile && landscape && this.world.height > this.world.width;
    if (orientationChanged) this.renderer.resetView();
    this.renderer.resize();
    document
      .querySelector("#fullscreen-btn")
      ?.setAttribute(
        "aria-label",
        focused ? "Exit fullscreen" : "Fullscreen simulation",
      );
  }
  setExpanded(expanded) {
    this.toolbox.classList.toggle("expanded", expanded);
    this.handle.setAttribute("aria-expanded", String(expanded));
    this.handle.setAttribute(
      "aria-label",
      expanded ? "Collapse drawing controls" : "Expand drawing controls",
    );
  }
  toolChanged(tool) {
    if (this.media.matches && tool !== "paint") this.setExpanded(true);
  }
  setFocus(focused) {
    this.manualFocus = focused;
    this.landscapeExit = !focused && this.landscape;
    this.setExpanded(false);
    this.layout();
    return focused;
  }
  toggleFocus() {
    return this.setFocus(!document.body.classList.contains("canvas-focus"));
  }
}
