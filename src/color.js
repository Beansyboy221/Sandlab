export function hsvToRgb(h, s, v) {
  const chroma = v * s,
    x = chroma * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - chroma;
  const channels =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return channels.map((c) => Math.round((c + m) * 255));
}
export function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = !d
    ? 0
    : max === r
      ? 60 * (((g - b) / d) % 6)
      : max === g
        ? 60 * ((b - r) / d + 2)
        : 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, max ? d / max : 0, max];
}
export const rgbToHex = (rgb) =>
  "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
export function parseHex(value) {
  if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return null;
  let hex = value.replace("#", "");
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
