import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { memberProgressRouter } from "../src/server/routes/memberProgress.js";

type MockFn = (...args: any[]) => any;
type TestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  sessionVersion: number;
};
type PointRecord = {
  id: string;
  studentId: string;
  pointsDelta: number;
  reason: string | null;
  awardedByUserId: string;
  awardedAt: Date;
  createdAt: Date;
};
type NoteRecord = {
  id: string;
  studentId: string;
  note: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

const assignedClubId = "assigned-club";
const outsideClubId = "outside-club";
const assignedStudentId = "assigned-student";
const outsideStudentId = "outside-student";
const users = {
  admin: testUser("admin-user", Role.ADMIN),
  director: testUser("director-user", Role.CENTER_DIRECTOR),
  facilitator: testUser("facilitator-user", Role.FACILITATOR),
  outsideFacilitator: testUser("outside-facilitator-user", Role.FACILITATOR),
  student: testUser("student-user", Role.STUDENT),
  outsideStudent: testUser("outside-student-user", Role.STUDENT)
};
const students = [
  { id: assignedStudentId, userId: users.student.id, clubId: assignedClubId },
  { id: outsideStudentId, userId: users.outsideStudent.id, clubId: outsideClubId }
];
const facilitatorClubIds = new Map([
  [users.facilitator.id, assignedClubId],
  [users.outsideFacilitator.id, outsideClubId]
]);
const pointRecords: PointRecord[] = [];
const noteRecords = new Map<string, NoteRecord>();
const fixedNow = new Date("2026-09-04T18:00:00.000Z");

patchModel("user", {
  findUnique: ({ where }: any) => Object.values(users).find((user) => user.id === where.id) ?? null
});
patchModel("student", {
  findUnique: ({ where }: any) => students.find((student) => (
    where.id ? student.id === where.id : student.userId === where.userId
  )) ?? null
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
patchModel("studentClubMembership", {
  count: ({ where }: any) => {
    const student = students.find((candidate) => candidate.id === where.studentId);
    if (!student || where.status !== "ACTIVE") return 0;

    if (where.clubId?.in) {
      return where.clubId.in.includes(student.clubId) ? 1 : 0;
    }

    const facilitatorId = where.club?.facilitators?.some?.facilitatorId;
    return facilitatorId && facilitatorClubIds.get(facilitatorId) === student.clubId ? 1 : 0;
  }
});
patchModel("memberPointTransaction", {
  aggregate: ({ where }: any) => ({
    _sum: {
      pointsDelta: pointRecords
        .filter((record) => record.studentId === where.studentId)
        .reduce((total, record) => total + record.pointsDelta, 0) || null
    }
  }),
  findMany: ({ where }: any) => pointRecords
    .filter((record) => record.studentId === where.studentId)
    .sort((left, right) => right.awardedAt.getTime() - left.awardedAt.getTime())
    .slice(0, 20)
    .map((record) => ({
      ...record,
      awardedBy: safeUser(Object.values(users).find((user) => user.id === record.awardedByUserId) ?? null)
    })),
  create: ({ data }: any) => {
    const record: PointRecord = {
      id: `point-${pointRecords.length + 1}`,
      studentId: data.studentId,
      pointsDelta: data.pointsDelta,
      reason: data.reason,
      awardedByUserId: data.awardedByUserId,
      awardedAt: fixedNow,
      createdAt: fixedNow
    };
    pointRecords.push(record);
    return record;
  }
});
patchModel("memberProgressNote", {
  findUnique: ({ where }: any) => {
    const note = noteRecords.get(where.studentId);
    return note ? {
      ...note,
      updatedBy: safeUser(Object.values(users).find((user) => user.id === note.updatedByUserId) ?? null)
    } : null;
  },
  upsert: ({ where, update, create }: any) => {
    const current = noteRecords.get(where.studentId);
    const note: NoteRecord = current
      ? { ...current, ...update, updatedAt: fixedNow }
      : { id: `note-${noteRecords.size + 1}`, ...create, createdAt: fixedNow, updatedAt: fixedNow };
    noteRecords.set(where.studentId, note);
    return note;
  }
});

const app = express();
app.use(express.json());
app.use("/api/member-progress", memberProgressRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  await addPoints(users.admin, assignedStudentId, 5, "Great participation", 201);
  await addPoints(users.admin, outsideStudentId, 4, "Admin award", 201);

  await addPoints(users.director, assignedStudentId, 3, "Centre activity", 201);
  await addPoints(users.director, outsideStudentId, 2, "Out of scope", 403);
  await request("GET", `/api/member-progress/${outsideStudentId}`, users.director, 403);
  await saveNote(users.director, outsideStudentId, "Out of scope note", 403);

  await addPoints(users.facilitator, assignedStudentId, 2, "Helpful teamwork", 201);
  await addPoints(users.facilitator, outsideStudentId, 2, "Out of scope", 403);
  await request("GET", `/api/member-progress/${outsideStudentId}`, users.facilitator, 403);
  await saveNote(users.facilitator, outsideStudentId, "Out of scope note", 403);
  await request("GET", `/api/member-progress/${assignedStudentId}`, users.outsideFacilitator, 403);

  await saveNote(users.facilitator, assignedStudentId, "Shows confidence and supports other members.", 200);
  const storedNote = noteRecords.get(assignedStudentId)!;
  assert.equal(storedNote.updatedByUserId, users.facilitator.id, "Progress notes record the staff user who updated them.");
  assert.ok(storedNote.updatedAt instanceof Date, "Progress notes record the update time.");

  const ownResponse = await request("GET", "/api/member-progress/me", users.student, 200);
  const own = await ownResponse.json() as any;
  assert.equal(own.studentId, assignedStudentId, "A member reads only their own points record.");
  assert.equal(own.totalPoints, 10, "A member sees the computed total of all point awards.");
  assert.equal(own.progressNote.note, "Shows confidence and supports other members.", "A member sees the staff progress note read-only.");
  assert.equal(own.transactions.length, 3, "A member sees recent point history.");
  assertSafeResponse(own);

  await request("GET", `/api/member-progress/${outsideStudentId}`, users.student, 403);
  await addPoints(users.student, assignedStudentId, 1, "Self award", 403);
  await saveNote(users.student, assignedStudentId, "Self note", 403);

  const firstAward = pointRecords[0];
  assert.equal(firstAward.awardedByUserId, users.admin.id, "Point history records awardedByUserId.");
  assert.ok(firstAward.awardedAt instanceof Date, "Point history records awardedAt.");
  assert.equal(firstAward.reason, "Great participation", "Point history records the reason.");

  await addPoints(users.admin, assignedStudentId, 0, "Invalid", 400);
  await addPoints(users.admin, assignedStudentId, -1, "Deductions are not enabled", 400);
  await addPoints(users.admin, assignedStudentId, 1, "x".repeat(501), 400);
  await saveNote(users.admin, assignedStudentId, "x".repeat(1001), 400);

  const adminResponse = await request("GET", `/api/member-progress/${outsideStudentId}`, users.admin, 200);
  assert.equal((await adminResponse.json() as any).totalPoints, 4, "Admin can view points for every member.");

  console.log("Member points, progress notes, ownership, staff scope, audit history, and safe response tests passed.");
} finally {
  await close(server);
  await prisma.$disconnect();
}

function testUser(id: string, role: Role): TestUser {
  return {
    id,
    email: `${id}@example.com`,
    firstName: id.split("-")[0],
    lastName: "User",
    role,
    isActive: true,
    sessionVersion: 0
  };
}

function safeUser(user: TestUser | null) {
  return user ? { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role } : null;
}

function patchModel(model: string, methods: Record<string, MockFn>) {
  const target = (prisma as any)[model];
  for (const [method, implementation] of Object.entries(methods)) target[method] = implementation;
}

async function addPoints(user: TestUser, studentId: string, points: number, reason: string, status: number) {
  return request("POST", `/api/member-progress/${studentId}/points`, user, status, { points, reason });
}

async function saveNote(user: TestUser, studentId: string, note: string, status: number) {
  return request("PUT", `/api/member-progress/${studentId}/note`, user, status, { note });
}

async function request(method: string, path: string, user: TestUser, expectedStatus: number, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${signToken(user)}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.equal(response.status, expectedStatus, `${method} ${path} should return ${expectedStatus}, received ${response.status}: ${await response.clone().text()}`);
  if (response.headers.get("content-type")?.includes("application/json")) assertSafeResponse(await response.clone().json());
  return response;
}

function assertSafeResponse(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const field of ["passwordhash", "token", "secret", "payment", "email", "phone", "dateofbirth"]) {
    assert.equal(serialized.includes(field), false, `Points responses must not expose ${field}.`);
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
