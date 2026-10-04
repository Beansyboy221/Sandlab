import { emitSpark } from "./sparks.js";
import { M, materials } from "./materials.js";

export function oxidizer(id) {
  return id === 0 || id === M.Oxygen || id === M.Fire;
}

export function hasOxidizer(w, i, x, y) {
  for (const [dx, dy] of neighbors) {
    const j = w.index(x + dx, y + dy);
    if (j >= 0 ? oxidizer(w.cells[j]) : w.border === "void") return true;
  }
  return false;
}

// Fuel remains a material while its lifetime counts down. The existing particle
// arrays therefore preserve burning surfaces through movement, undo, and saves.
export function burnFuel(world, i, x, y, material) {
  const { cells, temp, life } = world;
  if (!life[i] && temp[i] <= material.ignite) return;
  let air =
      world.border === "void" &&
      (x === 0 || y === 0 || x === world.width - 1 || y === world.height - 1),
    wet = -1;
  world.eachNeighbor(x, y, (j) => {
    if (oxidizer(cells[j])) air = true;
    if (
      materials[cells[j]].waterLike &&
      temp[j] < 100 &&
      (material.category !== "liquid" || j !== world.relativeIndex(x, y, 0, 1))
    )
      wet = j;
  });
  if (wet !== -1) {
    life[i] = 0;
    temp[i] = Math.min(temp[i], 100);
    return;
  }
  // Oxygen starvation pauses combustion without replenishing consumed fuel.
  if (!air && !material.selfOxidizing) return;
  if (!life[i]) {
    if (temp[i] <= material.ignite || world.random() >= 0.16) return;
    life[i] = Math.max(
      1,
      Math.round(material.burn * (0.85 + world.random() * 0.3)),
    );
  }

  temp[i] = Math.max(650, temp[i]);
  if (--life[i] === 0) {
    world.transform(
      i,
      material.residue || material.combustionGas || M.Smoke,
      120,
    );
    return;
  }

  // Heating and combustion generate pressure even for non-explosive fuels.
  world.fields.add(x, y, 0.025);
  if (material.burnPressure) world.fields.add(x, y, material.burnPressure);
  if ((world.tick + i) % 18 === 0)
    world.sound.emit("crackle", x, y, 0.1, material.density, material.id, {
      pressure: 0.025 + (material.burnPressure || 0),
      heat: 70,
      gas: 1,
    });
  if (material.sparkChance && world.random() < material.sparkChance)
    emitSpark(world, i, x, y, material.residue || M.Ash);

  // Prefer the exposed upper face. Side vents also support walls and overhangs.
  const above = world.relativeIndex(x, y, 0, -1);
  emitFlame(world, i, above, 0.32);
  emitFlame(world, i, world.relativeIndex(x, y, -1, 0), 0.08);
  emitFlame(world, i, world.relativeIndex(x, y, 1, 0), 0.08);
  if (world.random() < 0.1) {
    const dx = Math.floor(world.random() * 3) - 1,
      vent = world.relativeIndex(x, y, dx, -2);
    if (above >= 0 && vent >= 0 && plumePassage(cells[above])) {
      if (!cells[vent])
        world.transform(
          vent,
          material.category === "gas" || world.random() < 0.45
            ? material.combustionGas || M.Smoke
            : M.Smoke,
          Math.max(120, temp[i] * 0.3),
        );
    } else if (above >= 0 && !cells[above])
      world.transform(above, material.combustionGas || M.Smoke, 180);
  }
  // Heat travels along contiguous fuel, while the exposed-face test controls ignition.
  world.eachNeighbor(x, y, (j) => {
    if (materials[cells[j]].ignite) temp[j] += 12;
  });
}
function plumePassage(id) {
  return !id || id === M.Fire || id === M.Smoke || id === M.Oxygen;
}
function emitFlame(world, fuel, j, probability) {
  if (j < 0) return;
  const id = world.cells[j];
  if (id === M.Fire) {
    world.temp[j] = Math.max(world.temp[j], 650);
    return;
  }
  if ((!id || id === M.Oxygen) && world.random() < probability)
    world.transform(
      j,
      M.Fire,
      Math.max(650, world.temp[fuel]),
      materials[M.Fire].lifetime,
    );
}

export function reactFire(world, i, x, y) {
  const { cells, temp, life } = world;
  let quenched = false,
    smothered = 0;
  world.eachNeighbor(x, y, (j) => {
    if (materials[cells[j]].suppressesFlame) smothered++;
    if (materials[cells[j]].waterLike) {
      // A cold splash absorbs heat without every drop instantly becoming steam.
      const heat = Math.min(60, Math.max(0, (temp[i] - temp[j]) * 0.1));
      temp[j] += heat;
      temp[i] -= heat;
      if (
        temp[j] > 100 &&
        !world.nutrition[j] &&
        materials[cells[j]].dryTo === undefined
      ) {
        world.transform(j, M.Steam, Math.max(105, temp[j]));
        world.fields.add(x, y, 1.5);
      }
      quenched = true;
    }
  });
  if (quenched) {
    world.transform(i, M.Smoke, 100);
    return;
  }
  if (smothered >= 2) {
    life[i] = Math.max(1, life[i] - smothered * 3);
    temp[i] = Math.max(100, temp[i] - 60 * smothered);
  }
  if (!life[i] || --life[i] === 0) {
    world.transform(
      i,
      world.residue[i] || (world.random() < 0.7 ? M.Smoke : 0),
      120,
    );
    return;
  }
  temp[i] = Math.max(temp[i], 550);
  world.fields.add(x, y, 0.04);
  if ((world.tick + i) % 20 === 0)
    world.sound.emit("crackle", x, y, 0.08, 1, M.Fire, {
      pressure: 0.04,
      heat: 70,
    });
  world.eachNeighbor(x, y, (j) => {
    if (cells[j] === M.Oxygen) {
      world.transform(j, M.Fire, 900, 25);
      life[i] = Math.min(80, life[i] + 4);
    } else if (materials[cells[j]].ignite) temp[j] += 70;
  });
  // Radiant heat reaches the next exposed cell on a fuel surface, not through walls.
  for (const dx of [-1, 1]) {
    const across = world.relativeIndex(x, y, dx, 0),
      below = world.relativeIndex(x, y, dx, 1);
    if (
      across >= 0 &&
      below >= 0 &&
      plumePassage(cells[across]) &&
      materials[cells[below]].ignite
    )
      temp[below] += 10;
  }
}

// A flame next to a fuel surface lingers or creeps sideways before rising.
// Free flames retain the shared gas movement and pressure response.
export function moveSurfaceFlame(world, i, x, y) {
  const below = world.relativeIndex(x, y, 0, 1);
  if (below < 0) return false;
  if (!materials[world.cells[below]].ignite) return false;
  // An ignition flame needs contact time before it can travel to the next cell.
  if (
    !world.life[below] &&
    world.temp[below] < materials[world.cells[below]].ignite + 100
  )
    return true;
  const direction = world.random() < 0.5 ? -1 : 1;
  for (let side = 0; side < 2; side++) {
    const across = side ? -direction : direction;
    const j = world.relativeIndex(x, y, across, 0),
      support = world.relativeIndex(x, y, across, 1);
    if (j < 0 || support < 0) continue;
    const id = world.cells[j];
    if (
      (!id || id === M.Smoke) &&
      materials[world.cells[support]].ignite &&
      world.random() < 0.35
    ) {
      world.swap(i, j);
      return true;
    }
  }
  return world.random() < 0.55;
}

const neighbors = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
