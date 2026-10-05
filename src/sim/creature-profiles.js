import { distanceRatio } from "./world-units.js";
import { projectileDefaults } from "./projectile-profiles.js";
import { materials } from "./materials.js";
import { actorDefinitions } from "./entity-definitions.js";
import {
  compileActorProfiles,
  compileProjectileProfile,
} from "./entity-registry.js";

export const actorProfiles = compileActorProfiles(actorDefinitions);
export const humanProfile = actorProfiles.ai;
const scaledProfiles = new Map();
export function actorProfile(material, world) {
  const base = actorProfiles[materials[material]?.actor] || humanProfile;
  const ratio = world ? distanceRatio(world) : 1;
  if (ratio === 1) return base;
  let profiles = scaledProfiles.get(ratio);
  if (!profiles) {
    profiles = new Map();
    scaledProfiles.set(ratio, profiles);
  }
  if (!profiles.has(base)) {
    const profile = { ...base };
    for (const key of ["x", "y", "lengths"])
      profile[key] = base[key].map((v) => v * ratio);
    for (const key of [
      "speed",
      "acceleration",
      "jump",
      "headRadius",
      "stepHeight",
    ])
      profile[key] = base[key] * ratio;
    profile.appearance = {
      ...base.appearance,
      torsoThickness: base.appearance.torsoThickness * ratio,
      ears: base.appearance.ears * ratio,
    };
    profiles.set(base, Object.freeze(profile));
  }
  return profiles.get(base);
}

// Registry-indexed lookup: no profile allocation or material-name branching per entity.
export const projectileProfiles = Object.freeze(
  materials.map((m) =>
    m.projectile
      ? compileProjectileProfile(m.projectileMotion ?? {}, projectileDefaults)
      : null,
  ),
);
