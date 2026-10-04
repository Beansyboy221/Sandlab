// Usage: node tests/acoustics-benchmark.js [checkout-directory]
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(process.argv[2] || ".");
const { World } = await import(
  pathToFileURL(resolve(root, "src/sim/world.js"))
);
const w = new World(320, 200);
w.fields.rebuildBarriers(w);
w.sound.emit("explosion", 160, 100, 1);
let activeTicks = 0,
  total = 0,
  slept = null;
for (let tick = 1; tick <= 600; tick++) {
  w.tick = tick;
  const active = w.sound.active,
    start = performance.now();
  w.sound.step(w);
  if (active) {
    activeTicks++;
    total += performance.now() - start;
  }
  if (!w.sound.active && slept === null) slept = tick;
}
console.log(
  JSON.stringify({
    scene: "320×200 sealed-room impulse",
    sleepTicks: slept,
    activeTicks,
    activeStepMeanMs: total / activeTicks,
  }),
);
if (w.sound.listener) {
  w.sound.rebuildAbsorption(w);
  let total = 0;
  for (let run = 0; run < 100; run++) {
    w.sound.revision++;
    const start = performance.now();
    w.sound.listener.prepare(w, 160, 100);
    for (let voice = 0; voice < 8; voice++)
      w.sound.listener.sample(20 + voice * 36, 80);
    if (run >= 20) total += performance.now() - start;
  }
  console.log(
    JSON.stringify({
      scene: "Shared listener + eight voices",
      meanMs: total / 80,
      visitedTiles: w.sound.listener.visited,
      maxTiles: 8192,
    }),
  );
}
