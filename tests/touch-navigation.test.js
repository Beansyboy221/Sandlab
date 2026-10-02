import test from "node:test";
import assert from "node:assert/strict";
import { TouchNavigation } from "../src/touch-navigation.js";
const event = (pointerId, clientX, clientY, type = "pointerdown") => ({
  pointerId,
  clientX,
  clientY,
  type,
});
function fixture() {
  const calls = [];
  const renderer = {
    zoomAt: (...args) => calls.push(["zoom", ...args]),
    panBy: (...args) => calls.push(["pan", ...args]),
  };
  const drawing = {
    down: (e) => calls.push(["down", e.pointerId]),
    move: (e) => calls.push(["move", e.pointerId]),
    up: (e) => calls.push(["up", e.pointerId]),
    cancel: () => calls.push(["cancel"]),
  };
  return { nav: new TouchNavigation(renderer, drawing, 100000), calls };
}
test("a tap draws once and a moving single finger starts a continuous stroke", () => {
  const { nav, calls } = fixture();
  nav.down(event(1, 20, 30));
  assert.deepEqual(calls, []);
  nav.end(event(1, 20, 30, "pointerup"));
  assert.deepEqual(calls, [
    ["down", 1],
    ["up", 1],
  ]);
  calls.length = 0;
  nav.down(event(2, 20, 30));
  nav.move(event(2, 26, 30, "pointermove"));
  nav.end(event(2, 26, 30, "pointerup"));
  assert.deepEqual(calls, [
    ["down", 2],
    ["move", 2],
    ["up", 2],
  ]);
});
test("two touches suppress painting, zoom around the midpoint, and pan by screen displacement", () => {
  const { nav, calls } = fixture();
  nav.down(event(1, 20, 30));
  nav.down(event(2, 60, 30));
  assert.deepEqual(calls, [["cancel"]]);
  nav.move(event(2, 100, 30, "pointermove"));
  assert.deepEqual(calls.slice(1), [
    ["zoom", 2, 40, 30],
    ["pan", 20, 0],
  ]);
  nav.end(event(2, 100, 30, "pointerup"));
  nav.move(event(1, 40, 50, "pointermove"));
  assert.equal(calls.length, 3);
  nav.end(event(1, 40, 50, "pointerup"));
  assert.equal(nav.navigating, false);
  nav.down(event(3, 20, 30));
  nav.end(event(3, 20, 30, "pointerup"));
  assert.deepEqual(calls.slice(-2), [
    ["down", 3],
    ["up", 3],
  ]);
});
test("navigation interrupts an existing stroke and stays locked after a third finger or replacement", () => {
  const { nav, calls } = fixture();
  nav.down(event(1, 20, 30));
  nav.move(event(1, 25, 30, "pointermove"));
  nav.down(event(2, 60, 30));
  assert.equal(calls.at(-1)[0], "cancel");
  nav.down(event(3, 80, 30));
  nav.end(event(1, 25, 30, "pointerup"));
  const before = calls.length;
  nav.move(event(3, 100, 30, "pointermove"));
  assert.equal(calls[before][0], "zoom");
  nav.end(event(2, 60, 30, "pointerup"));
  nav.move(event(3, 110, 30, "pointermove"));
  nav.end(event(3, 110, 30, "pointerup"));
  assert.equal(calls.filter((c) => c[0] === "down").length, 1);
});
test("cancelling a pending tap or changing tools never starts a delayed stroke", () => {
  const { nav, calls } = fixture();
  nav.down(event(1, 20, 30));
  nav.end(event(1, 20, 30, "pointercancel"));
  assert.deepEqual(calls, []);
  nav.down(event(2, 20, 30));
  nav.cancel();
  nav.move(event(2, 70, 30, "pointermove"));
  nav.down(event(3, 90, 30));
  nav.end(event(2, 70, 30, "pointerup"));
  nav.end(event(3, 90, 30, "pointerup"));
  assert.deepEqual(calls, []);
  nav.down(event(4, 20, 30));
  nav.end(event(4, 20, 30, "pointerup"));
  assert.deepEqual(calls, [
    ["down", 4],
    ["up", 4],
  ]);
});
test("coincident fingers cannot produce invalid zoom factors", () => {
  const { nav, calls } = fixture();
  nav.down(event(1, 20, 30));
  nav.down(event(2, 20, 30));
  nav.move(event(2, 23, 30, "pointermove"));
  assert.equal(
    calls.some((c) => c[0] === "zoom"),
    false,
  );
  nav.end(event(1, 20, 30, "pointercancel"));
  nav.end(event(2, 23, 30, "pointercancel"));
  assert.equal(nav.touches.size, 0);
});
