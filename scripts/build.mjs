import { mkdir, rm, copyFile, readdir, lstat } from "node:fs/promises";
import { join, dirname } from "node:path";

// Ship application JavaScript and explicitly listed install assets; hidden files
// and unrelated assets stay out of the release.
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
for (const directory of ["public", "public/icons"]) {
  const entry = await lstat(directory);
  if (entry.isSymbolicLink())
    throw Error(`Build refuses symlink: ${directory}`);
  if (!entry.isDirectory())
    throw Error(`Build expects directory: ${directory}`);
}
for (const file of [
  "manifest.webmanifest",
  "icons/favicon.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
]) {
  const source = join("public", file),
    destination = join("dist", "public", file);
  const entry = await lstat(source);
  if (entry.isSymbolicLink()) throw Error(`Build refuses symlink: ${source}`);
  if (!entry.isFile()) throw Error(`Build expects file: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
console.log("Static Sandlab build ready.");
