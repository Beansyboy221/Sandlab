import { ViewportCache, DEFAULT_CACHE_MB } from "./viewport-cache.js";
import { ViewportOverview } from "./viewport-overview.js";
export class ViewportState {
  constructor(world, megabytes = DEFAULT_CACHE_MB, overview = null) {
    this.cache = new ViewportCache(megabytes);
    this.overview = overview ?? new ViewportOverview(world);
    this.home = {
      x: world.viewOriginX + (world.width * world.metersPerPixel) / 2,
      y: world.viewOriginY + (world.height * world.metersPerPixel) / 2,
      width: world.width * world.metersPerPixel,
      height: world.height * world.metersPerPixel,
    };
  }
  clear() {
    this.cache.clear();
    this.overview.clear();
  }
  export(world) {
    this.overview.update(world);
    return { ...this.overview.export(), home: { ...this.home } };
  }
}
