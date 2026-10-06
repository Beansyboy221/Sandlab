import { CELL_METERS } from "./world-units.js";
import { energize } from "./electrical-energy.js";
import { conducts } from "./oxidation.js";
import { materials } from "./materials.js";
// Output follows the Facing control. A is behind, B is on the left of that heading.
const directions = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
export const circuitDirection = (heading) =>
  directions[Math.round(heading / 2) % 4];
export function circuitOutput(material, state) {
  if (
    !material.circuit ||
    material.circuit === "lamp" ||
    material.circuit === "fan"
  )
    return false;
  return (
    material.circuit === "battery" ||
    Boolean(state & (material.circuit === "delay" ? 2048 : 1))
  );
}
export class Circuits {
  constructor(world) {
    this.world = world;
    this.locations = new Set();
    this.signals = new Uint8Array(world.length);
  }
  register(i, id) {
    if (materials[id].circuit) this.locations.add(i);
    else this.locations.delete(i);
  }
  rebuild(world) {
    this.world = world;
    this.locations.clear();
    if (this.signals.length !== world.length)
      this.signals = new Uint8Array(world.length);
    for (let i = 0; i < world.length; i++)
      if (materials[world.cells[i]].circuit) this.locations.add(i);
  }
  input(x, y, target) {
    const w = this.world,
      j = w.index(x, y);
    if (j < 0) return false;
    const m = materials[w.cells[j]];
    if (m.electricalArc) return true;
    if (!m.circuit) return conducts(w, j) && Boolean(this.signals[j]);
    const [dx, dy] = circuitDirection(w.heading[j]);
    return (
      Boolean(this.signals[j]) &&
      w.index((j % w.width) + dx, Math.floor(j / w.width) + dy) === target
    );
  }
  energize(j, energy) {
    const w = this.world;
    if (j >= 0 && conducts(w, j) && !w.cooldown[j]) {
      energize(w, j, energy);
    }
  }
  step() {
    if (!this.locations.size) return;
    const w = this.world;
    // Snapshot inputs before updating any gate, so scan order cannot change truth tables.
    this.signals.set(w.charge);
    for (const i of this.locations)
      this.signals[i] = Number(circuitOutput(materials[w.cells[i]], w.life[i]));
    for (const i of this.locations) {
      const m = materials[w.cells[i]],
        rule = m.circuit;
      if (!rule) {
        this.locations.delete(i);
        continue;
      }
      const x = i % w.width,
        y = Math.floor(i / w.width),
        [dx, dy] = circuitDirection(w.heading[i]);
      const a = this.input(x - dx, y - dy, i),
        b = this.input(x + dy, y - dx, i);
      const state = w.life[i];
      if (rule === "and") w.life[i] = Number(a && b);
      else if (rule === "or") w.life[i] = Number(a || b);
      else if (rule === "xor") w.life[i] = Number(a !== b);
      else if (rule === "not") w.life[i] = Number(!a);
      else if (rule === "toggle")
        w.life[i] =
          ((state & 1) ^ Number(a && !(state & 2))) | (Number(a) << 1);
      else if (rule === "delay") w.life[i] = ((state << 1) | Number(a)) & 4095;
      else if (rule === "battery") w.life[i] = 1;
      else w.life[i] = Number(a);
      if (circuitOutput(m, w.life[i]))
        this.energize(
          w.index(x + dx, y + dy),
          (w.electricalSupply[i] || m.pulseEnergy || 6) *
            w.quantity[i] *
            (w.metersPerPixel / CELL_METERS) ** 2,
        );
      if (rule === "fan" && a) this.fan(x, y, dx, dy);
    }
  }
  fan(x, y, dx, dy) {
    if (this.world.mechanics.pressureSimulation === false) return;
    const w = this.world;
    for (let d = 1; d <= 16; d++) {
      const j = w.index(x + dx * d, y + dy * d);
      if (j < 0) break;
      const m = materials[w.cells[j]];
      if (m.rigid) {
        w.velocityX[j] += dx * 0.08;
        w.velocityY[j] += dy * 0.08;
        break;
      }
      if (w.cells[j] && !m.movable) break;
      if (w.cells[j] && w.updated[j] !== w.tick) {
        const next = w.index(x + dx * (d + 1), y + dy * (d + 1));
        if (next >= 0 && !w.cells[next]) w.swap(j, next);
      }
      w.fields.airflow.impulse(w.fields, x + dx * d, y + dy * d, dx, dy, 0.6);
    }
  }
}
