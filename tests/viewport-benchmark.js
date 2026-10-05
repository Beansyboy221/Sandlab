import { performance } from "node:perf_hooks";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { zoomWorld } from "../src/viewport-navigation.js";
import { snapshot, pack } from "../src/persistence.js";
const results = [];
for (const scene of ["empty", "sand", "mixed"]) {
  const w = new World(320, 200);
  w.mechanics.temperatureSimulation = false;
  if (scene !== "empty")
    for (let y = 50; y < 150; y++)
      for (let x = 100; x < 220; x++)
        w.set(
          y * w.width + x,
          scene === "mixed" && (x + y) % 13 === 0 ? M.Water : M.Sand,
        );
  const times = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    zoomWorld(w, i % 2 ? 0.125 : 0.25);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const ticks = [];
  for (let i = 0; i < 30; i++) {
    const t = performance.now();
    w.step();
    if (i > 9) ticks.push(performance.now() - t);
  }
  ticks.sort((a, b) => a - b);
  results.push({
    scene,
    grid: [w.width, w.height],
    navigationMedianMs: +times[3].toFixed(2),
    tickMedianMs: +ticks[10].toFixed(2),
    cacheBytes: w.viewportState.cache.bytes,
    cacheLimitBytes: w.viewportState.cache.limit,
    packedSaveBytes: Buffer.byteLength(JSON.stringify(pack(snapshot(w)))),
  });
}
console.log(JSON.stringify(results, null, 2));
