import { materials } from "./materials.js";

// An isolated grain sinks freely. A packed bed exchanges only one neighboring
// cell at a time; connected pore volume, viscosity and packing limit the flux.
export function poreExchange(world, i, j) {
  const a = materials[world.cells[i]],
    b = materials[world.cells[j]];
  const grain = a.category === "powder" ? a : b;
  const liquid = a.category === "liquid" ? a : b;
  if (grain.category !== "powder" || liquid.category !== "liquid") return true;
  const g = grain === a ? i : j;
  const x = g % world.width,
    y = Math.floor(g / world.width);
  let packed = 0;
  for (let d = 0; d < 4; d++) {
    const k = world.index(
      x + (d === 0 ? -1 : d === 1 ? 1 : 0),
      y + (d === 2 ? -1 : d === 3 ? 1 : 0),
    );
    const category = k < 0 ? "static" : materials[world.cells[k]].category;
    if (category === "powder" || category === "solid" || category === "static")
      packed++;
  }
  if (!packed) return true;
  if (world.inParticlePass && world.updated[j] === world.tick) return false;
  const densityDrive = Math.min(1, Math.max(0, grain.density - liquid.density));
  const air = world.fields.index(x, y);
  const pressureDrive = Math.min(
    0.5,
    Math.abs(world.fields.pressure[air]) * 0.03,
  );
  const flux =
    ((grain.porosity / (grain.porosity + 1.5)) *
      grain.permeability *
      (0.3 + densityDrive + pressureDrive)) /
    (Math.max(1, liquid.viscosity) * (1 + packed * 2));
  return world.random() < Math.min(0.2, flux);
}

// Reused scratch storage caps each search at 24 visits and six cells of reach.
// A found outlet chooses the first local exchange, never teleports the liquid.
export class PorousFlow {
  constructor(world) {
    this.queue = new Int32Array(24);
    this.first = new Int32Array(24);
    this.depth = new Uint8Array(24);
    this.visited = new Uint32Array(world.length);
    this.epoch = 0;
    this.visits = 0;
  }
  seep(w, i, x, y) {
    const fluid = materials[w.cells[i]];
    if (fluid.category !== "liquid") return false;
    const above = w.relativeIndex(x, y, 0, -1);
    if (above < 0 || materials[w.cells[above]].category !== "powder")
      return false;
    // Deep sealed beds need no outlet search every tick; buoyancy still seeps.
    let target = above;
    if ((w.tick + i) % 4 === 0) {
      this.epoch = (this.epoch + 1) >>> 0 || 1;
      if (this.epoch === 1) this.visited.fill(0);
      this.queue[0] = i;
      this.depth[0] = 0;
      this.first[0] = -1;
      this.visited[i] = this.epoch;
      let head = 0,
        tail = 1,
        found = false;
      const side = w.random() < 0.5 ? -1 : 1;
      while (head < tail && !found) {
        const cell = this.queue[head],
          cx = cell % w.width,
          cy = Math.floor(cell / w.width);
        const depth = this.depth[head],
          first = this.first[head++];
        this.visits++;
        if (depth >= 6) continue;
        for (let d = 0; d < 3; d++) {
          const j = w.relativeIndex(
            cx,
            cy,
            d === 0 ? 0 : d === 1 ? side : -side,
            d === 0 ? -1 : 0,
          );
          if (j < 0 || this.visited[j] === this.epoch) continue;
          this.visited[j] = this.epoch;
          const m = materials[w.cells[j]],
            step = first < 0 ? j : first;
          if (!m.id) {
            target = step;
            found = true;
            break;
          }
          if (
            m.category !== "powder" ||
            !m.permeability ||
            !m.porosity ||
            m.density <= fluid.density + 0.08 ||
            tail >= 24
          )
            continue;
          this.queue[tail] = j;
          this.first[tail] = step;
          this.depth[tail++] = depth + 1;
        }
      }
    }
    if (!w.cells[target]) {
      w.swap(i, target);
      return true;
    }
    const grain = materials[w.cells[target]];
    if (
      grain.category !== "powder" ||
      grain.density <= fluid.density + 0.08 ||
      !grain.permeability ||
      !grain.porosity ||
      !poreExchange(w, i, target)
    )
      return false;
    w.swap(i, target);
    return true;
  }
}
