import { materials, M } from "./materials.js";
import { collide } from "./body-collisions.js";

export const rigidFields = ["restX", "restY", "angularVelocity", "damage"];
const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];
const neighbors = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
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
    this.parents = new Int32Array(world.length);
    this.reservations = new Uint32Array(world.length);
    this.epoch = 0;
    this.targets = new Int32Array(world.length);
    this.targetX = new Float64Array(world.length);
    this.targetY = new Float64Array(world.length);
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
    for (const i of this.locations.values()) parent[i] = i;
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
          w["bond" + d][i] = 0;
          continue;
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
        body.lx += w.restX[i] * mass;
        body.ly += w.restY[i] * mass;
        this.bodyOf.set(node, body);
      }
      body.lx /= body.mass;
      body.ly /= body.mass;
      for (const node of ids) {
        const i = this.locations.get(node),
          r2 = (w.restX[i] - body.lx) ** 2 + (w.restY[i] - body.ly) ** 2;
        body.inertia += materials[w.cells[i]].density * (r2 + 1 / 6);
        body.radius = Math.max(body.radius, Math.sqrt(r2));
      }
      this.bodies.push(body);
    }
    this.fresh.clear();
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
      omega += w.angularVelocity[i] * m;
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
      cross += m * (lx * py - ly * px);
      dot += m * (lx * px + ly * py);
    }
    return {
      x,
      y,
      angle: Math.atan2(cross, dot),
      vx: vx / body.mass,
      vy: vy / body.mass,
      omega: omega / body.mass,
    };
  }
  sync(body, p) {
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
  plan(body, p) {
    const w = this.world,
      cos = Math.cos(p.angle),
      sin = Math.sin(p.angle);
    this.epoch = (this.epoch + 1) >>> 0 || 1;
    if (this.epoch === 1) this.reservations.fill(0);
    let hit = null;
    for (let n = 0; n < body.ids.length; n++) {
      const i = this.locations.get(body.ids[n]);
      if (i === undefined) return { i: -1, j: -1 };
      const lx = w.restX[i] - body.lx,
        ly = w.restY[i] - body.ly,
        x = p.x + cos * lx - sin * ly,
        y = p.y + sin * lx + cos * ly,
        gx = Math.floor(x),
        gy = Math.floor(y);
      let j = w.index(gx, gy);
      const ix = i % w.width,
        iy = Math.floor(i / w.width);
      // Swept corner contacts prevent diagonal movement escaping a closed box.
      if (gx !== ix && gy !== iy) {
        const sideX = w.index(gx, iy),
          sideY = w.index(ix, gy);
        if (!this.passable(sideX, body)) j = sideX;
        else if (!this.passable(sideY, body)) j = sideY;
      }
      if (!this.passable(j, body)) {
        hit ??= {
          i,
          j,
          count: 0,
          x: 0,
          y: 0,
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
        };
        hit.count++;
        hit.x += (i % w.width) + 0.5 + w.offsetX[i];
        const cx = (i % w.width) + 0.5 + w.offsetX[i],
          cy = Math.floor(i / w.width) + 0.5 + w.offsetY[i];
        hit.y += cy;
        hit.minX = Math.min(hit.minX, cx);
        hit.maxX = Math.max(hit.maxX, cx);
        hit.minY = Math.min(hit.minY, cy);
        hit.maxY = Math.max(hit.maxY, cy);
        continue;
      }
      if (j >= 0 && this.reservations[j] === this.epoch) {
        let best = -1,
          distance = Infinity;
        // Rotation can round two attached pixels to one cell. Reserve the closest
        // unoccupied raster cell; the continuous rendered shape never deforms.
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const k = w.index(gx + dx, gy + dy),
              d = (gx + dx + 0.5 - x) ** 2 + (gy + dy + 0.5 - y) ** 2;
            if (
              k >= 0 &&
              this.reservations[k] !== this.epoch &&
              this.passable(k, body) &&
              d < distance
            ) {
              best = k;
              distance = d;
            }
          }
        if (best < 0) return { i, j: -1, internal: true };
        j = best;
      }
      if (j >= 0) this.reservations[j] = this.epoch;
      this.targets[n] = j;
      this.targetX[n] = x;
      this.targetY[n] = y;
    }
    if (hit) {
      hit.x /= hit.count;
      hit.y /= hit.count;
    }
    return hit;
  }
  commit(body, p) {
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
    this.sync(body, p);
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
    const w = this.world;
    if (this.dirty) this.rebuild();
    for (const body of this.bodies) {
      const p = this.pose(body);
      if (!p) continue;
      let liquid = 0,
        contacts = 0,
        pressureX = 0,
        pressureY = 0,
        rooted = false;
      for (const id of body.ids) {
        const i = this.locations.get(id),
          x = i % w.width,
          y = Math.floor(i / w.width);
        pressureX +=
          w.fields.sample((x >> 2) - 1, y >> 2) -
          w.fields.sample((x >> 2) + 1, y >> 2);
        pressureY +=
          w.fields.sample(x >> 2, (y >> 2) - 1) -
          w.fields.sample(x >> 2, (y >> 2) + 1);
        for (const [dx, dy] of neighbors) {
          const j = w.index(x + dx, y + dy);
          if (j < 0 || this.bodyOf.get(w.elasticId[j]) === body) continue;
          contacts++;
          if (materials[w.cells[j]].category === "liquid")
            liquid += materials[w.cells[j]].density;
          if (
            w.cells[i] === M.Plant &&
            (w.cells[j] === M.Dirt || w.cells[j] === M.Mud)
          )
            rooted = true;
        }
      }
      if (rooted) {
        p.vx = p.vy = p.omega = 0;
        this.sync(body, p);
        continue;
      }
      const buoyancy = contacts
          ? liquid / contacts / (body.mass / body.ids.length)
          : 0,
        gravity = 0.16 * (1 - buoyancy),
        drag = liquid ? 0.96 : 0.999;
      p.vx = clamp(
        (p.vx + gravity * w.gravityX + (pressureX * 0.012) / body.mass) * drag,
        2.5,
      );
      p.vy = clamp(
        (p.vy + gravity * w.gravityY + (pressureY * 0.012) / body.mass) * drag,
        2.5,
      );
      p.omega = clamp(
        p.omega * 0.995,
        Math.min(0.12, 1.5 / Math.max(1, body.radius)),
      );
      const steps = Math.max(
          1,
          Math.ceil(
            (Math.hypot(p.vx, p.vy) + Math.abs(p.omega) * body.radius) / 0.4,
          ),
        ),
        dt = 1 / steps;
      for (let n = 0; n < steps; n++) {
        const next = {
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            angle: p.angle + p.omega * dt,
          },
          hit = this.plan(body, next);
        if (!hit) {
          this.commit(body, next);
          Object.assign(p, next);
        } else {
          collide(
            this,
            body,
            p,
            hit,
            p.vx - p.omega * (Math.floor(hit.i / w.width) + 0.5 - p.y),
            p.vy + p.omega * ((hit.i % w.width) + 0.5 - p.x),
          );
          if (this.dirty) {
            this.sync(body, p);
            break;
          }
          // Tangential motion and rotation remain live at contact, allowing a
          // supported beam to topple instead of becoming an immobile pile.
          for (const axis of ["x", "y", "angle"]) {
            const amount =
              (axis === "x" ? p.vx : axis === "y" ? p.vy : p.omega) * dt;
            if (Math.abs(amount) < 0.00001) continue;
            const slide = { ...p, [axis]: p[axis] + amount };
            if (!this.plan(body, slide)) {
              this.commit(body, slide);
              Object.assign(p, slide);
            }
          }
          this.sync(body, p);
        }
      }
    }
  }
}
