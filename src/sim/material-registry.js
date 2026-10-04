const referenceFields = [
  "meltTo",
  "freezeTo",
  "boilTo",
  "condenseTo",
  "residue",
  "oxidizeTo",
  "bakeTo",
  "dryTo",
  "combustionGas",
  "breakInto",
  "fragmentTo",
];
const fractions = [
  "permeability",
  "retention",
  "brittleness",
  "friction",
  "restitution",
  "resistance",
  "airPermeability",
  "sparkChance",
  "oxidationRate",
  "lifetimeVariation",
  "damping",
  "adhesion",
];
const positive = [
  "conductivity",
  "viscosity",
  "elasticity",
  "toughness",
  "burn",
  "lifetime",
  "lightEmission",
  "glow",
];
const categories = new Set([
  "none",
  "powder",
  "liquid",
  "gas",
  "solid",
  "static",
  "elastic",
  "life",
  "energy",
  "special",
]);
export const capability = {
  gas: 1,
  rigid: 2,
  elastic: 4,
  static: 8,
  absorbable: 16,
  conductive: 32,
  combustible: 64,
  phase: 128,
};
function validate(m) {
  if (!categories.has(m.category))
    throw Error(`Unknown category for ${m.name}`);
  if (!/^#[0-9a-f]{6}$/i.test(m.color))
    throw Error(`Invalid color for ${m.name}`);
  if (!Number.isFinite(m.density)) throw Error(`Invalid density for ${m.name}`);
  if (!Number.isInteger(m.porosity) || m.porosity < 0 || m.porosity > 255)
    throw Error(`Invalid porosity for ${m.name}`);
  for (const key of fractions)
    if (
      m[key] !== undefined &&
      (!Number.isFinite(m[key]) || m[key] < 0 || m[key] > 1)
    )
      throw Error(`Invalid ${key} for ${m.name}`);
  for (const key of positive)
    if (m[key] !== undefined && (!Number.isFinite(m[key]) || m[key] < 0))
      throw Error(`Invalid ${key} for ${m.name}`);
  if ((m.rigid && (m.elasticity || m.static)) || (m.static && m.elasticity))
    throw Error(`Conflicting representations for ${m.name}`);
  if (m.category === "elastic" && !(m.elasticity > 0 && m.tearAt > 1))
    throw Error(`Missing elastic properties for ${m.name}`);
  for (const [key, value] of Object.entries(m)) {
    if (
      typeof value === "function" ||
      (typeof value === "object" && value !== null)
    )
      throw Error(`${m.name}.${key} must be scalar data`);
    if (
      typeof value === "number" &&
      !Number.isFinite(value) &&
      !["phaseMinimum", "phaseMaximum"].includes(key)
    )
      throw Error(`Invalid ${key} for ${m.name}`);
  }
}
function resolve(m, M, materials) {
  for (const key of referenceFields) {
    const value = m[key];
    if (value === undefined) continue;
    const id = typeof value === "string" ? M[value] : value;
    if (!Number.isInteger(id) || !materials[id])
      throw Error(`Unknown ${key} ${value} for ${m.name}`);
    m[key] = id;
  }
}
/** Defaults and name resolution happen once. Numeric IDs remain definition order. */
export function compileMaterials(
  definitions,
  configure = () => {},
  aliases = {},
  legacyDuplicates = {},
  finalize = () => {},
) {
  if (!Array.isArray(definitions) || definitions.length > 256)
    throw Error("Material registry exceeds Uint8 particle IDs");
  if (
    !definitions.length ||
    definitions[0][0] !== "Empty" ||
    definitions[0][1] !== "none"
  )
    throw Error("Material ID zero must be Empty");
  const M = Object.create(null);
  const materials = definitions.map(
    ([name, category, color, density, properties = {}], id) => {
      if (typeof name !== "string" || !name.trim())
        throw Error(`Missing material name at ${id}`);
      if (!properties || Object.getPrototypeOf(properties) !== Object.prototype)
        throw Error(`Invalid properties for ${name}`);
      for (const key of ["id", "name", "category", "color", "density"])
        if (key in properties)
          throw Error(`${name}: ${key} belongs to the definition`);
      const displayName = name.replace(/\b[a-z]/g, (letter) =>
        letter.toUpperCase(),
      );
      if (!properties.deprecated) {
        if (M[name] !== undefined || M[displayName] !== undefined) {
          const pair = legacyDuplicates[name];
          if (!pair || pair[0] !== M[name] || pair[1] !== id)
            throw Error(`Duplicate material ${name}`);
        }
        M[name] = M[displayName] = id;
      }
      return {
        id,
        name: displayName,
        category,
        color,
        density,
        porosity: category === "powder" ? 1 : 0,
        permeability: category === "powder" ? 0.35 : 0,
        retention: 0.7,
        brittleness:
          category === "solid"
            ? 0.5
            : category === "powder"
              ? 0.7
              : category === "elastic"
                ? 0.1
                : 0,
        conductivity: 0.04,
        resistance: 0,
        viscosity: 1,
        temperature: 20,
        movable: !["static", "special"].includes(category),
        rigid: category === "solid",
        friction: 0.4,
        restitution: 0.08,
        gas: category === "gas" || category === "energy",
        ...properties,
      };
    },
  );
  for (const [alias, name] of Object.entries(aliases)) {
    if (
      M[name] === undefined ||
      (M[alias] !== undefined && M[alias] !== M[name])
    )
      throw Error(`Invalid alias ${alias}`);
    M[alias] = M[name];
  }
  for (const m of materials) resolve(m, M, materials);
  configure(materials, M);
  for (const m of materials) {
    resolve(m, M, materials);
    validate(m);
    m.phaseMinimum = Math.max(m.freeze ?? -Infinity, m.condense ?? -Infinity);
    m.phaseMaximum = Math.min(
      m.dry ?? Infinity,
      m.bake ?? Infinity,
      m.melt ?? Infinity,
      m.boil ?? Infinity,
    );
  }
  for (const m of materials)
    if (m.retired) {
      const id = m.id,
        name = m.name,
        canonicalId = M[m.replacement];
      if (canonicalId === undefined || materials[canonicalId].retired)
        throw Error(`Unknown replacement for ${name}`);
      Object.assign(m, materials[canonicalId], {
        id,
        name,
        deprecated: true,
        retired: true,
        canonicalId,
      });
    }
  finalize(materials, M);
  for (const m of materials) {
    resolve(m, M, materials);
    validate(m);
  }
  const tables = { flags: new Uint8Array(materials.length) };
  // Float64 preserves the exact existing coefficients; no quantization drift.
  for (const key of [
    "density",
    "conductivity",
    "porosity",
    "permeability",
    "retention",
    "brittleness",
    "friction",
    "restitution",
  ])
    tables[key] = Float64Array.from(materials, (m) => m[key]);
  for (const m of materials)
    tables.flags[m.id] =
      (m.gas ? capability.gas : 0) |
      (m.rigid ? capability.rigid : 0) |
      (m.elasticity ? capability.elastic : 0) |
      (m.static ? capability.static : 0) |
      (m.absorbable ? capability.absorbable : 0) |
      (m.conductive ? capability.conductive : 0) |
      (m.burn ? capability.combustible : 0) |
      (m.phaseMinimum !== -Infinity || m.phaseMaximum !== Infinity
        ? capability.phase
        : 0);
  tables.heatTransfer = new Float64Array(materials.length * materials.length);
  for (let a = 0; a < materials.length; a++)
    for (let b = 0; b < materials.length; b++)
      tables.heatTransfer[a * materials.length + b] = Math.min(
        0.24,
        (tables.conductivity[a] + tables.conductivity[b]) * 0.25,
      );
  // Freeze definitions, not the indexed array: frozen array elements slow the
  // very frequent ID lookups in V8. Registry edits require recompilation.
  for (const m of materials) Object.freeze(m);
  Object.freeze(M);
  return { materials, M, tables };
}
