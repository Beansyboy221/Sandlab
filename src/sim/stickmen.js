import { materials } from "./materials.js";
import {
  restX,
  restY,
  links,
  bodyFields,
  integrateBody,
  blocked,
} from "./stickman-body.js";
import { StickmanPathfinder } from "./stickman-pathfinding.js";
export const MAX_STICKMEN = 32;
const segmentDistance = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax,
    dy = by - ay,
    t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};

export class Stickmen {
  constructor(world) {
    this.world = world;
    this.bodies = [];
    this.nextId = 1;
    this.controls = { move: 0, jump: false, crouch: false };
    this.planner = new StickmanPathfinder(world);
  }
  get player() {
    return this.bodies.find(
      (a) => materials[a.material].actor === "player" && a.alive,
    );
  }
  spawn(x, y, material) {
    if (
      !materials[material]?.actor ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      this.bodies.length >= MAX_STICKMEN
    )
      return false;
    const w = this.world,
      gx = w.gravityX,
      gy = w.gravityY;
    if (materials[material].actor === "player" && this.player) return false;
    if (
      this.bodies.some(
        (a) => Math.hypot(a.x[2] - x + gx * 5, a.y[2] - y + gy * 5) < 10,
      )
    )
      return false;
    const a = {
      id: this.nextId++,
      material,
      alive: true,
      health: 100,
      grounded: false,
      cooldown: 0,
      bonds: new Uint8Array(8).fill(1),
      path: [],
      goal: null,
      replan: 0,
      direction: 1,
      color: materials[material].color,
    };
    for (const f of bodyFields) a[f] = new Float32Array(9);
    for (let n = 0; n < 9; n++) {
      a.x[n] = x + gy * restX[n] + gx * restY[n];
      a.y[n] = y - gx * restX[n] + gy * restY[n];
      if (
        a.x[n] < 2 ||
        a.x[n] >= w.width - 2 ||
        a.y[n] < 2 ||
        a.y[n] >= w.height - 2 ||
        blocked(w, a.x[n], a.y[n])
      )
        return false;
      a.px[n] = a.x[n];
      a.py[n] = a.y[n];
      a.heat[n] = 37;
      a.fuel[n] = 100;
    }
    this.bodies.push(a);
    return true;
  }
  hit(x, y, radius = 2) {
    return this.bodies.find(
      (a) =>
        a.x.some(
          (px, n) =>
            Math.hypot(px - x, a.y[n] - y) <= radius + (n === 0 ? 1.5 : 0.7),
        ) ||
        links.some(
          ([u, v], k) =>
            a.bonds[k] &&
            segmentDistance(x, y, a.x[u], a.y[u], a.x[v], a.y[v]) <= radius,
        ),
    );
  }
  brush(tool, x, y, radius, dx = 0, dy = 0, power = 1, shape = "circle") {
    if (!this.bodies.length) return;
    for (const a of this.bodies) {
      for (let n = 0; n < 9; n++) {
        const inBrush =
          shape === "square"
            ? Math.max(Math.abs(a.x[n] - x), Math.abs(a.y[n] - y)) <= radius + 1
            : Math.hypot(a.x[n] - x, a.y[n] - y) <= radius + 1;
        if (!inBrush) continue;
        if (tool === "grab") {
          a.x[n] += dx;
          a.y[n] += dy;
          a.px[n] += dx;
          a.py[n] += dy;
        }
        if (tool === "fan") {
          a.px[n] -= dx * 0.4 * power;
          a.py[n] -= dy * 0.4 * power;
        }
        if (tool === "warm" || tool === "cool")
          a.heat[n] = Math.max(
            -250,
            Math.min(6000, a.heat[n] + (tool === "warm" ? 12 : -12) * power),
          );
      }
      if (tool === "erase" || tool === "erase-mobile") {
        for (let k = 0; k < links.length; k++) {
          const [u, v] = links[k];
          if (
            segmentDistance(x, y, a.x[u], a.y[u], a.x[v], a.y[v]) <=
            radius + 0.6
          )
            a.bonds[k] = 0;
        }
        if (Math.hypot(a.x[0] - x, a.y[0] - y) <= radius + 1.5) a.remove = true;
        if (!a.bonds[0] || !a.bonds[1]) a.alive = false;
      }
    }
    this.bodies = this.bodies.filter((a) => !a.remove);
  }
  step() {
    const w = this.world;
    if (!this.bodies.length) {
      this.controls.jump = false;
      return;
    }
    this.planner.world = w;
    let plans = 0;
    for (const a of this.bodies) {
      let move = 0,
        jump = false,
        crouch = false;
      if (a.alive && materials[a.material].actor === "player") {
        ({ move, jump, crouch } = this.controls);
      } else if (a.alive && a.grounded) {
        const foot = { x: (a.x[5] + a.x[6]) / 2, y: (a.y[5] + a.y[6]) / 2 };
        if (w.tick >= a.replan && plans < 1) {
          plans++;
          const player = this.player;
          a.goal = player
            ? {
                x: (player.x[5] + player.x[6]) / 2,
                y: (player.y[5] + player.y[6]) / 2,
              }
            : {
                x: foot.x + w.gravityY * a.direction * 45,
                y: foot.y - w.gravityX * a.direction * 45,
              };
          a.path = this.planner.find(foot, a.goal);
          a.replan = w.tick + 45 + (a.id % 15);
          if (a.path.length < 2) a.direction *= -1;
        }
        while (
          a.path.length &&
          Math.hypot(a.path[0].x - foot.x, a.path[0].y - foot.y) < 3.5
        )
          a.path.shift();
        if (a.path.length) {
          const p = a.path[0],
            across = (p.x - foot.x) * w.gravityY - (p.y - foot.y) * w.gravityX;
          move = Math.sign(across);
          jump = !!p.jump && a.grounded;
        }
      }
      integrateBody(w, a, move, jump, crouch);
      if (w.border === "looping") {
        const x = a.x[2],
          y = a.y[2],
          dx = x < 0 ? w.width : x >= w.width ? -w.width : 0,
          dy = y < 0 ? w.height : y >= w.height ? -w.height : 0;
        if (dx || dy)
          for (let n = 0; n < 9; n++) {
            a.x[n] += dx;
            a.px[n] += dx;
            a.y[n] += dy;
            a.py[n] += dy;
          }
      }
      if (
        w.border === "void" &&
        (a.x[2] < -20 ||
          a.y[2] < -20 ||
          a.x[2] > w.width + 20 ||
          a.y[2] > w.height + 20)
      )
        a.remove = true;
    }
    // Heads and torsos exchange motion when characters collide.
    for (let i = 0; i < this.bodies.length; i++)
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i],
          b = this.bodies[j];
        for (let n = 0; n < 3; n++) {
          const dx = b.x[n] - a.x[n],
            dy = b.y[n] - a.y[n],
            d = Math.hypot(dx, dy);
          if (d > 0 && d < 2.5) {
            const f = ((2.5 - d) / d) * 0.5;
            a.x[n] -= dx * f;
            a.y[n] -= dy * f;
            b.x[n] += dx * f;
            b.y[n] += dy * f;
          }
        }
      }
    this.bodies = this.bodies.filter((a) => !a.remove);
    this.controls.jump = false;
  }
  snapshot() {
    return this.bodies.map((a) => ({
      id: a.id,
      material: a.material,
      alive: a.alive,
      health: a.health,
      color: a.color,
      bonds: Array.from(a.bonds),
      ...Object.fromEntries(bodyFields.map((f) => [f, Array.from(a[f])])),
    }));
  }
  restore(data = []) {
    this.bodies = data.map((d) => ({
      id: d.id,
      material: d.material,
      alive: d.alive,
      health: d.health,
      color: d.color,
      grounded: false,
      cooldown: 0,
      replan: 0,
      direction: 1,
      path: [],
      goal: null,
      bonds: Uint8Array.from(d.bonds),
      ...Object.fromEntries(
        bodyFields.map((f) => [f, Float32Array.from(d[f])]),
      ),
    }));
    this.nextId = Math.max(0, ...this.bodies.map((a) => a.id)) + 1;
    this.controls = { move: 0, jump: false, crouch: false };
  }
}

export function validateStickmen(data) {
  if (data === undefined) return;
  if (!Array.isArray(data) || data.length > MAX_STICKMEN)
    throw Error("Invalid stickman count.");
  const ids = new Set();
  let players = 0;
  for (const a of data) {
    if (
      !a ||
      !Number.isSafeInteger(a.id) ||
      a.id < 1 ||
      a.id > 1000000 ||
      ids.has(a.id) ||
      !Number.isInteger(a.material) ||
      !materials[a.material]?.actor ||
      typeof a.alive !== "boolean" ||
      !Number.isFinite(a.health) ||
      a.health < 0 ||
      a.health > 100 ||
      !/^#[0-9a-f]{6}$/i.test(a.color) ||
      !Array.isArray(a.bonds) ||
      a.bonds.length !== 8 ||
      a.bonds.some((v) => v !== 0 && v !== 1)
    )
      throw Error("Invalid stickman body.");
    if (materials[a.material].actor === "player" && a.alive && ++players > 1)
      throw Error("Only one live player is supported.");
    ids.add(a.id);
    for (const f of bodyFields)
      if (
        !Array.isArray(a[f]) ||
        a[f].length !== 9 ||
        a[f].some(
          (v) =>
            !Number.isFinite(v) ||
            (f === "heat"
              ? v < -250 || v > 6000
              : f === "fuel"
                ? v < 0 || v > 100
                : Math.abs(v) > 2048),
        )
      )
        throw Error("Invalid stickman joints.");
  }
}
