import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
const embeddedFiles = {};

function addFilesToBundle(dir, prefix = "") {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const publicPath = `${prefix}/${entry}`;

    if (statSync(fullPath).isDirectory()) {
      addFilesToBundle(fullPath, publicPath);
      continue;
    }

    embeddedFiles[publicPath] = readFileSync(fullPath).toString("base64");
  }
}

addFilesToBundle(clientDir);
writeFileSync(
  path.join(serverDir, "index.js"),
  `const files = ${JSON.stringify(embeddedFiles)};
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function extension(pathname) {
  const index = pathname.lastIndexOf(".");
  return index === -1 ? "" : pathname.slice(index);
}

function fileResponse(pathname, status = 200) {
  const body = files[pathname];

  if (!body) {
    return null;
  }

  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));

  return new Response(bytes, {
    status,
    headers: {
      "Content-Type": contentTypes[extension(pathname)] || "application/octet-stream"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let pathname = url.pathname;

    if (pathname === "/") {
      pathname = "/index.html";
    }

    let response = fileResponse(pathname);

    if (!response && !pathname.endsWith(".html") && !pathname.includes(".")) {
      response = fileResponse(pathname.replace(/\\/$/, "") + ".html");
    }

    return response || fileResponse("/404.html", 404) || new Response("Not found", { status: 404 });
  }
};
`,
);
