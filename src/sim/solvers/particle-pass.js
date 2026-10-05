import { materials, M } from "../materials.js";
import { react } from "../reactions.js";
import { exchangeParticleHeat } from "./thermodynamics.js";

// One traversal preserves contact/reaction/movement ordering and seeded results.
export function stepParticles(world) {
  world.inParticlePass = true;
  const w = world.width,
    h = world.height,
    reverse = world.gravityX ? (world.gravityX > 0 ? 1 : 0) : world.tick % 2;
  // Skip empty 16-cell blocks; a tick stamp prevents moved cells from updating twice.
  for (let row = 0; row < h; row++) {
    // Along gravity, process downstream first. Across horizontal gravity,
    // alternate row order as we do columns for vertical gravity.
    const y =
      world.gravityY < 0 || (!world.gravityY && world.tick % 2)
        ? row
        : h - 1 - row;
    for (let k = 0; k < world.chunkWidth; k++) {
      const cx = reverse ? world.chunkWidth - 1 - k : k;
      if (!world.chunks[(y >> 4) * world.chunkWidth + cx]) continue;
      const start = cx * 16,
        end = Math.min(w, start + 16);
      for (let offset = 0; offset < end - start; offset++) {
        const x = reverse ? end - 1 - offset : start + offset,
          i = y * w + x;
        if (!world.cells[i] || world.updated[i] === world.tick) continue;
        world.updated[i] = world.tick;
        if (world.portalCooldown[i]) world.portalCooldown[i]--;
        exchangeParticleHeat(world, i, x, y);
        react(world, i, x, y);
        if (
          world.cells[i] === M.Fan &&
          world.mechanics.pressureSimulation !== false
        ) {
          for (let d = 2; d < 15; d++) {
            const nx = x + d;
            const j = world.index(nx, y);
            if (j < 0) break;
            if (world.fields.blocks(world.cells[j])) break;
            world.fields.airflow.impulse(world.fields, nx, y, 1, 0, 0.4);
          }
        } else if (world.cells[i]) {
          // Only movement sleeps. Heat and chemistry continue in settled chunks.
          const chunk = (y >> 4) * world.chunkWidth + cx,
            air = world.fields.index(x, y);
          if (
            world.environment.kinetic ||
            materials[world.cells[i]].ray ||
            world.tick + 1 - world.motionStamp[chunk] < 30 ||
            world.tick % 8 === 0 ||
            Math.abs(world.fields.pressure[air]) > 1 ||
            Math.abs(world.fields.airflow.velocityX[air]) > 0.1 ||
            Math.abs(world.fields.airflow.velocityY[air]) > 0.1
          )
            world.move(i, x, y);
        }
      }
    }
  }
  world.inParticlePass = false;
}
