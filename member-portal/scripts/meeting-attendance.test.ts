import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { meetingsRouter } from "../src/server/routes/meetings.js";

type MockFn = (...args: any[]) => any;
type TestUser = { id: string; email: string; role: Role; isActive: boolean; sessionVersion: number };
type AttendanceRecord = {
  id: string;
  meetingId: string;
  studentId: string;
  status: string;
  markedByUserId: string;
  markedAt: Date;
};

const assignedClubId = "assigned-club";
const outsideClubId = "outside-club";
const users = {
  admin: testUser("admin-user", Role.ADMIN),
  director: testUser("director-user", Role.CENTER_DIRECTOR),
  facilitator: testUser("facilitator-user", Role.FACILITATOR),
  student: testUser("student-user", Role.STUDENT),
  otherStudent: testUser("other-student-user", Role.STUDENT)
};
const meetings = [
  { id: "assigned-meeting", clubId: assignedClubId, title: "Assigned Meeting", meetingDate: new Date("2026-09-04T00:00:00.000Z"), club: { name: "Assigned Club" } },
  { id: "outside-meeting", clubId: outsideClubId, title: "Outside Meeting", meetingDate: new Date("2026-09-05T00:00:00.000Z"), club: { name: "Outside Club" } }
];
const students = [
  { id: "student-1", userId: users.student.id, clubId: assignedClubId, firstName: "Asha", lastName: "Member", active: true },
  { id: "student-2", userId: users.otherStudent.id, clubId: assignedClubId, firstName: "Ben", lastName: "Member", active: true },
  { id: "inactive-student", userId: "inactive-user", clubId: assignedClubId, firstName: "Inactive", lastName: "Member", active: false },
  { id: "outside-student", userId: "outside-user", clubId: outsideClubId, firstName: "Outside", lastName: "Member", active: true }
];
const attendanceRecords = new Map<string, AttendanceRecord>();

patchModel("user", {
  findUnique: ({ where }: any) => Object.values(users).find((user) => user.id === where.id) ?? null
});
patchModel("meeting", {
  findUnique: ({ where }: any) => meetings.find((meeting) => meeting.id === where.id) ?? null
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
  findFirst: ({ where }: any) => where.facilitatorId === users.facilitator.id && where.clubId === assignedClubId
    ? { clubId: assignedClubId, facilitatorId: users.facilitator.id }
    : null
});
patchModel("student", {
  findUnique: ({ where }: any) => students.find((student) => (
    where.id ? student.id === where.id : student.userId === where.userId
  )) ?? null
});
patchModel("studentClubMembership", {
  findUnique: ({ where }: any) => {
    const student = students.find((candidate) => candidate.id === where.studentId_clubId.studentId);
    if (!student || student.clubId !== where.studentId_clubId.clubId) return null;
    return {
      status: student.active ? "ACTIVE" : "INACTIVE",
      club: { isActive: true, centre: { isActive: true } }
    };
  },
  findMany: ({ where }: any) => students
    .filter((student) => student.clubId === where.clubId && student.active)
    .filter((student) => !where.student?.user?.id || student.userId === where.student.user.id)
    .map((student) => ({
      student: {
        id: student.id,
        user: { firstName: student.firstName, lastName: student.lastName }
      }
    }))
});
patchModel("meetingAttendance", {
  findMany: ({ where }: any) => [...attendanceRecords.values()].filter((record) => (
    record.meetingId === where.meetingId && where.studentId.in.includes(record.studentId)
  )),
  upsert: ({ where, update, create }: any) => {
    const key = attendanceKey(where.meetingId_studentId.meetingId, where.meetingId_studentId.studentId);
    const current = attendanceRecords.get(key);
    const record: AttendanceRecord = current
      ? { ...current, ...update }
      : { id: `attendance-${attendanceRecords.size + 1}`, ...create, markedAt: create.markedAt ?? new Date() };
    attendanceRecords.set(key, record);
    return Promise.resolve(record);
  }
});
(prisma as any).$transaction = (operations: Array<Promise<unknown>>) => Promise.all(operations);

const app = express();
app.use(express.json());
app.use("/api/meetings", meetingsRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  const initialRosterResponse = await request("GET", "/api/meetings/assigned-meeting/attendance", users.admin, 200);
  const initialRoster = await initialRosterResponse.json() as any;
  assert.deepEqual(initialRoster.roster.map((entry: any) => entry.memberName), ["Asha Member", "Ben Member"], "Roster includes only active club members in name order.");
  assert.equal(initialRoster.roster.every((entry: any) => entry.status === null), true, "Unmarked attendance is returned as Not Marked data.");
  assertSafeAttendanceResponse(initialRoster);

  await save(users.admin, "assigned-meeting", [
    { studentId: "student-1", status: "PRESENT" },
    { studentId: "student-2", status: "ABSENT" }
  ], 200);
  assert.equal(attendanceRecords.get(attendanceKey("assigned-meeting", "student-1"))?.status, "PRESENT", "Admin can mark a member Present.");
  assert.equal(attendanceRecords.get(attendanceKey("assigned-meeting", "student-2"))?.status, "ABSENT", "Admin can mark a member Absent.");

  await save(users.admin, "assigned-meeting", [{ studentId: "student-1", status: "ABSENT" }], 200);
  assert.equal(attendanceRecords.size, 2, "Saving the same meeting/member updates the unique record instead of creating another.");
  assert.equal(attendanceRecords.get(attendanceKey("assigned-meeting", "student-1"))?.status, "ABSENT");
  assert.equal(attendanceRecords.get(attendanceKey("assigned-meeting", "student-1"))?.markedByUserId, users.admin.id, "The staff user who marked attendance is recorded.");

  await save(users.director, "assigned-meeting", [{ studentId: "student-1", status: "PRESENT" }], 200);
  await save(users.director, "outside-meeting", [{ studentId: "outside-student", status: "ABSENT" }], 403);
  await request("GET", "/api/meetings/outside-meeting/attendance", users.director, 403);

  await save(users.facilitator, "assigned-meeting", [{ studentId: "student-2", status: "PRESENT" }], 200);
  await save(users.facilitator, "outside-meeting", [{ studentId: "outside-student", status: "ABSENT" }], 403);
  await request("GET", "/api/meetings/outside-meeting/attendance", users.facilitator, 403);

  await save(users.student, "assigned-meeting", [{ studentId: "student-1", status: "PRESENT" }], 403);
  const ownResponse = await request("GET", "/api/meetings/assigned-meeting/attendance", users.student, 200);
  const ownBody = await ownResponse.json() as any;
  assert.deepEqual(ownBody.roster.map((entry: any) => entry.studentId), ["student-1"], "A student sees only their own attendance record.");
  assertSafeAttendanceResponse(ownBody);
  await request("GET", "/api/meetings/outside-meeting/attendance", users.student, 403);

  await save(users.admin, "assigned-meeting", [{ studentId: "inactive-student", status: "PRESENT" }], 400);
  await save(users.admin, "assigned-meeting", [{ studentId: "outside-student", status: "PRESENT" }], 400);
  await save(users.admin, "assigned-meeting", [{ studentId: "student-1", status: "LATE" }], 400);
  await save(users.admin, "assigned-meeting", [
    { studentId: "student-1", status: "PRESENT" },
    { studentId: "student-1", status: "ABSENT" }
  ], 400);

  const markedRosterResponse = await request("GET", "/api/meetings/assigned-meeting/attendance", users.admin, 200);
  const markedRoster = await markedRosterResponse.json() as any;
  assert.equal(markedRoster.roster.find((entry: any) => entry.studentId === "student-1").status, "PRESENT", "Existing attendance records are included in the roster.");
  assertSafeAttendanceResponse(markedRoster);

  console.log("Meeting attendance status, roster, scope, ownership, uniqueness, and safe response tests passed.");
} finally {
  await close(server);
  await prisma.$disconnect();
}

function testUser(id: string, role: Role): TestUser {
  return { id, email: `${id}@example.com`, role, isActive: true, sessionVersion: 0 };
}

function attendanceKey(meetingId: string, studentId: string) {
  return `${meetingId}:${studentId}`;
}

function patchModel(model: string, methods: Record<string, MockFn>) {
  const target = (prisma as any)[model];
  for (const [method, implementation] of Object.entries(methods)) target[method] = implementation;
}

async function save(user: TestUser, meetingId: string, attendance: Array<{ studentId: string; status: string }>, status: number) {
  const response = await request("PUT", `/api/meetings/${meetingId}/attendance`, user, status, { attendance });
  if (status === 200) {
    assert.equal((await response.clone().json() as any).message, "Attendance saved successfully.");
  }
  return response;
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
  return response;
}

function assertSafeAttendanceResponse(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const field of ["passwordHash", "token", "secret", "payment", "email", "phone", "dateOfBirth"]) {
    assert.equal(serialized.toLowerCase().includes(field.toLowerCase()), false, `Attendance responses must not expose ${field}.`);
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
