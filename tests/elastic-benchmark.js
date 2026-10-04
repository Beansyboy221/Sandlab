import { performance } from "node:perf_hooks";
import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";

// Isolated whole-tick timing, including air and heat, with unsupported deforming
// meshes. Avoid benchmarking alongside browser/full regression processes.
for (const particles of [750, 3000]) {
  const w = new World(256, 600);
  w.seed = 7181;
  const columns = Math.ceil(Math.sqrt(particles));
  for (let n = 0; n < particles; n++) {
    const i = (20 + Math.floor(n / columns)) * w.width + 50 + (n % columns);
    w.set(i, M.Jelly);
    w.velocityX[i] = (w.random() - 0.5) * 1.5;
    w.velocityY[i] = 0.6;
  }
  for (let n = 0; n < 30; n++) w.step();
  const samples = [];
  for (let n = 0; n < 80; n++) {
    const start = performance.now();
    w.step();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      scene: "deformed Jelly free fall",
      particles,
      meanTickMs: +(
        samples.reduce((sum, v) => sum + v, 0) / samples.length
      ).toFixed(3),
      p95TickMs: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
      activeElasticNodes: w.elastic.locations.size,
      scratchCapacity: w.elastic.momentum.capacity,
    }),
  );
}
