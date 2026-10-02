import { canonicalMaterial, materials } from "./materials.js";
import { compositePaint, rgba } from "./paint.js";

// Iterative four-neighbor flood fill: bounded memory even for an empty large world.
// Collect before changing cells, so chemistry/body registration cannot change the boundary.
export function fillRegion(w, x, y, options = {}, beforeChange = () => {}) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || x >= w.width || y < 0 || y >= w.height) return 0;
  const start = y * w.width + x,
    layer = options.layer || "material",
    source = w.cells[start],
    target = canonicalMaterial(options.erase ? 0 : (options.material ?? 0)),
    field = layer === "background" ? w.backgroundPaint : w.pigment,
    oldColor = field[start],
    newColor = options.erase
      ? 0
      : compositePaint(
          oldColor,
          rgba(options.color ?? 0, options.opacity ?? 1),
        );
  if (!["material", "foreground", "background"].includes(layer)) return 0;
  if (layer === "material") {
    if (materials[target]?.actor || materials[target]?.projectile) return 0;
    if (
      !materials[target] ||
      source === target ||
      (source && target && !options.replace)
    )
      return 0;
  } else if (oldColor === newColor || (layer === "foreground" && !source))
    return 0;
  w.fillQueue ??= new Int32Array(w.length);
  w.fillMarks ??= new Uint32Array(w.length);
  w.fillEpoch = (w.fillEpoch + 1) >>> 0 || 1;
  if (w.fillEpoch === 1) w.fillMarks.fill(0);
  const queue = w.fillQueue,
    marks = w.fillMarks,
    epoch = w.fillEpoch;
  let tail = 1;
  queue[0] = start;
  marks[start] = epoch;
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    w.eachNeighbor(i % w.width, Math.floor(i / w.width), (j) => {
      if (marks[j] === epoch) return;
      const matches =
        layer === "material"
          ? w.cells[j] === source
          : field[j] === oldColor &&
            (layer === "background" || w.cells[j] === source);
      if (matches) {
        marks[j] = epoch;
        queue[tail++] = j;
      }
    });
  }
  beforeChange();
  for (let n = 0; n < tail; n++) {
    const i = queue[n];
    if (layer === "material") w.set(i, target);
    else field[i] = newColor;
  }
  return tail;
}
