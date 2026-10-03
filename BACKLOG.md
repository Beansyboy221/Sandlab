# Sandlab backlog

- Follow the [engine evolution plan](ENGINE_PLAN.md): v1.18.0 establishes traits, registry validation and opt-in stage timings. v1.19.0 adds contained-fluid mass without topology rebuilds. Next, calibrate thermal capacity/conductivity and phase accounting, then expand reaction authoring before an editor or new modes.

- Refine concave rigid contact manifolds and sustained load damage. Dense tumbling piles remain more expensive than the earlier sliding-only solver; keep optimizing contact/motion work without removing rotation, torque, friction or fracture.
- Refine coarse atmospheric boundaries for walls that divide a single air tile, including diagonal microchannels. The air solver now retains confined pressure and momentum; finite oxidizer and calibrated gas expansion remain future work.
- Add finite ambient oxygen transport so sealed fuel can exhaust implicit air; explicit gases already affect ignition and suppression.
- Introduce latent heat and calibrated heat capacities before adding more physical phase transitions.
- Extend spring-body tests to folded ropes and large cut membranes touching other elastic objects.
- Measure simulations on physical iPhones and Android devices; browser emulation verifies touch/layout but cannot measure phone thermal throttling or Safari sensor behavior.

- Extend selection masks and clipboard operations to jointed actors and moving devices, including partial-body selections.
- Expand AI navigation with climbing and swimming, with routes verified against character trajectories.

- Improve finite food chains, creature terrain navigation and obstacle-aware hunting without unbounded population growth. Measure larger flock populations before raising the current 32-body cap or introducing a spatial index.
- Measure acoustic occlusion and richer multi-bounce audible reflections before extending the current bounded room echo.

- Benchmark rapidly changing many-light scenes on physical phones before increasing optical source or bounce budgets. Fire lighting now caches silhouette stencils and filtered angular transport, with 24 merged shadow sources and a scene-wide lightning flash. Refine volumetric transport only after measuring the current faint smoke scattering and surface reflection pass.
- Verify standard controllers on physical iOS/Android devices and add configurable controller bindings when useful.

- Add grouped circuit editing and richer vehicle suspension after measuring large circuits and machine scenes; retain directional signal isolation and bounded moving-device work.

- Extend gravity-relative character navigation and contact support around Planet cores; keep orbital forces shared and bounded.

- Calibrate pore transport with more experimental beds; calibrate intake/outflow momentum and interfacial wetting; contained-fluid weight is now included without topology rebuilds. Shared integer reservoirs, permeability and retention now cover powders, solids, elastics and plant roots.
