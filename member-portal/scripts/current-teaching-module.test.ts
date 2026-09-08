import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { teachingModulesRouter } from "../src/server/routes/teachingModules.js";

type MockFn = (...args: any[]) => any;
type TestUserKey = keyof typeof users;

const assignedCentreId = "assigned-centre";
const outsideCentreId = "outside-centre";
const assignedClubId = "assigned-club";
const outsideClubId = "outside-club";
const assignedResourceUrl = "https://drive.google.com/file/d/assigned-module/view";
const outsideResourceUrl = "https://storage.example.com/outside-module.pdf";
const updatedAt = new Date("2026-09-08T14:00:00.000Z");

const users = {
  admin: testUser("admin", Role.ADMIN),
  director: testUser("director", Role.CENTER_DIRECTOR),
  facilitator: testUser("facilitator", Role.FACILITATOR),
  outsideFacilitator: testUser("outside-facilitator", Role.FACILITATOR),
  student: testUser("student", Role.STUDENT),
  parent: testUser("parent", Role.PARENT),
  inactive: { ...testUser("inactive", Role.FACILITATOR), isActive: false }
};

const clubs = [
  {
    id: assignedClubId,
    name: "Assigned Senior Club",
    program: "SENIOR",
    isActive: true,
    centreId: assignedCentreId,
    centre: { id: assignedCentreId, name: "Assigned Centre", isActive: true }
  },
  {
    id: outsideClubId,
    name: "Outside Junior Club",
    program: "JUNIOR",
    isActive: true,
    centreId: outsideCentreId,
    centre: { id: outsideCentreId, name: "Outside Centre", isActive: true }
  }
];

const modules = new Map<string, any>([
  [assignedClubId, teachingModule(assignedClubId, "Assigned Module", "Senior Module 4", assignedResourceUrl)],
  [outsideClubId, teachingModule(outsideClubId, "Outside Module", "Junior Module C", outsideResourceUrl)]
]);

patchModel("user", {
  findUnique: ({ where }: any) => Object.values(users).find((user) => user.id === where.id) ?? null
});
patchModel("centerDirectorAssignment", {
  findMany: ({ where }: any) => where.userId === users.director.id && where.isActive
    ? [{ centreId: assignedCentreId }]
    : []
});
patchModel("clubFacilitator", {
  findMany: ({ where }: any) => {
    if (where.facilitatorId === users.facilitator.id) return [{ clubId: assignedClubId }];
    if (where.facilitatorId === users.outsideFacilitator.id) return [{ clubId: outsideClubId }];
    return [];
  }
});
patchModel("club", {
  findUnique: ({ where }: any) => clubs.find((club) => club.id === where.id) ?? null,
  findMany: ({ where, select }: any = {}) => {
    const visibleClubs = clubs
      .filter((club) => !where?.centreId?.in || where.centreId.in.includes(club.centreId))
      .filter((club) => !where?.id?.in || where.id.in.includes(club.id));

    if (select) {
      return visibleClubs.map((club) => ({ id: club.id, centreId: club.centreId }));
    }

    return visibleClubs.map((club) => ({
      ...club,
      currentTeachingModule: modules.get(club.id) ?? null
    }));
  }
});
patchModel("clubTeachingModule", {
  upsert: ({ where, create, update }: any) => {
    const existing = modules.get(where.clubId);
    const next = {
      ...(existing ?? { id: `module-${where.clubId}`, clubId: where.clubId, createdAt: updatedAt }),
      ...(existing ? update : create),
      updatedAt,
      updatedBy: publicTestUser(Object.values(users).find((user) => user.id === (existing ? update : create).updatedByUserId)!)
    };
    modules.set(where.clubId, next);
    return next;
  },
  deleteMany: ({ where }: any) => ({ count: modules.delete(where.clubId) ? 1 : 0 })
});

const app = express();
app.use(express.json());
app.use("/api/teaching-modules", teachingModulesRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  const adminList = await request("GET", "/api/teaching-modules", "admin", 200);
  assert.deepEqual(adminList.body.clubs.map((club: any) => club.id), [assignedClubId, outsideClubId], "Admin can view every club module.");
  assert.equal(adminList.text.includes(assignedResourceUrl), true, "Admin receives authorized module URLs.");
  assert.equal(adminList.text.includes(outsideResourceUrl), true, "Admin receives module URLs outside one centre.");

  const directorList = await request("GET", "/api/teaching-modules", "director", 200);
  assert.deepEqual(directorList.body.clubs.map((club: any) => club.id), [assignedClubId], "Center Director sees only clubs in an assigned centre.");
  assert.equal(directorList.text.includes(outsideResourceUrl), false, "Center Director does not receive an out-of-scope module URL.");

  const facilitatorList = await request("GET", "/api/teaching-modules", "facilitator", 200);
  assert.deepEqual(facilitatorList.body.clubs.map((club: any) => club.id), [assignedClubId], "Facilitator sees only a directly assigned club.");
  assert.equal(facilitatorList.text.includes(outsideResourceUrl), false, "Facilitator does not receive another club's module URL.");

  const outsideFacilitatorList = await request("GET", "/api/teaching-modules", "outsideFacilitator", 200);
  assert.deepEqual(outsideFacilitatorList.body.clubs.map((club: any) => club.id), [outsideClubId], "A facilitator assigned elsewhere sees only that other club.");
  assert.equal(outsideFacilitatorList.text.includes(assignedResourceUrl), false, "A differently assigned facilitator does not receive the assigned-club URL.");

  await assertDeniedWithoutUrls("GET", "/api/teaching-modules", "student", 403);
  await assertDeniedWithoutUrls("GET", "/api/teaching-modules", "parent", 403);
  await assertDeniedWithoutUrls("GET", "/api/teaching-modules", "inactive", 401);

  const payload = {
    title: "Updated Teaching Module",
    moduleCode: "Senior Module 5",
    resourceUrl: "https://resources.example.com/senior-module-5.pdf",
    description: "Preparation for the next club session."
  };

  const adminSave = await request("PUT", `/api/teaching-modules/${outsideClubId}`, "admin", 200, payload);
  assert.equal(adminSave.body.teachingModule.resourceUrl, payload.resourceUrl, "Admin can replace a module for any club.");

  const directorSave = await request("PUT", `/api/teaching-modules/${assignedClubId}`, "director", 200, payload);
  assert.equal(directorSave.body.teachingModule.updatedBy.id, users.director.id, "The last updater is recorded.");

  await assertDeniedWithoutUrls("PUT", `/api/teaching-modules/${outsideClubId}`, "director", 403, payload);
  await assertDeniedWithoutUrls("PUT", `/api/teaching-modules/${assignedClubId}`, "facilitator", 403, payload);
  await assertDeniedWithoutUrls("PUT", `/api/teaching-modules/${assignedClubId}`, "student", 403, payload);
  await assertDeniedWithoutUrls("PUT", `/api/teaching-modules/${assignedClubId}`, "parent", 403, payload);
  await assertDeniedWithoutUrls("PUT", `/api/teaching-modules/${assignedClubId}`, "inactive", 401, payload);

  const invalidUrl = await request("PUT", `/api/teaching-modules/${assignedClubId}`, "admin", 400, {
    ...payload,
    resourceUrl: "http://resources.example.com/not-secure.pdf"
  });
  assert.match(invalidUrl.body.message, /https/i, "Non-HTTPS URLs are rejected.");

  await assertDeniedWithoutUrls("DELETE", `/api/teaching-modules/${outsideClubId}`, "director", 403);
  await assertDeniedWithoutUrls("DELETE", `/api/teaching-modules/${assignedClubId}`, "facilitator", 403);

  const adminRemove = await request("DELETE", `/api/teaching-modules/${outsideClubId}`, "admin", 200);
  assert.equal(adminRemove.body.removed, true, "Admin can remove an assignment for any club.");
  const directorRemove = await request("DELETE", `/api/teaching-modules/${assignedClubId}`, "director", 200);
  assert.equal(directorRemove.body.removed, true, "Center Director can remove an assignment in an assigned centre.");

  console.log("Current teaching module authorization tests passed.");
} finally {
  await close(server);
  await prisma.$disconnect();
}

async function assertDeniedWithoutUrls(
  method: string,
  path: string,
  userKey: TestUserKey,
  expectedStatus: number,
  body?: unknown
) {
  const result = await request(method, path, userKey, expectedStatus, body);
  assert.equal(result.text.includes(assignedResourceUrl), false, "Denied responses must not expose the assigned module URL.");
  assert.equal(result.text.includes(outsideResourceUrl), false, "Denied responses must not expose the outside module URL.");
  assert.equal(result.text.includes("resources.example.com"), false, "Denied responses must not echo a submitted resource URL.");
}

async function request(method: string, path: string, userKey: TestUserKey, expectedStatus: number, body?: unknown) {
  const user = users[userKey];
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${signToken({ id: user.id, email: user.email, role: user.role, sessionVersion: 0 })}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${method} ${path} as ${userKey}: ${text}`);
  return { response, text, body: text ? JSON.parse(text) : null };
}

function testUser(id: string, role: Role) {
  return {
    id,
    email: `${id}@example.com`,
    firstName: id,
    lastName: "Tester",
    role,
    isActive: true,
    sessionVersion: 0
  };
}

function publicTestUser(user: ReturnType<typeof testUser>) {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role };
}

function teachingModule(clubId: string, title: string, moduleCode: string, resourceUrl: string) {
  return {
    id: `module-${clubId}`,
    clubId,
    title,
    moduleCode,
    resourceUrl,
    description: null,
    updatedByUserId: users.admin.id,
    createdAt: updatedAt,
    updatedAt,
    updatedBy: publicTestUser(users.admin)
  };
}

function patchModel(model: string, methods: Record<string, MockFn>) {
  const client = prisma as any;
  client[model] ??= {};
  Object.assign(client[model], methods);
}

function listen(expressApp: express.Express) {
  return new Promise<Server>((resolve) => {
    const startedServer = expressApp.listen(0, "127.0.0.1", () => resolve(startedServer));
  });
}

function close(startedServer: Server) {
  return new Promise<void>((resolve, reject) => {
    startedServer.close((error) => error ? reject(error) : resolve());
  });
}
