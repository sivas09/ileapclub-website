import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../client");

app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
    credentials: true
  })
);
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "ileap-member-portal-api"
  });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

app.use(express.static(clientDistPath));

app.get("*", (request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ message: "API route not found." });
    return;
  }

  response.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ message: "Unexpected server error." });
});

app.use((_request, response) => {
  response.status(404).json({ message: "API route not found." });
});

app.listen(config.PORT, () => {
  console.log(`iLEAP Member Portal API listening on port ${config.PORT}`);
});
