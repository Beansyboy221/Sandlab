import { snapshot, restore } from "./persistence.js";

// Capture the current world on undo: redo includes the simulation since the last edit.
export class EditHistory {
  constructor(world, limit = 8) {
    this.world = world;
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  capture(name) {
    return { data: snapshot(this.world, true), name };
  }
  remember(name) {
    this.past.push(this.capture(name));
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }
  travel(from, to, name) {
    if (!from.length) return null;
    const entry = from.at(-1),
      current = this.capture(name);
    restore(this.world, entry.data);
    from.pop();
    to.push(current);
    return entry.name;
  }
  undo(name) {
    return this.travel(this.past, this.future, name);
  }
  redo(name) {
    return this.travel(this.future, this.past, name);
  }
}
