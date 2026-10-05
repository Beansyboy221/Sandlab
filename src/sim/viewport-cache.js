import { particleStateFields } from "./particle-state.js";

export const detailFields = ["detailRef", "detailX", "detailY"];
export const DEFAULT_CACHE_MB = 16;
const fields = [...particleStateFields, "backgroundPaint"];

// One record per visited viewport, not per particle. Array bytes and record
// overhead count toward the limit; zero/default planes need no allocation.
export class ViewportCache {
  constructor(megabytes = DEFAULT_CACHE_MB) {
    this.entries = new Map();
    this.nextId = 1;
    this.bytes = 0;
    this.evictions = 0;
    this.setLimit(megabytes);
  }
  setLimit(megabytes) {
    this.limit = Math.max(0, Math.min(64, Number(megabytes) || 0)) * 1048576;
    this.trim();
  }
  trim() {
    while (this.bytes > this.limit && this.entries.size) {
      const [id, entry] = this.entries.entries().next().value;
      this.entries.delete(id);
      this.bytes -= entry.bytes;
      this.evictions++;
    }
  }
  get(id) {
    const entry = this.entries.get(id);
    if (!entry) return null;
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry;
  }
  capture(w, mask) {
    if (!this.limit || !mask) return null;
    const selected = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) selected.push(i);
    if (!selected.length) return null;
    const indices = Uint32Array.from(selected),
      arrays = {};
    let bytes = 4096 + indices.byteLength;
    for (const key of fields) {
      const defaultValue = key === "temp" ? 20 : key === "quantity" ? 1 : 0;
      if (!selected.some((i) => w[key][i] !== defaultValue)) continue;
      bytes += indices.length * w[key].BYTES_PER_ELEMENT;
      if (bytes > this.limit) return null;
      arrays[key] = new w[key].constructor(indices.length);
      for (let i = 0; i < indices.length; i++)
        arrays[key][i] = w[key][indices[i]];
    }
    const entry = {
      id: this.nextId++,
      width: w.width,
      height: w.height,
      pitch: w.metersPerPixel,
      x: w.viewOriginX,
      y: w.viewOriginY,
      tick: w.tick,
      arrays,
      indices,
      bytes,
    };
    this.entries.set(entry.id, entry);
    this.bytes += bytes;
    this.trim();
    return entry;
  }
  // Chronological order stays separate from LRU order: recently used old data
  // must not overwrite a newer edit when revisiting an offscreen location.
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
export function cachedValue(entry, key, i) {
  if (i < 0 || i >= entry.width * entry.height)
    return key === "temp" ? 20 : key === "quantity" ? 1 : 0;
  let lo = 0,
    hi = entry.indices.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1,
      index = entry.indices[mid];
    if (index === i)
      return (
        entry.arrays[key]?.[mid] ??
        (key === "temp" ? 20 : key === "quantity" ? 1 : 0)
      );
    if (index < i) lo = mid + 1;
    else hi = mid - 1;
  }
  return key === "temp" ? 20 : key === "quantity" ? 1 : 0;
}
