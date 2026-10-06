import { materials } from "./materials.js";
import { CELL_METERS, MAX_PARTICLE_QUANTITY } from "./world-units.js";

export const OVERVIEW_SIZE = 128;
export const summaryFields = [
  "cells",
  "temp",
  "quantity",
  "life",
  "pigment",
  "backgroundPaint",
  "velocityX",
  "velocityY",
  "storedLiquid",
  "storedAmount",
  "dissolvedId",
  "dissolvedAmount",
  "oxidationLevel",
];
const FloatFields = new Set(["temp", "quantity", "velocityX", "velocityY"]);
const typeFor = (key) =>
  FloatFields.has(key)
    ? Float32Array
    : ["pigment", "backgroundPaint"].includes(key)
      ? Uint32Array
      : key === "life"
        ? Uint16Array
        : Uint8Array;
const defaultFor = (key) => (key === "temp" ? 20 : key === "quantity" ? 1 : 0);
const massAt = (source, i, quantity = true) => {
  const host = materials[source.cells[i]];
  if (!host.id) return 0;
  return (
    ((host.density > 0 ? host.density : 1) +
      (source.storedAmount?.[i] ?? 0) *
        materials[source.storedLiquid?.[i] ?? 0].density +
      (source.dissolvedAmount?.[i] ?? 0) *
        materials[source.dissolvedId?.[i] ?? 0].density) *
    (quantity ? (source.quantity?.[i] ?? 1) : 1)
  );
};

// The always-retained overview has a fixed size, regardless of distance traveled.
// It is a reconstruction source, never a second, offscreen simulation.
export class ViewportOverview {
  constructor(w) {
    this.width = this.height = OVERVIEW_SIZE;
    this.pitch =
      w.metersPerPixel *
      2 ** Math.ceil(Math.log2(Math.max(w.width, w.height) / 64));
    this.x =
      w.viewOriginX +
      (w.width * w.metersPerPixel) / 2 -
      (this.width * this.pitch) / 2;
    this.y =
      w.viewOriginY +
      (w.height * w.metersPerPixel) / 2 -
      (this.height * this.pitch) / 2;
    this.arrays = Object.fromEntries(
      summaryFields.map((key) => [
        key,
        new (typeFor(key))(this.width * this.height).fill(defaultFor(key)),
      ]),
    );
    this.actors = [];
    this.missiles = [];
    this.events = [];
  }
  contains(x, y) {
    return (
      x >= this.x &&
      y >= this.y &&
      x < this.x + this.width * this.pitch &&
      y < this.y + this.height * this.pitch
    );
  }
  index(x, y) {
    return this.contains(x, y)
      ? Math.floor((y - this.y) / this.pitch) * this.width +
          Math.floor((x - this.x) / this.pitch)
      : -1;
  }
  grow(w) {
    const right = w.viewOriginX + w.width * w.metersPerPixel,
      bottom = w.viewOriginY + w.height * w.metersPerPixel;
    for (
      let pass = 0;
      pass < 24 &&
      (!this.contains(w.viewOriginX, w.viewOriginY) ||
        !this.contains(right - 1e-8, bottom - 1e-8));
      pass++
    ) {
      const old = {
        x: this.x,
        y: this.y,
        pitch: this.pitch,
        arrays: this.arrays,
      };
      const minX = Math.min(this.x, w.viewOriginX),
        maxX = Math.max(this.x + this.width * this.pitch, right),
        minY = Math.min(this.y, w.viewOriginY),
        maxY = Math.max(this.y + this.height * this.pitch, bottom);
      this.pitch *= 2;
      this.x = (minX + maxX) / 2 - (this.width * this.pitch) / 2;
      this.y = (minY + maxY) / 2 - (this.height * this.pitch) / 2;
      this.arrays = Object.fromEntries(
        summaryFields.map((key) => [
          key,
          new (typeFor(key))(this.width * this.height).fill(defaultFor(key)),
        ]),
      );
      // Each prior representative covers a square area, rather than becoming
      // a full cell at the larger pitch and manufacturing more material.
      const totals = new Float64Array(this.width * this.height),
        best = new Float64Array(totals.length);
      for (let i = 0; i < totals.length; i++) {
        const j = this.index(
          old.x + ((i % this.width) + 0.5) * old.pitch,
          old.y + (Math.floor(i / this.width) + 0.5) * old.pitch,
        );
        if (j < 0) continue;
        const m = massAt(old.arrays, i) / 4;
        totals[j] += m;
        if (m > best[j]) {
          best[j] = m;
          for (const key of summaryFields)
            this.arrays[key][j] = old.arrays[key][i];
        }
      }
      for (let i = 0; i < totals.length; i++)
        if (this.arrays.cells[i])
          this.arrays.quantity[i] =
            totals[i] / Math.max(1e-8, massAt(this.arrays, i, false));
    }
  }
  update(w) {
    this.grow(w);
    const totals = new Float64Array(this.width * this.height),
      best = new Float64Array(totals.length),
      touched = new Uint8Array(totals.length);
    const ratio = (w.metersPerPixel / this.pitch) ** 2;
    for (let i = 0; i < w.length; i++) {
      const j = this.index(
        w.viewOriginX + ((i % w.width) + 0.5) * w.metersPerPixel,
        w.viewOriginY + (Math.floor(i / w.width) + 0.5) * w.metersPerPixel,
      );
      if (j < 0) continue;
      if (!touched[j]) {
        touched[j] = 1;
        for (const key of summaryFields) this.arrays[key][j] = defaultFor(key);
      }
      const m = massAt(w, i) * ratio;
      totals[j] += m;
      if (m > best[j] || (!m && w.backgroundPaint[i])) {
        best[j] = m;
        for (const key of summaryFields) this.arrays[key][j] = w[key][i];
        this.arrays.velocityX[j] *= w.metersPerPixel / this.pitch;
        this.arrays.velocityY[j] *= w.metersPerPixel / this.pitch;
      }
    }
    for (let i = 0; i < totals.length; i++)
      if (touched[i] && this.arrays.cells[i])
        this.arrays.quantity[i] =
          totals[i] / Math.max(1e-8, massAt(this.arrays, i, false));
    const inside = (x, y) =>
      x >= w.viewOriginX &&
      y >= w.viewOriginY &&
      x < w.viewOriginX + w.width * w.metersPerPixel &&
      y < w.viewOriginY + w.height * w.metersPerPixel;
    this.actors = this.actors.filter((a) => !a.wasActive);
    for (const a of w.stickmen.snapshot()) {
      a.observedTick = w.tick;
      a.observedEventSequence = this.events.at(-1)?.sequence ?? 0;
      a.wasActive = true;
      for (const key of ["x", "px", "y", "py"])
        a[key] = a[key].map(
          (v) =>
            v * w.metersPerPixel +
            (key.endsWith("x") ? w.viewOriginX : w.viewOriginY),
        );
      this.actors = this.actors.filter((old) => old.id !== a.id);
      this.actors.push(a);
    }
    this.missiles = this.missiles.filter((a) => !a.wasActive);
    for (const a of w.missiles.snapshot()) {
      a.observedTick = w.tick;
      a.observedEventSequence = this.events.at(-1)?.sequence ?? 0;
      a.wasActive = true;
      a.x = a.x * w.metersPerPixel + w.viewOriginX;
      a.y = a.y * w.metersPerPixel + w.viewOriginY;
      a.vx *= w.metersPerPixel;
      a.vy *= w.metersPerPixel;
      this.missiles = this.missiles.filter((old) => old.id !== a.id);
      this.missiles.push(a);
    }
    this.actors = this.actors.slice(-32);
    this.missiles = this.missiles.slice(-32);
  }
  clear() {
    for (const key of summaryFields) this.arrays[key].fill(defaultFor(key));
    this.actors = [];
    this.missiles = [];
    this.events = [];
  }
  export() {
    const arrays = {};
    for (const key of summaryFields) {
      const values = this.arrays[key],
        runs = [];
      let start = 0;
      for (let i = 1; i <= values.length; i++)
        if (i === values.length || values[i] !== values[start]) {
          runs.push(i - start, values[start]);
          start = i;
        }
      if (runs.length !== 2 || runs[1] !== defaultFor(key)) arrays[key] = runs;
    }
    return {
      version: 1,
      x: this.x,
      y: this.y,
      pitch: this.pitch,
      arrays,
      actors: this.actors.map((a) =>
        Object.fromEntries(
          Object.entries(a).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.slice() : value,
          ]),
        ),
      ),
      missiles: this.missiles.map((a) => ({ ...a })),
      events: this.events.map((e) => ({ ...e })),
    };
  }
  static restore(w, data) {
    const overview = new ViewportOverview(w);
    if (!data) return overview;
    if (
      data.version !== 1 ||
      ![data.x, data.y, data.pitch].every(Number.isFinite) ||
      Math.abs(data.x) > 1e6 ||
      Math.abs(data.y) > 1e6 ||
      data.pitch < CELL_METERS / 4 ||
      data.pitch > 1e6 ||
      !data.arrays ||
      typeof data.arrays !== "object"
    )
      throw Error("Invalid viewport overview.");
    overview.x = data.x;
    overview.y = data.y;
    overview.pitch = data.pitch;
    for (const key of summaryFields) {
      const runs = data.arrays[key];
      if (runs === undefined) continue;
      if (
        !Array.isArray(runs) ||
        runs.length % 2 ||
        runs.length > OVERVIEW_SIZE ** 2 * 2
      )
        throw Error("Invalid overview data.");
      let offset = 0;
      for (let i = 0; i < runs.length; i += 2) {
        const count = runs[i],
          v = runs[i + 1];
        const material = ["cells", "storedLiquid", "dissolvedId"].includes(key),
          max = material
            ? materials.length - 1
            : key === "quantity"
              ? MAX_PARTICLE_QUANTITY
              : key === "temp"
                ? 100000
                : key === "velocityX" || key === "velocityY"
                  ? 8
                  : key === "life"
                    ? 65535
                    : key === "pigment" || key === "backgroundPaint"
                      ? 4294967295
                      : 255;
        const min = key === "temp" ? -273 : key.startsWith("velocity") ? -8 : 0;
        if (
          !Number.isInteger(count) ||
          count < 1 ||
          offset + count > OVERVIEW_SIZE ** 2 ||
          !Number.isFinite(v) ||
          v < min ||
          v > max ||
          (!FloatFields.has(key) && !Number.isInteger(v))
        )
          throw Error("Invalid overview component.");
        overview.arrays[key].fill(v, offset, offset + count);
        offset += count;
      }
      if (offset !== OVERVIEW_SIZE ** 2) throw Error("Incomplete overview.");
    }
    // Entity validators run in persistence before these finite physical poses
    // become live; only the fixed actor/device caps can occupy this overview.
    for (let i = 0; i < OVERVIEW_SIZE ** 2; i++)
      if (overview.arrays.cells[i] && !overview.arrays.quantity[i])
        throw Error("Invalid overview amount.");
    const events = data.events ?? [];
    if (
      !Array.isArray(events) ||
      events.length > 32 ||
      events.some(
        (e) =>
          !e ||
          ![e.x, e.y, e.radius].every(Number.isFinite) ||
          Math.abs(e.x) > 1e5 ||
          Math.abs(e.y) > 1e5 ||
          e.radius <= 0 ||
          e.radius > 8192 ||
          !Number.isSafeInteger(e.tick) ||
          e.tick < 0 ||
          (e.sequence !== undefined &&
            (!Number.isSafeInteger(e.sequence) || e.sequence < 1)),
      )
    )
      throw Error("Invalid destruction history.");
    overview.events = events.map((e) => ({ ...e }));
    overview.actors = (data.actors ?? []).map((a) => ({
      ...a,
      x: [...a.x],
      y: [...a.y],
      px: [...a.px],
      py: [...a.py],
    }));
    overview.missiles = (data.missiles ?? []).map((a) => ({ ...a }));
    return overview;
  }
}
