import { rigidFields } from "./sim/rigid-bodies.js";
import { validateStickmen } from "./sim/stickmen.js";
import { elasticFields, elasticFloatFields } from "./sim/elasticity.js";
import {
  defaultLevel,
  validateLevelMetadata,
  applyLevelMetadata,
} from "./level-properties.js";
import { particleStateFields } from "./sim/particle-state.js";
import { World } from "./sim/world.js";
import { absorbable } from "./sim/absorption.js";
import { materials, M, canonicalMaterial } from "./sim/materials.js";
const KEY = "sandlab.saves.v1",
  AUTO = "sandlab.autosave.v1";
const arrays = [...particleStateFields, "backgroundPaint"];
const floatFields = [...elasticFloatFields, ...rigidFields];
export function snapshot(world, typed = false) {
  return {
    version: 1,
    stickmen: world.stickmen.snapshot(),
    atmosphere: {
      ambientTemperature: world.fields.ambientTemperature,
      ambientPressure: world.fields.ambientPressure,
      temperature: typed
        ? world.fields.temperature.slice()
        : Array.from(world.fields.temperature),
    },
    level: {
      name: world.name,
      border: world.border,
      background: world.background,
    },
    width: world.width,
    height: world.height,
    seed: world.seed,
    tick: world.tick,
    activity: Array.from(world.motionStamp),
    arrays: Object.fromEntries(
      arrays.map((key) => [
        key,
        typed ? world[key].slice() : Array.from(world[key]),
      ]),
    ),
    pressure: typed
      ? world.fields.pressure.slice()
      : Array.from(world.fields.pressure),
  };
}
function validateDimensions(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Number.isInteger(data.width) ||
    !Number.isInteger(data.height) ||
    data.width < 8 ||
    data.height < 8 ||
    data.width > 512 ||
    data.height > 512 ||
    data.width * data.height > 200000
  )
    throw Error("This file uses an unsupported world size or format.");
}
export function validateSnapshot(data) {
  validateDimensions(data);
  validateStickmen(data.stickmen);
  if (data.level !== undefined) validateLevelMetadata(data.level);
  if (
    (data.seed !== undefined &&
      (!Number.isInteger(data.seed) ||
        data.seed < 0 ||
        data.seed > 4294967295)) ||
    (data.tick !== undefined &&
      (!Number.isSafeInteger(data.tick) || data.tick < 0))
  )
    throw Error("Invalid simulation clock or seed.");
  const length = data.width * data.height;
  for (const key of arrays) {
    const values =
      data.arrays?.[key] ??
      ([
        ...elasticFields,
        ...rigidFields,
        "pigment",
        "backgroundPaint",
        "heading",
        "chargedAt",
        "moisture",
        "nutrition",
        "growth",
        "storedLiquid",
        "storedAmount",
      ].includes(key)
        ? new Uint32Array(length)
        : undefined);
    if (
      !(Array.isArray(values) || ArrayBuffer.isView(values)) ||
      values.length !== length ||
      values.some((v) => !Number.isFinite(v))
    )
      throw Error("This save is incomplete or damaged.");
  }
  for (const key of arrays) {
    const values = data.arrays[key];
    if (!values) continue;
    const maximum =
      key === "temp"
        ? 100000
        : floatFields.includes(key)
          ? key.startsWith("offset")
            ? 1.5
            : key.startsWith("rest")
              ? 2048
              : key === "damage"
                ? 100000
                : 4
          : key === "elasticAnchor"
            ? 15
            : key === "heading"
              ? 7
              : key === "pigment" ||
                  key === "backgroundPaint" ||
                  key === "chargedAt" ||
                  ["elasticId", "bond0", "bond1", "bond2", "bond3"].includes(
                    key,
                  )
                ? 4294967295
                : key === "life"
                  ? 65535
                  : key === "storedAmount"
                    ? 48
                    : ["cells", "clone", "residue", "storedLiquid"].includes(
                          key,
                        )
                      ? materials.length - 1
                      : 255;
    const minimum =
      key === "temp"
        ? -273
        : floatFields.includes(key) && key !== "damage"
          ? -maximum
          : 0;
    if (
      values.some(
        (v) =>
          v < minimum ||
          v > maximum ||
          (key !== "temp" &&
            !floatFields.includes(key) &&
            !Number.isInteger(v)),
      )
    )
      throw Error("This save contains invalid particle data.");
  }
  const elasticIds = new Set();
  for (let i = 0; i < length; i++) {
    if (!data.arrays.cells[i] && data.arrays.pigment?.[i])
      throw Error("Invalid foreground paint on an empty cell.");
    const id = data.arrays.elasticId?.[i];
    if (id) {
      if (
        !(
          materials[data.arrays.cells[i]]?.elasticity ||
          materials[data.arrays.cells[i]]?.rigid
        ) ||
        elasticIds.has(id)
      )
        throw Error("Invalid elastic particle identity.");
      elasticIds.add(id);
    }
    const amount = data.arrays.storedAmount?.[i] || 0,
      type = data.arrays.storedLiquid?.[i] || 0;
    if (
      (amount && (data.arrays.cells[i] !== M.Sponge || !absorbable(type))) ||
      (!amount && type)
    )
      throw Error("Invalid sponge contents.");
  }
  if (
    data.arrays.cells.some(
      (v) => v < 0 || v >= materials.length || !Number.isInteger(v),
    )
  )
    throw Error("This save contains an unknown material.");
  if (
    data.pressure &&
    (!(Array.isArray(data.pressure) || ArrayBuffer.isView(data.pressure)) ||
      data.pressure.length !==
        Math.ceil(data.width / 4) * Math.ceil(data.height / 4) ||
      data.pressure.some((v) => !Number.isFinite(v) || Math.abs(v) > 80))
  )
    throw Error("Invalid pressure data.");
  if (data.atmosphere !== undefined) {
    if (!data.atmosphere || typeof data.atmosphere !== "object")
      throw Error("Invalid atmosphere data.");
    const { ambientTemperature, ambientPressure, temperature } =
      data.atmosphere;
    if (
      !Number.isFinite(ambientTemperature) ||
      ambientTemperature < -273 ||
      ambientTemperature > 6000 ||
      !Number.isFinite(ambientPressure) ||
      ambientPressure < 0.01 ||
      ambientPressure > 10 ||
      !(Array.isArray(temperature) || ArrayBuffer.isView(temperature)) ||
      temperature.length !==
        Math.ceil(data.width / 4) * Math.ceil(data.height / 4) ||
      temperature.some((v) => !Number.isFinite(v) || v < -273 || v > 6000)
    )
      throw Error("Invalid atmosphere data.");
  }
  const chunkCount = Math.ceil(data.width / 16) * Math.ceil(data.height / 16);
  if (
    data.activity &&
    (!Array.isArray(data.activity) ||
      data.activity.length !== chunkCount ||
      data.activity.some(
        (v) => !Number.isInteger(v) || v < 0 || v > 4294967295,
      ))
  )
    throw Error("Invalid activity data.");
}
export function restore(world, data) {
  validateSnapshot(data);
  const gravityX = world.gravityX,
    gravityY = world.gravityY;
  // Validate the complete payload before replacing a live world or allocating its grid.
  if (world.width !== data.width || world.height !== data.height)
    Object.assign(world, new World(data.width, data.height));
  else world.clear();
  applyLevelMetadata(world, data.level ?? defaultLevel);
  world.setGravity(gravityX, gravityY);
  world.lastStrikeTick = -1;
  for (const key of arrays)
    world[key].set(data.arrays[key] ?? new Uint32Array(world.length));
  for (const key of ["cells", "clone", "residue", "storedLiquid"])
    for (let i = 0; i < world.length; i++)
      world[key][i] = canonicalMaterial(world[key][i]);
  for (let i = 0; i < world.length; i++) {
    const old = data.arrays.cells[i];
    if (materials[old].retired) {
      const lifetime = materials[world.cells[i]].lifetime;
      world.life[i] = lifetime ? world.life[i] || lifetime : 0;
    }
    // Older sponge saves stored the dissolved liquid's type, before nutrition
    // became a property of ordinary water. Keep that finite food supply readable.
    if (data.arrays.storedLiquid?.[i] === 66 && !world.nutrition[i])
      world.nutrition[i] = Math.min(255, world.storedAmount[i] * 96);
  }
  world.seed = data.seed >>> 0 || 17421;
  world.tick = Number.isSafeInteger(data.tick) ? data.tick : 0;
  for (let i = 0; i < world.length; i++)
    if (world.cells[i]) {
      world.count++;
      world.chunks[world.chunk(i)]++;
    }
  world.elastic.rebuild(world);
  world.stickmen.world = world;
  world.stickmen.restore(data.stickmen);
  if (data.pressure) world.fields.pressure.set(data.pressure);
  if (data.atmosphere) {
    world.fields.ambientTemperature = data.atmosphere.ambientTemperature;
    world.fields.ambientPressure = data.atmosphere.ambientPressure;
    world.fields.temperature.set(data.atmosphere.temperature);
  }
  world.fields.obstaclesDirty = true;
  if (data.activity) world.motionStamp.set(data.activity);
  else world.motionStamp.fill(world.tick + 1);
}
// Run-length encoding compresses empty cells and walls without a library or network service.
export function pack(data) {
  const result = { ...data, encoding: "rle", arrays: {} };
  for (const key of arrays) {
    const source = data.arrays[key],
      runs = [];
    let last = source[0],
      count = 1;
    for (let i = 1; i <= source.length; i++) {
      if (i < source.length && source[i] === last && count < 65535) count++;
      else {
        runs.push(count, last);
        last = source[i];
        count = 1;
      }
    }
    result.arrays[key] = runs;
  }
  return result;
}
export function unpack(data) {
  validateDimensions(data);
  validateStickmen(data.stickmen);
  if (data.level !== undefined) validateLevelMetadata(data.level);
  if (data.encoding === undefined) return data;
  if (data.encoding !== "rle") throw Error("Unsupported save encoding.");
  const output = { ...data, arrays: {} };
  for (const key of arrays) {
    const runs =
      data.arrays?.[key] ??
      ([
        ...elasticFields,
        ...rigidFields,
        "pigment",
        "backgroundPaint",
        "heading",
        "chargedAt",
        "moisture",
        "nutrition",
        "growth",
        "storedLiquid",
        "storedAmount",
      ].includes(key)
        ? [data.width * data.height, 0]
        : undefined);
    if (
      !Array.isArray(runs) ||
      runs.length % 2 ||
      runs.length > data.width * data.height * 2
    )
      throw Error("Invalid compressed save.");
    const values = [];
    for (let i = 0; i < runs.length; i += 2) {
      if (
        !Number.isFinite(runs[i + 1]) ||
        !Number.isInteger(runs[i]) ||
        runs[i] < 1 ||
        values.length + runs[i] > data.width * data.height
      )
        throw Error("Invalid compressed save.");
      for (let n = 0; n < runs[i]; n++) values.push(runs[i + 1]);
    }
    if (values.length !== data.width * data.height)
      throw Error("Incomplete compressed save.");
    output.arrays[key] = values;
  }
  return output;
}
// Only locally generated PNG previews are accepted; saves cannot request remote images or SVG.
export function safeThumbnail(value) {
  return typeof value === "string" &&
    value.length <= 500000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value
    : "";
}
export function getSaves() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(data)
      ? data
          .filter((s) => s && typeof s.name === "string" && s.data)
          .slice(0, 8)
          .map((s) => ({
            ...s,
            name: s.name.slice(0, 120),
            thumbnail: safeThumbnail(s.thumbnail),
          }))
      : [];
  } catch {
    return [];
  }
}
export function saveWorld(world, name, thumbnail) {
  const saves = getSaves();
  if (saves.length >= 8)
    throw Error(
      "You have eight saved worlds. Export or delete a saved copy to make room.",
    );
  saves.unshift({
    id: Date.now(),
    name,
    date: new Date().toISOString(),
    thumbnail,
    data: pack(snapshot(world)),
  });
  localStorage.setItem(KEY, JSON.stringify(saves));
  return saves;
}
export function deleteSave(id) {
  localStorage.setItem(
    KEY,
    JSON.stringify(getSaves().filter((s) => s.id !== id)),
  );
}
export function autosave(world) {
  localStorage.setItem(AUTO, JSON.stringify(pack(snapshot(world))));
}
export function getAutosave() {
  try {
    return unpack(JSON.parse(localStorage.getItem(AUTO)));
  } catch {
    return null;
  }
}
