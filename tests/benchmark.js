import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import { loadPreset } from "../src/presets.js";
function measure(name, fill) {
  const w = new World();
  fill(w);
  for (let i = 0; i < 30; i++) w.step();
  const times = [];
  for (let i = 0; i < 180; i++) {
    const t = performance.now();
    w.step();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(
    `${name}: ${w.count} particles; mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms per tick`,
  );
}
measure("Seed garden", (w) => loadPreset(w, "garden"));
measure("Fluid stress", (w) => {
  for (let y = 30; y < 200; y++)
    for (let x = 0; x < 320; x++)
      w.set(y * 320 + x, y < 80 ? M.Oil : y < 150 ? M.Water : M.Mercury);
});
measure("Powder stress", (w) => {
  for (let y = 0; y < 180; y++)
    for (let x = 0; x < 320; x++)
      if (w.random() < 0.75) w.set(y * 320 + x, M.Sand);
});
measure("Burning surfaces", (w) => {
  for (let x = 20; x < 300; x++)
    for (let y = 155; y < 190; y++) w.set(y * 320 + x, M.Wood);
  for (let x = 25; x < 300; x += 12) w.set(154 * 320 + x, M.Fire);
});
measure("Absorption laboratory", (w) => loadPreset(w, "absorption"));

measure("Reaction bench", (w) => loadPreset(w, "reactions"));
measure("Pottery kiln", (w) => loadPreset(w, "pottery"));
measure("Elastic bodies", (w) => {
  for (let y = 15; y < 85; y++)
    for (let x = 90; x < 170; x++) w.set(y * w.width + x, M.Rubber);
  for (let x = 0; x < w.width; x++) w.set(185 * w.width + x, M.Wall);
});

measure("Rigid solids", (w) => {
  for (let x = 0; x < w.width; x++) w.set(185 * w.width + x, M.Wall);
  for (let y = 20; y < 120; y += 22)
    for (let x = 40; x < 280; x += 30)
      for (let dy = 0; dy < 12; dy++)
        for (let dx = 0; dx < 18; dx++)
          w.set((y + dy) * w.width + x + dx, M.Steel);
});
