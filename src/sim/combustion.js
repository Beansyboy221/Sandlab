import { emitSpark } from "./sparks.js";
import { M, materials } from "./materials.js";

export function oxidizer(id) {
  return id === 0 || id === M.Oxygen || id === M.Fire;
}

export function hasOxidizer(w, i, x, y) {
  return (
    (x > 0 && oxidizer(w.cells[i - 1])) ||
    (x < w.width - 1 && oxidizer(w.cells[i + 1])) ||
    (y > 0 && oxidizer(w.cells[i - w.width])) ||
    (y < w.height - 1 && oxidizer(w.cells[i + w.width]))
  );
}

// Fuel remains a material while its lifetime counts down. The existing particle
// arrays therefore preserve burning surfaces through movement, undo, and saves.
export function burnFuel(world, i, x, y, material) {
  const { cells, temp, life, width: w } = world;
  if (!life[i] && temp[i] <= material.ignite) return;
  let air = false,
    wet = -1;
  world.eachNeighbor(x, y, (j) => {
    if (oxidizer(cells[j])) air = true;
    if (
      materials[cells[j]].waterLike &&
      temp[j] < 100 &&
      (material.category !== "liquid" || j !== i + w)
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
    world.set(i, material.residue || M.Smoke, 120);
    return;
  }

  if (material.burnPressure) world.fields.add(x, y, material.burnPressure);
  if (material.sparkChance && world.random() < material.sparkChance)
    emitSpark(world, i, x, y, material.residue || M.Ash);

  // Prefer the exposed upper face. Side vents also support walls and overhangs.
  if (y > 0) emitFlame(world, i, i - w, 0.32);
  if (x > 0) emitFlame(world, i, i - 1, 0.08);
  if (x < w - 1) emitFlame(world, i, i + 1, 0.08);
  if (world.random() < 0.1) {
    const dx = Math.floor(world.random() * 3) - 1;
    const nx = x + dx;
    if (y > 1 && nx >= 0 && nx < w && plumePassage(cells[i - w])) {
      const j = (y - 2) * w + nx;
      if (!cells[j])
        world.set(
          j,
          material.combustionGas || M.Smoke,
          Math.max(120, temp[i] * 0.3),
        );
    } else if (y > 0 && !cells[i - w])
      world.set(i - w, material.combustionGas || M.Smoke, 180);
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
  const id = world.cells[j];
  if (id === M.Fire) {
    world.temp[j] = Math.max(world.temp[j], 650);
    return;
  }
  if ((!id || id === M.Oxygen) && world.random() < probability)
    world.set(
      j,
      M.Fire,
      Math.max(650, world.temp[fuel]),
      materials[M.Fire].lifetime,
    );
}

export function reactFire(world, i, x, y) {
  const { cells, temp, life, width: w } = world;
  let quenched = false,
    smothered = 0;
  world.eachNeighbor(x, y, (j) => {
    if (materials[cells[j]].suppressesFlame) smothered++;
    if (materials[cells[j]].waterLike) {
      // A cold splash absorbs heat without every drop instantly becoming steam.
      const heat = Math.min(60, Math.max(0, (temp[i] - temp[j]) * 0.1));
      temp[j] += heat;
      temp[i] -= heat;
      if (temp[j] > 100 && materials[cells[j]].dryTo === undefined)
        world.set(j, M.Steam, Math.max(105, temp[j]));
      quenched = true;
    }
  });
  if (quenched) {
    world.set(i, M.Smoke, 100);
    return;
  }
  if (smothered >= 2) {
    life[i] = Math.max(1, life[i] - smothered * 3);
    temp[i] = Math.max(100, temp[i] - 60 * smothered);
  }
  if (!life[i] || --life[i] === 0) {
    world.set(i, world.residue[i] || (world.random() < 0.7 ? M.Smoke : 0), 120);
    return;
  }
  temp[i] = Math.max(temp[i], 550);
  world.eachNeighbor(x, y, (j) => {
    if (cells[j] === M.Oxygen) {
      world.set(j, M.Fire, 900, 25);
      life[i] = Math.min(80, life[i] + 4);
    } else if (materials[cells[j]].ignite) temp[j] += 70;
  });
  // Radiant heat reaches the next exposed cell on a fuel surface, not through walls.
  if (y < world.height - 1) {
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (nx < 0 || nx >= w) continue;
      const across = y * w + nx,
        below = across + w;
      if (plumePassage(cells[across]) && materials[cells[below]].ignite)
        temp[below] += 10;
    }
  }
}

// A flame next to a fuel surface lingers or creeps sideways before rising.
// Free flames retain the shared gas movement and pressure response.
export function moveSurfaceFlame(world, i, x, y) {
  if (y >= world.height - 1) return false;
  const w = world.width,
    below = i + w;
  if (!materials[world.cells[below]].ignite) return false;
  // An ignition flame needs contact time before it can travel to the next cell.
  if (
    !world.life[below] &&
    world.temp[below] < materials[world.cells[below]].ignite + 100
  )
    return world.random() < 0.97;
  const direction = world.random() < 0.5 ? -1 : 1;
  for (let side = 0; side < 2; side++) {
    const nx = x + (side ? -direction : direction);
    if (nx < 0 || nx >= w) continue;
    const j = y * w + nx,
      id = world.cells[j];
    if (
      (!id || id === M.Smoke) &&
      materials[world.cells[j + w]].ignite &&
      world.random() < 0.35
    ) {
      world.swap(i, j);
      return true;
    }
  }
  return world.random() < 0.55;
}
