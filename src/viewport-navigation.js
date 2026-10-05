import { predictHiddenEntities } from "./sim/hidden-entities.js";
import { entityCanSpawn } from "./sim/entity-metrics.js";
import { createLevel } from "./level.js";
import { levelProperties, validateCanvasSize } from "./level-properties.js";
import { ViewportState } from "./sim/viewport-state.js";
import {
  resampleViewport,
  resampleViewportFields,
  shiftViewport,
} from "./sim/viewport-resample.js";
import { validateScale } from "./sim/world-units.js";

// Only this viewport is a World with live solvers. Cached regions and the fixed
// overview are data; they never advance chemistry, bodies, fields or agents.
export function reframeWorld(
  w,
  {
    pitch = w.metersPerPixel,
    x = w.viewOriginX,
    y = w.viewOriginY,
    width = w.width,
    height = w.height,
    cacheMB = 16,
    predictHidden = true,
  } = {},
) {
  validateScale(pitch);
  // Validate the final dimensions before a multi-level transition can mutate state.
  validateCanvasSize(width, height, pitch);
  if (![x, y].every(Number.isFinite) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5)
    throw Error("Viewport is outside the supported coordinate range.");
  const factor = pitch / w.metersPerPixel;
  if (factor > 2 || factor < 0.5) {
    const oldPitch = w.metersPerPixel,
      oldX = w.viewOriginX,
      oldY = w.viewOriginY;
    const step = oldPitch * (factor > 2 ? 2 : 0.5),
      fraction = (step - oldPitch) / (pitch - oldPitch);
    reframeWorld(w, {
      pitch: step,
      x: oldX + (x - oldX) * fraction,
      y: oldY + (y - oldY) * fraction,
      cacheMB,
      predictHidden,
    });
    return reframeWorld(w, {
      pitch,
      x,
      y,
      width,
      height,
      cacheMB,
      predictHidden,
    });
  }
  const next = createLevel({
    ...levelProperties(w),
    width,
    height,
    metersPerPixel: pitch,
    viewOriginX: x,
    viewOriginY: y,
  });
  const state = w.viewportState ?? new ViewportState(w, cacheMB);
  state.cache.setLimit(cacheMB);
  state.overview.update(w);
  predictHiddenEntities(state.overview, w.tick, predictHidden);
  const mask = unresolvedDetailMask(w, next);
  const entry = state.cache.capture(w, mask);
  next.profile = w.profile;
  next.viewportState = state;
  next.seed = w.seed;
  next.tick = w.tick;
  next.setGravity(w.gravityX, w.gravityY);
  const dx = (x - w.viewOriginX) / w.metersPerPixel,
    dy = (y - w.viewOriginY) / w.metersPerPixel;
  if (
    pitch === w.metersPerPixel &&
    Number.isInteger(dx) &&
    Number.isInteger(dy)
  )
    shiftViewport(w, next, state);
  else resampleViewport(w, next, state, entry);
  resampleViewportFields(w, next);
  const inside = (px, py) =>
    px >= x && py >= y && px < x + width * pitch && py < y + height * pitch;
  next.stickmen.restore(
    state.overview.actors
      .filter((a) => inside(a.x[2], a.y[2]) && entityCanSpawn(next, a.material))
      .map((a) => {
        const out = { ...a };
        for (const key of ["x", "px", "y", "py"])
          out[key] = a[key].map(
            (v) => (v - (key.endsWith("x") ? x : y)) / pitch,
          );
        return out;
      }),
  );
  next.missiles.restore(
    state.overview.missiles
      .filter((a) => inside(a.x, a.y) && entityCanSpawn(next, a.material))
      .map((a) => ({
        ...a,
        x: (a.x - x) / pitch,
        y: (a.y - y) / pitch,
        vx: a.vx / pitch,
        vy: a.vy / pitch,
      })),
  );
  next.stickmen.nextId = Math.max(
    next.stickmen.nextId,
    ...state.overview.actors.map((a) => a.id + 1),
  );
  next.missiles.nextId = Math.max(
    next.missiles.nextId,
    ...state.overview.missiles.map((a) => a.id + 1),
  );
  const actorIds = new Set(next.stickmen.bodies.map((a) => a.id)),
    missileIds = new Set(next.missiles.items.map((a) => a.id));
  for (const a of state.overview.actors) a.wasActive = actorIds.has(a.id);
  for (const a of state.overview.missiles) a.wasActive = missileIds.has(a.id);
  next.environment.update();
  next.fragments.dirty = next.damage.some((v) => v > 0);
  Object.assign(w, next);
  w.rebind();
  return w;
}
export function zoomWorld(
  w,
  pitch,
  anchor = { x: w.width / 2, y: w.height / 2 },
  cacheMB = 16,
  predictHidden = true,
) {
  return reframeWorld(w, {
    pitch,
    x: w.viewOriginX + anchor.x * (w.metersPerPixel - pitch),
    y: w.viewOriginY + anchor.y * (w.metersPerPixel - pitch),
    cacheMB,
    predictHidden,
  });
}
export class ViewportNavigation {
  constructor(
    world,
    renderer,
    settings,
    onChange = () => {},
    beforeZoom = () => {},
  ) {
    Object.assign(this, { world, renderer, settings, onChange, beforeZoom });
    this.accumulator = 1;
    this.panX = this.panY = 0;
    renderer.navigation = this;
  }
  changed() {
    this.renderer.zoom = 0.125 / this.world.metersPerPixel;
    this.renderer.center = {
      x: this.world.width / 2,
      y: this.world.height / 2,
    };
    this.renderer.updateViewport();
    this.onChange();
  }
  zoomAt(factor, clientX, clientY) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.accumulator = Math.max(0.25, Math.min(4, this.accumulator * factor));
    const direction =
      this.accumulator >= Math.SQRT2
        ? -1
        : this.accumulator <= 1 / Math.SQRT2
          ? 1
          : 0;
    if (!direction) return;
    const pitch = this.world.metersPerPixel * 2 ** direction;
    if (pitch < 0.03125 || pitch > 8) {
      this.accumulator = 1;
      return;
    }
    const point = this.renderer.point(clientX, clientY),
      anchor = { x: Math.round(point.x), y: Math.round(point.y) };
    if (this.settings.get("pauseWhenZooming")) this.beforeZoom();
    zoomWorld(
      this.world,
      pitch,
      anchor,
      this.settings.get("maxCacheMB"),
      this.settings.get("predictHidden"),
    );
    this.accumulator *= 2 ** direction;
    this.changed();
  }
  panBy(dx, dy) {
    const a = this.renderer.point(0, 0),
      b = this.renderer.point(dx, dy);
    this.panX += a.x - b.x;
    this.panY += a.y - b.y;
    const x = Math.trunc(this.panX),
      y = Math.trunc(this.panY);
    if (!x && !y) return;
    this.panX -= x;
    this.panY -= y;
    reframeWorld(this.world, {
      x: this.world.viewOriginX + x * this.world.metersPerPixel,
      y: this.world.viewOriginY + y * this.world.metersPerPixel,
      cacheMB: this.settings.get("maxCacheMB"),
      predictHidden: this.settings.get("predictHidden"),
    });
    this.changed();
  }
  reset() {
    this.accumulator = 1;
    this.panX = this.panY = 0;
    this.renderer.zoom = 0.125 / this.world.metersPerPixel;
    this.renderer.center = {
      x: this.world.width / 2,
      y: this.world.height / 2,
    };
    this.renderer.updateViewport();
  }
}

// Cache only subpixel boundaries, mixed cells and already-unresolved detail;
// uniform bulk is reconstructed directly from the live coarse material.
function unresolvedDetailMask(w, next) {
  if (next.metersPerPixel <= w.metersPerPixel) return null;
  const mask = new Uint8Array(w.length);
  for (let y = 0; y < next.height; y++)
    for (let x = 0; x < next.width; x++) {
      const left = Math.floor(
          (next.viewOriginX + x * next.metersPerPixel - w.viewOriginX) /
            w.metersPerPixel,
        ),
        top = Math.floor(
          (next.viewOriginY + y * next.metersPerPixel - w.viewOriginY) /
            w.metersPerPixel,
        ),
        size = Math.round(next.metersPerPixel / w.metersPerPixel);
      let first = -1,
        mixed = false,
        occupied = false;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const sx = left + dx,
            sy = top + dy,
            id =
              sx >= 0 && sy >= 0 && sx < w.width && sy < w.height
                ? w.cells[sy * w.width + sx]
                : 0;
          if (first < 0) first = id;
          else if (first !== id) mixed = true;
          occupied ||= !!id;
          if (id && w.detailRef[sy * w.width + sx]) mixed = true;
        }
      if (!occupied || !mixed) continue;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const sx = left + dx,
            sy = top + dy;
          if (sx >= 0 && sy >= 0 && sx < w.width && sy < w.height)
            mask[sy * w.width + sx] = 1;
        }
    }
  return mask;
}
