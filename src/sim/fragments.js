import { materials } from "./materials.js";
export class Fragments {
  constructor(world) {
    this.world = world;
    this.dirty = false;
  }
  mark(i) {
    if (i >= 0) {
      this.world.damage[i] = Math.max(0.001, this.world.damage[i]);
      this.dirty = true;
    }
  }
  removal(i) {
    const w = this.world;
    for (let d = 0; d < 4; d++) {
      const id = w["bond" + d][i];
      const j = w.elastic.locations.get(id) ?? w.rigid.locations.get(id);
      if (j !== undefined) this.mark(j);
    }
    this.dirty = true;
  }
  convert(i) {
    const w = this.world,
      m = materials[w.cells[i]];
    if (m.fragmentTo === undefined || w.elasticAnchor[i]) return;
    const temp = w.temp[i],
      life = w.life[i],
      pigment = w.pigment[i],
      variant = w.variant[i],
      charge = w.charge[i],
      cooldown = w.cooldown[i],
      residue = w.residue[i],
      ox = w.offsetX[i],
      oy = w.offsetY[i],
      vx = w.velocityX[i],
      vy = w.velocityY[i];
    w.set(i, m.fragmentTo, temp, life);
    w.pigment[i] = pigment;
    w.variant[i] = variant;
    w.charge[i] = charge;
    w.cooldown[i] = cooldown;
    w.residue[i] = residue;
    w.offsetX[i] = ox;
    w.offsetY[i] = oy;
    w.velocityX[i] = vx;
    w.velocityY[i] = vy;
  }
  step() {
    if (!this.dirty || !this.world.mechanics.fragmentParticles) return;
    this.dirty = false;
    const w = this.world,
      pending = [];
    if (w.rigid.dirty) w.rigid.rebuild();
    for (const body of w.rigid.bodies)
      if (
        body.ids.length <= 3 &&
        body.ids.some((id) => w.damage[w.rigid.locations.get(id)] > 0)
      )
        for (const id of body.ids) pending.push(w.rigid.locations.get(id));
    const groups = new Map();
    for (const i of w.elastic.locations.values()) {
      const key = w.elastic.components[i] || w.elasticId[i];
      let g = groups.get(key);
      if (!g) {
        g = [];
        groups.set(key, g);
      }
      g.push(i);
    }
    for (const group of groups.values())
      if (group.length <= 3 && group.some((i) => w.damage[i] > 0))
        pending.push(...group);
    for (const i of pending) this.convert(i);
    // Conversion removes topology. Pending large pieces keep their damage marks
    // so another cut can simplify them without losing the original material.
    this.dirty = false;
  }
}
