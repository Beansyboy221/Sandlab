import { materials } from "../materials.js";
export function solveMaterialDevice(w, i, x, y, m) {
  w.eachNeighbor(x, y, (j) => {
    const target = materials[w.cells[j]];
    if (m.deviceRule === "sink") {
      if (target.id && target.deviceRule !== "sink") w.transform(j, 0);
    } else if (m.deviceRule === "replicate") {
      if (!w.clone[i] && target.cloneable) w.clone[i] = target.id;
      if (!target.id && w.clone[i] && w.random() < m.spawnChance)
        w.transform(j, w.clone[i]);
    }
  });
}
