import { circuitDirection } from "./sim/circuits.js";
import { PortalInput } from "./portal-input.js";
import { TouchNavigation } from "./touch-navigation.js";
import { fillRegion } from "./sim/fill.js";
import { paintBrush, beginColorStroke } from "./sim/paint.js";
import { stampGesture } from "./drawing-gesture.js";
import { M, materials } from "./sim/materials.js";
import { applyTool, dragBrush, blowBrush } from "./sim/tools.js";
const readTools = new Set(["inspect", "eyedropper", "guide"]);
export function lightningInterval(radius) {
  return 1000 / (1 + 0.4 * (Math.max(1, Math.min(30, radius)) - 1));
}
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
    drawingPause,
    onNotice = () => {},
  ) {
    this.canvas = canvas;
    canvas.tabIndex = 0;
    this.renderer = renderer;
    this.world = world;
    this.state = state;
    this.pointers = new Map();
    this.controllerId = -100;
    this.lastLightningAt = -Infinity;
    this.onStroke = onStroke;
    this.onHover = onHover;
    this.selection = selection;
    this.drawingPause = drawingPause;
    this.lastSolidBrush = null;
    this.portalInput = new PortalInput(
      world,
      renderer,
      state,
      onStroke,
      onNotice,
    );
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    const pointerDown = (e) => {
      if (e.button === 1) {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, {
          pan: true,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        return;
      }
      if (e.button !== 0 && e.button !== 2) return;
      const selecting = state.tool === "select";
      if (selecting && this.pointers.size) return;
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      if (e.pointerType !== "touch") canvas.setPointerCapture(e.pointerId);
      const point = renderer.point(e.clientX, e.clientY);
      // Letterbox margins are presentation space, not part of the world.
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x >= world.width ||
        point.y >= world.height
      )
        return;
      const portalDrawing =
        state.tool === "paint" && state.material === M.Portal;
      if (portalDrawing && this.pointers.size) return;
      if (
        this.portalInput.begin(
          point,
          e.button === 2 || state.erase,
          e.shiftKey || e.ctrlKey,
        )
      ) {
        this.pointers.set(e.pointerId, { ...point, portalLink: true });
        renderer.cursor = null;
        return;
      }
      if (readTools.has(state.tool)) {
        const tool = state.tool;
        this.pointers.set(e.pointerId, { ...point, readOnly: tool });
        onRead?.(tool, point);
        this.hover(point);
        return;
      }
      if (state.tool === "fill") {
        if (this.pointers.size) return;
        fillRegion(
          world,
          point.x,
          point.y,
          {
            layer: state.fillLayer || "material",
            material: state.material,
            replace: state.replace,
            erase:
              e.button === 2 ||
              (state.colorErase && state.fillLayer !== "material"),
            color: parseInt(state.color.slice(1), 16),
            opacity: state.colorOpacity,
          },
          this.onStroke,
        );
        this.pointers.set(e.pointerId, { ...point, readOnly: "fill" });
        this.hover(point);
        return;
      }
      const geometric =
        !selecting &&
        ["paint", "erase", "recolor"].includes(state.tool) &&
        (e.shiftKey || e.ctrlKey);
      if (geometric && this.pointers.size) return;
      if (portalDrawing && e.button === 0 && !state.erase)
        world.portals.beginStroke(Number(state.portalFacing ?? 7));
      if (
        state.tool === "paint" &&
        !state.erase &&
        e.button === 0 &&
        materials[state.material].rigid
      )
        drawingPause?.begin(e.pointerId);
      if (
        !selecting &&
        !geometric &&
        !this.pointers.size &&
        (state.tool !== "wind" || e.button === 2 || state.erase)
      ) {
        this.onStroke();
        if (state.tool === "recolor") beginColorStroke(world);
      }
      this.pointers.set(e.pointerId, {
        ...point,
        erase:
          e.button === 2 || (selecting ? state.selectionErase : state.erase),
        selecting,
        dx: 1,
        dy: 0,
        at: e.timeStamp || performance.now(),
        strokeStarted: state.tool !== "wind" || e.button === 2 || state.erase,
      });
      if (geometric) {
        const gesture = {
          start: this.bounded(point),
          end: this.bounded(point),
          kind: e.ctrlKey ? state.shape : "line",
          radius: state.radius,
          erase: e.button === 2 || state.erase,
        };
        this.pointers.get(e.pointerId).gesture = gesture;
        renderer.gesture = gesture;
        renderer.cursor = null;
        return;
      }
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
      } else
        this.paint(point, point, e.button === 2 || state.erase, 1, 0, true);
      this.hover(
        point,
        selecting && (e.button === 2 || state.selectionErase),
        e.shiftKey,
      );
    };
    const pointerMove = (e) => {
      const point = renderer.point(e.clientX, e.clientY),
        last = this.pointers.get(e.pointerId);
      if (last?.pan) {
        renderer.panBy(e.clientX - last.clientX, e.clientY - last.clientY);
        last.clientX = e.clientX;
        last.clientY = e.clientY;
        return;
      }
      if (last?.portalLink) {
        this.portalInput.move(point);
        renderer.cursor = null;
        return;
      }
      this.hover(point, last?.selecting && last.erase, e.shiftKey);
      if (last?.gesture) {
        last.gesture.end = this.bounded(point);
        renderer.cursor = null;
        return;
      }
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
        const now = e.timeStamp || performance.now();
        const dx = point.x - last.x,
          dy = point.y - last.y;
        if (
          state.tool === "wind" &&
          !last.erase &&
          !last.strokeStarted &&
          (dx || dy)
        ) {
          this.onStroke();
          last.strokeStarted = true;
        }
        const direction =
          Math.hypot(dx, dy) > 0.1 ? { dx, dy } : { dx: last.dx, dy: last.dy };
        this.paint(
          last,
          point,
          last.erase,
          direction.dx,
          direction.dy,
          false,
          now - last.at,
        );
        this.pointers.set(e.pointerId, {
          ...last,
          ...point,
          erase: last.erase,
          ...direction,
          at: now,
        });
      }
    };
    const pointerEnd = (e) => {
      const type = e.type;
      if (this.pointers.get(e.pointerId)?.portalLink)
        this.portalInput.end(
          renderer.point(e.clientX, e.clientY),
          type !== "pointerup",
        );
      const gesture = this.pointers.get(e.pointerId)?.gesture;
      if (gesture) {
        if (type === "pointerup") {
          gesture.end = this.bounded(renderer.point(e.clientX, e.clientY));
          this.onStroke();
          if (state.tool === "recolor") beginColorStroke(world);
          const dx = gesture.end.x - gesture.start.x,
            dy = gesture.end.y - gesture.start.y;
          if (
            state.tool === "paint" &&
            state.material === M.Lightning &&
            !gesture.erase
          )
            this.paint(gesture.end, gesture.end, false, dx, dy, true);
          else {
            const radius = state.radius;
            state.radius = gesture.radius;
            try {
              stampGesture(gesture, gesture.radius, (x, y) =>
                this.paint({ x, y }, { x, y }, gesture.erase, dx, dy),
              );
            } finally {
              state.radius = radius;
            }
          }
        }
        renderer.gesture = null;
      }
      if (this.pointers.get(e.pointerId)?.selecting) {
        if (type === "pointerup") {
          if (selection.dragging)
            selection.move(renderer.point(e.clientX, e.clientY));
          selection.end();
        } else selection.cancel();
      }
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) world.portals.endStroke();
      drawingPause?.end(e.pointerId, type !== "pointerup");
      if (e.pointerType === "touch") {
        renderer.cursor = null;
        canvas.style.cursor = "crosshair";
      } else if (type === "pointerup")
        this.hover(renderer.point(e.clientX, e.clientY));
    };
    // Controller input shares every stroke/history/selection path with pointers.
    // Call handlers directly so virtual pointers never request browser capture.
    this.controllerPointer = (type, clientX, clientY, erase = false) => {
      const event = {
        type,
        clientX,
        clientY,
        button: erase ? 2 : 0,
        pointerId: this.controllerId,
        pointerType: "touch",
        shiftKey: false,
        ctrlKey: false,
        preventDefault() {},
      };
      if (type === "pointerdown") pointerDown(event);
      else if (type === "pointermove") pointerMove(event);
      else pointerEnd(event);
    };
    this.touchNavigation = new TouchNavigation(renderer, {
      down: pointerDown,
      move: pointerMove,
      up: pointerEnd,
      cancel: () => {
        this.cancelDrawing();
        selection.cancel();
        renderer.cursor = null;
      },
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return pointerDown(e);
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      this.touchNavigation.down(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") return pointerMove(e);
      e.preventDefault();
      this.touchNavigation.move(e);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(type, (e) => {
        if (e.pointerType !== "touch") return pointerEnd(e);
        this.touchNavigation.end(e);
        renderer.cursor = null;
      });
    for (const type of ["gesturestart", "gesturechange"])
      canvas.addEventListener(type, (e) => e.preventDefault(), {
        passive: false,
      });
    window.addEventListener("blur", () => {
      this.cancel();
      world.missiles.guidance.setCursor(null);
    });
    canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch") world.missiles.guidance.setCursor(null);
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
        if (e.ctrlKey)
          renderer.zoomAt(
            Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.005),
            e.clientX,
            e.clientY,
          );
        else if (e.deltaY)
          state.setRadius(state.radius + (e.deltaY < 0 ? 0.5 : -0.5));
        this.hover(renderer.point(e.clientX, e.clientY));
      },
      { passive: false },
    );
  }
  bounded(point) {
    return {
      x: Math.max(0, Math.min(this.world.width - 1, Math.floor(point.x))),
      y: Math.max(0, Math.min(this.world.height - 1, Math.floor(point.y))),
    };
  }
  cancel() {
    this.touchNavigation.cancel();
    this.cancelDrawing();
  }
  cancelDrawing() {
    this.portalInput.cancel();
    this.pointers.clear();
    this.renderer.gesture = null;
    this.drawingPause?.cancel();
  }
  hover(point, erasing = false, refine = false) {
    this.world.missiles.guidance.setCursor(point);
    if (this.state.tool === "fill") {
      this.canvas.style.cursor = "crosshair";
      this.renderer.cursor = null;
      this.onHover(point);
      return;
    }
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
      radius:
        this.state.tool === "paint" &&
        (this.state.material === M.Lightning ||
          materials[this.state.material].directed)
          ? 0
          : this.state.radius,
      shape: this.state.shape,
      erase: this.state.erase,
    };
    this.onHover(point);
  }
  paint(a, b, erase, dx = 1, dy = 0, immediate = false, elapsed = 1000 / 60) {
    // Renderer points measure from cell edges; engine brush centers are integer cells.
    a = { x: a.x - 0.5, y: a.y - 0.5 };
    b = { x: b.x - 0.5, y: b.y - 0.5 };
    const tool = erase ? "erase" : this.state.tool || "paint";
    if (tool === "paint" && materials[this.state.material].circuit) {
      [dx, dy] = circuitDirection(this.state.deviceFacing ?? 0);
    }
    if (tool === "paint" && this.state.material === M.Lightning) {
      const now = performance.now();
      if (
        !immediate &&
        now - this.lastLightningAt < lightningInterval(this.state.radius)
      )
        return;
      this.lastLightningAt = now;
      this.world.brush(
        b.x,
        b.y,
        0,
        M.Lightning,
        this.state.shape,
        this.state.replace,
        1,
        0,
      );
      return;
    }
    if (tool === "grab") {
      dragBrush(
        this.world,
        a,
        b,
        this.state.radius,
        this.state.shape,
        this.state.includeSolids,
        elapsed,
      );
      return;
    }
    if (tool === "wind") {
      blowBrush(
        this.world,
        a,
        b,
        this.state.radius,
        this.state.shape,
        this.state.power || 1,
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
      if (this.state.tool === "recolor") {
        paintBrush(
          this.world,
          x,
          y,
          this.state.radius,
          this.state.shape,
          this.state.colorLayer,
          parseInt(this.state.color.slice(1), 16),
          this.state.colorOpacity,
          erase || this.state.colorErase,
        );
        continue;
      }
      if (tool !== "paint" && tool !== "erase") {
        applyTool(
          this.world,
          tool,
          x,
          y,
          this.state.radius,
          this.state.shape,
          dx,
          dy,
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
        dx,
        dy,
      );
    }
  }
  update() {
    if (!this.pointers.size) {
      this.renderer.gesture = null;
      this.lastSolidBrush = null;
      return;
    }
    const s = this.state,
      frozen =
        this.drawingPause?.active &&
        s.tool === "paint" &&
        !s.erase &&
        materials[s.material].rigid,
      previous = this.lastSolidBrush,
      changed =
        !previous ||
        previous.material !== s.material ||
        previous.radius !== s.radius ||
        previous.shape !== s.shape ||
        previous.replace !== s.replace;
    // Pointer events already stamp moving strokes. Frozen solids cannot vacate
    // their brush, so held strokes need another stamp only if brush settings change.
    for (const [id, point] of this.pointers)
      if (
        !point.selecting &&
        !point.readOnly &&
        !point.gesture &&
        !point.pan &&
        !point.portalLink &&
        !(s.tool === "wind" && !point.erase) &&
        !(frozen && this.drawingPause.pointers.has(id) && !changed)
      )
        this.paint(point, point, point.erase, point.dx, point.dy);
    this.lastSolidBrush = frozen
      ? changed
        ? {
            material: s.material,
            radius: s.radius,
            shape: s.shape,
            replace: s.replace,
          }
        : previous
      : null;
  }
}
