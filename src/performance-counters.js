// Opt-in stage timings: no clock reads or allocations inside particle loops.
export class PerformanceCounters {
  constructor(labels, clock = () => performance.now()) {
    this.labels = labels;
    this.times = new Float64Array(labels.length);
    this.clock = clock;
    this.enabled = false;
  }
  begin() {
    if (!this.enabled) return;
    this.times.fill(0);
    this.last = this.clock();
  }
  mark(stage) {
    if (!this.enabled) return;
    const now = this.clock();
    this.times[stage] += now - this.last;
    this.last = now;
  }
  describe() {
    return this.labels
      .map((label, i) => `${label}: ${this.times[i].toFixed(2)} ms`)
      .join(" · ");
  }
}
export const simulationStages = [
  "Air",
  "Circuits",
  "Particles",
  "Solids",
  "Elastics",
  "Creatures",
  "Devices",
  "Fragments",
  "Sound",
];
export const renderingStages = [
  "Pixels",
  "Light field",
  "Buffer",
  "Elastics",
  "Solids",
  "Entities",
  "Lighting",
  "Airflow",
  "Bloom",
  "Overlays",
];
