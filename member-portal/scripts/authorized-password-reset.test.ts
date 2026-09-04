import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { adminRouter } from "../src/server/routes/admin.js";
import { authRouter } from "../src/server/routes/auth.js";

type MockFn = (...args: any[]) => any;
type StoredUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  passwordHash: string;
  sessionVersion: number;
};

const originalPassword = "Original-Password-1";
const users = new Map<string, StoredUser>();
const audits: Array<{ id: string; targetUserId: string; resetByUserId: string; resetAt: Date }> = [];
const assignments = new Map<string, string>([
  ["member-user", "assigned-club"],
  ["facilitator-target", "assigned-club"],
  ["outside-member", "outside-club"]
]);

await Promise.all([
  addUser("admin-user", Role.ADMIN),
  addUser("other-admin", Role.ADMIN),
  addUser("director-user", Role.CENTER_DIRECTOR),
  addUser("director-target", Role.CENTER_DIRECTOR),
  addUser("facilitator-actor", Role.FACILITATOR),
  addUser("facilitator-target", Role.FACILITATOR),
  addUser("student-actor", Role.STUDENT),
  addUser("member-user", Role.STUDENT),
  addUser("outside-member", Role.STUDENT)
]);

patchModel("user", {
  findUnique: ({ where, select }: any) => {
    const user = where.id
      ? users.get(where.id)
      : [...users.values()].find((candidate) => candidate.email === where.email);
    return user ? project(user, select) : null;
  },
  update: ({ where, data, select }: any) => {
    const user = users.get(where.id);
    if (!user) throw new Error("Test user not found.");
    const sessionVersion = typeof data.sessionVersion?.increment === "number"
      ? user.sessionVersion + data.sessionVersion.increment
      : data.sessionVersion ?? user.sessionVersion;
    const updated = { ...user, ...data, sessionVersion } as StoredUser;
    users.set(user.id, updated);
    return project(updated, select);
  }
});
patchModel("passwordResetAudit", {
  create: ({ data }: any) => {
    const audit = { id: `audit-${audits.length + 1}`, ...data, resetAt: new Date("2026-09-04T15:00:00.000Z") };
    audits.push(audit);
    return audit;
  }
});
patchModel("centerDirectorAssignment", {
  findMany: ({ where }: any) => where.userId === "director-user" && where.isActive
    ? [{ centreId: "assigned-centre" }]
    : []
});
patchModel("club", {
  findMany: ({ where }: any = {}) => [
    { id: "assigned-club", centreId: "assigned-centre" },
    { id: "outside-club", centreId: "outside-centre" }
  ].filter((club) => !where.centreId?.in || where.centreId.in.includes(club.centreId))
});
patchModel("studentClubMembership", {
  count: ({ where }: any) => {
    const userId = where.student?.userId;
    const clubId = userId ? assignments.get(userId) : undefined;
    if (!clubId) return 0;
    if (where.clubId?.in) return where.clubId.in.includes(clubId) ? 1 : 0;
    if (where.clubId?.notIn) return where.clubId.notIn.includes(clubId) ? 0 : 1;
    return 0;
  }
});
patchModel("clubFacilitator", {
  count: ({ where }: any) => {
    const clubId = assignments.get(where.facilitatorId);
    if (!clubId) return 0;
    if (where.clubId?.in) return where.clubId.in.includes(clubId) ? 1 : 0;
    if (where.clubId?.notIn) return where.clubId.notIn.includes(clubId) ? 0 : 1;
    return 0;
  }
});
patchModel("centreFacilitator", { count: () => 0 });
(prisma as any).$transaction = async (callback: any) => callback(prisma);

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
app.use("/api/auth", authRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  const memberOldToken = signToken(authUser("member-user"));
  const memberPassword = "Member-Temporary-1";
  const memberReset = await resetPassword("admin-user", "member-user", memberPassword, 200);
  const memberResetBody = await memberReset.json();
  assertSafeResponse(memberResetBody, memberPassword);
  assert.equal(audits[0].targetUserId, "member-user", "Audit records the target user ID.");
  assert.equal(audits[0].resetByUserId, "admin-user", "Audit records the resetting admin ID.");
  assert.ok(audits[0].resetAt instanceof Date, "Audit records a timestamp.");
  assert.equal(JSON.stringify(audits[0]).includes(memberPassword), false, "Audit data never stores the plain password.");

  await login("member-user", originalPassword, 401);
  await login("member-user", memberPassword, 200);
  await authenticatedRequest("GET", "/api/auth/me", memberOldToken, 401);
  await resetPassword("admin-user", "member-user", memberPassword, 400);

  await resetPassword("admin-user", "facilitator-target", "Facilitator-Temporary-1", 200);
  await resetPassword("admin-user", "director-target", "Director-Temporary-1", 200);
  await resetPassword("admin-user", "other-admin", "Admin-Temporary-1", 403);

  await resetPassword("director-user", "member-user", "Member-Temporary-2", 200);
  await resetPassword("director-user", "facilitator-target", "Facilitator-Temporary-2", 200);
  await resetPassword("director-user", "admin-user", "Blocked-Temporary-1", 403);
  await resetPassword("director-user", "director-target", "Blocked-Temporary-2", 403);
  await resetPassword("director-user", "outside-member", "Blocked-Temporary-3", 403);
  await resetPassword("facilitator-actor", "member-user", "Blocked-Temporary-4", 403);
  await resetPassword("student-actor", "member-user", "Blocked-Temporary-5", 403);

  await resetPassword("admin-user", "member-user", "short", 400);
  await resetPassword("admin-user", "member-user", "x".repeat(73), 400);

  for (const audit of audits) {
    assert.deepEqual(Object.keys(audit).sort(), ["id", "resetAt", "resetByUserId", "targetUserId"], "Audit records contain identifiers and timestamp only.");
  }

  console.log("Authorized password reset, bcrypt login replacement, scope, audit, safe response, and session revocation tests passed.");
} finally {
  await close(server);
  await prisma.$disconnect();
}

async function addUser(id: string, role: Role) {
  users.set(id, {
    id,
    email: `${id}@example.com`,
    firstName: id.split("-")[0],
    lastName: "User",
    role,
    isActive: true,
    passwordHash: await bcrypt.hash(originalPassword, 4),
    sessionVersion: 0
  });
}

function authUser(userId: string) {
  const user = users.get(userId)!;
  return { id: user.id, email: user.email, role: user.role, sessionVersion: user.sessionVersion };
}

async function resetPassword(actorId: string, targetId: string, newPassword: string, status: number) {
  return authenticatedRequest(
    "PATCH",
    `/api/admin/users/${targetId}/password`,
    signToken(authUser(actorId)),
    status,
    { newPassword }
  );
}

async function login(userId: string, password: string, status: number) {
  const user = users.get(userId)!;
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password })
  });
  assert.equal(response.status, status, `Login for ${userId} should return ${status}, received ${response.status}.`);
  if (status === 200) assertSafeResponse(await response.clone().json(), password);
  return response;
}

async function authenticatedRequest(method: string, path: string, token: string, status: number, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.equal(response.status, status, `${method} ${path} should return ${status}, received ${response.status}: ${await response.clone().text()}`);
  return response;
}

function project(user: StoredUser, select?: Record<string, boolean>) {
  if (!select) return { ...user };
  return Object.fromEntries(Object.entries(select).filter(([, included]) => included).map(([key]) => [key, user[key as keyof StoredUser]]));
}

function assertSafeResponse(value: unknown, password: string) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(password), false, "Response never contains the submitted password.");
  assert.equal(serialized.includes("passwordHash"), false, "Response never contains passwordHash.");
}

function patchModel(model: string, methods: Record<string, MockFn>) {
  const target = (prisma as any)[model];
  for (const [method, implementation] of Object.entries(methods)) target[method] = implementation;
}

function listen(app: express.Express) {
  return new Promise<Server>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
