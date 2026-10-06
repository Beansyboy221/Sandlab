// Optional authored chemistry uses the same indexed executor as generated rules.
// Compilation bounds the entire recipe set; ticks never parse or search recipes.
const references = new Set(["with", "selfTo", "otherTo", "dissolvedProduct"]);
const ranges = {
  chance: [0, 1],
  minimumTemperature: [-273, 6000],
  maximumTemperature: [-273, 6000],
  heat: [-6000, 6000],
  pressure: [-32, 32],
};
export function compileContactComponent(input, ids, materials, ownId) {
  if (!Array.isArray(input) || input.length > 16)
    throw Error("Contact recipes require at most 16 entries per material.");
  const seen = new Set();
  return Object.freeze(
    input.map((recipe) => {
      if (!recipe || Object.getPrototypeOf(recipe) !== Object.prototype)
        throw Error("Contact recipes must be plain data.");
      const result = { selfTo: ownId, chance: 1, ...recipe };
      for (const [key, value] of Object.entries(result)) {
        if (references.has(key)) {
          const id = typeof value === "string" ? ids[value] : value;
          if (!Number.isInteger(id) || !materials[id])
            throw Error(`Unknown contact product: ${key}`);
          result[key] = id;
        } else {
          const range = ranges[key];
          if (
            !range ||
            !Number.isFinite(value) ||
            value < range[0] ||
            value > range[1]
          )
            throw Error(`Invalid contact condition: ${key}`);
        }
      }
      if (
        result.with === undefined ||
        result.otherTo === undefined ||
        result.with === ownId ||
        seen.has(result.with) ||
        (result.minimumTemperature ?? -273) >
          (result.maximumTemperature ?? 6000)
      )
        throw Error("Conflicting contact recipe.");
      seen.add(result.with);
      return Object.freeze(result);
    }),
  );
}
