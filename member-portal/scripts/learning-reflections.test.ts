import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { reflectionsRouter } from "../src/server/routes/reflections.js";

type MockFn = (...args: any[]) => any;
type TestUser = { id: string; email: string; role: Role; isActive: boolean };
type StoredReflection = {
  id: string;
  studentId: string;
  meetingId: string | null;
  whatLearned: string;
  whatDidWell: string;
  whatToImprove: string;
  bandRequirementId: string | null;
  thinksBandRequirementCompleted: boolean;
  facilitatorResponse: string | null;
  respondedByUserId: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const assignedStudentId = "assigned-student";
const outsideStudentId = "outside-student";
const assignedClubId = "assigned-club";
const outsideClubId = "outside-club";
const users = {
  admin: { id: "admin-user", email: "admin@example.com", role: Role.ADMIN, isActive: true },
  director: { id: "director-user", email: "director@example.com", role: Role.CENTER_DIRECTOR, isActive: true },
  facilitator: { id: "facilitator-user", email: "facilitator@example.com", role: Role.FACILITATOR, isActive: true },
  student: { id: "student-user", email: "student@example.com", role: Role.STUDENT, isActive: true },
  otherStudent: { id: "other-student-user", email: "other-student@example.com", role: Role.STUDENT, isActive: true }
} satisfies Record<string, TestUser>;
const reflections: StoredReflection[] = [];
let nextReflectionId = 1;
let officialProgressWrites = 0;

patchModel("user", {
  findUnique: ({ where }: any) => Object.values(users).find((user) => user.id === where.id) ?? null
});
patchModel("student", {
  findUnique: ({ where }: any) => {
    if (where.userId === users.student.id) return { id: assignedStudentId };
    if (where.userId === users.otherStudent.id) return { id: outsideStudentId };
    return null;
  }
});
patchModel("centerDirectorAssignment", {
  findMany: ({ where }: any) => where.userId === users.director.id && where.isActive
    ? [{ centreId: "assigned-centre" }]
    : []
});
patchModel("club", {
  findMany: ({ where }: any = {}) => [
    { id: assignedClubId, centreId: "assigned-centre" },
    { id: outsideClubId, centreId: "outside-centre" }
  ].filter((club) => !where.centreId?.in || where.centreId.in.includes(club.centreId))
});
patchModel("clubFacilitator", {
  findMany: ({ where }: any) => where.facilitatorId === users.facilitator.id
    ? [{ clubId: assignedClubId, club: { centreId: "assigned-centre" } }]
    : []
});
patchModel("centreFacilitator", { findMany: () => [] });
patchModel("studentClubMembership", {
  count: ({ where }: any) => {
    const studentClubId = where.studentId === assignedStudentId ? assignedClubId : outsideClubId;
    if (where.club?.facilitators?.some?.facilitatorId) {
      return where.club.facilitators.some.facilitatorId === users.facilitator.id && studentClubId === assignedClubId ? 1 : 0;
    }
    return where.clubId?.in?.includes(studentClubId) ? 1 : 0;
  }
});
patchModel("memberLearningReflection", {
  findMany: ({ where }: any) => reflections.filter((entry) => entry.studentId === where.studentId).map(withRelations),
  findFirst: ({ where }: any) => reflections.find((entry) => entry.id === where.id && entry.studentId === where.studentId) ?? null,
  findUnique: ({ where }: any) => reflections.find((entry) => entry.id === where.id) ?? null,
  create: ({ data }: any) => {
    const now = new Date("2026-09-03T15:00:00.000Z");
    const reflection: StoredReflection = {
      id: `reflection-${nextReflectionId++}`,
      ...data,
      facilitatorResponse: null,
      respondedByUserId: null,
      respondedAt: null,
      createdAt: now,
      updatedAt: now
    };
    reflections.push(reflection);
    return withRelations(reflection);
  },
  update: ({ where, data }: any) => {
    const index = reflections.findIndex((entry) => entry.id === where.id);
    reflections[index] = { ...reflections[index], ...data, updatedAt: new Date("2026-09-03T15:05:00.000Z") };
    return withRelations(reflections[index]);
  },
  delete: ({ where }: any) => {
    const index = reflections.findIndex((entry) => entry.id === where.id);
    return reflections.splice(index, 1)[0];
  }
});
patchModel("studentRequirementProgress", {
  update: () => { officialProgressWrites += 1; }
});

const app = express();
app.use(express.json());
app.use("/api/reflections", reflectionsRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
const validReflection = {
  whatLearned: "I learned how to organize a short speech.",
  whatDidWell: "I spoke clearly and stayed within time.",
  whatToImprove: "I want to make stronger eye contact.",
  thinksBandRequirementCompleted: true
};

try {
  const createResponse = await request("POST", "/api/reflections", users.student, 201, validReflection);
  const created = (await createResponse.json() as any).reflection;
  assert.equal(created.studentId, assignedStudentId, "A student creates a reflection owned by their own profile.");
  assert.equal(created.thinksBandRequirementCompleted, true, "The self-check is stored separately.");
  assert.equal(officialProgressWrites, 0, "Creating a reflection never writes official band progress.");

  const updateResponse = await request("PATCH", `/api/reflections/${created.id}`, users.student, 200, {
    ...validReflection,
    whatToImprove: "I want to pause more often."
  });
  assert.equal((await updateResponse.json() as any).reflection.whatToImprove, "I want to pause more often.", "A student can update their own reflection.");

  const ownList = await request("GET", "/api/reflections/me", users.student, 200);
  const ownBody = await ownList.json() as any;
  assert.equal(ownBody.reflections.length, 1, "A student can view their own reflections.");
  assertNoSensitiveFields(ownBody);

  const otherOwnList = await request("GET", "/api/reflections/me", users.otherStudent, 200);
  assert.equal((await otherOwnList.json() as any).reflections.length, 0, "A student cannot see another student's reflection in their own list.");
  await request("GET", `/api/reflections/student/${assignedStudentId}`, users.otherStudent, 403);
  await request("PATCH", `/api/reflections/${created.id}`, users.otherStudent, 404, validReflection);
  await request("DELETE", `/api/reflections/${created.id}`, users.otherStudent, 404);

  for (const field of ["whatLearned", "whatDidWell", "whatToImprove"] as const) {
    await request("POST", "/api/reflections", users.student, 400, { ...validReflection, [field]: "x".repeat(201) });
  }

  await request("POST", "/api/reflections", users.student, 400, { ...validReflection, isCompleted: true });
  assert.equal(officialProgressWrites, 0, "A student cannot send an official band-completion field through reflection APIs.");

  const deletableResponse = await request("POST", "/api/reflections", users.student, 201, {
    ...validReflection,
    thinksBandRequirementCompleted: false
  });
  const deletable = (await deletableResponse.json() as any).reflection;
  await request("DELETE", `/api/reflections/${deletable.id}`, users.student, 200);

  const outsideReflection = seedReflection(outsideStudentId);
  const facilitatorAssigned = await request("GET", `/api/reflections/student/${assignedStudentId}`, users.facilitator, 200);
  assert.equal((await facilitatorAssigned.json() as any).reflections.length, 1, "A facilitator can view an assigned-club member's reflections.");
  await request("GET", `/api/reflections/student/${outsideStudentId}`, users.facilitator, 403);

  const directorAssigned = await request("GET", `/api/reflections/student/${assignedStudentId}`, users.director, 200);
  assert.equal((await directorAssigned.json() as any).reflections.length, 1, "A director can view an assigned-centre member's reflections.");
  await request("GET", `/api/reflections/student/${outsideStudentId}`, users.director, 403);

  const adminAssigned = await request("GET", `/api/reflections/student/${assignedStudentId}`, users.admin, 200);
  const adminOutside = await request("GET", `/api/reflections/student/${outsideStudentId}`, users.admin, 200);
  assert.equal((await adminAssigned.json() as any).reflections.length, 1, "Admin can view reflections for an assigned member.");
  assert.equal((await adminOutside.json() as any).reflections[0].id, outsideReflection.id, "Admin can view reflections for any member.");

  await request("PATCH", `/api/reflections/${outsideReflection.id}/response`, users.facilitator, 403, { facilitatorResponse: "Out of scope" });
  const responseResult = await request("PATCH", `/api/reflections/${created.id}/response`, users.facilitator, 200, { facilitatorResponse: "Thoughtful next step." });
  const responseBody = await responseResult.json() as any;
  assert.equal(responseBody.reflection.facilitatorResponse, "Thoughtful next step.", "Authorized staff can add a short response.");
  assertNoSensitiveFields(responseBody);
  await request("PATCH", `/api/reflections/${created.id}/response`, users.facilitator, 400, { facilitatorResponse: "x".repeat(301) });
  await request("DELETE", `/api/reflections/${created.id}`, users.student, 409);

  console.log("Learning reflection ownership, limits, scope, sign-off separation, and safe response tests passed.");
} finally {
  await close(server);
  await prisma.$disconnect();
}

function seedReflection(studentId: string) {
  const now = new Date("2026-09-03T14:00:00.000Z");
  const reflection: StoredReflection = {
    id: `reflection-${nextReflectionId++}`,
    studentId,
    meetingId: null,
    whatLearned: "A useful lesson",
    whatDidWell: "A strong contribution",
    whatToImprove: "A clear next step",
    bandRequirementId: null,
    thinksBandRequirementCompleted: false,
    facilitatorResponse: null,
    respondedByUserId: null,
    respondedAt: null,
    createdAt: now,
    updatedAt: now
  };
  reflections.push(reflection);
  return reflection;
}

function withRelations(reflection: StoredReflection) {
  const responder = Object.values(users).find((user) => user.id === reflection.respondedByUserId);
  return {
    ...reflection,
    meeting: null,
    bandRequirement: null,
    respondedBy: responder ? { firstName: "Test", lastName: "Staff", role: responder.role } : null
  };
}

function patchModel(model: string, methods: Record<string, MockFn>) {
  const target = (prisma as any)[model];
  for (const [method, implementation] of Object.entries(methods)) target[method] = implementation;
}

async function request(method: string, path: string, user: TestUser, expectedStatus: number, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${signToken({ id: user.id, email: user.email, role: user.role })}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.equal(response.status, expectedStatus, `${method} ${path} should return ${expectedStatus}, received ${response.status}: ${await response.clone().text()}`);
  return response;
}

function assertNoSensitiveFields(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const field of ["passwordHash", "token", "secret"]) {
    assert.equal(serialized.includes(field), false, `Responses must not expose ${field}.`);
  }
}

function listen(app: express.Express) {
  return new Promise<Server>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
