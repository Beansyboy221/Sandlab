import { materialDefinitions } from "./material-definitions.js";
import { compileMaterials } from "./material-registry.js";
import {
  applyMaterialProfiles,
  applyFragmentProfiles,
} from "./material-profiles.js";

export const {
  M,
  materials,
  tables: materialTables,
} = compileMaterials(
  materialDefinitions,
  applyMaterialProfiles,
  {
    Rocket: "Missile",
    "Heat-Seeking Missile": "Seeking Missile",
    "Laser-Guided Missile": "Guided Missile",
  },
  // Both historical slots remain readable; the newer debris owns the name.
  { "Wood Chips": [96, 121] },
  applyFragmentProfiles,
);
export const canonicalMaterial = (id) => materials[id]?.canonicalId ?? id;
export const categories = [
  "all",
  "powder",
  "liquid",
  "gas",
  "solid",
  "static",
  "elastic",
  "life",
  "energy",
];
export const categoryLabels = {
  all: "All",
  powder: "Powders",
  liquid: "Liquids",
  gas: "Gases",
  solid: "Solids",
  static: "Static",
  elastic: "Elastics",
  life: "Plants",
  energy: "Energy",
  devices: "Devices",
};
