import { MAX_ELECTRICAL_ENERGY } from "./electrical-energy.js";
import { MAX_PARTICLE_QUANTITY } from "./world-units.js";
import { particleStateFields } from "./particle-state.js";
import { materials } from "./materials.js";
import { cachedValue } from "./viewport-cache.js";
const defaultValue = (key) =>
  key === "temp" ? 20 : key === "quantity" ? 1 : 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const read = (record, key) =>
  record.i < 0
    ? defaultValue(key)
    : record.entry
      ? cachedValue(record.entry, key, record.i)
      : (record.source[key]?.[record.i] ?? defaultValue(key));
const weight = (material) =>
  material.id ? (material.density > 0 ? material.density : 1) : 0;
const baseMass = (record) =>
  weight(materials[read(record, "cells")]) +
  read(record, "storedAmount") *
    materials[read(record, "storedLiquid")].density +
  read(record, "dissolvedAmount") *
    materials[read(record, "dissolvedId")].density;
const mass = (record) =>
  read(record, "cells") ? baseMass(record) * read(record, "quantity") : 0;
const inWorld = (w, x, y) =>
  x >= w.viewOriginX &&
  y >= w.viewOriginY &&
  x < w.viewOriginX + w.width * w.metersPerPixel &&
  y < w.viewOriginY + w.height * w.metersPerPixel;
const transferFields = [...particleStateFields, "backgroundPaint"];
const detailChecks = [
  "cells",
  "storedLiquid",
  "storedAmount",
  "dissolvedId",
  "dissolvedAmount",
  "oxidationLevel",
  "clone",
  "nutrition",
  "growth",
];

export function resampleViewport(old, next, state, entry) {
  const records = Array.from({ length: 4 }, () => ({})),
    sources = new Map([
      [0, old],
      [-1, { ...state.overview.arrays, width: 128, height: 128 }],
    ]);
  const namespaces = new Int32Array(next.length),
    indices = new Int32Array(next.length).fill(-1),
    parents = new Int32Array(next.length).fill(-1);
  const scratch = {};
  const groups = new Int32Array(old.length);
  for (let i = 0; i < old.length; i++) groups[i] = i;
  const root = (i) => {
    while (groups[i] !== i) {
      groups[i] = groups[groups[i]];
      i = groups[i];
    }
    return i;
  };
  const locations = new Map();
  for (let i = 0; i < old.length; i++)
    if (old.elasticId[i]) locations.set(old.elasticId[i], i);
  for (const i of locations.values())
    for (let d = 0; d < 4; d++) {
      const j = locations.get(old["bond" + d][i]);
      if (j !== undefined) {
        const a = root(i),
          b = root(j);
        if (a !== b) groups[b] = a;
      }
    }

  function sample(record, x, y, refine = true) {
    record.parent = -1;
    record.detail = false;
    record.quantityFactor = 1;
    record.temperatureDelta = 0;
    record.lifeDelta = 0;
    if (inWorld(old, x, y)) {
      const sx = Math.floor((x - old.viewOriginX) / old.metersPerPixel),
        sy = Math.floor((y - old.viewOriginY) / old.metersPerPixel),
        i = sy * old.width + sx;
      record.source = old;
      record.entry = null;
      record.i = i;
      record.ns = 0;
      record.pitch = old.metersPerPixel;
      record.parent = i;
      if (
        refine &&
        next.metersPerPixel < old.metersPerPixel &&
        old.detailRef[i]
      ) {
        const cached = state.cache.get(old.detailRef[i]);
        if (cached && cached.pitch <= next.metersPerPixel) {
          const size = Math.round(old.metersPerPixel / cached.pitch),
            bx = old.detailX[i],
            by = old.detailY[i];
          let total = 0,
            best = -1,
            representative = -1,
            temperature = 0;
          for (let dy = 0; dy < size; dy++)
            for (let dx = 0; dx < size; dx++) {
              const cx = bx + dx,
                cy = by + dy;
              if (cx < 0 || cy < 0 || cx >= cached.width || cy >= cached.height)
                continue;
              scratch.entry = cached;
              scratch.i = cy * cached.width + cx;
              const m = mass(scratch);
              total += m;
              temperature += m * read(scratch, "temp");
              if (m > best && read(scratch, "cells")) {
                best = m;
                representative = scratch.i;
              }
            }
          scratch.entry = cached;
          scratch.i = representative;
          if (
            representative >= 0 &&
            detailChecks.every((key) => old[key][i] === read(scratch, key))
          ) {
            const cx =
                bx +
                Math.floor(
                  ((x - old.viewOriginX) / old.metersPerPixel - sx) * size,
                ),
              cy =
                by +
                Math.floor(
                  ((y - old.viewOriginY) / old.metersPerPixel - sy) * size,
                );
            record.entry = cached;
            record.source = cached.arrays;
            record.i =
              cx >= 0 && cy >= 0 && cx < cached.width && cy < cached.height
                ? cy * cached.width + cx
                : -1;
            record.ns = cached.id;
            record.pitch = cached.pitch;
            record.detail = true;
            record.quantityFactor = total
              ? (mass({ source: old, i, entry: null }) * size * size) / total
              : 1;
            record.temperatureDelta =
              old.temp[i] - (total ? temperature / total : 20);
            record.lifeDelta = old.life[i] - read(scratch, "life");
            sources.set(cached.id, cached);
          }
        }
      }
    } else {
      record.source = state.overview.arrays;
      record.entry = null;
      record.i = state.overview.index(x, y);
      record.pitch = state.overview.pitch;
      record.ns = -1;
    }
  }
  for (let y = 0; y < next.height; y++)
    for (let x = 0; x < next.width; x++) {
      const i = y * next.width + x,
        px = next.viewOriginX + (x + 0.5) * next.metersPerPixel,
        py = next.viewOriginY + (y + 0.5) * next.metersPerPixel;
      sample(records[0], px, py);
      let chosen = records[0],
        total = mass(chosen),
        temperature = total * read(chosen, "temp"),
        samples = 1;
      // A fixed four-sample reduction limits transition work. Fine detail stays
      // in the bounded cache; coarse materials remain live solver participants.
      if (next.metersPerPixel > old.metersPerPixel) {
        total = temperature = 0;
        samples = 4;
        let best = -1;
        for (let n = 0; n < 4; n++) {
          sample(
            records[n],
            px + ((n & 1 ? 1 : -1) * next.metersPerPixel) / 4,
            py + ((n & 2 ? 1 : -1) * next.metersPerPixel) / 4,
            false,
          );
          const m = mass(records[n]);
          total += m;
          temperature += m * read(records[n], "temp");
          if (m > best && read(records[n], "cells")) {
            best = m;
            chosen = records[n];
          }
        }
      }
      next.backgroundPaint[i] = read(chosen, "backgroundPaint");
      const id = read(chosen, "cells");
      if (!id) continue;
      for (const key of transferFields) next[key][i] = read(chosen, key);
      if (next.cells[i]) {
        let electricalEnergy = 0;
        if (samples === 4) {
          for (let n = 0; n < 4; n++)
            electricalEnergy +=
              (read(records[n], "electricalEnergy") *
                (next.metersPerPixel / records[n].pitch) ** 2) /
              4;
        } else {
          const source = chosen.detail
            ? old.electricalEnergy[chosen.parent]
            : read(chosen, "electricalEnergy");
          const pitch = chosen.detail ? old.metersPerPixel : chosen.pitch;
          const detailWeight = chosen.detail
            ? (mass(chosen) * chosen.quantityFactor) /
              Math.max(
                1e-8,
                mass({ source: old, i: chosen.parent, entry: null }),
              )
            : 1;
          electricalEnergy =
            source * (next.metersPerPixel / pitch) ** 2 * detailWeight;
        }
        next.electricalEnergy[i] = Math.min(
          MAX_ELECTRICAL_ENERGY,
          electricalEnergy,
        );
        if (chosen.detail) {
          next.charge[i] = old.charge[chosen.parent];
          next.cooldown[i] = old.cooldown[chosen.parent];
          next.chargedAt[i] = old.chargedAt[chosen.parent];
        }
        next.quantity[i] = clamp(
          samples === 4
            ? total / (4 * Math.max(1e-8, baseMass(chosen)))
            : read(chosen, "quantity") * chosen.quantityFactor,
          1e-8,
          MAX_PARTICLE_QUANTITY,
        );
        next.temp[i] = clamp(
          samples === 4 && total
            ? temperature / total
            : read(chosen, "temp") + chosen.temperatureDelta,
          -273,
          100000,
        );
        next.life[i] = clamp(read(chosen, "life") + chosen.lifeDelta, 0, 65535);
        const scale = chosen.pitch / next.metersPerPixel;
        next.velocityX[i] = clamp(read(chosen, "velocityX") * scale, -4, 4);
        next.velocityY[i] = clamp(read(chosen, "velocityY") * scale, -4, 4);
        if (chosen.detail && chosen.parent >= 0) {
          next.velocityX[i] = clamp(
            (old.velocityX[chosen.parent] * old.metersPerPixel) /
              next.metersPerPixel,
            -4,
            4,
          );
          next.velocityY[i] = clamp(
            (old.velocityY[chosen.parent] * old.metersPerPixel) /
              next.metersPerPixel,
            -4,
            4,
          );
        }
        next.offsetX[i] = next.offsetY[i] = 0;
        namespaces[i] = chosen.ns;
        indices[i] = chosen.i;
        parents[i] = chosen.parent;
        if (
          samples === 4 &&
          entry &&
          records.every((r) => r.ns === 0) &&
          cachedValue(entry, "cells", chosen.i)
        ) {
          next.detailRef[i] = entry.id;
          next.detailX[i] = Math.floor(
            (px - next.metersPerPixel / 2 - old.viewOriginX) /
              old.metersPerPixel,
          );
          next.detailY[i] = Math.floor(
            (py - next.metersPerPixel / 2 - old.viewOriginY) /
              old.metersPerPixel,
          );
        } else if (chosen.pitch !== next.metersPerPixel) next.detailRef[i] = 0;
      } else next.detailRef[i] = 0;
      // Reconstruct topology from actual surviving source links, not an old image
      // of a whole body. No cached identity is reused for two live particles.
      next.elasticId[i] = 0;
      next.elasticAnchor[i] = 0;
      for (let d = 0; d < 4; d++) next["bond" + d][i] = 0;
      if (
        materials[next.cells[i]].rigid ||
        materials[next.cells[i]].elasticity
      ) {
        next.elasticId[i] = next.elastic.allocate();
        next.restX[i] = x + 0.5;
        next.restY[i] = y + 0.5;
      }
    }
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [-1, 1],
  ];
  for (let i = 0; i < next.length; i++)
    if (next.elasticId[i])
      for (let d = 0; d < 4; d++) {
        const x = (i % next.width) + dirs[d][0],
          y = Math.floor(i / next.width) + dirs[d][1];
        if (x < 0 || y < 0 || x >= next.width || y >= next.height) continue;
        const j = y * next.width + x;
        if (next.cells[i] !== next.cells[j] || !next.elasticId[j]) continue;
        let connect = false;
        if (namespaces[i] === namespaces[j]) {
          const source = sources.get(namespaces[i]),
            a = indices[i],
            b = indices[j];
          const sourceValue = (key, index) =>
            namespaces[i] > 0
              ? cachedValue(source, key, index)
              : (source[key]?.[index] ?? 0);
          connect =
            a === b ||
            (a >= 0 &&
              b >= 0 &&
              [0, 1, 2, 3].some(
                (k) =>
                  (sourceValue("bond" + k, a) === sourceValue("elasticId", b) &&
                    sourceValue("elasticId", b)) ||
                  (sourceValue("bond" + k, b) === sourceValue("elasticId", a) &&
                    sourceValue("elasticId", a)),
              ));
          if (namespaces[i] === -1) connect = true;
          if (
            namespaces[i] === 0 &&
            next.metersPerPixel > old.metersPerPixel &&
            a >= 0 &&
            b >= 0 &&
            old.elasticId[a] &&
            old.elasticId[b]
          )
            connect = root(a) === root(b);
        }
        if (
          next.metersPerPixel <= old.metersPerPixel &&
          parents[i] >= 0 &&
          parents[j] >= 0 &&
          parents[i] !== parents[j] &&
          old.elasticId[parents[i]] &&
          old.elasticId[parents[j]]
        )
          connect &&= [0, 1, 2, 3].some(
            (k) =>
              old["bond" + k][parents[i]] === old.elasticId[parents[j]] ||
              old["bond" + k][parents[j]] === old.elasticId[parents[i]],
          );
        if (connect) next["bond" + d][i] = next.elasticId[j];
      }
  for (let i = 0; i < next.length; i++)
    if (next.cells[i]) {
      next.count++;
      next.chunks[next.chunk(i)]++;
    }
  next.elastic.rebuild(next);
  next.circuits.rebuild(next);
  next.portals.rebuild(next);
  next.motionStamp.fill(next.tick + 1);
}

function interpolate(values, width, height, x, y, ambient = 0) {
  const left = Math.floor(x),
    top = Math.floor(y),
    fx = x - left,
    fy = y - top;
  let result = 0;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const sx = left + dx,
        sy = top + dy;
      result +=
        (sx >= 0 && sy >= 0 && sx < width && sy < height
          ? values[sy * width + sx]
          : ambient) *
        (dx ? fx : 1 - fx) *
        (dy ? fy : 1 - fy);
    }
  return result;
}
export function resampleViewportFields(old, next) {
  const a = old.fields,
    b = next.fields;
  b.ambientTemperature = a.ambientTemperature;
  b.ambientPressure = a.ambientPressure;
  const ratio = old.metersPerPixel / next.metersPerPixel;
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const i = y * b.width + x,
        sx =
          ((next.viewOriginX +
            (x * 4 + 2) * next.metersPerPixel -
            old.viewOriginX) /
            old.metersPerPixel -
            2) /
          4,
        sy =
          ((next.viewOriginY +
            (y * 4 + 2) * next.metersPerPixel -
            old.viewOriginY) /
            old.metersPerPixel -
            2) /
          4;
      b.pressure[i] = interpolate(a.pressure, a.width, a.height, sx, sy);
      b.temperature[i] = interpolate(
        a.temperature,
        a.width,
        a.height,
        sx,
        sy,
        a.ambientTemperature,
      );
      b.airflow.velocityX[i] = clamp(
        interpolate(a.airflow.velocityX, a.width, a.height, sx, sy) * ratio,
        -8,
        8,
      );
      b.airflow.velocityY[i] = clamp(
        interpolate(a.airflow.velocityY, a.width, a.height, sx, sy) * ratio,
        -8,
        8,
      );
      next.sound.wave[i] = interpolate(
        old.sound.wave,
        old.sound.width,
        old.sound.height,
        sx,
        sy,
      );
      next.sound.previous[i] = interpolate(
        old.sound.previous,
        old.sound.width,
        old.sound.height,
        sx,
        sy,
      );
    }
  next.sound.active = old.sound.active;
  next.sound.tick = old.tick;
}

// Integer panning does not change fidelity: overlapping state can travel by
// typed-array row copies instead of invoking the reducer for every pixel.
export function shiftViewport(old, next, state) {
  const dx = Math.round(
      (next.viewOriginX - old.viewOriginX) / old.metersPerPixel,
    ),
    dy = Math.round((next.viewOriginY - old.viewOriginY) / old.metersPerPixel);
  const left = Math.max(0, -dx),
    right = Math.min(next.width, old.width - dx),
    top = Math.max(0, -dy),
    bottom = Math.min(next.height, old.height - dy);
  if (right > left && bottom > top)
    for (const key of transferFields)
      for (let y = top; y < bottom; y++)
        next[key].set(
          old[key].subarray(
            (y + dy) * old.width + left + dx,
            (y + dy) * old.width + right + dx,
          ),
          y * next.width + left,
        );
  next.elastic.rebuild(next);
  next.elastic.nextId = Math.max(old.elastic.nextId, next.elastic.nextId);
  for (let y = 0; y < next.height; y++)
    for (let x = 0; x < next.width; x++) {
      const i = y * next.width + x;
      if (x >= left && x < right && y >= top && y < bottom) {
        if (next.elasticId[i]) {
          next.restX[i] -= dx;
          next.restY[i] -= dy;
        }
        if (next.cells[i]) {
          next.count++;
          next.chunks[next.chunk(i)]++;
        }
      } else {
        const j = state.overview.index(
          next.viewOriginX + (x + 0.5) * next.metersPerPixel,
          next.viewOriginY + (y + 0.5) * next.metersPerPixel,
        );
        if (j < 0) continue;
        const arrays = state.overview.arrays,
          id = arrays.cells[j];
        next.backgroundPaint[i] = arrays.backgroundPaint[j];
        if (!id) continue;
        next.set(i, id, arrays.temp[j], arrays.life[j]);
        for (const key of [
          "quantity",
          "pigment",
          "storedLiquid",
          "storedAmount",
          "dissolvedId",
          "dissolvedAmount",
          "oxidationLevel",
        ])
          next[key][i] = arrays[key][j];
        next.velocityX[i] = clamp(
          (arrays.velocityX[j] * state.overview.pitch) / next.metersPerPixel,
          -4,
          4,
        );
        next.velocityY[i] = clamp(
          (arrays.velocityY[j] * state.overview.pitch) / next.metersPerPixel,
          -4,
          4,
        );
      }
    }
  next.elastic.rebuild(next);
  next.circuits.rebuild(next);
  next.portals.rebuild(next);
  next.motionStamp.fill(next.tick + 1);
}
