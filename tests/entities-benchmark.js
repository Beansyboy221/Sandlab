import { World } from "../src/sim/world.js";
import { M } from "../src/sim/materials.js";
import {
  applyLevelMetadata,
  levelProperties,
} from "../src/level-properties.js";
function measure(name, setup, ticks = 120) {
  const w = new World(160, 120);
  setup(w);
  for (let i = 0; i < 15; i++) w.step();
  const t = [];
  for (let i = 0; i < ticks; i++) {
    let a = performance.now();
    w.step();
    t.push(performance.now() - a);
  }
  t.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      name,
      particles: w.count,
      rigidBodies: w.rigid.bodies.length,
      elasticNodes: w.elastic.locations.size,
      meanMs: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(3),
      p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(3),
    }),
  );
}
for (const on of [false, true])
  measure("Tiny cut wood, simplification " + on, (w) => {
    w.mechanics.fragmentParticles = on;
    for (let y = 12; y < 75; y += 6)
      for (let x = 12; x < 145; x += 6) {
        for (let d = 0; d < 4; d++) w.set(y * w.width + x + d, M.Wood);
        w.set(y * w.width + x + 2, 0);
      }
  });
for (const canvasMode of ["normal", "planet", "vortex", "zero"])
  measure(
    canvasMode + " dense particles",
    (w) => {
      applyLevelMetadata(w, {
        ...levelProperties(w),
        canvasMode,
        border: "looping",
      });
      for (let y = 10; y < 100; y++)
        for (let x = 10; x < 150; x++)
          if ((x + y) % 3 !== 0)
            w.set(y * w.width + x, x % 3 === 0 ? M.Water : M.Sand);
    },
    60,
  );
const w = new World(320, 200);
for (let y = 8; y < 190; y += 3)
  for (let x = 8; x < 310; x += 3) w.set(y * w.width + x, M.Laser);
for (let n = 0; n < 32; n++)
  w.missiles.spawn(10 + n * 9, 195, 1, 0, M["Laser-Guided Missile"]);
const t = [];
for (let k = 0; k < 50; k++) {
  let a = performance.now();
  w.missiles.guidance.capture();
  for (const m of w.missiles.items) w.missiles.guidance.nearest(m);
  t.push(performance.now() - a);
}
t.sort((a, b) => a - b);
console.log(
  JSON.stringify({
    name: "Laser guidance only",
    lasers: w.missiles.guidance.count,
    missiles: 32,
    meanMs: t.reduce((a, b) => a + b, 0) / t.length,
    p95Ms: t[47],
  }),
);
