import { mkdir, rm, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// Ship only application JavaScript; hidden files, credentials, and arbitrary assets stay out.
async function copyModules(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw Error(`Build refuses symlink: ${entry.name}`);
    if (entry.name.startsWith(".")) continue;
    const from = join(source, entry.name),
      to = join(destination, entry.name);
    if (entry.isDirectory()) await copyModules(from, to);
    else if (entry.isFile() && entry.name.endsWith(".js"))
      await copyFile(from, to);
  }
}
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const file of ["index.html", "style.css", "mobile.css"])
  await copyFile(file, `dist/${file}`);
await copyModules("src", "dist/src");
console.log("Static Sandlab build ready.");
