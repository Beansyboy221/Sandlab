import { materials } from "./materials.js";

// All actors share nine joints and eight breakable links. Species supply anatomy
// and locomotion parameters without duplicating collisions, heat or persistence.
const humanLinks = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 7],
  [7, 5],
  [2, 8],
  [8, 6],
];
function profile(x, y, options = {}) {
  const links = options.links || humanLinks;
  return {
    x,
    y,
    links,
    lengths: links.map(([a, b]) => Math.hypot(x[a] - x[b], y[a] - y[b])),
    speed: 0.24,
    acceleration: 0.04,
    jump: 1.6,
    headRadius: 1.3,
    mode: "walk",
    ...options,
  };
}
export const humanProfile = profile(
  [0, 0, 0, -4, 4, -2, 2, -1.5, 1.5],
  [-13, -9, -5, -7, -7, 0, 0, -2.5, -2.5],
);
const profiles = {
  ai: humanProfile,
  player: humanProfile,
  cat: profile(
    [5, 2, -2, 3, -6, -3, 2, -3, 2],
    [-6, -4, -4, 0, -6, 0, 0, -2, -2],
    {
      speed: 0.16,
      jump: 1.2,
      headRadius: 1.1,
      links: [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [2, 7],
        [7, 5],
        [1, 8],
        [8, 6],
      ],
    },
  ),
  rabbit: profile(
    [2, 1, -1, 2, -3, -2, 1, -2, 1],
    [-6, -4, -3, -1, -3, 0, 0, -1.5, -1.5],
    {
      speed: 0.2,
      jump: 1.05,
      headRadius: 1,
      mode: "hop",
      links: [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [2, 7],
        [7, 5],
        [1, 8],
        [8, 6],
      ],
    },
  ),
  fish: profile(
    [3, 1, -1, 0, -3, -3, -3, -2, -2],
    [-2, -2, -2, -3, -2, -3, -1, -2.5, -1.5],
    {
      speed: 0.13,
      acceleration: 0.018,
      jump: 0,
      headRadius: 0.7,
      mode: "swim",
      links: [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [2, 7],
        [7, 5],
        [2, 8],
        [8, 6],
      ],
    },
  ),
  bird: profile(
    [2, 1, -1, 0, -3, -1, 1, -1, 1],
    [-4, -3, -3, -6, -3, 0, 0, -1.5, -1.5],
    {
      speed: 0.22,
      acceleration: 0.025,
      jump: 0.9,
      headRadius: 0.8,
      mode: "fly",
      links: [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [2, 7],
        [7, 5],
        [1, 8],
        [8, 6],
      ],
    },
  ),
};
export const actorProfile = (material) =>
  profiles[materials[material]?.actor] || humanProfile;
