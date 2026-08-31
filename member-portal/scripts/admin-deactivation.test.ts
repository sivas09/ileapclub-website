import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { adminRouter } from "../src/server/routes/admin.js";
import { meetingsRouter } from "../src/server/routes/meetings.js";
import { resourcesRouter } from "../src/server/routes/resources.js";

type TestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  studentProfile?: { id: string } | null;
};

type Membership = {
  id: string;
  studentId: string;
  clubId: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
};

const selectedClubId = "selected-club";
const historicalClubId = "historical-club";
const facilitatorClubId = "facilitator-selected-club";
const users = new Map<string, TestUser>([
  ["admin-user", testUser("admin-user", Role.ADMIN)],
  ["other-admin", testUser("other-admin", Role.ADMIN)],
  ["student-user", { ...testUser("student-user", Role.STUDENT), studentProfile: { id: "student-profile" } }],
  ["student-no-club", { ...testUser("student-no-club", Role.STUDENT, false), studentProfile: { id: "student-no-club-profile" } }],
  ["student-new-club", { ...testUser("student-new-club", Role.STUDENT, false), studentProfile: { id: "student-new-club-profile" } }],
  ["facilitator-user", testUser("facilitator-user", Role.FACILITATOR)],
  ["facilitator-caller", testUser("facilitator-caller", Role.FACILITATOR)]
]);
const memberships = new Map<string, Membership>([
  [membershipKey("student-profile", selectedClubId), membership("student-profile", selectedClubId, "ACTIVE")],
  [membershipKey("student-profile", historicalClubId), membership("student-profile", historicalClubId, "ACTIVE")],
  [membershipKey("student-no-club-profile", historicalClubId), membership("student-no-club-profile", historicalClubId, "INACTIVE")]
]);
const facilitatorAssignments = new Set([assignmentKey("facilitator-user", historicalClubId)]);
const bandProgressRecords = [{ id: "historical-band-progress", studentId: "student-profile" }];
const state = {
  transactionCalls: 0,
  roleSlotUpdates: [] as Array<{ where: unknown; data: unknown }>,
  historicalMutationCalls: 0
};

patchModel("user", {
  findUnique: ({ where }: { where: { id: string } }) => {
    const user = users.get(where.id);
    return user ? { ...user } : null;
  },
  update: ({ where, data }: { where: { id: string }; data: { isActive?: boolean } }) => {
    const user = users.get(where.id);
    if (!user) throw new Error("Test user not found.");
    const updatedUser = { ...user, ...data };
    users.set(user.id, updatedUser);
    return updatedUser;
  }
});
patchModel("club", {
  count: ({ where }: any) => (where.id?.in ?? []).filter(isActiveClubId).length,
  findMany: ({ where }: any = {}) => clubIdsFromFilter(where.id).filter(isActiveClubId).map(clubRecord)
});
patchModel("studentClubMembership", {
  updateMany: ({ where, data }: any) => {
    let count = 0;
    for (const entry of memberships.values()) {
      if (!matchesMembershipWhere(entry, where)) continue;
      Object.assign(entry, data);
      count += 1;
    }
    return { count };
  },
  upsert: ({ where, update, create }: any) => {
    const identity = where.studentId_clubId;
    const key = membershipKey(identity.studentId, identity.clubId);
    const existing = memberships.get(key);
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const created = membership(create.studentId, create.clubId, create.status);
    memberships.set(key, created);
    return created;
  },
  findMany: ({ where }: any = {}) => {
    const studentId = where.student?.userId ? users.get(where.student.userId)?.studentProfile?.id : where.studentId;
    return [...memberships.values()]
      .filter((entry) => (!studentId || entry.studentId === studentId) && (!where.status || entry.status === where.status))
      .map((entry) => ({ ...entry, club: clubRecord(entry.clubId) }));
  }
});
patchModel("student", {
  findUnique: ({ where }: any) => {
    const user = where.userId ? users.get(where.userId) : [...users.values()].find((candidate) => candidate.studentProfile?.id === where.id);
    if (!user?.studentProfile) return null;
    const activeMemberships = [...memberships.values()]
      .filter((entry) => entry.studentId === user.studentProfile!.id && entry.status === "ACTIVE")
      .map((entry) => ({ ...entry, club: clubRecord(entry.clubId) }));
    return {
      id: user.studentProfile.id,
      userId: user.id,
      grade: "6",
      programLevel: null,
      bandLevel: "White",
      clubMemberships: activeMemberships,
      roleSlots: [],
      requirementProgress: []
    };
  },
  findMany: () => []
});
patchModel("clubFacilitator", {
  deleteMany: ({ where }: any) => {
    let count = 0;
    for (const key of [...facilitatorAssignments]) {
      const [facilitatorId, clubId] = key.split(":");
      const matchesClub = !where.clubId?.notIn || !where.clubId.notIn.includes(clubId);
      if (facilitatorId === where.facilitatorId && matchesClub) {
        facilitatorAssignments.delete(key);
        count += 1;
      }
    }
    return { count };
  },
  createMany: ({ data }: any) => {
    data.forEach((entry: any) => facilitatorAssignments.add(assignmentKey(entry.facilitatorId, entry.clubId)));
    return { count: data.length };
  }
});
patchModel("centreFacilitator", { deleteMany: () => ({ count: 1 }) });
patchModel("meetingRoleSlot", {
  updateMany: ({ where, data }: { where: unknown; data: unknown }) => {
    state.roleSlotUpdates.push({ where, data });
    return { count: 3 };
  },
  findMany: () => []
});
patchModel("meeting", { findMany: ({ where }: any) => clubIdsFromFilter(where.clubId).map(meetingRecord) });
patchModel("roleDefinition", { findMany: () => [] });
patchModel("resourceLink", { findMany: () => [resourceRecord()] });
patchModel("bandRequirement", { findMany: () => [] });
patchModel("studentRequirementProgress", {
  findMany: () => bandProgressRecords,
  delete: historicalMutation,
  deleteMany: historicalMutation,
  update: historicalMutation,
  updateMany: historicalMutation
});
for (const modelName of ["meetingAttendance", "meetingRoleScore", "studentMeetingFeedback", "memberFeedback"] as const) {
  patchModel(modelName, { delete: historicalMutation, deleteMany: historicalMutation, update: historicalMutation, updateMany: historicalMutation });
}

(prisma as unknown as { $transaction: (callback: (tx: typeof prisma) => Promise<unknown>) => Promise<unknown> }).$transaction = (callback) => {
  state.transactionCalls += 1;
  return callback(prisma);
};

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/resources", resourcesRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  await assertDeactivateStatus("admin cannot deactivate self", "admin-user", "admin-user", 400);
  await assertDeactivateStatus("admin cannot deactivate another admin", "admin-user", "other-admin", 400);
  await assertReactivateStatus("admin role cannot use member reactivation", "admin-user", "other-admin", [], 400);
  await assertDeactivateStatus("non-admin cannot deactivate users", "facilitator-caller", "student-user", 403);
  await assertReactivateStatus("non-admin cannot reactivate users", "facilitator-caller", "student-no-club", [], 403);
  await assertLegacyActiveStatus("legacy active route cannot bypass safe deactivation", "student-user", false, 400);

  const studentResponse = await assertDeactivateStatus("admin can safely deactivate a student", "admin-user", "student-user", 200);
  const studentBody = await studentResponse.json() as { user?: { isActive?: boolean }; deactivatedMemberships?: number; clearedUpcomingRoleSlots?: number };
  assert.equal(studentBody.user?.isActive, false, "student account should be inactive");
  assert.equal(studentBody.deactivatedMemberships, 2, "active memberships should be closed");
  assert.equal(studentBody.clearedUpcomingRoleSlots, 3, "upcoming unscored roles should be released");
  assert.equal(memberships.get(membershipKey("student-profile", selectedClubId))?.status, "INACTIVE");
  assert.equal(memberships.get(membershipKey("student-profile", historicalClubId))?.status, "INACTIVE");

  const transactionsBeforeReactivation = state.transactionCalls;
  const reactivatedStudentResponse = await assertReactivateStatus("admin restores selected member club access", "admin-user", "student-user", [selectedClubId], 200);
  const reactivatedStudentBody = await reactivatedStudentResponse.json() as { user: { isActive: boolean }; activeClubIds: string[] };
  assert.equal(state.transactionCalls, transactionsBeforeReactivation + 1, "member reactivation uses one transaction");
  assert.equal(reactivatedStudentBody.user.isActive, true, "member account access is restored");
  assert.deepEqual(reactivatedStudentBody.activeClubIds, [selectedClubId]);
  assert.equal(memberships.get(membershipKey("student-profile", selectedClubId))?.status, "ACTIVE", "selected inactive membership is restored");
  assert.equal(memberships.get(membershipKey("student-profile", selectedClubId))?.endDate, null, "restored membership is reopened");
  assert.equal(memberships.get(membershipKey("student-profile", historicalClubId))?.status, "INACTIVE", "unselected historical membership stays inactive");

  const meetingsResponse = await authenticatedRequest("GET", "/api/meetings", requiredUser("student-user"));
  assert.equal(meetingsResponse.status, 200);
  const meetingsBody = await meetingsResponse.json() as { meetings: Array<{ clubId: string }> };
  assert.deepEqual(meetingsBody.meetings.map((meeting) => meeting.clubId), [selectedClubId], "member sees meetings for the restored club only");

  const resourcesResponse = await authenticatedRequest("GET", "/api/resources", requiredUser("student-user"));
  assert.equal(resourcesResponse.status, 200);
  const resourcesBody = await resourcesResponse.json() as { resources: Array<{ id: string }> };
  assert.deepEqual(resourcesBody.resources.map((resource) => resource.id), ["junior-resource"], "member sees resources after selected club access is restored");

  const noClubResponse = await assertReactivateStatus("member can reactivate without silently restoring historical access", "admin-user", "student-no-club", [], 200);
  const noClubBody = await noClubResponse.json() as { warning: string; activeClubIds: string[] };
  assert.deepEqual(noClubBody.activeClubIds, []);
  assert.equal(noClubBody.warning, "This account will reactivate, but the member/facilitator will not have active club access.");
  assert.equal(memberships.get(membershipKey("student-no-club-profile", historicalClubId))?.status, "INACTIVE", "no club selection does not restore old access");

  await assertReactivateStatus("selected access creates a membership when none exists", "admin-user", "student-new-club", [selectedClubId], 200);
  assert.equal(memberships.get(membershipKey("student-new-club-profile", selectedClubId))?.status, "ACTIVE", "selected new membership is created active");

  await assertDeactivateStatus("admin can safely deactivate a facilitator", "admin-user", "facilitator-user", 200);
  facilitatorAssignments.add(assignmentKey("facilitator-user", historicalClubId));
  await assertReactivateStatus("facilitator regains only selected assigned clubs", "admin-user", "facilitator-user", [facilitatorClubId], 200);
  assert.deepEqual([...facilitatorAssignments], [assignmentKey("facilitator-user", facilitatorClubId)]);

  assert.equal(state.historicalMutationCalls, 0, "reactivation preserves meetings, attendance, feedback, scores, and member feedback");
  assert.deepEqual(bandProgressRecords, [{ id: "historical-band-progress", studentId: "student-profile" }], "band progress is preserved");
  console.log("Admin deactivation and safe reactivation tests passed.");
} finally {
  await close(server);
}

function assertDeactivateStatus(label: string, callerId: string, targetId: string, expectedStatus: number) {
  return authenticatedRequest("PATCH", `/api/admin/users/${targetId}/deactivate`, requiredUser(callerId)).then((response) => {
    assert.equal(response.status, expectedStatus, label);
    return response;
  });
}

function assertReactivateStatus(label: string, callerId: string, targetId: string, clubIds: string[], expectedStatus: number) {
  return authenticatedRequest("PATCH", `/api/admin/users/${targetId}/active`, requiredUser(callerId), { isActive: true, clubIds }).then((response) => {
    assert.equal(response.status, expectedStatus, label);
    return response;
  });
}

function assertLegacyActiveStatus(label: string, targetId: string, isActive: boolean, expectedStatus: number) {
  return authenticatedRequest("PATCH", `/api/admin/users/${targetId}/active`, requiredUser("admin-user"), { isActive }).then((response) => {
    assert.equal(response.status, expectedStatus, label);
    return response;
  });
}

function authenticatedRequest(method: string, path: string, user: TestUser, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${signToken(user)}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function requiredUser(userId: string) {
  const user = users.get(userId);
  if (!user) throw new Error(`Missing test user: ${userId}`);
  return user;
}

function testUser(id: string, role: Role, isActive = true): TestUser {
  return { id, email: `${id}@example.com`, firstName: "Test", lastName: "User", role, isActive, studentProfile: null };
}

function membership(studentId: string, clubId: string, status: string): Membership {
  return {
    id: `${studentId}-${clubId}`,
    studentId,
    clubId,
    status,
    startDate: new Date("2025-09-01T00:00:00.000Z"),
    endDate: status === "ACTIVE" ? null : new Date("2026-06-30T00:00:00.000Z")
  };
}

function membershipKey(studentId: string, clubId: string) { return `${studentId}:${clubId}`; }
function assignmentKey(facilitatorId: string, clubId: string) { return `${facilitatorId}:${clubId}`; }

function matchesMembershipWhere(entry: Membership, where: any) {
  if (where.studentId && entry.studentId !== where.studentId) return false;
  if (where.status && entry.status !== where.status) return false;
  if (where.clubId?.notIn?.includes(entry.clubId)) return false;
  return true;
}

function isActiveClubId(clubId: string) { return [selectedClubId, historicalClubId, facilitatorClubId].includes(clubId); }
function clubIdsFromFilter(filter: any) { return filter?.in ?? [selectedClubId, historicalClubId, facilitatorClubId]; }

function clubRecord(clubId: string) {
  return { id: clubId, centreId: "centre-1", name: clubId, program: "Junior Regular Meeting", isActive: true, centre: { id: "centre-1", name: "Test Centre", isActive: true } };
}

function meetingRecord(clubId: string) {
  return {
    id: `${clubId}-meeting`, clubId, title: `${clubId} meeting`, templateType: "Regular Meeting",
    meetingDate: new Date("2026-09-15T00:00:00.000Z"), startTime: "18:00", location: "Room 1", isRoleLocked: false,
    club: clubRecord(clubId), roleSlots: [], attendance: [], roleScores: [], studentFeedbacks: []
  };
}

function resourceRecord() {
  return {
    id: "junior-resource", title: "Junior guide", explanation: "Guide for junior members.", youtubeUrl: null,
    documentUrl: "https://example.com/guide.pdf", programLevel: "JUNIOR", bandLevel: "White", bandOrder: 1,
    roleKey: null, requirementId: null, category: "Role Guide", status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00.000Z"),
    requirement: null, createdBy: { firstName: "Admin", lastName: "User" }, updatedBy: null
  };
}

function historicalMutation() {
  state.historicalMutationCalls += 1;
  throw new Error("Reactivation must not mutate historical records.");
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
