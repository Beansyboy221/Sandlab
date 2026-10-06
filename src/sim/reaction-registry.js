// Expand component matching to direct ID-pair lookup once at startup. There is
// no rule search, tag matching or allocation for individual reacting particles.
export function compileContactReactions(materials) {
  const contacts = [];
  function pair(a, b, resultA, resultB, options = {}) {
    for (const id of [a, b, resultA, resultB])
      if (!Number.isInteger(id) || !materials[id])
        throw Error("Unknown reaction product");
    const rule = Object.freeze({
      a,
      b,
      resultA,
      resultB,
      chance: 1,
      ...options,
    });
    (contacts[a] ??= [])[b] = rule;
    (contacts[b] ??= [])[a] = rule;
  }
  const active = materials.filter(
    (m) => !m.deprecated && m.materialState !== "legacy",
  );
  for (const acid of active.filter((m) => m.acidity > 0)) {
    for (const target of active) {
      if (target.alkalinity > 0) {
        pair(
          acid.id,
          target.id,
          acid.neutralizedTo,
          target.carbonate
            ? target.neutralizationGas
            : target.neutralizationProduct,
          {
            chance: Math.min(1, acid.acidity * target.alkalinity * 2),
            heat: target.carbonate ? 0 : 35,
            pressure: target.carbonate ? 4 * target.carbonate : undefined,
            dissolvedProduct: target.carbonate
              ? target.neutralizationProduct
              : undefined,
          },
        );
      } else if (target.acidMetalReactivity > 0) {
        pair(acid.id, target.id, target.acidProduct, target.acidGas, {
          chance: Math.min(
            1,
            acid.acidity * target.acidMetalReactivity * target.surfaceArea,
          ),
          heat: 12,
        });
      } else if (
        target.materialState === "oxide" &&
        target.acidProduct !== undefined
      ) {
        pair(acid.id, target.id, acid.neutralizedTo, target.acidProduct, {
          chance: acid.acidity * target.acidSolubility,
        });
      } else if (target.oxidationRate > 0) {
        pair(acid.id, target.id, acid.neutralizedTo, target.id, {
          chance: acid.acidity * 0.06,
          oxide: -32,
        });
      }
    }
  }
  for (const metal of active.filter((m) => m.reactsWithWater))
    for (const water of active.filter((m) => m.aqueous))
      pair(
        metal.id,
        water.id,
        metal.waterReactionProduct,
        metal.waterReactionGas,
        {
          heat: 600,
          pressure: 2,
        },
      );
  for (const oxidant of active.filter((m) => m.oxidizingStrength > 0))
    for (const metal of active.filter((m) => m.halideTo !== undefined))
      pair(oxidant.id, metal.id, 0, metal.halideTo, {
        chance: oxidant.oxidizingStrength * 0.04 * metal.surfaceArea,
      });
  for (const oxide of active.filter((m) => m.reductionTo !== undefined))
    for (const reducer of active.filter((m) => m.reducingStrength > 0))
      pair(oxide.id, reducer.id, oxide.reductionTo, reducer.reductionGas, {
        minimumTemperature: oxide.reductionTemperature,
        chance: reducer.reducingStrength * 0.04,
        pressure: 0.5,
      });

  // Compound formation needs known products, not guesses from generic properties.
  // These recipes are data; the same bounded executor handles every pair.
  for (const m of active.filter((m) => m.hydratesTo !== undefined))
    for (const water of active.filter(
      (m) => m.waterLike && m.materialState === "bulk",
    ))
      pair(water.id, m.id, 0, m.hydratesTo);
  for (const m of active.filter((m) => m.nutritionSoluble))
    for (const water of active.filter(
      (m) => m.waterLike && m.materialState === "bulk",
    ))
      pair(water.id, m.id, water.id, 0, { dissolveNutrition: true });
  for (const m of active.filter((m) => m.soluble))
    for (const water of active.filter(
      (m) => m.waterLike && m.materialState === "bulk",
    ))
      pair(water.id, m.id, water.id, 0, { dissolve: m.id });
  // Explicit recipes override inferred component pairs, but two authored recipes
  // cannot claim the same unordered pair with ambiguous products or conditions.
  const explicitPairs = new Set();
  for (const m of active)
    for (const recipe of m.contactReactions || []) {
      const key =
        Math.min(m.id, recipe.with) * materials.length +
        Math.max(m.id, recipe.with);
      if (explicitPairs.has(key))
        throw Error("Conflicting authored contact pair");
      explicitPairs.add(key);
      const { with: partner, selfTo, otherTo, ...conditions } = recipe;
      pair(m.id, partner, selfTo, otherTo, conditions);
    }
  return contacts;
}
