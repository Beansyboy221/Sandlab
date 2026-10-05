import { materials } from "../sim/materials.js";
import { machineAppearances } from "../sim/entity-definitions.js";
import { drawEntitySprite } from "./entity-sprite.js";
export function drawMachine(c, w, a) {
  const recipe = machineAppearances[materials[a.material].vehicle];
  if (!recipe) return false;
  c.save();
  c.translate(a.x, a.y);
  c.rotate(Math.atan2(-w.gravityX, w.gravityY));
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
