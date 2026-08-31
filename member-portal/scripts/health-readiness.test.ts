import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../src/server/app.js";
import { createDatabaseReadinessCheck } from "../src/server/health.js";

const fixedDate = new Date("2026-08-31T12:00:00.000Z");
const originalBuildSha = process.env.BUILD_SHA;
process.env.BUILD_SHA = "1234567890abcdef";
let databaseIsReachable = true;
let readinessChecks = 0;
const readinessErrors: unknown[] = [];

const app = createApp({
  now: () => fixedDate,
  readinessCheck: async () => {
    readinessChecks += 1;

    if (!databaseIsReachable) {
      throw new Error("private database failure details");
    }
  },
  onReadinessError: (error) => readinessErrors.push(error)
});
const server = await listen(app);
const address = server.address();

if (!address || typeof address === "string") {
  throw new Error("Health test server did not expose a TCP port.");
}

const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const healthBody = await healthResponse.json() as Record<string, unknown>;

  assert.equal(healthResponse.status, 200, "liveness returns HTTP 200");
  assert.equal(healthResponse.headers.get("cache-control"), "no-store", "liveness is not cached");
  assert.equal(healthBody.ok, true, "liveness reports success");
  assert.equal(healthBody.service, "ileap-member-portal-api", "liveness identifies the service");
  assert.equal(healthBody.buildSha, "1234567890ab", "liveness includes an available shortened build SHA");
  assert.equal(healthBody.timestamp, fixedDate.toISOString(), "liveness includes an ISO timestamp");
  assert.equal(readinessChecks, 0, "liveness does not query the database");

  const readyResponse = await fetch(`${baseUrl}/api/ready`);
  const readyBody = await readyResponse.json() as { ok?: unknown; checks?: { database?: unknown } };

  assert.equal(readyResponse.status, 200, "readiness returns HTTP 200 when the database works");
  assert.equal(readyBody.ok, true, "readiness reports success when the database works");
  assert.equal(readyBody.checks?.database, "reachable", "readiness identifies the successful database check");
  assert.equal(readinessChecks, 1, "readiness performs the database check");

  databaseIsReachable = false;
  const unavailableResponse = await fetch(`${baseUrl}/api/ready`);
  const unavailableBody = await unavailableResponse.json() as { ok?: unknown; checks?: { database?: unknown } };
  const unavailableJson = JSON.stringify(unavailableBody);

  assert.equal(unavailableResponse.status, 503, "readiness returns HTTP 503 when the database fails");
  assert.equal(unavailableBody.ok, false, "readiness reports failure when the database fails");
  assert.equal(unavailableBody.checks?.database, "unavailable", "readiness reports the database as unavailable");
  assert.doesNotMatch(unavailableJson, /private database failure details/, "readiness does not expose internal errors");
  assert.equal(readinessErrors.length, 1, "readiness failure is recorded for server-side logging");

  const boundedCheck = createDatabaseReadinessCheck({
    probe: () => new Promise(() => undefined),
    timeoutMs: 25
  });
  await assert.rejects(boundedCheck(), /timed out after 25ms/, "database readiness checks are time bounded");

  console.log("Health and readiness tests passed.");
} finally {
  await close(server);

  if (originalBuildSha === undefined) {
    delete process.env.BUILD_SHA;
  } else {
    process.env.BUILD_SHA = originalBuildSha;
  }
}

function listen(expressApp: ReturnType<typeof createApp>) {
  return new Promise<Server>((resolve) => {
    const startedServer = expressApp.listen(0, "127.0.0.1", () => resolve(startedServer));
  });
}

function close(serverToClose: Server) {
  return new Promise<void>((resolve, reject) => {
    serverToClose.close((error) => error ? reject(error) : resolve());
  });
}
