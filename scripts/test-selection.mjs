export const groups = {
  quick: ["settings", "frame-clock", "editor", "materials", "security"],
  collisions: [
    "rigid-physics",
    "collision-bounds",
    "bodies-fill",
    "fragments",
    "entities-modes",
    "simulation",
  ],
  elastics: [
    "elasticity",
    "rigid-physics",
    "fragments",
    "selection",
    "bodies-fill",
    "paint",
  ],
  atmosphere: ["airflow", "atmosphere", "simulation", "ignition", "energy"],
  actors: ["stickmen", "creatures", "boids", "moving-mechanics", "acoustics"],
  devices: [
    "devices",
    "moving-mechanics",
    "entities-modes",
    "energy",
    "inspection",
  ],
  levels: [
    "level",
    "canvas-view",
    "entities-modes",
    "selection",
    "paint",
    "security",
  ],
  input: [
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
  lighting: ["lighting", "energy", "inspection"],
};
export const browserChecks = {
  quick: [],
  collisions: ["rigid_physics_check"],
  elastics: ["elastic_contacts_check", "elastics_check"],
  atmosphere: ["airflow_check"],
  actors: ["creatures_audio_check", "flocking_check"],
  devices: ["devices_check", "entities_check"],
  levels: ["level_check"],
  input: ["drawing_check", "touch_gestures_check"],
  ui: ["browser_check"],
  lighting: ["lighting_check"],
};
const rules = [
  [/^src\/sim\/(body-|rigid-|collision-|fragments\.)/, ["collisions"]],
  [/^src\/sim\/elastic/, ["elastics"]],
  [/^src\/sim\/(airflow|fields|combustion|ignition|weather)\./, ["atmosphere"]],
  [/^src\/sim\/(stickm|creature|boids|predation)/, ["actors"]],
  [/^src\/sim\/(missile|machine|circuit)/, ["devices"]],
  [/^src\/sim\/(energy|sparks|bubbles)/, ["atmosphere", "lighting"]],
  [/^src\/sim\/(paint|fill|tools)\./, ["input", "collisions"]],
  [/^src\/(level|canvas-view|history)/, ["levels"]],
  [
    /^src\/(input|drawing-|selection|touch-|player-controls)/,
    ["input", "actors"],
  ],
  [/^src\/(lighting|light-|bloom|color)/, ["lighting", "ui"]],
  [
    /^src\/(settings|shortcuts|shortcut-|material-groups|tool-picker|inspector|icons|frame-clock)/,
    ["ui"],
  ],
  [/^src\/audio\./, ["actors"]],
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
