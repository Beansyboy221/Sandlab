import { materials, M } from "./materials.js";
import { BodyConnections } from "./body-connections.js";
import { BodyRaster } from "./body-raster.js";
import { stepBodies } from "./body-motion.js";

export const rigidFields = ["restX", "restY", "angularVelocity", "damage"];
const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];
const clamp = (v, max) => Math.max(-max, Math.min(max, v));
const wrapDelta = (v, length) => v - Math.round(v / length) * length;

// One object per connected body, never per particle. Stable IDs/links are shared
// with elastics; rigid rest coordinates preserve a shape through cuts and saves.
export class RigidBodies {
  constructor(world) {
    this.world = world;
    this.locations = new Map();
    this.bodyOf = new Map();
    this.bodies = [];
    this.dirty = true;
    this.fresh = new Set();
    this.collidedBodies = new Set();
    this.parents = new Int32Array(world.length);
    this.edgeCounts = new Uint8Array(world.length);
    this.connections = new BodyConnections(this);
    this.raster = new BodyRaster(this);
    this.targets = this.raster.targets;
    this.targetX = this.raster.x;
    this.targetY = this.raster.y;
  }
  add(i, connect = true) {
    const w = this.world,
      id = w.elastic.allocate();
    w.elasticId[i] = id;
    w.restX[i] = (i % w.width) + 0.5;
    w.restY[i] = Math.floor(i / w.width) + 0.5;
    this.locations.set(id, i);
    this.fresh.add(id);
    this.dirty = true;
    if (!connect) return;
    for (let d = 0; d < 4; d++)
      for (const sign of [-1, 1]) {
        const j = w.index(
          (i % w.width) + directions[d][0] * sign,
          Math.floor(i / w.width) + directions[d][1] * sign,
        );
        if (j >= 0 && j !== i && w.cells[j] === w.cells[i] && w.elasticId[j])
          w["bond" + d][sign > 0 ? i : j] = w.elasticId[sign > 0 ? j : i];
      }
  }
  remove(id) {
    this.locations.delete(id);
    this.fresh.delete(id);
    this.dirty = true;
  }
  rebuild() {
    const w = this.world;
    this.bodyOf.clear();
    const parent = this.parents;
    for (const i of this.locations.values()) {
      parent[i] = i;
      this.edgeCounts[i] = 0;
    }
    const root = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (const i of this.locations.values())
      for (let d = 0; d < 4; d++) {
        const id = w["bond" + d][i];
        if (!id) continue;
        const j = this.locations.get(id);
        if (j === undefined) {
          w.fragments.mark(i);
          w["bond" + d][i] = 0;
          continue;
        }
        if (d < 2) {
          this.edgeCounts[i]++;
          this.edgeCounts[j]++;
        }
        const a = root(i),
          b = root(j);
        if (a !== b) parent[b] = a;
      }
    const groups = new Map();
    for (const [id, i] of this.locations) {
      const component = root(i);
      if (!groups.has(component)) groups.set(component, []);
      groups.get(component).push(id);
    }
    this.bodies = [];
    for (const ids of groups.values()) {
      ids.sort((a, b) => a - b);
      const rebase = ids.some((node) => this.fresh.has(node));
      const body = {
        ids: Uint32Array.from(ids),
        mass: 0,
        lx: 0,
        ly: 0,
        inertia: 0,
        radius: 0,
        friction: 0,
        restitution: 0,
      };
      const first = this.locations.get(ids[0]),
        fx = (first % w.width) + w.offsetX[first] + 0.5,
        fy = Math.floor(first / w.width) + w.offsetY[first] + 0.5;
      for (const node of ids) {
        const i = this.locations.get(node),
          mass = materials[w.cells[i]].density;
        if (rebase) {
          let x = (i % w.width) + w.offsetX[i] + 0.5,
            y = Math.floor(i / w.width) + w.offsetY[i] + 0.5;
          if (w.border === "looping") {
            x = fx + wrapDelta(x - fx, w.width);
            y = fy + wrapDelta(y - fy, w.height);
          }
          w.restX[i] = x;
          w.restY[i] = y;
        }
        body.mass += mass;
        body.friction += materials[w.cells[i]].friction * mass;
        body.restitution += materials[w.cells[i]].restitution * mass;
        body.lx += w.restX[i] * mass;
        body.ly += w.restY[i] * mass;
        this.bodyOf.set(node, body);
      }
      body.lx /= body.mass;
      body.ly /= body.mass;
      body.friction /= body.mass;
      body.restitution /= body.mass;
      for (const node of ids) {
        const i = this.locations.get(node),
          r2 = (w.restX[i] - body.lx) ** 2 + (w.restY[i] - body.ly) ** 2;
        body.inertia += materials[w.cells[i]].density * (r2 + 1 / 6);
        body.radius = Math.max(body.radius, Math.sqrt(r2));
      }
      body.edges = Uint32Array.from(
        ids.filter((node) => this.edgeCounts[this.locations.get(node)] < 4),
      );
      this.bodies.push(body);
    }
    this.fresh.clear();
    this.connections.dirty = true;
    this.dirty = false;
  }
  pose(body) {
    const w = this.world;
    let x = 0,
      y = 0,
      vx = 0,
      vy = 0,
      omega = 0,
      cross = 0,
      dot = 0;
    const first = this.locations.get(body.ids[0]);
    if (first === undefined) return null;
    const fx = (first % w.width) + 0.5 + w.offsetX[first],
      fy = Math.floor(first / w.width) + 0.5 + w.offsetY[first];
    for (const id of body.ids) {
      const i = this.locations.get(id);
      if (i === undefined) return null;
      const m = materials[w.cells[i]].density;
      let px = (i % w.width) + 0.5 + w.offsetX[i],
        py = Math.floor(i / w.width) + 0.5 + w.offsetY[i];
      if (w.border === "looping") {
        px = fx + wrapDelta(px - fx, w.width);
        py = fy + wrapDelta(py - fy, w.height);
      }
      x += px * m;
      y += py * m;
      vx += w.velocityX[i] * m;
      vy += w.velocityY[i] * m;
      omega += (w.angularVelocity[i] * m) / 6;
    }
    x /= body.mass;
    y /= body.mass;
    for (const id of body.ids) {
      const i = this.locations.get(id),
        m = materials[w.cells[i]].density;
      let px = (i % w.width) + 0.5 + w.offsetX[i] - x,
        py = Math.floor(i / w.width) + 0.5 + w.offsetY[i] - y;
      if (w.border === "looping") {
        px = wrapDelta(px, w.width);
        py = wrapDelta(py, w.height);
      }
      const lx = w.restX[i] - body.lx,
        ly = w.restY[i] - body.ly;
      omega += m * (px * w.velocityY[i] - py * w.velocityX[i]);
      cross += m * (lx * py - ly * px);
      dot += m * (lx * px + ly * py);
    }
    return {
      x,
      y,
      angle: Math.atan2(cross, dot),
      vx: vx / body.mass,
      vy: vy / body.mass,
      omega: omega / body.inertia,
    };
  }
  sync(body, p) {
    body.motion = p;
    const w = this.world,
      cos = Math.cos(p.angle),
      sin = Math.sin(p.angle);
    for (const id of body.ids) {
      const i = this.locations.get(id);
      if (i === undefined) continue;
      const lx = w.restX[i] - body.lx,
        ly = w.restY[i] - body.ly,
        rx = cos * lx - sin * ly,
        ry = sin * lx + cos * ly;
      w.velocityX[i] = clamp(p.vx - p.omega * ry, 3.5);
      w.velocityY[i] = clamp(p.vy + p.omega * rx, 3.5);
      w.angularVelocity[i] = p.omega;
    }
  }
  passable(j, body) {
    const w = this.world;
    if (j < 0) return w.border === "void";
    const m = materials[w.cells[j]];
    return (
      !m.id ||
      m.gas ||
      m.category === "liquid" ||
      this.bodyOf.get(w.elasticId[j]) === body
    );
  }
  plan(body, p, contactsOnly = false) {
    const w = this.world,
      cos = Math.cos(p.angle),
      sin = Math.sin(p.angle);
    let hit = null;
    let contacts = null;
    for (let n = 0; n < body.ids.length; n++) {
      const i = this.locations.get(body.ids[n]);
      if (i === undefined) return { i: -1, j: -1 };
      const lx = w.restX[i] - body.lx,
        ly = w.restY[i] - body.ly,
        x = p.x + cos * lx - sin * ly,
        y = p.y + sin * lx + cos * ly,
        gx = Math.floor(x - 1e-6),
        gy = Math.floor(y - 1e-6);
      let j = w.index(gx, gy);
      const oldX = (i % w.width) + 0.5 + w.offsetX[i],
        oldY = Math.floor(i / w.width) + 0.5 + w.offsetY[i],
        ix = Math.floor(oldX - 1e-6),
        iy = Math.floor(oldY - 1e-6);
      let axis = gx !== ix && gy === iy ? 0 : 1;
      // Sweep from the continuous position, not a displaced raster reservation.
      if (gx !== ix && gy !== iy) {
        const sideX = w.index(gx, iy),
          sideY = w.index(ix, gy);
        if (!this.passable(sideX, body)) {
          j = sideX;
          axis = 0;
        } else if (!this.passable(sideY, body)) {
          j = sideY;
          axis = 1;
        }
      }
      if (!this.passable(j, body)) {
        const owner = j >= 0 ? this.bodyOf.get(w.elasticId[j]) : undefined;
        const sign =
          Math.sign(axis === 0 ? x - oldX : y - oldY) ||
          Math.sign(axis === 0 ? p.vx : p.vy) ||
          1;
        contacts ??= [];
        let contact;
        for (let c = 0; c < contacts.length; c++)
          if (
            contacts[c].owner === owner &&
            contacts[c].axis === axis &&
            contacts[c].sign === sign
          ) {
            contact = contacts[c];
            break;
          }
        if (!contact) {
          contact = {
            i,
            j,
            owner,
            axis,
            sign,
            depth: 0,
            count: 0,
            x: 0,
            y: 0,
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity,
          };
          contacts.push(contact);
          hit ??= contact;
        }
        let boundary =
          j >= 0
            ? (axis === 0 ? j % w.width : Math.floor(j / w.width)) +
              (sign < 0 ? 1 : 0)
            : sign > 0
              ? axis === 0
                ? w.width
                : w.height
              : 0;
        if (w.border === "looping") {
          const length = axis === 0 ? w.width : w.height,
            value = axis === 0 ? x : y;
          boundary = value + wrapDelta(boundary - value, length);
        }
        contact.depth = Math.max(
          contact.depth,
          ((axis === 0 ? x : y) - boundary) * sign,
        );
        contact.count++;
        let cx = (i % w.width) + 0.5 + w.offsetX[i],
          cy = Math.floor(i / w.width) + 0.5 + w.offsetY[i];
        if (w.border === "looping") {
          cx = p.x + wrapDelta(cx - p.x, w.width);
          cy = p.y + wrapDelta(cy - p.y, w.height);
        }
        contact.x += cx;
        contact.y += cy;
        contact.minX = Math.min(contact.minX, cx);
        contact.maxX = Math.max(contact.maxX, cx);
        contact.minY = Math.min(contact.minY, cy);
        contact.maxY = Math.max(contact.maxY, cy);
        continue;
      }
      this.targets[n] = j;
      this.targetX[n] = x;
      this.targetY[n] = y;
    }
    if (hit) {
      for (const contact of contacts) {
        contact.x /= contact.count;
        contact.y /= contact.count;
      }
      hit.others = contacts.slice(1);
      return hit;
    }
    if (contactsOnly) return null;
    // Most rejected moves touch a support near the last row of the body. Reserve
    // occupancy only after the physical sweep succeeds, avoiding wasted matching.
    this.raster.begin();
    for (let n = 0; n < body.ids.length; n++)
      if (
        !this.raster.reserve(
          n,
          this.targetX[n],
          this.targetY[n],
          body,
          this.targets[n],
        )
      )
        return { i: this.locations.get(body.ids[n]), j: -1, internal: true };
    return null;
  }
  commit(body, p, sync = true) {
    const w = this.world;
    for (let n = 0; n < body.ids.length; n++) {
      const i = this.locations.get(body.ids[n]),
        j = this.targets[n];
      if (i === undefined) continue;
      if (j < 0) {
        w.set(i, 0);
        continue;
      }
      if (i !== j) w.swap(i, j);
    }
    for (let n = 0; n < body.ids.length; n++) {
      const i = this.locations.get(body.ids[n]);
      if (i === undefined) continue;
      let dx = this.targetX[n] - ((i % w.width) + 0.5),
        dy = this.targetY[n] - (Math.floor(i / w.width) + 0.5);
      if (w.border === "looping") {
        dx = wrapDelta(dx, w.width);
        dy = wrapDelta(dy, w.height);
      }
      w.offsetX[i] = dx;
      w.offsetY[i] = dy;
    }
    if (sync) this.sync(body, p);
  }
  translate(body, dx, dy) {
    const p = this.pose(body);
    if (!p) return false;
    p.x += dx;
    p.y += dy;
    if (this.plan(body, p)) return false;
    p.vx = clamp(dx * 0.3, 2);
    p.vy = clamp(dy * 0.3, 2);
    p.omega = 0;
    this.commit(body, p);
    return true;
  }
  step() {
    stepBodies(this);
  }
}
