import { applyTool, dragBrush } from "./sim/tools.js";
const fanDirections = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
};
const readTools = new Set(["inspect", "eyedropper"]);
export class Input {
  constructor(
    canvas,
    renderer,
    world,
    state,
    onStroke,
    onHover,
    selection,
    onRead,
  ) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.world = world;
    this.state = state;
    this.pointers = new Map();
    this.onStroke = onStroke;
    this.onHover = onHover;
    this.selection = selection;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      const selecting = state.tool === "select";
      if (selecting && this.pointers.size) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const point = renderer.point(e.clientX, e.clientY);
      if (readTools.has(state.tool)) {
        const tool = state.tool;
        this.pointers.set(e.pointerId, { ...point, readOnly: tool });
        onRead?.(tool, point);
        this.hover(point);
        return;
      }
      if (!selecting && !this.pointers.size) this.onStroke();
      this.pointers.set(e.pointerId, {
        ...point,
        erase:
          e.button === 2 || (selecting ? state.selectionErase : state.erase),
        selecting,
        dx: 1,
        dy: 0,
      });
      if (selecting) {
        if (e.button === 2 && selection.placing) selection.cancel();
        else
          selection.begin(
            point,
            state.selectionShape,
            state.radius,
            e.button === 2 || state.selectionErase,
            e.shiftKey,
          );
      } else this.paint(point, point, e.button === 2 || state.erase);
      this.hover(
        point,
        selecting && (e.button === 2 || state.selectionErase),
        e.shiftKey,
      );
    });
    canvas.addEventListener("pointermove", (e) => {
      const point = renderer.point(e.clientX, e.clientY),
        last = this.pointers.get(e.pointerId);
      this.hover(point, last?.selecting && last.erase, e.shiftKey);
      if (last?.readOnly) {
        if (last.readOnly === "inspect") onRead?.("inspect", point);
        this.pointers.set(e.pointerId, { ...last, ...point });
        return;
      }
      if (last?.selecting) {
        selection.move(point);
        this.pointers.set(e.pointerId, { ...last, ...point });
        return;
      }
      if (last) {
        const dx = point.x - last.x,
          dy = point.y - last.y;
        const direction =
          Math.hypot(dx, dy) > 0.1 ? { dx, dy } : { dx: last.dx, dy: last.dy };
        this.paint(last, point, last.erase, direction.dx, direction.dy);
        this.pointers.set(e.pointerId, {
          ...point,
          erase: last.erase,
          ...direction,
        });
      }
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(type, (e) => {
        if (this.pointers.get(e.pointerId)?.selecting) {
          if (type === "pointerup") {
            if (selection.dragging)
              selection.move(renderer.point(e.clientX, e.clientY));
            selection.end();
          } else selection.cancel();
        }
        this.pointers.delete(e.pointerId);
        if (e.pointerType === "touch") {
          renderer.cursor = null;
          canvas.style.cursor = "crosshair";
        } else if (type === "pointerup")
          this.hover(renderer.point(e.clientX, e.clientY));
      });
    canvas.addEventListener("pointerleave", () => {
      if (!this.pointers.size) {
        renderer.cursor = null;
        canvas.style.cursor = "crosshair";
        onHover(null);
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        state.setRadius(state.radius + (e.deltaY < 0 ? 1 : -1));
      },
      { passive: false },
    );
  }
  hover(point, erasing = false, refine = false) {
    if (readTools.has(this.state.tool)) {
      this.canvas.style.cursor =
        this.state.tool === "inspect" ? "zoom-in" : "crosshair";
      this.renderer.cursor = null;
      this.onHover(point);
      return;
    }
    if (this.state.tool === "select") {
      const grabbing =
        !refine &&
        !this.selection.brushing &&
        !this.state.selectionErase &&
        !erasing &&
        !this.selection.placing &&
        (this.selection.dragging || this.selection.contains(point));
      this.canvas.style.cursor = grabbing
        ? this.selection.dragging
          ? "grabbing"
          : "grab"
        : "crosshair";
      this.renderer.cursor =
        !this.selection.placing &&
        !grabbing &&
        (this.state.selectionShape === "circle" || erasing)
          ? {
              ...point,
              radius: this.state.radius,
              shape: "circle",
              selection: true,
              erase: erasing || this.state.selectionErase,
            }
          : null;
      if (this.selection.placing) this.selection.move(point);
      this.onHover(point);
      return;
    }
    this.canvas.style.cursor = "crosshair";
    this.renderer.cursor = {
      ...point,
      radius: this.state.radius,
      shape: this.state.shape,
      erase: this.state.erase,
    };
    this.onHover(point);
  }
  paint(a, b, erase, dx = 1, dy = 0) {
    const tool = erase ? "erase" : this.state.tool || "paint";
    if (tool === "grab") {
      dragBrush(
        this.world,
        a,
        b,
        this.state.radius,
        this.state.shape,
        this.state.includeSolids,
      );
      return;
    }
    const distance = Math.hypot(b.x - a.x, b.y - a.y),
      steps = Math.max(
        1,
        Math.ceil(distance / Math.max(1, this.state.radius * 0.5)),
      );
    for (let i = 0; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps,
        y = a.y + ((b.y - a.y) * i) / steps;
      if (tool !== "paint" && tool !== "erase") {
        const direction = fanDirections[this.state.fanDirection];
        applyTool(
          this.world,
          tool,
          x,
          y,
          this.state.radius,
          this.state.shape,
          direction?.[0] ?? dx,
          direction?.[1] ?? dy,
          this.state.power || 1,
        );
        if (!distance) break;
        continue;
      }
      if (tool === "erase" && !this.state.includeSolids) {
        applyTool(
          this.world,
          "erase-mobile",
          x,
          y,
          this.state.radius,
          this.state.shape,
        );
        continue;
      }
      this.world.brush(
        a.x + ((b.x - a.x) * i) / steps,
        a.y + ((b.y - a.y) * i) / steps,
        this.state.radius,
        erase ? 0 : this.state.material,
        this.state.shape,
        this.state.replace,
      );
    }
  }
  update() {
    for (const point of this.pointers.values())
      if (!point.selecting && !point.readOnly)
        this.paint(point, point, point.erase, point.dx, point.dy);
  }
}
