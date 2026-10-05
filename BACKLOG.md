# Sandlab backlog

- Follow the [engine evolution plan](ENGINE_PLAN.md): v1.18.0 establishes traits, registry validation and opt-in stage timings. v1.19.0 adds contained-fluid mass without topology rebuilds. Next, calibrate thermal capacity/conductivity and phase accounting, then extend finite reagent capacity and concentration before an editor or new modes.

- Refine concave rigid contact manifolds and sustained load damage. Dense tumbling piles remain more expensive than the earlier sliding-only solver; keep optimizing contact/motion work without removing rotation, torque, friction or fracture.
- Refine coarse atmospheric boundaries for walls that divide a single air tile, including diagonal microchannels. The air solver now retains confined pressure and momentum; finite oxidizer and calibrated gas expansion remain future work.
- Add finite ambient oxygen transport so sealed fuel can exhaust implicit air; explicit gases already affect ignition and suppression.
- Introduce latent heat and calibrated heat capacities before adding more physical phase transitions.
- Extend spring-body tests to folded ropes and large cut membranes touching other elastic objects.
- Measure simulations on physical iPhones and Android devices; browser emulation verifies touch/layout but cannot measure phone thermal throttling or Safari sensor behavior.

- Extend selection masks and clipboard operations to jointed actors and moving devices, including partial-body selections.
- Expand AI navigation with climbing and swimming, with routes verified against character trajectories.

- Improve finite food chains, creature terrain navigation and obstacle-aware hunting without unbounded population growth. Measure larger flock populations before raising the current 32-body cap or introducing a spatial index.
- Calibrate procedural foley on physical headphones and phone speakers; refine diagonal acoustic microchannels before extending the shared barrier transport or three finite reflection taps.

- Benchmark rapidly changing many-light scenes on physical phones before increasing optical source or bounce budgets. Fire lighting now caches silhouette stencils and filtered angular transport, with 24 merged shadow sources and a scene-wide lightning flash. Refine volumetric transport only after measuring the current faint smoke scattering and surface reflection pass.
- Verify standard controllers on physical iOS/Android devices and add configurable controller bindings when useful.

- Add grouped circuit editing and richer vehicle suspension after measuring large circuits and machine scenes; retain directional signal isolation and bounded moving-device work.

- Extend gravity-relative character navigation and contact support around Planet cores; keep orbital forces shared and bounded.

- Calibrate pore transport with more experimental beds; calibrate intake/outflow momentum and interfacial wetting; contained-fluid weight is now included without topology rebuilds. Shared integer reservoirs, permeability and retention now cover powders, solids, elastics and plant roots.

- Extend per-cell dissolved ingredients beyond one additive slot only when useful reactions justify the extra memory; add solubility curves and precipitation thresholds without losing component mass.

- Calibrate Crystal caustics and beam surface normals on complex moving silhouettes; refine bounded interior glow before increasing spectral casts or optical cache budgets.

- Calibrate oxide passivation against wet/salty exposure and add finite fungal substrate nutrition when richer ecosystems justify it; retain the 32-birth cap.

- Extend the [physics contract](PHYSICS_MODEL.md): base/state transitions and common chemical components are implemented, but normalized reagent equivalents, partial neutralization, aqueous pH, chemical energy budgets and accurate multi-product quantities still need calibration fixtures.
- Replace composite concrete/ceramic melt proxies with tested dehydration, sintering and melt-composition data when thermal amount accounting supports it; preserve family identity and finite contents.

- Extend shared-grid presentation benchmarks to moving/cut elastic meshes and mixed crowds on physical phones; refine subpixel contact coverage only where pixel-scale fixtures justify its memory and calculation cost.

- Calibrate anchored-contact effective mass, fatigue and temperature-dependent mechanical strength with controlled fixtures; preserve bounded grain/cutting work and avoid a continuum or recursive body rebuild.
