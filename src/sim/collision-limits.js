// Fixed per-body/per-pixel bounds. Crowding may defer a candidate move, never
// create unbounded pair processing, recursive searches or deleted particles.
export const collisionLimits = Object.freeze({
  contacts: 16,
  plans: 96,
  substeps: 13,
  supportPasses: 3,
  rasterSearch: 64,
  rasterVisitsPerPixel: 16,
  grainSearch: 64,
  grainDepth: 6,
  grainVisits: 256,
  grainMoves: 64,
});
