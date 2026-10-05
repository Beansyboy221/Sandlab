import { distanceRatio } from "../sim/world-units.js";
import { materials } from "../sim/materials.js";
import { machineAppearances } from "../sim/entity-definitions.js";
import { drawEntitySprite } from "./entity-sprite.js";
export function drawMachine(c, w, a) {
  const recipe = machineAppearances[materials[a.material].vehicle];
  if (!recipe) return false;
  c.save();
  c.translate(a.x, a.y);
  c.rotate(Math.atan2(-w.gravityX, w.gravityY));
  c.scale(distanceRatio(w), distanceRatio(w));
  const direction =
    Math.cos(a.angle) * w.gravityY - Math.sin(a.angle) * w.gravityX;
  drawEntitySprite(
    c,
    recipe,
    materials[a.material].color,
    w.tick,
    a.health,
    direction,
  );
  c.restore();
  return true;
}
