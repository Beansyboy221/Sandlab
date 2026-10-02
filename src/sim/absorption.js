import { M, materials } from "./materials.js";
const watery = (id) => materials[id].waterLike;
export const absorbable = (id) =>
  !!materials[id]?.absorbable || id === M.Oil || id === M.Kerosene;
function mixWater(a, b) {
  if (a === M.Brine || b === M.Brine) return M.Brine;
  if (a === M["Nutrient water"] || b === M["Nutrient water"])
    return M["Nutrient water"];
  return b;
}
export function absorb(w, i, x, y) {
  let type = w.storedLiquid[i],
    amount = w.storedAmount[i];
  const releasing =
    w.cooldown[i] > 0 || Math.abs(w.fields.pressure[w.fields.index(x, y)]) > 3;
  if (!releasing && (i + w.tick) % 3 === 0)
    w.eachNeighbor(x, y, (j) => {
      const liquid = w.cells[j];
      if (liquid === M.Sponge) {
        const other = w.storedAmount[j],
          otherType = w.storedLiquid[j];
        if (
          amount > other + 3 &&
          (!otherType ||
            otherType === type ||
            (watery(type) && watery(otherType)))
        ) {
          const transfer = Math.min(4, (amount - other) >> 2, 48 - other);
          w.temp[j] =
            (w.temp[j] * (other + 1) + w.temp[i] * transfer) /
            (other + 1 + transfer);
          w.storedAmount[j] += transfer;
          w.storedLiquid[j] =
            watery(type) && watery(otherType)
              ? mixWater(type, otherType)
              : type;
          amount -= transfer;
        }
        return;
      }
      if (
        amount >= 48 ||
        !absorbable(liquid) ||
        (type && liquid !== type && !(watery(type) && watery(liquid)))
      )
        return;
      const temperature = w.temp[j];
      type = watery(type) && watery(liquid) ? mixWater(type, liquid) : liquid;
      w.temp[i] = (w.temp[i] * (amount + 1) + temperature) / (amount + 2);
      w.transform(j, 0);
      amount++;
    });
  if (amount) {
    const boiling = watery(type) && w.temp[i] > 100;
    const burning =
      materials[type].ignite && w.temp[i] > materials[type].ignite;
    if (releasing || boiling || burning) {
      // Release at most one stored cell per tick, without erasing neighboring particles.
      for (let side = 0; side < 4; side++) {
        const order = boiling || burning ? 3 - side : side;
        const [dx, dy] = releases[order],
          j = w.relativeIndex(x, y, dx, dy);
        if ((j < 0 && w.border !== "void") || (j >= 0 && w.cells[j])) continue;
        if (j >= 0)
          w.transform(
            j,
            boiling
              ? materials[type].dryTo !== undefined
                ? type
                : M.Steam
              : burning
                ? M.Fire
                : type,
            boiling ? 120 : burning ? 680 : w.temp[i],
          );
        amount--;
        if (boiling || burning) w.fields.add(x, y, 0.8);
        if (boiling) w.temp[i] = Math.max(90, w.temp[i] - 5);
        break;
      }
      if (boiling && amount) w.temp[i] = Math.min(w.temp[i], 100);
    }
  }
  w.storedLiquid[i] = amount ? type : 0;
  w.storedAmount[i] = amount;
}

const releases = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
];
