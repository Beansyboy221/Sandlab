import { materials } from "./sim/materials.js";
import { portalHandleRadius } from "./portal-renderer.js";

// Existing portal shapes are link handles; empty space remains ordinary drawing.
export class PortalInput {
  constructor(world, renderer, state, remember, notice) {
    Object.assign(this, { world, renderer, state, remember, notice });
  }
  hit(point) {
    const direct = this.world.portals.hit(point);
    if (direct) return direct;
    this.world.portals.ensure();
    const scale = this.renderer.viewport.scale;
    const radius = portalHandleRadius(scale) / scale;
    let shown = 0;
    for (const shape of this.world.portals.shapes.values()) {
      if (++shown > 128) break;
      if (Math.hypot(point.x - shape.x, point.y - shape.y) <= radius)
        return shape.id;
    }
    return 0;
  }
  begin(point, erase, geometric = false) {
    if (
      erase ||
      this.state.tool !== "paint" ||
      !materials[this.state.material].portal
    )
      return false;
    const mode = this.state.portalMode || "draw",
      id = this.hit(point);
    if (geometric && mode === "draw") return false;
    if (mode === "unlink") {
      this.world.portals.ensure();
      if (id && this.world.portals.shapes.get(id)?.link) {
        this.remember();
        this.world.portals.unlink(id);
        this.notice("Portal unlinked");
      } else this.notice("Choose a linked Portal");
      return true;
    }
    if (id) {
      this.renderer.portalDrag = { source: id, point, target: 0 };
      return true;
    }
    if (mode === "link") {
      this.notice("Drag from one Portal to another");
      return true;
    }
    return false;
  }
  move(point) {
    const drag = this.renderer.portalDrag;
    if (drag) {
      drag.point = point;
      drag.target = this.hit(point);
    }
  }
  end(point, cancelled = false) {
    const drag = this.renderer.portalDrag;
    this.renderer.portalDrag = null;
    if (!drag || cancelled) return;
    const target = this.hit(point);
    if (!target || target === drag.source)
      return this.notice("Drag to a different Portal");
    this.world.portals.ensure();
    if (!this.world.portals.shapes.has(drag.source)) return;
    if (this.world.portals.shapes.get(drag.source).link === target) return;
    this.remember();
    if (this.world.portals.link(drag.source, target))
      this.notice("Portals linked");
  }
  cancel() {
    this.renderer.portalDrag = null;
    this.world.portals.endStroke();
  }
}
