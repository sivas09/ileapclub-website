import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
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

app.use(express.static(clientDistPath));

app.get("*", (request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ message: "API route not found." });
    return;
  }

  response.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((_request, response) => {
  response.status(404).json({ message: "API route not found." });
});

app.listen(config.PORT, () => {
  console.log(`iLEAP Member Portal API listening on port ${config.PORT}`);
});
