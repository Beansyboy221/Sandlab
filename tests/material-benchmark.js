// Usage: node tests/material-benchmark.js [checkout]; run without other heavy jobs.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const checkout = resolve(process.argv[2] || ".");
const load = (path) => import(pathToFileURL(resolve(checkout, path)));
const { World } = await load("src/sim/world.js");
const { M } = await load("src/sim/materials.js");
const { react } = await load("src/sim/reactions.js");
for (const [name, material] of [
  ["Dormant plants", M.Plant],
  ["Nutrient reservoir", M.Dirt],
  ["Settled sand", M.Sand],
]) {
  const w = new World(320, 200);
  w.mechanics.temperatureSimulation = false;
  w.mechanics.pressureSimulation = false;
  w.random = () => 0.5;
  for (let y = 40; y < 160; y++)
    for (let x = 60; x < 260; x++) w.set(y * 320 + x, material, 2);
  const indices = [];
  for (let i = 0; i < w.length; i++) if (w.cells[i]) indices.push(i);
  const times = [];
  for (let pass = 0; pass < 120; pass++) {
    w.tick++;
    const start = performance.now();
    for (const i of indices) react(w, i, i % w.width, Math.floor(i / w.width));
    if (pass >= 30) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      scene: name,
      particles: indices.length,
      meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3),
      p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(3),
    }),
  );
}
