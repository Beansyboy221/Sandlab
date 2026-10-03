import { M } from "./materials.js";
import { portalRoute } from "./portal-geometry.js";

export const portalFields = ["portalId", "portalLink", "portalCooldown"];
export const PORTAL_COOLDOWN = 12;

// Shapes have persistent identities, independent of their location and of links.
// Geometry is rebuilt only after an edit; empty worlds do no portal work.
export class Portals {
  constructor(world) {
    this.world = world;
    this.locations = new Set();
    this.shapes = new Map();
    this.nextId = 1;
    this.strokeId = 0;
    this.facing = 7;
    this.dirty = false;
  }
  allocate() {
    this.ensure();
    while (this.shapes.has(this.nextId))
      this.nextId = (this.nextId % 4294967295) + 1;
    const id = this.nextId;
    this.nextId = (id % 4294967295) + 1;
    return id;
  }
  beginStroke(facing = 7) {
    this.strokeId = this.allocate();
    this.facing = [0, 2, 4, 6].includes(facing) ? facing : 7;
  }
  endStroke() {
    this.strokeId = 0;
  }
  add(i) {
    const w = this.world;
    let id = this.strokeId;
    let neighbor = -1;
    if (!id) {
      w.eachNeighbor(i % w.width, Math.floor(i / w.width), (j) => {
        if (!id && w.cells[j] === M.Portal) {
          id = w.portalId[j];
          neighbor = j;
        }
      });
      id ||= this.allocate();
    }
    w.portalId[i] = id;
    w.heading[i] = this.strokeId
      ? this.facing
      : neighbor >= 0
        ? w.heading[neighbor]
        : 7;
    if (neighbor >= 0) w.portalLink[i] = w.portalLink[neighbor];
    this.locations.add(i);
    this.dirty = true;
  }
  remove(i) {
    if (this.locations.delete(i)) this.dirty = true;
  }
  clear() {
    this.locations.clear();
    this.shapes.clear();
    this.nextId = 1;
    this.strokeId = 0;
    this.dirty = false;
  }
  rebuild(world = this.world) {
    this.world = world;
    this.locations.clear();
    this.strokeId = 0;
    for (let i = 0; i < world.length; i++)
      if (world.cells[i] === M.Portal) this.locations.add(i);
    this.dirty = true;
    this.ensure();
    this.pruneLinks();
  }
  ensure() {
    if (!this.dirty) return;
    const w = this.world;
    this.shapes.clear();
    for (const i of this.locations) {
      const id = w.portalId[i];
      if (!id || w.cells[i] !== M.Portal) continue;
      let shape = this.shapes.get(id);
      if (!shape) {
        shape = {
          id,
          cells: [],
          link: w.portalLink[i],
          facing: w.heading[i],
          left: w.width,
          right: -1,
          top: w.height,
          bottom: -1,
          normalTick: -1,
        };
        this.shapes.set(id, shape);
      }
      const x = i % w.width,
        y = Math.floor(i / w.width);
      shape.cells.push(i);
      shape.left = Math.min(shape.left, x);
      shape.right = Math.max(shape.right, x);
      shape.top = Math.min(shape.top, y);
      shape.bottom = Math.max(shape.bottom, y);
    }
    for (const shape of this.shapes.values()) {
      shape.x = (shape.left + shape.right + 1) / 2;
      shape.y = (shape.top + shape.bottom + 1) / 2;
      shape.faces = [
        new Int32Array(shape.bottom - shape.top + 1).fill(-1),
        new Int32Array(shape.right - shape.left + 1).fill(-1),
        new Int32Array(shape.bottom - shape.top + 1).fill(-1),
        new Int32Array(shape.right - shape.left + 1).fill(-1),
      ];
      for (const i of shape.cells) {
        const x = i % w.width,
          y = Math.floor(i / w.width);
        for (let face = 0; face < 4; face++) {
          const n = face % 2 ? x - shape.left : y - shape.top;
          const old = shape.faces[face][n];
          if (old < 0 || (face < 2 ? i > old : i < old))
            shape.faces[face][n] = i;
        }
      }
    }
    this.dirty = false;
  }
  pruneLinks() {
    this.ensure();
    // Run after atomic edits, never halfway through a selection move.
    for (const shape of this.shapes.values()) {
      const other = this.shapes.get(shape.link);
      if (!other || other.link !== shape.id || other === shape)
        this.writeLink(shape, 0);
    }
  }
  writeLink(shape, target) {
    shape.link = target;
    for (const i of shape.cells) this.world.portalLink[i] = target;
  }
  unlink(id) {
    this.ensure();
    const shape = this.shapes.get(id);
    if (!shape) return;
    const other = this.shapes.get(shape.link);
    if (other?.link === id) this.writeLink(other, 0);
    this.writeLink(shape, 0);
  }
  link(a, b) {
    this.ensure();
    if (a === b || !this.shapes.has(a) || !this.shapes.has(b)) return false;
    this.unlink(a);
    this.unlink(b);
    this.writeLink(this.shapes.get(a), b);
    this.writeLink(this.shapes.get(b), a);
    return true;
  }
  hit(point) {
    const w = this.world;
    if (
      !point ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= w.width ||
      point.y >= w.height
    )
      return 0;
    const i = Math.floor(point.y) * w.width + Math.floor(point.x);
    return w.cells[i] === M.Portal ? w.portalId[i] : 0;
  }
  route(i, x, y, vx, vy, clearance = 0.5) {
    this.ensure();
    return portalRoute(this, i, x, y, vx, vy, clearance);
  }
}
