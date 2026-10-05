const modes = new Set(["walk", "hop", "swim", "fly"]);
function immutable(value) {
  if (typeof value === "function")
    throw Error("Entity definitions must be data");
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
// Compile once; the shared jointed-body solver owns integration and behavior.
export function compileActorProfiles(definitions) {
  const profiles = Object.create(null),
    visiting = new Set();
  function compile(key) {
    if (profiles[key]) return profiles[key];
    const input = definitions[key];
    if (!input || visiting.has(key))
      throw Error(`Invalid actor inheritance: ${key}`);
    visiting.add(key);
    if (input.base && Object.keys(input).length === 1) {
      profiles[key] = compile(input.base);
    } else {
      const data = { ...(input.base ? compile(input.base) : {}), ...input };
      if (
        !modes.has(data.mode) ||
        !Array.isArray(data.x) ||
        !Array.isArray(data.y) ||
        data.x.length !== 9 ||
        data.y.length !== 9 ||
        ![...data.x, ...data.y].every(Number.isFinite) ||
        !Array.isArray(data.links) ||
        data.links.length !== 8 ||
        !data.links.every(
          (link) =>
            Array.isArray(link) &&
            link.length === 2 &&
            link.every((i) => Number.isInteger(i) && i >= 0 && i < 9) &&
            link[0] !== link[1],
        )
      )
        throw Error(`Invalid actor anatomy: ${key}`);
      for (const property of ["speed", "acceleration", "jump", "headRadius"])
        if (!Number.isFinite(data[property]) || data[property] < 0)
          throw Error(`Invalid actor ${property}: ${key}`);
      // Copy before freezing so callers can continue editing their input data.
      const profile = structuredClone(data);
      profile.lengths = profile.links.map(([a, b]) =>
        Math.hypot(profile.x[a] - profile.x[b], profile.y[a] - profile.y[b]),
      );
      profiles[key] = immutable(profile);
    }
    visiting.delete(key);
    return profiles[key];
  }
  for (const key of Object.keys(definitions)) compile(key);
  return Object.freeze(profiles);
}

export function compileProjectileProfile(configuration, defaults) {
  const data = { ...defaults, ...configuration };
  for (const [key, value] of Object.entries(data))
    if (!Number.isFinite(value) || value < 0)
      throw Error(`Invalid projectile ${key}`);
  if (
    !Number.isInteger(data.lifetime) ||
    data.lifetime < 1 ||
    data.lifetime > 480 ||
    data.momentumRetention > 1 ||
    data.turnRate > Math.PI
  )
    throw Error("Projectile profile exceeds supported bounds");
  return Object.freeze(data);
}
