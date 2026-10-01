import { particleStateFields } from "./sim/particle-state.js";
export function selectionRect(world, a, b = a) {
  const x = Math.max(
      0,
      Math.min(world.width - 1, Math.floor(Math.min(a.x, b.x))),
    ),
    y = Math.max(0, Math.min(world.height - 1, Math.floor(Math.min(a.y, b.y)))),
    right = Math.max(
      0,
      Math.min(world.width - 1, Math.floor(Math.max(a.x, b.x))),
    ),
    bottom = Math.max(
      0,
      Math.min(world.height - 1, Math.floor(Math.max(a.y, b.y))),
    );
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
}
export function copyRegion(world, box, mask = null) {
  const rect = selectionRect(world, box, {
    x: box.x + box.width - 1,
    y: box.y + box.height - 1,
  });
  const arrays = {};
  for (const name of particleStateFields) {
    const source = world[name],
      copy = new source.constructor(rect.width * rect.height);
    for (let row = 0; row < rect.height; row++) {
      const start = (rect.y + row) * world.width + rect.x;
      copy.set(source.subarray(start, start + rect.width), row * rect.width);
    }
    arrays[name] = copy;
  }
  const copiedMask = new Uint8Array(rect.width * rect.height);
  for (let row = 0; row < rect.height; row++)
    for (let col = 0; col < rect.width; col++) {
      const target = row * rect.width + col;
      copiedMask[target] = mask
        ? mask[(rect.y + row) * world.width + rect.x + col]
        : 1;
      if (!copiedMask[target])
        for (const name of particleStateFields) arrays[name][target] = 0;
    }
  return { ...rect, arrays, mask: copiedMask, tick: world.tick };
}
export function pasteRegion(world, clipboard, x, y, replace = false) {
  x = Math.round(x);
  y = Math.round(y);
  let count = 0;
  for (let row = 0; row < clipboard.height; row++)
    for (let col = 0; col < clipboard.width; col++) {
      const nx = x + col,
        ny = y + row,
        source = row * clipboard.width + col,
        id = clipboard.arrays.cells[source];
      if (clipboard.mask && !clipboard.mask[source]) continue;
      if (!id || nx < 0 || nx >= world.width || ny < 0 || ny >= world.height)
        continue;
      const target = ny * world.width + nx;
      if (world.cells[target] && !replace) continue;
      world.set(
        target,
        id,
        clipboard.arrays.temp[source],
        clipboard.arrays.life[source],
      );
      for (const name of particleStateFields)
        world[name][target] = clipboard.arrays[name][source];
      // Electrical tick stamps are relative to the copied moment, rather than the old world clock.
      world.chargedAt[target] = clipboard.arrays.chargedAt[source]
        ? Math.max(
            0,
            world.tick - (clipboard.tick - clipboard.arrays.chargedAt[source]),
          )
        : 0;
      count++;
    }
  return count;
}
// Validate the whole move before clearing any source cells. Overlap is safe:
// all selected particles are captured before their old positions are emptied.
export function canMoveRegion(world, clip, x, y, sourceMask, replace = false) {
  if (
    x < 0 ||
    y < 0 ||
    x + clip.width > world.width ||
    y + clip.height > world.height
  )
    return false;
  if (replace) return true;
  for (let row = 0; row < clip.height; row++)
    for (let col = 0; col < clip.width; col++) {
      const i = row * clip.width + col;
      if (!clip.arrays.cells[i] || (clip.mask && !clip.mask[i])) continue;
      const target = (y + row) * world.width + x + col;
      if (world.cells[target] && !sourceMask[target]) return false;
    }
  return true;
}
export function moveRegion(world, clip, x, y, sourceMask, replace = false) {
  if (!canMoveRegion(world, clip, x, y, sourceMask, replace)) return false;
  for (let row = 0; row < clip.height; row++)
    for (let col = 0; col < clip.width; col++) {
      const source = row * clip.width + col;
      if (!clip.arrays.cells[source] || (clip.mask && !clip.mask[source]))
        continue;
      world.set((clip.y + row) * world.width + clip.x + col, 0);
    }
  pasteRegion(world, clip, x, y, true);
  return true;
}
