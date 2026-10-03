import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
export function scene(count = 40, large = true) {
  const w = new World(320, 200);
  w.mechanics.fragmentParticles = false;
  for (let x = 0; x < w.width; x++) w.set(190 * w.width + x, M.Wall);
  if (large)
    for (let y = 160; y < 180; y++)
      for (let x = 10; x < 310; x++) w.set(y * w.width + x, M.Steel);
  for (let n = 0; n < count; n++) {
    const x = 10 + (n % 100) * 3,
      y = (large ? 158 : 185) - Math.floor(n / 100) * 3;
    w.set(y * w.width + x, M.Copper, 20, 0, false);
    w.velocityY[y * w.width + x] = 0.5;
  }
  w.rigid.rebuild();
  return w;
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  for (const count of [20, 80, 200]) {
    const w = scene(count);
    for (let i = 0; i < 10; i++) w.rigid.step();
    const times = [];
    for (let i = 0; i < 30; i++) {
      const t = performance.now();
      w.rigid.step();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        count,
        particles: w.rigid.locations.size,
        meanMs: times.reduce((a, b) => a + b, 0) / times.length,
        p95Ms: times[28],
      }),
    );
  }
}
