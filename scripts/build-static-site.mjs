import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");
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

if (existsSync(path.join(root, ".openai"))) {
  cpSync(path.join(root, ".openai"), path.join(dist, ".openai"), { recursive: true });
}

mkdirSync(serverDir, { recursive: true });
writeFileSync(
  path.join(serverDir, "index.js"),
  `import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3000);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function resolveRequest(url) {
  const parsed = new URL(url || "/", "http://localhost");
  const pathname = decodeURIComponent(parsed.pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.resolve(root, "." + requested);

  if (!candidate.startsWith(root)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  const htmlCandidate = path.resolve(root, "." + requested + ".html");

  if (htmlCandidate.startsWith(root) && existsSync(htmlCandidate) && statSync(htmlCandidate).isFile()) {
    return htmlCandidate;
  }

  return path.join(root, "404.html");
}

createServer((request, response) => {
  const filePath = resolveRequest(request.url);

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(filePath.endsWith("404.html") ? 404 : 200, {
    "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log("iLEAP Club test site listening on port " + port);
});
`,
);
