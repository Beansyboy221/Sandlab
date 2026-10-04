// Shared scalar optics: angles follow Snell's law; dispersion changes the index
// with wavelength, instead of inventing a fixed bend for every surface.
export const wavelengths = [550, 650, 610, 580, 550, 500, 460, 420];
export const spectrum = [
  [255, 255, 240],
  [255, 60, 48],
  [255, 144, 38],
  [255, 223, 55],
  [90, 235, 92],
  [55, 224, 230],
  [72, 115, 255],
  [183, 75, 255],
];
export function spectralIndex(material, band = 0) {
  const wavelength = wavelengths[band] || 550;
  return Math.max(
    1,
    material.refractiveIndex +
      material.opticalDispersion * ((550 / wavelength) ** 2 - 1),
  );
}
export function bendLight(dx, dy, nx, ny, from, to, out) {
  if (dx * nx + dy * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const cosine = -(dx * nx + dy * ny),
    eta = from / to,
    k = 1 - eta * eta * (1 - cosine * cosine);
  if (k < 0) {
    out[0] = dx + 2 * cosine * nx;
    out[1] = dy + 2 * cosine * ny;
    out[2] = 1;
  } else {
    const normal = eta * cosine - Math.sqrt(k);
    out[0] = eta * dx + normal * nx;
    out[1] = eta * dy + normal * ny;
    out[2] = 0;
  }
  return out;
}
export function reflectedLight(dx, dy, nx, ny, out) {
  const dot = dx * nx + dy * ny;
  out[0] = dx - 2 * dot * nx;
  out[1] = dy - 2 * dot * ny;
  out[2] = 1;
  return out;
}
export function spectrumPigment(band) {
  const [r, g, b] = spectrum[band] || spectrum[0];
  return (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
}

export function opticalNormal(w, materials, j, dx, dy, out) {
  const x = j % w.width,
    y = Math.floor(j / w.width),
    medium = materials[w.cells[j]].refractiveIndex;
  let nx = 0,
    ny = 0;
  for (let d = 0; d < 4; d++) {
    const ox = d === 0 ? 1 : d === 1 ? -1 : 0,
      oy = d === 2 ? 1 : d === 3 ? -1 : 0,
      k = w.index(x + ox, y + oy);
    if (
      k < 0 ||
      !w.cells[k] ||
      Math.abs(materials[w.cells[k]].refractiveIndex - medium) > 0.005
    ) {
      nx += ox;
      ny += oy;
    }
  }
  const length = Math.hypot(nx, ny);
  if (length) {
    nx /= length;
    ny /= length;
  } else if (Math.abs(dx) >= Math.abs(dy)) {
    nx = -Math.sign(dx);
    ny = 0;
  } else {
    nx = 0;
    ny = -Math.sign(dy);
  }
  if (dx * nx + dy * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  out[0] = nx;
  out[1] = ny;
  return out;
}
