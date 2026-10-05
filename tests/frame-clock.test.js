import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameClock, FRAME_INTERVAL } from "../src/frame-clock.js";
import { Settings } from "../src/settings.js";

test("display and physics stay at 60 or lower on common refresh rates", () => {
  for (const refresh of [30, 60, 75, 90, 120, 144, 165, 240]) {
    for (const speed of [0.25, 0.5, 1, 2]) {
      const clock = new FrameClock(0);
      let frames = 0,
        ticks = 0;
      for (let i = 1; i <= refresh * 10; i++) {
        const elapsed = clock.takeFrame((i * 1000) / refresh);
        if (!elapsed) continue;
        frames++;
        ticks += clock.takeTick(elapsed, speed, false) ? 1 : 0;
      }
      assert.equal(frames, Math.min(refresh, 60) * 10, `render ${refresh}`);
      assert.ok(ticks <= 600);
      if (refresh >= 60) assert.equal(ticks, Math.min(1, speed) * 600);
    }
  }
});

test("slow or stalled frames never burst, and pause clears tick debt", () => {
  const clock = new FrameClock(0);
  assert.equal(clock.takeTick(clock.takeFrame(1000), 1, false), true);
  assert.equal(clock.droppedTicks, 59);
  assert.equal(clock.takeFrame(1001), 0);
  assert.equal(
    clock.takeTick(clock.takeFrame(1000 + FRAME_INTERVAL), 1, false),
    true,
  );
  assert.equal(clock.takeTick(1000, 1, true), false);
  assert.equal(clock.takeTick(FRAME_INTERVAL / 2, 1, false), false);
  assert.equal(clock.takeTick(FRAME_INTERVAL / 2, 1, false), true);
  clock.reset(10000);
  assert.equal(clock.takeFrame(10000), 0);
  assert.equal(
    clock.takeTick(clock.takeFrame(10000 + FRAME_INTERVAL), 1, false),
    true,
  );
  assert.equal(clock.droppedTicks, 0);
});

test("irregular timestamps maintain capped cadence and speed changes reset debt", () => {
  const clock = new FrameClock(0);
  let now = 0,
    frames = 0,
    ticks = 0;
  for (let i = 0; i < 2000; i++) {
    now += [3, 6, 12, 8, 4][i % 5];
    const elapsed = clock.takeFrame(now);
    if (elapsed) {
      frames++;
      ticks += clock.takeTick(elapsed, 1, false) ? 1 : 0;
    }
    assert.ok(frames <= Math.floor((now + 0.01) / FRAME_INTERVAL));
    assert.ok(ticks <= frames);
  }
  clock.resetSimulation();
  assert.equal(clock.takeTick(FRAME_INTERVAL, 0.5, false), false);
  assert.equal(clock.takeTick(FRAME_INTERVAL, 0.5, false), true);
});

test("legacy 2× preferences fall back to 1× and cannot bypass the cap", () => {
  const storage = { getItem: () => JSON.stringify({ speed: 2 }), setItem() {} };
  const settings = new Settings(storage);
  assert.equal(settings.get("speed"), 1);
  settings.set("speed", 2);
  assert.equal(settings.get("speed"), 1);
  settings.set("speed", 0.25);
  assert.equal(settings.get("speed"), 1); // Playback now belongs to a saved world.
});
