import { SelectionMask } from "./selection-mask.js";
import {
  selectionRect,
  copyRegion,
  pasteRegion,
  canMoveRegion,
  moveRegion,
} from "./selection-region.js";
export { selectionRect, copyRegion, pasteRegion } from "./selection-region.js";
export class Selection {
  constructor(
    world,
    onChange = () => {},
    onMutation = () => {},
    onBlocked = () => {},
  ) {
    this.world = world;
    this.onChange = onChange;
    this.onMutation = onMutation;
    this.onBlocked = onBlocked;
    this.dragging = null;
    this.mask = new SelectionMask(world);
    this.brushing = false;
    this.last = null;
    this.clipboard = null;
    this.placing = false;
    this.visible = false;
    this.origin = null;
    this.preview = null;
    this.replace = false;
  }
  get box() {
    return this.mask.box;
  }
  ensureSize() {
    if (
      this.mask.width !== this.world.width ||
      this.mask.height !== this.world.height
    )
      this.mask.resize(this.world);
  }
  clear() {
    this.ensureSize();
    this.mask.clear();
    this.cancel();
  }
  contains(point) {
    const x = Math.floor(point.x),
      y = Math.floor(point.y);
    return (
      x >= 0 &&
      x < this.mask.width &&
      y >= 0 &&
      y < this.mask.height &&
      !!this.mask.data[y * this.mask.width + x]
    );
  }
  begin(point, shape = "square", radius = 6, erase = false, refine = false) {
    this.ensureSize();
    this.brushing = false;
    if (this.placing) {
      const box = this.placement(point);
      this.onMutation();
      pasteRegion(this.world, this.clipboard, box.x, box.y, this.replace);
      this.placing = false;
      this.mask.place(this.clipboard, box.x, box.y);
    } else if (!erase && !refine && this.contains(point)) {
      this.dragging = {
        point,
        clip: copyRegion(this.world, this.box, this.mask.data),
      };
      this.preview = { ...this.box };
      this.moveBlocked = false;
    } else if (shape === "circle" || erase) {
      this.brushing = true;
      this.radius = radius;
      this.erasing = erase;
      this.last = point;
      this.mask.stroke(point, point, radius, erase);
    } else {
      this.origin = point;
      this.mask.rectangle(selectionRect(this.world, point));
    }
    this.onChange();
  }
  move(point) {
    if (this.placing) this.preview = this.placement(point);
    else if (this.dragging) {
      const { point: start, clip } = this.dragging;
      this.preview = {
        x: Math.max(
          0,
          Math.min(
            this.world.width - clip.width,
            clip.x + Math.floor(point.x) - Math.floor(start.x),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            this.world.height - clip.height,
            clip.y + Math.floor(point.y) - Math.floor(start.y),
          ),
        ),
        width: clip.width,
        height: clip.height,
      };
      this.moveBlocked = !canMoveRegion(
        this.world,
        clip,
        this.preview.x,
        this.preview.y,
        this.mask.data,
        this.replace,
      );
    } else if (this.brushing) {
      this.mask.stroke(this.last, point, this.radius, this.erasing);
      this.last = point;
    } else if (this.origin)
      this.mask.rectangle(selectionRect(this.world, this.origin, point));
    this.onChange();
  }
  end() {
    if (this.dragging) {
      const { clip } = this.dragging,
        target = this.preview;
      if (target.x !== clip.x || target.y !== clip.y) {
        if (
          canMoveRegion(
            this.world,
            clip,
            target.x,
            target.y,
            this.mask.data,
            this.replace,
          )
        ) {
          if (clip.arrays.cells.some(Boolean)) this.onMutation();
          moveRegion(
            this.world,
            clip,
            target.x,
            target.y,
            this.mask.data,
            this.replace,
          );
          this.mask.place(clip, target.x, target.y);
        } else this.onBlocked();
      }
      this.dragging = null;
      this.preview = null;
      this.moveBlocked = false;
    }
    this.brushing = false;
    this.last = null;
    this.origin = null;
    this.onChange();
  }
  copy() {
    if (!this.box || this.dragging) return false;
    this.clipboard = copyRegion(this.world, this.box, this.mask.data);
    this.placing = false;
    this.onChange();
    return true;
  }
  arm() {
    if (!this.clipboard) return false;
    this.cancel();
    this.placing = true;
    this.origin = null;
    this.preview = null;
    this.onChange();
    return true;
  }
  cancel() {
    this.dragging = null;
    this.moveBlocked = false;
    this.brushing = false;
    this.last = null;
    this.placing = false;
    this.preview = null;
    this.origin = null;
    this.onChange();
  }
  placement(point) {
    return {
      x: Math.round(point.x - (this.clipboard.width - 1) / 2),
      y: Math.round(point.y - (this.clipboard.height - 1) / 2),
      width: this.clipboard.width,
      height: this.clipboard.height,
    };
  }
}
