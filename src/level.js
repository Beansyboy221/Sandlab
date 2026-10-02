import { World } from "./sim/world.js";
import { particleStateFields } from "./sim/particle-state.js";
import {
  validateLevelProperties,
  applyLevelMetadata,
} from "./level-properties.js";
export function createLevel(properties) {
  const p = validateLevelProperties(properties),
    world = new World(p.width, p.height);
  applyLevelMetadata(world, p);
  return world;
}
// x/y locate the new canvas origin in the old grid. Negative offsets add space
// before the old origin; positive offsets crop from its left/top sides.
export function resizeLevel(world, properties, x, y) {
  const p = validateLevelProperties(properties);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < Math.min(0, world.width - p.width) ||
    x > Math.max(0, world.width - p.width) ||
    y < Math.min(0, world.height - p.height) ||
    y > Math.max(0, world.height - p.height)
  )
    throw Error("Place the canvas within the preview bounds.");
  const resized = createLevel(p);
  resized.seed = world.seed;
  resized.tick = world.tick;
  resized.fields.ambientTemperature = world.fields.ambientTemperature;
  resized.fields.ambientPressure = world.fields.ambientPressure;
  resized.fields.temperature.fill(world.fields.ambientTemperature);
  resized.setGravity(world.gravityX, world.gravityY);
  const left = Math.max(0, -x),
    right = Math.min(p.width, world.width - x);
  for (
    let row = Math.max(0, -y);
    row < Math.min(p.height, world.height - y);
    row++
  ) {
    const source = (row + y) * world.width + left + x,
      target = row * p.width + left;
    for (const name of [...particleStateFields, "backgroundPaint"])
      resized[name].set(
        world[name].subarray(source, source + right - left),
        target,
      );
  }
  for (let i = 0; i < resized.length; i++)
    if (resized.cells[i]) {
      resized.count++;
      resized.chunks[resized.chunk(i)]++;
    }
  for (let fy = 0; fy < resized.fields.height; fy++)
    for (let fx = 0; fx < resized.fields.width; fx++) {
      const sx = Math.min(p.width - 1, fx * 4 + 2) + x,
        sy = Math.min(p.height - 1, fy * 4 + 2) + y;
      if (sx >= 0 && sx < world.width && sy >= 0 && sy < world.height) {
        resized.fields.pressure[fy * resized.fields.width + fx] =
          world.fields.pressure[world.fields.index(sx, sy)];
        resized.fields.temperature[fy * resized.fields.width + fx] =
          world.fields.temperature[world.fields.index(sx, sy)];
      }
    }
  resized.elastic.rebuild(resized);
  resized.motionStamp.fill(resized.tick + 1);
  return resized;
}
export class ResizePlacement {
  constructor(world, properties) {
    this.oldWidth = world.width;
    this.oldHeight = world.height;
    this.properties = validateLevelProperties(properties);
    this.maxX = Math.abs(world.width - properties.width);
    this.maxY = Math.abs(world.height - properties.height);
    this.width = Math.max(world.width, properties.width);
    this.height = Math.max(world.height, properties.height);
    this.setPosition(Math.floor(this.maxX / 2), Math.floor(this.maxY / 2));
  }
  setPosition(x, y) {
    this.positionX = Math.max(0, Math.min(this.maxX, Math.round(x)));
    this.positionY = Math.max(0, Math.min(this.maxY, Math.round(y)));
    this.x =
      this.properties.width > this.oldWidth ? -this.positionX : this.positionX;
    this.y =
      this.properties.height > this.oldHeight
        ? -this.positionY
        : this.positionY;
  }
  get oldBox() {
    return {
      x: this.properties.width > this.oldWidth ? this.positionX : 0,
      y: this.properties.height > this.oldHeight ? this.positionY : 0,
      width: this.oldWidth,
      height: this.oldHeight,
    };
  }
  get newBox() {
    return {
      x: this.properties.width > this.oldWidth ? 0 : this.positionX,
      y: this.properties.height > this.oldHeight ? 0 : this.positionY,
      width: this.properties.width,
      height: this.properties.height,
    };
  }
}
