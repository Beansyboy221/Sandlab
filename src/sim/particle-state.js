import { mixtureFields } from "./mixtures.js";
import { rigidFields } from "./rigid-bodies.js";
import { elasticFields } from "./elasticity.js";
import { portalFields } from "./portals.js";
// Shared by copying, movement, and persistence: every particle property travels together.
export const particleStateFields = [
  "cells",
  "temp",
  "life",
  "charge",
  "cooldown",
  "clone",
  "residue",
  "variant",
  "pigment",
  "heading",
  "chargedAt",
  "moisture",
  "nutrition",
  "growth",
  "storedLiquid",
  "storedAmount",
  ...mixtureFields,
  ...portalFields,
  ...elasticFields,
  ...rigidFields,
];
