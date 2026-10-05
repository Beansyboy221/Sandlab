# Sandlab's physics contract

Sandlab models macroscopic behavior at a pixel scale. The rule for abstraction is:
**resolve local quantities, contact and geometry when they affect gameplay;
approximate effects below a pixel or above the solver's bandwidth with bounded,
data-driven rules.** A material name must not choose an unrelated physical result.

## Materials, states and presets

A base material owns shared physical and chemical components. A state selects its
representation and overrides only the properties that differ: grains, a rigid
body, an elastic mesh, a liquid, a gas, an oxide or a compound. Configuration is
compiled once, not copied into a JavaScript object for every particle.

`baseMaterial` preserves the family; `materialState` describes the form. Fracture
uses `brittleness`, accumulated damage and `toughness`, then the family's
`fragmentTo`. Fine fragments inherit conductivity, corrosion, combustion and
optical properties; a cut does not turn Concrete into Stone or Crystal into Glass.
Their density stays unchanged unless the state explicitly supplies a bulk-density
override. Voids between grains normally supply the lower aggregate density.

A physical phase transition must stay in its family, checked by the compiler.
Temperature thresholds determine phase; pressure-dependent boiling, calibrated
heat capacity and latent heat are not implemented yet. Rust cannot become metal
by heating alone: its chemical reduction requires a reducer and a temperature
threshold. Oxidation is saved state and travels through cuts and physical phases.

The palette shows base presets, not every internal state. Metal Dust, Rust,
Sawdust and Glass Shards remain valid simulation/save forms but are not independent
paint choices. Sand is an explicit granular silicate preset alongside Glass;
heating creates the family's liquid, cooling creates Glass. These configurations
are silicate proxies, not mineral composition assays. Electronic assemblies retain
separate controls, with their modeled metal or glass housing as the base; melting
destroys their circuitry instead of cooling back into a working device.

Old IDs remain readable. Generic Rubble migrates to Stone Gravel because the
historical save never recorded its original composition; new fracture paths retain
that identity. Existing Brick debris keeps its stable slot as Brick Fragments.

## Chemical abstraction

Chemistry cannot be inferred from density, acidity or appearance alone. Use two
layers:

1. Components describe classes of behavior: acid strength, alkalinity, carbonate
   content, water reactivity, susceptibility to chemical attack, oxidation/reduction
   behavior, solubility and exposed surface area.
2. Known product references describe the supported chemical families. The compiler
   expands components into symmetric indexed contact rules. A shared executor
   checks conditions, consumes reagents once, creates products and couples heat
   and gas production to the atmosphere. Adding a configured acid or carbonate
   does not require a branch in a solver.

The stock Acid models an aqueous, non-oxidizing acid; complex acids require
explicit product data rather than inference from strength alone.

`acidity` and `alkalinity` are normalized kinetic-strength coefficients from zero
to one, not pH. The current amount model consumes whole reagent cells; weaker
strength changes reaction probability, not the number of equivalents in a cell.
Each successful attack exhausts its reagent. Pores and dissolved ingredients are
finite integer reservoirs. Etching keeps attacked substance in the resulting
carrier, rather than deleting it; evaporation can release it again.

Carbonate neutralization produces CO2 and a dissolved salt product. Metal-acid
reactions produce Hydrogen and a configured ionic salt state. Iron Salt and Copper
Salt are simplified compound families, not exact molecular formulas; their
identity and optical/thermal data are chemical configuration, not deductions from
mechanical density. Oxidizing gas requires a configured compound product; hot
carbon reduction uses a configured reduced state and gas product.

**The next chemical quantity increment** should add acid/base equivalent capacity
and concentration, with concentration traveling through the existing mixture and
pore transport. Then derive aqueous pH for display and equilibrium, rather than
using pH as a universal material property. Add ion balance, buffers and partial
neutralization only after finite amount/yield tests. Adding a fake pH slider to
non-aqueous solids would not make chemistry more accurate.

Fixed occupied cells, different densities and whole-cell product yields do not
provide exact SI mass or enthalpy conservation. Pressure/heat yields are normalized
coefficients. Preserve stored ingredients and explicitly consumed reagents today;
calibrate substance amounts, thermal energy and chemical yield accounting before
claiming quantitative conservation or laboratory accuracy.

## Shared mechanical systems

| System            | Resolve                                                                                             | Approximate / current limit                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Motion            | Density, gravity, local displacement, friction, contact impulses, rigid rotation and spring tension | Fixed cell occupancy and bounded contact/substep budgets; no continuum stress tensor           |
| Liquids           | Density displacement, viscosity, radial pressure relaxation, pore transport and retention           | Cellular local flow; no full incompressible Navier–Stokes or calibrated surface tension        |
| Heat              | Local neighbor exchange, air temperature and configured phase thresholds                            | Relative conductivity and thresholds; heat capacity, latent heat and calibrated units are next |
| Air               | Local pressure, face velocity, barriers, moving-matter momentum, vents and buoyancy                 | Coarse four-pixel tiles with finite force budgets; ambient oxygen remains implicit             |
| Electricity       | Conductivity, insulation/oxidation, transported pulses, sparks and gates                            | Digital pulse propagation and heating; not a calibrated voltage/current network                |
| Light             | Shared absorption, reflection, refraction, shadows and mechanical ray transport                     | Bounded geometric rays, coarse radiance, finite bounces and cosmetic interior glow             |
| Sound             | Shared material barriers, absorption, dispersion, wave propagation and listener occlusion           | Damped coarse wave field, procedural foley and three finite reflection taps                    |
| Biology / devices | Configured behavior kind and bounded specialized solver                                             | Growth, navigation, portals and fictional modes are explicitly authored gameplay models        |

A realistic ordinary material should be added through data and existing components.
A new solver is justified only for a missing reusable mechanism with a regression
scene and a measured budget. Explicit chemical recipes and configured device
behaviors are allowed; ad hoc material-name exceptions for ordinary motion,
fracture, phase, transport or chemical susceptibility are not the extension path.

Keep these models separate from puzzle goals, player controls and level scripting.
These approximations are deterministic under the same saved seed and tick inputs;
a neural next-frame guess must not replace authoritative contents or topology.

Planet and moving-center modes sample gravity at physical positions, separate from
the coarse atmosphere grid. Resting liquids relieve radial hydrostatic pressure
through connected local cells: at most 128 visits and eight neighboring swaps per
surface query, staggered over eight ticks. These transfers lower radial potential,
respect viscosity/density and walls, and preserve contents and particle state; they
do not prescribe a circular boundary. The finite reach leaves pixel-scale surface
roughness rather than resolving an incompressible pressure field across a whole pool.

Rigid impacts use relative contact velocity, effective mass and angular leverage;
energy per contact pixel determines whether a narrow edge can cut a softer solid.
Cutting consumes toughness-dependent work and ejects the configured family fragment
only when a local opening can accept it. Crack damage spends a brittleness-dependent
fraction of collision work; ductile metals mainly dissipate contact energy.
Granular force chains preserve every grain and reservoir, with 64 visits per query,
six links of reach, 256 visits and 64 moves across an entire tick. A failed search
leaves contents in place; this local yield model does not solve a continuum
soil stress field. Topology changes rebuild outside the active contact pass instead of
recursively restarting contacts. Grab release velocity comes from timed movement, then respects
the existing body speed caps.


## Viewport fidelity and reconstruction

The spatial unit is meters per displayed pixel, with a fixed one-meter slice depth. The reference pitch is 0.125 m and each zoom step halves or doubles it; the tick remains 60 Hz maximum. A full pixel at twice the pitch has four times the area and dry mass. `quantity` is a saved fractional material amount, so coarsening existing matter averages represented mass instead of treating each merged cell as newly full. Existing thermal and chemical rules remain qualitative pixel models; this unit contract does not add latent heat, exact gas-volume expansion, or calibrated continuum transport.

Only the current viewport is a live `World`. Coarsening merges cells into one representative state and estimates unresolved contacts; it can remove small openings or minor species from the visible coarse geometry. Uniform bulk needs no detailed snapshot. Subpixel boundaries/mixed constituents retain optional sparse detail, addressed by references that move with their coarse host. Changed host composition, erasure or coarse breakage invalidates that reconstruction. Cache eviction falls back to piecewise material reconstruction and bilinear field transfer, never a second running simulation. This is an intentional fidelity tradeoff, not lossless microscopic gameplay.

The detail cache is an LRU with a configurable 0–64 MiB byte budget and conservative record overhead. It is not serialized. A fixed 128 × 128 coarse overview and at most 32 actor/32 device records retain approximate surroundings; exported overview planes use run-length encoding and are validated before load. Saves therefore do not accumulate every viewed level of detail. Revisiting distant or reloaded regions restores estimated geometry and fields, rather than an exact old fine scene.

Subpixel/offscreen entities leave the live integration pool. Before re-entry, velocity and elapsed ticks estimate their positions, with a maximum 3,600-tick prediction horizon, 64 coarse collision samples and 32 timestamped destructive events. Event sequence numbers disambiguate edits while paused. Destruction uses the predicted position at the event's time, so a creature which plausibly escaped is not removed merely because its old area was hit. This does not predict unseen AI decisions, flocking, exact trajectories or missed collisions; behavior resumes when the entity becomes visible.
