import type { Server } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

const forceShutdownAfterMs = 10_000;
const app = createApp();
const server = app.listen(config.PORT, () => {
  console.log(`iLEAP Member Portal API listening on port ${config.PORT}`);
});
let isShuttingDown = false;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

async function shutdown(signal: "SIGTERM" | "SIGINT") {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received; closing the API server.`);

  const forceShutdownTimer = setTimeout(() => {
    console.error(`Graceful shutdown exceeded ${forceShutdownAfterMs}ms; forcing process exit.`);
    process.exit(1);
  }, forceShutdownAfterMs);
  forceShutdownTimer.unref();

  let exitCode = 0;

  try {
    await closeServer(server);
  } catch (error) {
    exitCode = 1;
    console.error("Failed to close the API server cleanly.", error);
  }

  try {
    await prisma.$disconnect();
  } catch (error) {
    exitCode = 1;
    console.error("Failed to disconnect Prisma cleanly.", error);
  }

  clearTimeout(forceShutdownTimer);
  process.exitCode = exitCode;
  console.log("API shutdown complete.");
}

function closeServer(httpServer: Server) {
  return new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });

    httpServer.closeIdleConnections();
  });
}
