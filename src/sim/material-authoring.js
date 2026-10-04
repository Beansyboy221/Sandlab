/** Authoring helpers run once at startup, never on individual particles. */
const carriers = {
  granular: "powder",
  fluid: "liquid",
  gas: "gas",
  rigid: "solid",
  elastic: "elastic",
  static: "static",
};
function plain(value, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw Error(`${label} must be plain data`);
}
/** Traits compose left-to-right; explicit properties are the final override. */
export function defineMaterial({
  name,
  category,
  representation,
  color,
  density,
  traits = [],
  properties = {},
}) {
  plain(properties, `${name} properties`);
  if (!Array.isArray(traits)) throw Error(`${name} traits must be an array`);
  let carrier = representation;
  if (carrier && !carriers[carrier])
    throw Error(`Unknown representation ${carrier}`);
  const merged = {};
  for (const trait of traits) {
    plain(trait, `${name} trait`);
    plain(trait.properties, `${name} trait properties`);
    if (trait.representation) {
      if (
        !carriers[trait.representation] ||
        (carrier && carrier !== trait.representation)
      )
        throw Error(`Conflicting representations for ${name}`);
      carrier = trait.representation;
    }
    Object.assign(merged, trait.properties);
  }
  if (carrier && category && carriers[carrier] !== category)
    throw Error(`Conflicting representations for ${name}`);
  Object.assign(merged, properties);
  for (const key of [
    "id",
    "name",
    "category",
    "color",
    "density",
    "traits",
    "representation",
  ])
    if (key in merged)
      throw Error(`${name}: ${key} belongs to the definition, not a trait`);
  return [name, category || carriers[carrier], color, density, merged];
}
export const porous = (porosity, permeability, retention) => ({
  properties: { porosity, permeability, retention },
});
export const springy = (elasticity, damping, tearAt) => ({
  representation: "elastic",
  properties: { elasticity, damping, tearAt },
});
export const combustible = (ignite, burn, residue, properties = {}) => ({
  properties: { ignite, burn, residue, ...properties },
});
export const conductor = (conductivity) => ({
  properties: { conductive: true, conductivity },
});
export const oxidizable = (oxidationRate, oxidationColor) => ({
  properties: { oxidationRate, oxidationColor },
});
export const surface = (friction, restitution, brittleness) => ({
  properties: { friction, restitution, brittleness },
});

export const optical = (
  lightAbsorption,
  lightReflectivity,
  refractiveIndex = 1,
  opticalDispersion = 0,
) => ({
  properties: {
    lightAbsorption,
    lightReflectivity,
    refractiveIndex,
    opticalDispersion,
  },
});
export const acoustic = (
  soundAbsorption,
  soundDispersion,
  soundTransmission,
) => ({
  properties: {
    soundAbsorption,
    soundDispersion,
    ...(soundTransmission === undefined ? {} : { soundTransmission }),
  },
});
