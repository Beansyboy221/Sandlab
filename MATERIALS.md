# Data-driven material authoring

Materials configure reusable solver mechanisms; they never contain callbacks or
run their own physics. Add an append-only definition in `sim/material-definitions.js`,
compose traits from `material-authoring.js`, and let the registry resolve product
names, validate ranges and freeze the result. Existing numeric IDs and aliases
must remain stable. This is a source authoring interface, not a runtime pack editor.

For example, a different plant can reuse germination, pore transport, heat,
combustion, growth and photosynthesis without any solver recognizing its name:

```js
defineMaterial({
  name: "Reed",
  representation: "rigid",
  color: "#668c52",
  density: 0.7,
  traits: [
    porous(2, 0.25, 0.99),
    combustible(275, 260, "Ash", { combustionGas: "CO2" }),
    biological("shoot", {
      growthChance: 0.04,
      growthLimit: 18,
      uprightBias: 0.85,
      photosynthesisInput: "CO2",
      photosynthesisOutput: "Oxygen",
    }),
  ],
  properties: {
    initialMoisture: 80,
    biologicalHost: true,
    decomposable: true,
    rooted: true,
    waterOnly: true,
  },
});
```

A seed uses `biological("seed", { growthTo: "Reed" })`. It germinates beside a
material with `growthSubstrate: true`, rather than requiring Dirt by name. Change
products or growing conditions in data to make another species. `colonize` consumes
`decomposable` neighbors; `infect` consumes `biologicalHost` tissue with finite
incubation, lifetime and replication. `reservoir` receives nutrients without budding.

## Component ownership

| Component data                                                                               | Shared calculation                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Representation, density, friction, restitution, strength, brittleness, family fragments      | Physics: displacement, rigid/elastic contacts, impact work and fracture |
| Viscosity, porosity, permeability, retention, absorbable and water-only flags                | Fluid motion and finite pore/mixture transport                          |
| Conductivity, specific heat, thresholds, phase products and heat sources                     | Thermodynamics and phase transitions                                    |
| Air permeability, buoyancy, pressure triggers, air sources                                   | Atmospheric pressure/face velocities, vents and forces                  |
| Conductive flag, resistance, oxidation and circuit behavior kind                             | Electrical pulses, gates and sparks                                     |
| Absorption, reflection, refractive index and spectral dispersion                             | Optical packets and read-only visual radiance                           |
| Sound absorption, transmission and dispersion                                                | Acoustic waves, listener paths and property-based audio                 |
| Acidity, alkalinity, carbonate, solubility, oxidation/reduction and product references       | Compiled contact chemistry, dissolution and corrosion                   |
| Ignition, burn duration, oxidizer, suppression, combustion products and sparks               | Combustion, heat and local pressure                                     |
| Biology mode, hydration/nutrient conditions, probabilities, temperatures, depth and products | Shared biology solver                                                   |
| Suspended condensate and rain/vapor/discharge products                                       | Local cloud coalescence and charge separation                           |
| Decay emission, ray transport, force/sink/replicator/portal capabilities                     | Bounded energy and device mechanisms                                    |
| Actor anatomy, behavior kind, movement/habitat/prey and projectile profiles                  | Agent decision and body integration solvers                             |

Configuration describes inputs and supported behavior kinds. The solvers contain
the algorithms and shared numerical constants. Introducing a missing mechanism
requires a bounded shared solver, with a regression fixture; adding a material
that combines existing mechanisms requires data only.

## Chemistry recipes

Chemical identity cannot be inferred from density or acidity. Ordinary chemical
components generate indexed contact pairs; a known special reaction can instead
supply an explicit, declarative recipe:

```js
reactive({
  with: "Other Reagent",
  selfTo: "Liquid Product",
  otherTo: "Gas Product",
  minimumTemperature: 50,
  maximumTemperature: 100,
  chance: 0.2,
  heat: 12,
  pressure: 2,
});
```

All referenced products must exist. Each material may declare at most 16 recipes.
Pairs are symmetric; explicit recipes override inferred ones, and duplicate
explicit pairs are rejected. The shared executor handles finite contents,
temperature windows, reagent consumption, heat, gas pressure and sound. Callbacks,
unknown keys and arbitrary executable strings are rejected. An optional
`dissolvedProduct` carries an ingredient in the `selfTo` host's finite reservoir.
The fixed occupied-cell model still approximates reaction yields rather than
conserving exact molecular mass or enthalpy.

## Performance and state contract

- Compile immutable definitions and indexed contact pairs once; never scan the
  material registry or interpret recipes during a particle update.
- Keep the fused heat → reaction → motion traversal and direct four-neighbor queries.
- Growth uses four local neighbors and a shared maximum of 32 births per world tick;
  dense colonies cannot generate unbounded work in one step.
- Cloud samples remain a staggered 5 × 5 neighborhood every 16 ticks, with at most
  one lightning trace per world tick. Optical packets, contact/fracture work,
  populations and acoustic voices retain their existing global budgets.
- Particle moisture, nutrition, growth, lifetimes, stored ingredients and other
  changing quantities remain typed arrays; these changes add no per-particle objects
  or saved arrays. Graphics and audio consume state without advancing it.
- Retired combined liquids and wet-host saves use declarative migration metadata;
  ordinary mixing keeps constituents in the existing finite reservoirs.

`tests/data-driven-materials.test.js` exercises arbitrary names and reordered IDs,
resource use, light/temperature limits, decomposition/infection, recipe execution,
compiler safety and growth budgets. It also rejects stock-name branches in the
runtime simulation. See [PHYSICS_MODEL.md](PHYSICS_MODEL.md) for accuracy limits and
[ENGINE_PLAN.md](ENGINE_PLAN.md) for calibration priorities.

Physical exchange also accepts `specificHeat` (positive normalized capacity),
`electricalResistance` (nonnegative dissipative pulse loss), `dragCoefficient`
(nonnegative face drag) and `pulseEnergy` (explicit powered-device supply).
`quantity` is represented parcel amount, not a decorative alpha or occupancy value.
State changes preserve its density-weighted mass, and all pulse state travels with
particles through editing, transport and persistence.

Powered devices may override supply per particle through saved `electricalSupply`;
it scales with represented amount and physical pixel area, while ordinary devices
retain their configured low-power defaults.
