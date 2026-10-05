import { materials } from "./materials.js";

// Prediction advances a pose once when changing the viewport; it is not an
// offscreen solver. The sweep and destructive-event history have fixed caps.
export function predictHiddenEntities(overview, tick, enabled = true) {
  const blocked = (x, y) => {
    const i = overview.index(x, y),
      m = i < 0 ? null : materials[overview.arrays.cells[i]];
    return (
      !!m?.id &&
      !m.gas &&
      m.category !== "liquid" &&
      overview.arrays.quantity[i] >= 0.25
    );
  };
  function predict(a, actor) {
    const since = a.observedTick ?? tick,
      dt = Math.max(0, Math.min(3600, tick - since));
    if (
      !dt &&
      !overview.events.some(
        (event) => (event.sequence ?? 0) > (a.observedEventSequence ?? 0),
      )
    )
      return a;
    const x = actor ? a.x[2] : a.x,
      y = actor ? a.y[2] : a.y;
    const vx = actor ? a.x[2] - a.px[2] : a.vx,
      vy = actor ? a.y[2] - a.py[2] : a.vy;
    const dx = enabled ? vx * dt : 0,
      dy = enabled ? vy * dt : 0;
    for (const event of overview.events)
      if (
        event.tick >= since &&
        event.tick <= tick &&
        (event.sequence === undefined ||
          event.sequence > (a.observedEventSequence ?? 0))
      ) {
        const elapsed = event.tick - since,
          px = x + (enabled ? vx * elapsed : 0),
          py = y + (enabled ? vy * elapsed : 0);
        if (Math.hypot(px - event.x, py - event.y) <= event.radius) return null;
      }
    let fraction = 1;
    const steps = Math.min(
      64,
      Math.max(1, Math.ceil(Math.hypot(dx, dy) / overview.pitch)),
    );
    for (let i = 1; i <= steps; i++)
      if (blocked(x + (dx * i) / steps, y + (dy * i) / steps)) {
        fraction = (i - 1) / steps;
        break;
      }
    if (actor) {
      const out = {
        ...a,
        observedTick: tick,
        observedEventSequence: overview.events.at(-1)?.sequence ?? 0,
      };
      for (const key of ["x", "px", "y", "py"])
        out[key] = a[key].map(
          (v) => v + (key.endsWith("x") ? dx : dy) * fraction,
        );
      if (fraction < 1) {
        out.px = [...out.x];
        out.py = [...out.y];
      }
      return out;
    }
    const life = materials[a.material].vehicle ? 0 : a.life - dt;
    if (!materials[a.material].vehicle && life < 1) return null;
    return {
      ...a,
      x: x + dx * fraction,
      y: y + dy * fraction,
      life,
      observedTick: tick,
      observedEventSequence: overview.events.at(-1)?.sequence ?? 0,
      ...(fraction < 1 ? { vx: 0, vy: 0 } : {}),
    };
  }
  overview.actors = overview.actors
    .map((a) => predict(a, true))
    .filter(Boolean);
  overview.missiles = overview.missiles
    .map((a) => predict(a, false))
    .filter(Boolean);
}
