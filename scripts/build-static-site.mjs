import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const htmlFiles = readdirSync(root).filter((file) => file.endsWith(".html"));
const assetDirs = ["assets", "css", "js"];

rmSync(dist, { force: true, recursive: true });
mkdirSync(dist, { recursive: true });

for (const file of htmlFiles) {
  cpSync(path.join(root, file), path.join(dist, file));
}

for (const dir of assetDirs) {
  const source = path.join(root, dir);

  if (existsSync(source)) {
    cpSync(source, path.join(dist, dir), { recursive: true });
  }
}
