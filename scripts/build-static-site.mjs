import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const clientDir = path.join(dist, "client");
const serverDir = path.join(dist, "server");
const htmlFiles = readdirSync(root).filter((file) => file.endsWith(".html"));
const assetDirs = ["assets", "css", "js"];

rmSync(dist, { force: true, recursive: true });
mkdirSync(clientDir, { recursive: true });

for (const file of htmlFiles) {
  cpSync(path.join(root, file), path.join(clientDir, file));
}

for (const dir of assetDirs) {
  const source = path.join(root, dir);

  if (existsSync(source)) {
    cpSync(source, path.join(clientDir, dir), { recursive: true });
  }
}

if (existsSync(path.join(root, ".openai"))) {
  cpSync(path.join(root, ".openai"), path.join(dist, ".openai"), { recursive: true });
}

mkdirSync(serverDir, { recursive: true });
writeFileSync(
  path.join(serverDir, "index.js"),
  `export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      url.pathname = "/index.html";
    }

    let response = await env.ASSETS.fetch(new Request(url, request));

    if (response.status === 404 && !url.pathname.endsWith(".html") && !url.pathname.includes(".")) {
      url.pathname = url.pathname.replace(/\\/$/, "") + ".html";
      response = await env.ASSETS.fetch(new Request(url, request));
    }

    return response;
  }
};
`,
);
