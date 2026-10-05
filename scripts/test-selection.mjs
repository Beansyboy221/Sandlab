export const groups = {
  portals: [
    "portals",
    "materials",
    "selection",
    "level",
    "security",
    "entities-modes",
  ],
  quick: [
    "engine-boundaries",
    "settings",
    "frame-clock",
    "editor",
    "materials",
    "security",
  ],
  collisions: [
    "engine-boundaries",
    "material-upgrade",
    "mechanical-mass",
    "rigid-physics",
    "contact-yield",
    "collision-bounds",
    "bodies-fill",
    "fragments",
    "entities-modes",
    "simulation",
  ],
  elastics: [
    "engine-boundaries",
    "material-upgrade",
    "mechanical-mass",
    "elasticity",
    "rigid-physics",
    "fragments",
    "selection",
    "bodies-fill",
    "paint",
  ],
  atmosphere: [
    "airflow",
    "airflow-system",
    "atmosphere",
    "simulation",
    "ignition",
    "energy",
  ],
  actors: [
    "stickmen",
    "creatures",
    "boids",
    "moving-mechanics",
    "acoustics",
    "audio-voices",
  ],
  devices: [
    "devices",
    "moving-mechanics",
    "entities-modes",
    "energy",
    "inspection",
  ],
  levels: [
    "world-scale",
    "radial-liquids",
    "level",
    "canvas-view",
    "entities-modes",
    "selection",
    "paint",
    "security",
  ],
  input: [
    "brush-geometry",
    "gamepad",
    "editor",
    "selection",
    "touch-navigation",
    "canvas-view",
    "paint",
    "bodies-fill",
    "settings",
    "frame-clock",
  ],
  ui: [
    "settings",
    "inspection",
    "material-groups",
    "canvas-view",
    "touch-navigation",
    "editor",
    "security",
    "frame-clock",
  ],
  lighting: ["lighting", "energy", "inspection", "perception"],
};
export const browserChecks = {
  portals: ["portals_check"],
  quick: [],
  collisions: [
    "contact_yield_check",
    "unified_scene_check",
    "rigid_physics_check",
  ],
  elastics: ["elastic_contacts_check", "elastics_check"],
  atmosphere: ["airflow_check"],
  actors: ["creatures_audio_check", "audio_occlusion_check", "flocking_check"],
  devices: ["devices_check", "entities_check"],
  levels: ["level_check"],
  input: ["controller_check", "drawing_check", "touch_gestures_check"],
  ui: ["browser_check"],
  lighting: ["lighting_check"],
};
const rules = [
  [/^src\/sim\/(body-|rigid-|collision-|fragments\.)/, ["collisions"]],
  [/^src\/sim\/elastic/, ["elastics"]],
  [
    /^src\/sim\/(airflow|air-brush|fields|combustion|ignition|weather)\./,
    ["atmosphere"],
  ],
  [/^src\/sim\/(stickm|creature|boids|predation)/, ["actors"]],
  [/^src\/sim\/(missile|machine|circuit)/, ["devices"]],
  [/^src\/sim\/(energy|sparks|bubbles)/, ["atmosphere", "lighting"]],
  [/^src\/sim\/(paint|fill|tools)\./, ["input", "collisions"]],
  [/^src\/(level|canvas-view|history)/, ["levels"]],
  [
    /^src\/(controller-controls|gamepad-state|input|drawing-|selection|touch-|player-controls)/,
    ["input", "actors"],
  ],
  [/^src\/(lighting|light-|bloom|color)/, ["lighting", "ui"]],
  [
    /^src\/(settings|shortcuts|shortcut-|material-groups|tool-picker|inspector|icons|frame-clock)/,
    ["ui"],
  ],
  [/^src\/audio(?:-voices)?\./, ["actors"]],
  [/^src\/sim\/acoustic/, ["actors"]],
  [
    /^(index\.html|[^/]+\.css|src\/(app|renderer|mobile-dock|changelog)\.js)$/,
    ["ui"],
  ],
];
export function selectTests(paths, available, names = []) {
  const tests = new Set(),
    selected = new Set(names),
    reasons = [];
  let full = false;
  for (const path of paths) {
    if (/\.md$/.test(path) || path === ".gitignore") continue;
    if (available.includes(path)) {
      tests.add(path);
      continue;
    }
    const rule = rules.find(([pattern]) => pattern.test(path));
    if (rule) for (const name of rule[1]) selected.add(name);
    else {
      full = true;
      reasons.push(path);
    }
  }
  for (const name of selected) {
    if (!groups[name]) throw Error(`Unknown check group: ${name}`);
    for (const short of groups[name]) {
      const file = `tests/${short}.test.js`;
      if (!available.includes(file)) throw Error(`Missing test: ${file}`);
      tests.add(file);
    }
  }
  return {
    files: full ? [...available].sort() : [...tests].sort(),
    groups: [...selected].sort(),
    full,
    reasons,
    browsers: [
      ...new Set([...selected].flatMap((name) => browserChecks[name] || [])),
    ].sort(),
  };
}
