// Cache geometry by body identity. Rebuild/cut/restore creates new bodies, so
// obsolete canvases become collectible without a global invalidation scan.
const textures = new WeakMap();
export const rigidTextureWork = { uploads: 0, draws: 0, fallbackCells: 0 };
export function resetRigidTextureWork() {
  rigidTextureWork.uploads =
    rigidTextureWork.draws =
    rigidTextureWork.fallbackCells =
      0;
}
function build(w, body) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const first = w.rigid.locations.get(body.ids[0]);
  if (first === undefined) return null;
  const originX = w.restX[first],
    originY = w.restY[first];
  for (const id of body.ids) {
    const i = w.rigid.locations.get(id);
    if (i === undefined) return null;
    const x = w.restX[i] - originX,
      y = w.restY[i] - originY;
    // Newly drawn cells attached to a rotating body may have non-grid rest
    // coordinates. Keep the continuous rectangle path for those shapes.
    if (
      Math.abs(x - Math.round(x)) > 1e-4 ||
      Math.abs(y - Math.round(y)) > 1e-4
    )
      return null;
    minX = Math.min(minX, Math.round(x));
    minY = Math.min(minY, Math.round(y));
    maxX = Math.max(maxX, Math.round(x));
    maxY = Math.max(maxY, Math.round(y));
  }
  const width = maxX - minX + 1,
    height = maxY - minY + 1;
  // Sparse or extreme bodies should not allocate enormous mostly empty images.
  if (
    width > 1024 ||
    height > 1024 ||
    width * height > Math.max(64, body.ids.length * 8)
  )
    return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d"),
    image = context.createImageData(width, height),
    offsets = new Uint32Array(body.ids.length);
  for (let n = 0; n < body.ids.length; n++) {
    const i = w.rigid.locations.get(body.ids[n]),
      x = Math.round(w.restX[i] - originX) - minX,
      y = Math.round(w.restY[i] - originY) - minY;
    offsets[n] = (y * width + x) * 4;
  }
  return {
    canvas,
    context,
    image,
    offsets,
    x: originX + minX - 0.5,
    y: originY + minY - 0.5,
  };
}
export function rigidTexture(w, body, colors) {
  let texture = textures.get(body);
  if (texture === undefined) {
    texture = build(w, body);
    textures.set(body, texture);
  }
  if (!texture) return null;
  const data = texture.image.data;
  let dirty = false;
  for (let n = 0; n < body.ids.length; n++) {
    const i = w.rigid.locations.get(body.ids[n]);
    if (i === undefined) return null;
    const c = i * 3,
      o = texture.offsets[n],
      r = colors[c],
      g = colors[c + 1],
      b = colors[c + 2];
    if (
      data[o] !== r ||
      data[o + 1] !== g ||
      data[o + 2] !== b ||
      data[o + 3] !== 255
    ) {
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
      dirty = true;
    }
  }
  // Colors remain live: paint, temperature and diagnostic views refresh only
  // changed textures. Lighting is applied later, never baked into this cache.
  if (dirty) {
    texture.context.putImageData(texture.image, 0, 0);
    rigidTextureWork.uploads++;
  }
  return texture;
}
