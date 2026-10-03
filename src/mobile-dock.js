import { icon } from "./icons.js";

import { orientationTurn, gravityForTurn } from "./canvas-view.js";
export function phoneOrientation() {
  const angle =
    typeof window.orientation === "number"
      ? window.orientation
      : screen.orientation?.angle;
  return Number.isFinite(angle) ? angle : 0;
}

export class MobileDock {
  constructor(toolbox, world, renderer) {
    this.toolbox = toolbox;
    this.world = world;
    this.renderer = renderer;
    this.manualFocus = false;
    this.landscapeExit = false;
    this.media = matchMedia("(max-width: 700px), (pointer: coarse)");
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
      const delta = e.clientY - start.y;
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
    // iOS can report the new angle before the viewport has rotated. Commit
    // layout and gravity together, after the browser has settled both events.
    const schedule = () => {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = requestAnimationFrame(() => {
        this.layoutFrame = requestAnimationFrame(() => this.layout());
      });
    };
    this.media.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    screen.orientation?.addEventListener("change", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    this.setExpanded(false);
    this.layout();
  }
  layout() {
    const mobile = this.media.matches;
    const landscape = mobile && innerWidth > innerHeight;
    const reportedTurn = mobile ? orientationTurn(phoneOrientation()) : 0;
    this.baseLandscape ??= landscape !== !!(reportedTurn % 2);
    const turn =
      mobile && landscape !== (this.baseLandscape !== !!(reportedTurn % 2))
        ? this.renderer.rotation
        : reportedTurn;
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
    if (turn !== this.renderer.rotation) {
      this.onOrientationChange?.();
      this.renderer.rotation = turn;
      this.renderer.resetView();
    }
    if (orientationChanged || turn !== this.committedTurn)
      this.setExpanded(false);
    this.committedTurn = turn;
    this.world.setGravity(...gravityForTurn(turn));
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
