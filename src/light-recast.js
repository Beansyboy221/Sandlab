import { materials } from "./sim/materials.js";
import {
  bendLight,
  reflectedLight,
  spectralIndex,
  spectrum,
  opticalNormal,
} from "./optical-transport.js";

// A bounded secondary transport pass supplements diffuse illumination with
// directional reflections and spectral caustics. It never spawns light sources.
export class LightRecast {
  constructor() {
    this.normal = new Float64Array(2);
    this.direction = new Float64Array(3);
  }
  update(f, w, amount) {
    this.casts = this.steps = 0;
    if (!amount || !f.interfaceCount) return;
    const stride = Math.max(1, Math.ceil(f.interfaceCount / 32));
    for (let n = 0; n < f.interfaceCount && this.casts < 64; n += stride) {
      const i = f.interfaces[n],
        x = (i % w.width) + 0.5,
        y = Math.floor(i / w.width) + 0.5,
        m = materials[w.cells[i]];
      let source = -1,
        incident = 0;
      for (let s = 0; s < f.sourceCount; s++) {
        const o = s * 7,
          dx = x - f.sources[o] * f.cellSize,
          dy = y - f.sources[o + 1] * f.cellSize,
          distance = Math.hypot(dx, dy),
          radius = f.sources[o + 6] * f.cellSize,
          power =
            (f.sources[o + 5] * Math.max(0, 1 - distance / radius) ** 2) /
            (1 + distance * distance * 0.0015);
        if (power > incident) {
          incident = power;
          source = o;
        }
      }
      if (source < 0 || incident < 0.01) continue;
      const sx = f.sources[source] * f.cellSize,
        sy = f.sources[source + 1] * f.cellSize,
        distance = Math.hypot(x - sx, y - sy);
      if (distance < 1 || !f.trace(sx, sy, x, y, true)) continue;
      const dx = (x - sx) / distance,
        dy = (y - sy) / distance;
      opticalNormal(w, materials, i, dx, dy, this.normal);
      if (m.lightReflectivity >= 0.5) {
        reflectedLight(dx, dy, this.normal[0], this.normal[1], this.direction);
        this.cast(
          f,
          w,
          x + this.direction[0] * 0.75,
          y + this.direction[1] * 0.75,
          this.direction[0],
          this.direction[1],
          incident * amount * m.lightReflectivity,
          0,
          materials[0],
          f.sources,
          source + 2,
        );
      } else if (m.refractsLight) {
        const bands = m.opticalDispersion > 0.01 ? 7 : 1;
        for (let b = 1; b <= bands && this.casts < 64; b++) {
          const band = bands === 1 ? 0 : b;
          bendLight(
            dx,
            dy,
            this.normal[0],
            this.normal[1],
            1,
            spectralIndex(m, band),
            this.direction,
          );
          this.cast(
            f,
            w,
            x,
            y,
            this.direction[0],
            this.direction[1],
            (incident * amount * m.lightTransmission) / bands,
            band,
            m,
            f.sources,
            source + 2,
          );
        }
      }
    }
  }
  cast(f, w, x, y, dx, dy, energy, band, medium, source, color) {
    this.casts++;
    let interfaces = 0,
      last = w.index(Math.floor(x), Math.floor(y));
    for (let step = 0; step < 256 && energy > 0.001; step++) {
      this.steps++;
      x += dx * 0.75;
      y += dy * 0.75;
      const i = w.index(Math.floor(x), Math.floor(y));
      if (i < 0) break;
      if (i === last) continue;
      if (
        last >= 0 &&
        i % w.width !== last % w.width &&
        Math.floor(i / w.width) !== Math.floor(last / w.width)
      ) {
        const a = w.index(i % w.width, Math.floor(last / w.width)),
          b = w.index(last % w.width, Math.floor(i / w.width));
        if (
          a >= 0 &&
          b >= 0 &&
          materials[w.cells[a]].occludesLight &&
          materials[w.cells[b]].occludesLight
        )
          break;
      }
      const m = materials[w.cells[i]];
      if (
        m.id !== medium.id &&
        Math.abs(m.refractiveIndex - medium.refractiveIndex) > 0.001
      ) {
        if (++interfaces > 4) break;
        opticalNormal(w, materials, m.id ? i : last, dx, dy, this.normal);
        bendLight(
          dx,
          dy,
          this.normal[0],
          this.normal[1],
          spectralIndex(medium, band),
          spectralIndex(m, band),
          this.direction,
        );
        dx = this.direction[0];
        dy = this.direction[1];
        if (this.direction[2]) break;
        medium = m;
      }
      const j = f.index(
        Math.floor((i % w.width) / f.cellSize),
        Math.floor(Math.floor(i / w.width) / f.cellSize),
      );
      for (let c = 0; c < 3; c++) {
        const hue = band ? spectrum[band][c] / 255 : 1;
        f.recast[j * 3 + c] = Math.max(
          f.recast[j * 3 + c],
          energy * hue * source[color + c],
        );
      }
      if (m.occludesLight) break;
      energy *= m.lightTransmission * 0.985;
      last = i;
    }
  }
}
