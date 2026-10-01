const paths = {
  warm: "M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0ZM12 8v9M17 5h4M19 3v4",
  cool: "M12 3v18M4 7l16 10M4 17 20 7M9 5l3 3 3-3M9 19l3-3 3 3M4 10l4-1-1-4M17 19l-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1",
  fan: "M10 10c-5-7 7-10 5-3l-2 3M14 11c9-1 5 11 0 7l-2-4M11 14c-4 8-12-2-5-4l4 1M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  hand: "M8 13V6a2 2 0 0 1 4 0v6M12 6a2 2 0 0 1 4 0v6M16 8a2 2 0 0 1 4 0v8c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l3 3",
  select: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M11 10l8 5-4 1-1 4-3-10Z",
  eyedropper: "m15 3 6 6M14 4l6 6M17 7 6 18l-4 1 1-4L14 4M8 13l3 3",
  pressure:
    "M12 8V3m-3 3 3-3 3 3M12 16v5m-3-3 3 3 3-3M8 12H3m3-3-3 3 3 3M16 12h5m-3-3 3 3-3 3",
  vacuum:
    "M12 3v5m-3-3 3 3 3-3M12 21v-5m-3 3 3-3 3 3M3 12h5M5 9l3 3-3 3M21 12h-5m3-3-3 3 3 3",
  squeeze: "M5 12h14v8H5ZM8 16h.01M12 18h.01M16 16h.01M12 3v6M9 6l3 3 3-3",

  plus: "M12 4v16M4 12h16",
  sliders: "M4 7h16M4 17h16M8 4v6M16 14v6",
  gear: "M9.5 3h5l.5 2.5 2.1 1.2 2.4-.8 2.5 4.3-1.9 1.7v2.4l1.9 1.7-2.5 4.3-2.4-.8-2.1 1.2-.5 2.5h-5L9 20.7l-2.1-1.2-2.4.8L2 16l1.9-1.7v-2.4L2 10.2l2.5-4.3 2.4.8L9 5.5Z M15.5 13.1a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
  deselect: "M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6M8 8l8 8M16 8l-8 8",
  copy: "M9 9h12v12H9ZM15 9V3H3v12h6",
  paste: "M9 5H5v16h14V5h-4M9 3h6v4H9Z",
  flask: "M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10",
  folder:
    "M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7L10 4H5a2 2 0 0 0-2 2v1Z",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01|circle",
  pause: "M9 5v14M15 5v14",
  play: "M8 5l11 7-11 7V5Z",
  step: "M5 5l10 7-10 7V5ZM19 5v14",
  brush: "m14 4 6 6M5 14l9-11 7 7-11 9M5 14c-5 0-1 4-4 7 7 1 10-3 4-7Z",
  eraser: "m15 3 6 6-11 12H5l-3-3L15 3ZM8 12l7 7M10 21h11",
  circle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  square: "M4 4h16v16H4Z",
  redo: "M21 10H10a7 7 0 0 0 0 14M21 10l-5-5M21 10l-5 5",
  undo: "M3 10h11a7 7 0 0 1 0 14M3 10l5-5M3 10l5 5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  layers: "m12 3 10 6-10 6L2 9l10-6ZM2 14l10 6 10-6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l6 6",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m8 5 7 7-7 7",
  expand: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  pointer: "m5 3 14 9-7 2-3 7-4-18Z",
  sparkles: "m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6ZM20 3v4M18 5h4",
  save: "M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 15V3M7 8l5-5 5 5M4 17v4h16v-4",
};
export function icon(name) {
  const path = paths[name] || paths.circle;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path.split("|")[0]}"/>${path.includes("|circle") ? '<circle cx="12" cy="12" r="10"/>' : ""}</svg>`;
}
export function populateIcons(root = document) {
  root
    .querySelectorAll("[data-icon]")
    .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
}
