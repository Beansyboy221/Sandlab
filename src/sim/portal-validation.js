import { materials } from "./materials.js";

// Check relationships before restore allocates or changes the live world.
export function validatePortalState(data) {
  const shapes = new Map(),
    { cells, portalId, portalLink, heading } = data.arrays;
  for (let i = 0; i < cells.length; i++) {
    const id = portalId?.[i] || 0,
      link = portalLink?.[i] || 0;
    if (!materials[cells[i]].portal) {
      if (id || link) throw Error("Invalid portal data on a non-portal cell.");
      continue;
    }
    if (!id || ![0, 2, 4, 6, 7].includes(heading?.[i]))
      throw Error("Invalid portal identity or facing.");
    const old = shapes.get(id);
    if (old && (old.link !== link || old.facing !== heading[i]))
      throw Error("Inconsistent portal shape.");
    shapes.set(id, { link, facing: heading[i] });
  }
  for (const [id, shape] of shapes)
    if (
      shape.link &&
      (shape.link === id || shapes.get(shape.link)?.link !== id)
    )
      throw Error("Invalid portal link.");
}
