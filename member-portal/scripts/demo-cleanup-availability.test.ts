import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { config } from "../src/server/config.js";
import { prisma } from "../src/server/db.js";
import { adminRouter } from "../src/server/routes/admin.js";

const admin = {
  id: "demo-cleanup-admin",
  email: "admin@ileapclub.com",
  role: Role.ADMIN,
  isActive: true
};
const facilitator = {
  id: "demo-cleanup-facilitator",
  email: "facilitator@ileapclub.com",
  role: Role.FACILITATOR,
  isActive: true
};
let cleanupQueries = 0;

patchModel("user", {
  findUnique: ({ where }: any) => where.id === admin.id
    ? admin
    : where.id === facilitator.id
      ? facilitator
      : null,
  findMany: () => {
    cleanupQueries += 1;
    return [];
  },
  count: () => {
    cleanupQueries += 1;
    return 2;
  }
});
patchModel("student", {
  findMany: () => {
    cleanupQueries += 1;
    return [{ id: "sample-student" }];
  }
});
patchModel("meeting", {
  findMany: () => {
    cleanupQueries += 1;
    return [{ id: "seed-meeting" }];
  }
});

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
const originalEnvironment = {
  NODE_ENV: config.NODE_ENV,
  ENABLE_DEMO_CLEANUP: config.ENABLE_DEMO_CLEANUP
};

try {
  config.NODE_ENV = "production";
  config.ENABLE_DEMO_CLEANUP = false;

  const blockedRoutes: Array<[string, string]> = [
    ["DELETE", "/api/admin/users/sample-user/demo"],
    ["GET", "/api/admin/demo/cleanup-preview"],
    ["POST", "/api/admin/demo/delete-sample-users"],
    ["POST", "/api/admin/demo/delete-sample-feedback"],
    ["POST", "/api/admin/demo/reset-meeting-data"]
  ];

  for (const [method, path] of blockedRoutes) {
    const response = await request(method, path, admin);
    assert.equal(response.status, 403, `${method} ${path} must be blocked in production by default`);
  }

  assert.equal(cleanupQueries, 0, "blocked production requests must not run cleanup discovery or mutation queries");

  config.ENABLE_DEMO_CLEANUP = true;
  const nonAdminResponse = await request("GET", "/api/admin/demo/cleanup-preview", facilitator);
  assert.equal(nonAdminResponse.status, 403, "explicit enablement must not bypass admin authorization");
  assert.equal(cleanupQueries, 0, "non-admin requests must not reach cleanup queries");

  const enabledPreviewResponse = await request("GET", "/api/admin/demo/cleanup-preview", admin);
  assert.equal(enabledPreviewResponse.status, 200, "explicit enablement allows the admin preview in production");
  assert.deepEqual(await enabledPreviewResponse.json(), {
    preview: { sampleUsers: 2, sampleStudents: 1, demoMeetings: 1 }
  });

  const enabledCleanupResponse = await request("POST", "/api/admin/demo/delete-sample-users", admin);
  assert.equal(enabledCleanupResponse.status, 200, "explicit enablement allows admin cleanup in production");

  config.NODE_ENV = "development";
  config.ENABLE_DEMO_CLEANUP = false;
  const developmentPreviewResponse = await request("GET", "/api/admin/demo/cleanup-preview", admin);
  assert.equal(developmentPreviewResponse.status, 200, "cleanup remains available outside production");

  console.log("Demo cleanup availability tests passed.");
} finally {
  config.NODE_ENV = originalEnvironment.NODE_ENV;
  config.ENABLE_DEMO_CLEANUP = originalEnvironment.ENABLE_DEMO_CLEANUP;
  await close(server);
}

function request(method: string, path: string, user: typeof admin | typeof facilitator) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${signToken(user)}` }
  });
}

function patchModel(modelName: string, methods: Record<string, unknown>) {
  Object.assign((prisma as unknown as Record<string, object>)[modelName], methods);
}

function listen(expressApp: express.Express) {
  return new Promise<Server>((resolve) => {
    const startedServer = expressApp.listen(0, "127.0.0.1", () => resolve(startedServer));
  });
}

function close(serverToClose: Server) {
  return new Promise<void>((resolve, reject) => {
    serverToClose.close((error) => error ? reject(error) : resolve());
  });
}
