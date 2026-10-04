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
    Prism: "Crystal",
    Wire: "Copper",
    Patina: "Copper",
    Rocket: "Missile",
    Kerosene: "Fuel",
    "Steel Powder": "Metal Dust",
    "Wood Chips": "Sawdust",
    Storm: "Cloud",
    "Heat-Seeking Missile": "Seeking Missile",
    "Laser-Guided Missile": "Guided Missile",
  },
  // Historical chips and Storm slots migrate through canonical material IDs.
  {},
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
  life: "Flora",
  energy: "Energy",
  devices: "Devices",
};
