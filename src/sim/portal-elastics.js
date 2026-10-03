import { PORTAL_COOLDOWN } from "./portals.js";
import { rotateMotion } from "./portal-geometry.js";
import { portalContact } from "./portal-transport.js";

// Elastic networks move atomically, keeping bonds and tension. Work is linear
// in live nodes plus at most two component traversals per tick, never pairwise.
export function transportElastics(solver) {
  const w = solver.world;
  if (!w.portals.locations.size || !solver.locations.size) return;
  const attempted = new Set();
  let adjacency;
  let attempts = 0;
  for (const [id, i] of solver.locations) {
    if (w.portalCooldown[i] || attempted.has(id) || w.elasticAnchor[i])
      continue;
    const x = (i % w.width) + 0.5 + w.offsetX[i],
      y = Math.floor(i / w.width) + 0.5 + w.offsetY[i];
    const vx = w.velocityX[i] + w.gravityX * 0.12,
      vy = w.velocityY[i] + w.gravityY * 0.12;
    const contact = portalContact(w, x, y, vx, vy, 0.4);
    if (contact < 0) continue;
    if (++attempts > 2) break;
    const nodes = [],
      ids = new Set([id]),
      queue = [id];
    // Spring links are stored once, so build reverse adjacency only when needed.
    if (!adjacency) {
      adjacency = new Map();
      for (const [node, cell] of solver.locations)
        for (const bonds of solver.bonds) {
          const other = bonds[cell];
          if (!other || !solver.locations.has(other)) continue;
          if (!adjacency.has(node)) adjacency.set(node, []);
          if (!adjacency.has(other)) adjacency.set(other, []);
          adjacency.get(node).push(other);
          adjacency.get(other).push(node);
        }
    }
    let cx = 0,
      cy = 0;
    for (let n = 0; n < queue.length; n++) {
      const node = queue[n],
        cell = solver.locations.get(node);
      attempted.add(node);
      nodes.push(cell);
      cx += (cell % w.width) + 0.5 + w.offsetX[cell];
      cy += Math.floor(cell / w.width) + 0.5 + w.offsetY[cell];
      for (const other of adjacency.get(node) || [])
        if (!ids.has(other)) {
          ids.add(other);
          queue.push(other);
        }
    }
    cx /= nodes.length;
    cy /= nodes.length;
    let radius = 0.5;
    for (const cell of nodes)
      radius = Math.max(
        radius,
        Math.hypot(
          (cell % w.width) + 0.5 + w.offsetX[cell] - cx,
          Math.floor(cell / w.width) + 0.5 + w.offsetY[cell] - cy,
        ) + 0.5,
      );
    const route = w.portals.route(contact, cx, cy, vx, vy, radius);
    if (!route || nodes.some((cell) => w.elasticAnchor[cell])) continue;
    const targets = [],
      occupied = new Set();
    let valid = true;
    for (const cell of nodes) {
      const [dx, dy] = rotateMotion(
        route,
        (cell % w.width) + 0.5 + w.offsetX[cell] - cx,
        Math.floor(cell / w.width) + 0.5 + w.offsetY[cell] - cy,
      );
      const nx = route.x + dx,
        ny = route.y + dy,
        j = w.index(Math.floor(nx), Math.floor(ny));
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= w.width ||
        ny >= w.height ||
        j < 0 ||
        w.cells[j] ||
        occupied.has(j)
      ) {
        valid = false;
        break;
      }
      occupied.add(j);
      targets.push({ j, x: nx, y: ny });
    }
    if (!valid) continue;
    for (let n = 0; n < nodes.length; n++) {
      const cell = nodes[n],
        { j, x: nx, y: ny } = targets[n];
      const [dx, dy] = rotateMotion(
        route,
        w.velocityX[cell],
        w.velocityY[cell],
      );
      w.swap(cell, j);
      w.offsetX[j] = nx - ((j % w.width) + 0.5);
      w.offsetY[j] = ny - (Math.floor(j / w.width) + 0.5);
      w.velocityX[j] = dx;
      w.velocityY[j] = dy;
      w.elasticAnchor[j] = 0;
      w.portalCooldown[j] = PORTAL_COOLDOWN;
    }
    solver.topologyDirty = true;
  }
}
