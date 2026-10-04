import { paletteEntries, paletteBase } from "./sim/material-families.js";
export const materialGroupsKey = "sandlab.material-groups.v1";
export const MAX_MATERIAL_GROUPS = 16;
const allowed = new Set(paletteEntries.map((m) => m.id));
function validateGroup(group) {
  if (
    !group ||
    typeof group !== "object" ||
    !/^custom-[1-9]\d{0,8}$/.test(group.id) ||
    typeof group.name !== "string" ||
    !group.name.trim() ||
    group.name.trim().length > 32 ||
    !Array.isArray(group.materials) ||
    group.materials.length > paletteEntries.length
  )
    throw Error("Invalid material group.");
  return {
    id: group.id,
    name: group.name.trim(),
    materials: [
      ...new Set(
        group.materials
          .filter(
            (id) => Number.isInteger(id) && id >= 0 && id < paletteBase.length,
          )
          .map((id) => paletteBase[id])
          .filter((id) => allowed.has(id)),
      ),
    ],
  };
}
export class MaterialGroups {
  constructor(storage) {
    this.storage = storage;
    this.groups = [];
    try {
      this.storage = storage ?? globalThis.localStorage;
      const saved = this.storage.getItem(materialGroupsKey);
      const raw = saved?.length <= 65536 ? JSON.parse(saved) : null;
      if (Array.isArray(raw) && raw.length <= MAX_MATERIAL_GROUPS) {
        const ids = new Set();
        for (const item of raw) {
          try {
            const group = validateGroup(item);
            if (!ids.has(group.id)) {
              this.groups.push(group);
              ids.add(group.id);
            }
          } catch {
            /* Ignore damaged entries without losing valid groups. */
          }
        }
      }
    } catch {
      /* Storage may be unavailable. Built-in groups remain usable. */
    }
  }
  get(id) {
    return this.groups.find((group) => group.id === id);
  }
  includes(id, material) {
    return this.get(id)?.materials.includes(material) ?? false;
  }
  save(id, name, materials) {
    if (!id && this.groups.length >= MAX_MATERIAL_GROUPS)
      throw Error("You can create up to 16 groups.");
    const existing = id ? this.get(id) : null;
    if (id && !existing) throw Error("This group no longer exists.");
    if (!id) {
      let n = 1;
      while (this.get(`custom-${n}`)) n++;
      id = `custom-${n}`;
    }
    const group = validateGroup({ id, name, materials });
    if (
      this.groups.some(
        (g) => g.id !== id && g.name.toLowerCase() === group.name.toLowerCase(),
      )
    )
      throw Error("Choose a different group name.");
    const next = existing
      ? this.groups.map((g) => (g.id === id ? group : g))
      : [...this.groups, group];
    this.persist(next);
    return group;
  }
  delete(id) {
    this.persist(this.groups.filter((g) => g.id !== id));
  }
  persist(groups) {
    try {
      this.storage.setItem(materialGroupsKey, JSON.stringify(groups));
    } catch {
      throw Error(
        "Groups could not be saved. Browser storage is unavailable or full.",
      );
    }
    this.groups = groups;
  }
}
