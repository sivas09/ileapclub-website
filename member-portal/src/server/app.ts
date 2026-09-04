import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { checkDatabaseReadiness, serviceStatus, type ReadinessCheck } from "./health.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { meetingsRouter } from "./routes/meetings.js";
import { memberProgressRouter } from "./routes/memberProgress.js";
import { membersRouter } from "./routes/members.js";
import { noticesRouter } from "./routes/notices.js";
import { reportsRouter } from "./routes/reports.js";
import { reflectionsRouter } from "./routes/reflections.js";
import { resourcesRouter } from "./routes/resources.js";
import { studentRouter } from "./routes/student.js";

type AppOptions = {
  readinessCheck?: ReadinessCheck;
  now?: () => Date;
  onReadinessError?: (error: unknown) => void;
};

export function createApp({
  readinessCheck = checkDatabaseReadiness,
  now = () => new Date(),
  onReadinessError = (error) => console.error("Database readiness check failed.", error)
}: AppOptions = {}) {
  const app = express();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDistPath = path.resolve(__dirname, "../client");
  const allowedOrigins = new Set(config.CLIENT_ORIGINS);

  app.set("trust proxy", 1);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(serviceStatus(true, now()));
  });

  app.get("/api/ready", async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      await readinessCheck();
      response.json({
        ...serviceStatus(true, now()),
        checks: { database: "reachable" }
      });
    } catch (error) {
      onReadinessError(error);
      response.status(503).json({
        ...serviceStatus(false, now()),
        checks: { database: "unavailable" }
      });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/meetings", meetingsRouter);
  app.use("/api/member-progress", memberProgressRouter);
  app.use("/api/members", membersRouter);
  app.use("/api/notices", noticesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/reflections", reflectionsRouter);
  app.use("/api/resources", resourcesRouter);
  app.use("/api/student", studentRouter);

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

    if (isRequestBodyError(error)) {
      response.status(error.status).json({
        message: error.status === 413 ? "Request body is too large." : "Request body must contain valid JSON."
      });
      return;
    }

    response.status(500).json({ message: "Unexpected server error." });
  });

  app.use((_request, response) => {
    response.status(404).json({ message: "API route not found." });
  });

  return app;
}

function isRequestBodyError(error: unknown): error is { status: 400 | 413 } {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return false;
  }

  const status = (error as { status?: unknown }).status;

  return status === 400 || status === 413;
}
