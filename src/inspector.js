import { circuitDirection, circuitOutput } from "./sim/circuits.js";
import { actorProfile } from "./sim/creature-profiles.js";
import { materials, M } from "./sim/materials.js";

export function cellAt(world, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return null;
  const x = Math.floor(point.x),
    y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  const index = y * world.width + x;
  const actor = world.stickmen.hit(point.x, point.y, 0.8);
  const missile = world.missiles.hit(point.x, point.y, 0.8);
  return {
    x,
    y,
    index,
    material:
      materials[actor?.material ?? missile?.material ?? world.cells[index]],
    actor,
    missile,
  };
}
export function cellProperties(world, point) {
  const cell = cellAt(world, point);
  if (!cell) return null;
  const { x, y, index: i, material: m } = cell,
    life = world.life[i];
  if (cell.missile && !cell.actor) {
    const a = cell.missile;
    return {
      ...cell,
      rows: [
        ["Temperature", `${a.temperature.toFixed(1)}°C`],
        [
          a.health !== undefined ? "Condition" : "Lifetime",
          a.health !== undefined
            ? `${a.health.toFixed(0)}%`
            : `${a.life} ticks`,
        ],
        ["Speed", `${Math.hypot(a.vx, a.vy).toFixed(2)} cells/tick`],
        [
          "Target",
          materials[a.material].vehicle
            ? world.mechanics.machineMotors
              ? "Cruising"
              : "Motors off"
            : m.guidance === "none"
              ? "Unguided"
              : a.targetKind === "cursor"
                ? `Cursor · ${a.targetX.toFixed(0)}, ${a.targetY.toFixed(0)}`
                : a.targetKind === "laser"
                  ? "Nearest visible laser"
                  : a.target < 0
                    ? "Searching"
                    : `${materials[world.cells[a.target]].name} · ${world.temp[a.target].toFixed(0)}°C`,
        ],
      ],
    };
  }
  if (cell.actor) {
    const a = cell.actor;
    return {
      ...cell,
      rows: [
        ["Health", `${Math.round(a.health)} / 100`],
        [
          "Role",
          actorProfile(a.material).prey?.length
            ? "Predator"
            : m.actor === "ai" || m.actor === "player"
              ? "Character"
              : "Prey",
        ],
        ["Behavior", a.alive ? a.behavior || "Patrolling" : "Ragdoll"],
        ...(a.alive &&
        (a.behavior === "Flocking" || a.behavior === "Schooling") &&
        a.flockSize
          ? [["Group", `${a.flockSize} creatures`]]
          : []),
        ["State", a.alive ? "Alive" : "Ragdoll"],
        ["Temperature", `${Math.max(...a.heat).toFixed(1)}°C`],
        ["Joints", `${a.bonds.filter(Boolean).length} / 8`],
        [
          "Navigation",
          m.actor === "ai"
            ? `A* · ${a.path.length} waypoints`
            : m.actor === "player"
              ? "Player"
              : ["fish", "shark"].includes(m.actor)
                ? "Swimming"
                : m.actor === "bird"
                  ? "Flying"
                  : m.actor === "rabbit"
                    ? "Hopping"
                    : "Walking",
        ],
        ["Grounded", a.grounded ? "Yes" : "No"],
      ],
    };
  }
  if (m.circuit) {
    const [dx, dy] = circuitDirection(world.heading[i]);
    return {
      ...cell,
      rows: [
        ["Temperature", `${world.temp[i].toFixed(1)}°C`],
        [
          "Output",
          circuitOutput(m, life) ||
          ((m.circuit === "lamp" || m.circuit === "fan") && life)
            ? "On"
            : "Off",
        ],
        [
          "Facing",
          dx === 1 ? "Right" : dx === -1 ? "Left" : dy === 1 ? "Down" : "Up",
        ],
        [
          "Inputs",
          m.circuit === "battery"
            ? "None"
            : ["and", "or", "xor"].includes(m.circuit)
              ? "A behind · B on left"
              : "A behind",
        ],
        [
          "Output port",
          m.circuit === "fan"
            ? "Air in front"
            : m.circuit === "lamp"
              ? "Light"
              : "In front",
        ],
        ...(m.circuit === "delay" ? [["Delay", "12 ticks"]] : []),
      ],
    };
  }
  world.fields.airflow.sample(world.fields, x, y);
  const rows = [
    [
      "Temperature",
      `${(m.id ? world.temp[i] : world.fields.temperature[world.fields.index(x, y)]).toFixed(1)}°C`,
    ],
    [
      m.ignitionDelay
        ? "Ignition timer"
        : m.burn && life
          ? "Burn remaining"
          : "Lifetime",
      life
        ? `${life} ticks`
        : m.id === 0
          ? "—"
          : m.lifetime
            ? "Expired"
            : m.ignitionDelay || m.burn
              ? "Inactive"
              : "Persistent",
    ],
    ["Charge", world.charge[i] ? `${world.charge[i]} ticks` : "None"],
    ["Pressure", world.fields.pressure[world.fields.index(x, y)].toFixed(2)],
    [
      "Airflow",
      `${world.fields.airflow.x.toFixed(2)}, ${world.fields.airflow.y.toFixed(2)} cells/tick`,
    ],
  ];
  rows.push(
    [
      "Air temperature",
      `${world.fields.temperature[world.fields.index(x, y)].toFixed(1)}°C`,
    ],
    [
      "Ambient",
      `${world.fields.ambientTemperature.toFixed(1)}°C · ${world.fields.ambientPressure.toFixed(2)} atm`,
    ],
  );
  if (world.cooldown[i]) rows.push(["Cooldown", `${world.cooldown[i]} ticks`]);
  if (world.moisture[i] || [M.Plant, M.Seed, M.Dirt, M.Mud].includes(m.id))
    rows.push(["Moisture", `${Math.round((world.moisture[i] / 255) * 100)}%`]);
  if (world.nutrition[i])
    rows.push(["Nutrients", `${world.nutrition[i]} / 255`]);
  if (m.id === M.Plant) rows.push(["Growth depth", String(world.growth[i])]);
  if (m.id === M.Sponge)
    rows.push([
      "Absorbed",
      world.storedAmount[i]
        ? `${materials[world.storedLiquid[i]].name} · ${world.storedAmount[i]} / 48`
        : "Empty · 0 / 48",
    ]);
  if (m.elasticity) {
    const { connections, stretch, tension } = world.elastic.measure(i);
    rows.push(
      ["Elastic links", String(connections)],
      ["Stretch", `${Math.round(stretch * 100)}%`],
      ["Tension", `${tension.toFixed(2)} units`],
      ["Anchored", world.elasticAnchor[i] ? "Yes" : "No"],
    );
  }
  if (m.rigid) {
    rows.push(["Cell mass", `${m.density.toFixed(2)} units`]);
    const body =
      !world.rigid.dirty && world.rigid.bodyOf.get(world.elasticId[i]);
    if (body)
      rows.push(
        ["Body mass", `${body.mass.toFixed(1)} units`],
        ["Body size", `${body.ids.length} cells`],
      );
    rows.push(
      [
        "Speed",
        `${Math.hypot(world.velocityX[i], world.velocityY[i]).toFixed(2)} cells/tick`,
      ],
      ["Impact damage", `${world.damage[i].toFixed(1)} / ${m.toughness}`],
    );
  }
  if (m.static) rows.push(["Fixed", "Indestructible"]);
  if (m.ray)
    rows.push([
      "Direction",
      ["E", "SE", "S", "SW", "W", "NW", "N", "NE"][world.heading[i]],
    ]);
  if (world.clone[i] && m.id === M.Clone)
    rows.push(["Clones", materials[world.clone[i]].name]);
  if (m.id === M.Ice && world.residue[i])
    rows.push(["Frozen from", materials[world.residue[i]].name]);
  return { ...cell, rows };
}

export class Inspector {
  constructor(panel, world, renderer) {
    this.panel = panel;
    this.world = world;
    this.renderer = renderer;
    this.title = panel.querySelector("h3");
    this.location = panel.querySelector(".inspection-location");
    this.list = panel.querySelector("dl");
    this.lens = panel.querySelector("canvas");
    this.context = this.lens.getContext("2d", { alpha: false });
    this.rows = new Map();
    this.point = null;
    this.active = false;
    this.pinned = false;
    this.zoom = 8;
    this.nextUpdate = 0;
  }
  setActive(active) {
    if (active !== this.active) {
      this.point = null;
      this.pinned = false;
    }
    this.active = active;
    if (!active) this.panel.hidden = true;
  }
  follow(point) {
    if (!this.active || this.pinned) return;
    this.point = point;
    if (!cellAt(this.world, point)) this.panel.hidden = true;
  }
  sample(point) {
    if (!this.active || !cellAt(this.world, point)) return;
    this.point = { x: Math.floor(point.x), y: Math.floor(point.y) };
    this.pinned = true;
    this.nextUpdate = 0;
  }
  update(now) {
    if (!this.active || now < this.nextUpdate) return;
    this.nextUpdate = now + 100;
    const data = cellProperties(this.world, this.point);
    if (!data) {
      this.panel.hidden = true;
      return;
    }
    this.panel.hidden = false;
    this.title.textContent = data.material.name;
    this.location.textContent = `${data.material.category === "none" ? "Empty" : data.material.category} · ${data.x}, ${data.y} · ${this.pinned ? "Held cell" : "Live"}`;
    for (const row of this.rows.values()) row.hidden = true;
    for (const [name, value] of data.rows) {
      let row = this.rows.get(name);
      if (!row) {
        row = document.createElement("div");
        const label = document.createElement("dt"),
          output = document.createElement("dd");
        label.textContent = name;
        row.append(label, output);
        this.list.append(row);
        this.rows.set(name, row);
      }
      row.hidden = false;
      row.lastChild.textContent = value;
    }
    this.drawLens(data.x, data.y);
  }
  drawLens(x, y) {
    const ctx = this.context,
      size = this.lens.width,
      scale = this.zoom * 2,
      span = size / scale,
      left = x - Math.floor(span / 2),
      top = y - Math.floor(span / 2),
      sx = Math.max(0, left),
      sy = Math.max(0, top),
      width = Math.min(this.world.width, left + span) - sx,
      height = Math.min(this.world.height, top + span) - sy;
    ctx.fillStyle = "#0b1317";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((this.renderer.rotation * Math.PI) / 2);
    ctx.translate(-size / 2, -size / 2);
    // Clip source bounds explicitly so edge cells keep their position in the lens.
    ctx.drawImage(
      this.renderer.worldImage(),
      sx,
      sy,
      width,
      height,
      (sx - left) * scale,
      (sy - top) * scale,
      width * scale,
      height * scale,
    );
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#edf3d9";
    ctx.strokeRect(
      (x - left) * scale + 1,
      (y - top) * scale + 1,
      scale - 2,
      scale - 2,
    );
    ctx.restore();
  }
}
