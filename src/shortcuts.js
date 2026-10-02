// One catalogue drives dispatch, preferences, and toolbar key hints.
export const shortcutDefinitions = [
  ["pause", "Pause / play", ["Space", "p"]],
  ["step", "Single step", [".", "n"]],
  ["paint", "Draw", ["b"]],
  ["fill", "Fill", ["k"]],
  ["recolor", "Paint", ["o"]],
  ["erase", "Erase", ["e"]],
  ["select", "Select", ["v"]],
  ["inspect", "Inspect", ["m"]],
  ["eyedropper", "Copy", ["i"]],
  ["warm", "Warm", ["h"]],
  ["cool", "Cool", ["c"]],
  ["smaller", "Smaller brush", ["[", "-"]],
  ["larger", "Larger brush", ["]", "Plus"]],
  ["shape", "Brush shape", ["r"]],
  ["undo", "Undo", ["Mod+z"]],
  ["redo", "Redo", ["Mod+Shift+z", "Mod+y"]],
  ["copy", "Copy selection", ["Mod+c"]],
  ["cut", "Cut selection", ["Mod+x"]],
  ["paste", "Paste selection", ["Mod+v"]],
  ["selectAll", "Select all", ["Mod+a"]],
  ["deselect", "Deselect", ["Mod+d"]],
  ["delete", "Delete selection", ["Delete", "Backspace"]],
  ["escape", "Cancel / deselect", ["Escape"]],
  ["save", "Save world", ["Mod+s"]],
  ["import", "Import world", ["Mod+o"]],
  ["export", "Export world", ["Mod+Shift+s"]],
  ["search", "Find material", ["/"]],
  ["sand", "Select Sand", ["1"]],
  ["water", "Select Water", ["2"]],
  ["fire", "Select Fire", ["3"]],
  ["grid", "Grid overlay", ["g"]],
  ["view", "Visualization", ["t"]],
  ["fullscreen", "Fullscreen", ["f"]],
  ["help", "About Sandlab", ["?"]],
].map(([id, label, defaults]) => ({ id, label, defaults }));

const namedKey =
  /^(Space|Plus|Escape|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|F(?:[1-9]|1[0-2]))$/;
export function normalizeChord(value) {
  if (typeof value !== "string" || value.length > 60) return null;
  const parts = value.split("+"),
    key = parts.pop();
  if (!namedKey.test(key) && !/^[!-~]$/.test(key)) return null;
  if (
    parts.some((part) => !["Mod", "Alt", "Shift"].includes(part)) ||
    new Set(parts).size !== parts.length
  )
    return null;
  return [
    ...["Mod", "Alt", "Shift"].filter((part) => parts.includes(part)),
    key.length === 1 ? key.toLowerCase() : key,
  ].join("+");
}
export function chordFromEvent(event) {
  if (event.isComposing || typeof event.key !== "string") return null;
  const key =
    event.key === " " ? "Space" : event.key === "+" ? "Plus" : event.key;
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  // Shift is inherent in punctuation such as ? and +. Keep it for letters
  // and command chords so Ctrl+Shift+Z remains distinct from Ctrl+Z.
  if (
    event.shiftKey &&
    (event.ctrlKey ||
      event.metaKey ||
      /^[a-z]$/i.test(key) ||
      (namedKey.test(key) && key !== "Plus"))
  )
    parts.push("Shift");
  parts.push(key);
  return normalizeChord(parts.join("+"));
}
export function bindingsFor(id, overrides = {}) {
  return (
    overrides[id] ??
    shortcutDefinitions.find((action) => action.id === id)?.defaults ??
    []
  );
}
export function normalizeBindings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const result = {};
  for (const { id } of shortcutDefinitions) {
    if (
      !Object.hasOwn(value, id) ||
      !Array.isArray(value[id]) ||
      value[id].length > 2
    )
      continue;
    const chords = value[id].map(normalizeChord);
    if (chords.some((chord) => !chord)) continue;
    result[id] = [...new Set(chords)];
  }
  return result;
}
export function shortcutAction(event, overrides = {}) {
  const chord = chordFromEvent(event);
  if (!chord) return null;
  return (
    shortcutDefinitions.find(({ id }) =>
      bindingsFor(id, overrides).includes(chord),
    )?.id ?? null
  );
}
export function bindingConflict(chord, id, overrides = {}) {
  return shortcutDefinitions.find(
    (action) =>
      action.id !== id && bindingsFor(action.id, overrides).includes(chord),
  );
}
export function formatChord(chord) {
  return chord
    .split("+")
    .map((part) =>
      part === "Mod"
        ? "Ctrl/⌘"
        : part === "Plus"
          ? "+"
          : part.length === 1
            ? part.toUpperCase()
            : part,
    )
    .join(" + ");
}
