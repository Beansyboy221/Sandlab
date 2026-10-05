import { projectileDefaults } from "./projectile-profiles.js";
import { materials } from "./materials.js";
import { actorDefinitions } from "./entity-definitions.js";
import {
  compileActorProfiles,
  compileProjectileProfile,
} from "./entity-registry.js";

export const actorProfiles = compileActorProfiles(actorDefinitions);
export const humanProfile = actorProfiles.ai;
export const actorProfile = (material) =>
  actorProfiles[materials[material]?.actor] || humanProfile;

// Registry-indexed lookup: no profile allocation or material-name branching per entity.
export const projectileProfiles = Object.freeze(
  materials.map((m) =>
    m.projectile
      ? compileProjectileProfile(m.projectileMotion ?? {}, projectileDefaults)
      : null,
  ),
);
