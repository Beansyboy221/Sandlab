# Sandlab backlog

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

- Benchmark rapidly changing many-light scenes on physical phones before increasing optical source or bounce budgets. Particle silhouettes and smooth directional shadows are implemented; faint reflections still use the radiance grid.
- Verify standard controllers on physical iOS/Android devices and add configurable controller bindings when useful.

- Add grouped circuit editing and richer vehicle suspension after measuring large circuits and machine scenes; retain directional signal isolation and bounded moving-device work.

- Extend gravity-relative character navigation and contact support around Planet cores; keep orbital forces shared and bounded.
