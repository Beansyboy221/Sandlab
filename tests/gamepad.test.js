import test from "node:test";
import assert from "node:assert/strict";
import { GamepadState, stickAxis } from "../src/gamepad-state.js";
import { toolGroups, brushTools } from "../src/sim/tools.js";
const pad = () => ({
  index: 0,
  connected: true,
  mapping: "standard",
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});
test("controller axes suppress drift, preserve analog movement and reject invalid readings", () => {
  assert.equal(stickAxis(0.1), 0);
  assert.equal(stickAxis(NaN), 0);
  assert.equal(stickAxis(Infinity), 0);
  assert.equal(stickAxis(1), 1);
  assert.equal(stickAxis(-1), -1);
  assert.ok(stickAxis(0.6) > 0 && stickAxis(0.6) < 1);
});
test("buttons fire once, initial held buttons are disarmed and disconnects clear controls", () => {
  const input = new GamepadState(),
    device = pad();
  device.buttons[7].value = 0.8;
  assert.equal(input.poll(device), true);
  assert.equal(input.held[7], 1);
  assert.equal(input.pressed[7], 0);
  device.buttons[7].value = 0;
  input.poll(device);
  device.buttons[9].pressed = true;
  input.poll(device);
  assert.equal(input.pressed[9], 1);
  input.poll(device);
  assert.equal(input.pressed[9], 0);
  device.axes[0] = 1;
  input.poll(device);
  assert.equal(input.axes[0], 1);
  input.poll(null);
  assert.ok(input.axes.every((v) => v === 0));
  assert.ok(input.held.every((v) => v === 0));
  device.mapping = "";
  input.poll(device);
  assert.equal(input.connected, false);
});
test("every tool belongs to exactly one category", () => {
  const categorized = toolGroups.flatMap((g) => g.tools);
  assert.equal(new Set(categorized).size, categorized.length);
  assert.deepEqual([...categorized].sort(), brushTools.map((t) => t[0]).sort());
});
