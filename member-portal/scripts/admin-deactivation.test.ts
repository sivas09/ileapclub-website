import assert from "node:assert/strict";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { adminRouter } from "../src/server/routes/admin.js";
import { authRouter } from "../src/server/routes/auth.js";
import { meetingsRouter } from "../src/server/routes/meetings.js";
import { membersRouter } from "../src/server/routes/members.js";
import { resourcesRouter } from "../src/server/routes/resources.js";

type TestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  passwordHash: string;
  sessionVersion: number;
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
const outsideClubId = "outside-club";
const testPassword = "test-password-123";
const testPasswordHash = bcrypt.hashSync(testPassword, 4);
const users = new Map<string, TestUser>([
  ["admin-user", testUser("admin-user", Role.ADMIN)],
  ["other-admin", testUser("other-admin", Role.ADMIN)],
  ["student-user", { ...testUser("student-user", Role.STUDENT), studentProfile: { id: "student-profile" } }],
  ["student-no-club", { ...testUser("student-no-club", Role.STUDENT, false), studentProfile: { id: "student-no-club-profile" } }],
  ["student-new-club", { ...testUser("student-new-club", Role.STUDENT, false), studentProfile: { id: "student-new-club-profile" } }],
  ["student-multiple-clubs", { ...testUser("student-multiple-clubs", Role.STUDENT, false), studentProfile: { id: "student-multiple-clubs-profile" } }],
  ["student-outside-scope", { ...testUser("student-outside-scope", Role.STUDENT, false), studentProfile: { id: "student-outside-scope-profile" } }],
  ["facilitator-user", testUser("facilitator-user", Role.FACILITATOR)],
  ["facilitator-caller", testUser("facilitator-caller", Role.FACILITATOR)],
  ["director-caller", testUser("director-caller", Role.CENTER_DIRECTOR)],
  ["student-caller", testUser("student-caller", Role.STUDENT)]
]);
const memberships = new Map<string, Membership>([
  [membershipKey("student-profile", selectedClubId), membership("student-profile", selectedClubId, "ACTIVE")],
  [membershipKey("student-profile", historicalClubId), membership("student-profile", historicalClubId, "ACTIVE")],
  [membershipKey("student-no-club-profile", historicalClubId), membership("student-no-club-profile", historicalClubId, "INACTIVE")],
  [membershipKey("student-multiple-clubs-profile", selectedClubId), membership("student-multiple-clubs-profile", selectedClubId, "INACTIVE")],
  [membershipKey("student-multiple-clubs-profile", historicalClubId), membership("student-multiple-clubs-profile", historicalClubId, "INACTIVE")],
  [membershipKey("student-outside-scope-profile", outsideClubId), membership("student-outside-scope-profile", outsideClubId, "INACTIVE")]
]);
const facilitatorAssignments = new Set([assignmentKey("facilitator-user", historicalClubId)]);
const bandProgressRecords = [{ id: "historical-band-progress", studentId: "student-profile" }];
const state = {
  transactionCalls: 0,
  roleSlotUpdates: [] as Array<{ where: unknown; data: unknown }>,
  historicalMutationCalls: 0,
  forceNoOtherActiveAdmins: false
};

patchModel("user", {
  findUnique: ({ where }: { where: { id?: string; email?: string } }) => {
    const user = where.id
      ? users.get(where.id)
      : [...users.values()].find((candidate) => candidate.email === where.email);
    return user ? { ...user } : null;
  },
  count: ({ where }: any = {}) => {
    if (state.forceNoOtherActiveAdmins && where.role === Role.ADMIN && where.isActive === true) {
      return 0;
    }

    return [...users.values()].filter((user) => (
      (!where.role || user.role === where.role)
      && (where.isActive === undefined || user.isActive === where.isActive)
      && (!where.id?.not || user.id !== where.id.not)
    )).length;
  },
  update: ({ where, data }: { where: { id: string }; data: { isActive?: boolean; role?: Role; sessionVersion?: { increment: number } } }) => {
    const user = users.get(where.id);
    if (!user) throw new Error("Test user not found.");
    const updatedUser = {
      ...user,
      ...data,
      sessionVersion: data.sessionVersion?.increment
        ? user.sessionVersion + data.sessionVersion.increment
        : user.sessionVersion
    } as TestUser;
    users.set(user.id, updatedUser);
    return updatedUser;
  }
});
patchModel("club", {
  count: ({ where }: any) => (where.id?.in ?? []).filter(isActiveClubId).length,
  findMany: ({ where }: any = {}) => clubIdsFromFilter(where.id)
    .filter(isActiveClubId)
    .map(clubRecord)
    .filter((club) => !where.centreId?.in || where.centreId.in.includes(club.centreId))
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
  findMany: ({ where, include, select }: any = {}) => filteredMemberships(where).map((entry) => {
    if (select?.clubId) {
      return {
        clubId: entry.clubId,
        ...(select.club ? { club: { centreId: clubRecord(entry.clubId).centreId } } : {})
      };
    }

    const user = [...users.values()].find((candidate) => candidate.studentProfile?.id === entry.studentId)!;
    return {
      ...entry,
      club: clubRecord(entry.clubId),
      ...(include?.student ? {
        student: {
          id: entry.studentId,
          userId: user.id,
          programLevel: "JUNIOR",
          bandLevel: "White",
          user,
          clubMemberships: filteredMemberships({
            studentId: entry.studentId,
            status: { not: "ACTIVE" },
            club: { isActive: true, centre: { isActive: true } }
          }).map((candidate) => ({ clubId: candidate.clubId }))
        }
      } : {})
    };
  }),
  count: ({ where }: any = {}) => filteredMemberships(where).length
});
patchModel("centre", {
  findMany: () => [
    { id: "centre-1", name: "Test Centre", province: "ON", city: "Toronto", isActive: true },
    { id: "centre-2", name: "Outside Centre", province: "ON", city: "Ottawa", isActive: true }
  ]
});
patchModel("centerDirectorAssignment", {
  findMany: ({ where }: any) => where.userId === "director-caller" ? [{ centreId: "centre-1" }] : []
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
for (const modelName of [
  "meetingAttendance",
  "meetingRoleScore",
  "studentMeetingFeedback",
  "memberFeedback",
  "monthlyMemberPayment",
  "memberLearningReflection",
  "memberPointTransaction",
  "memberProgressNote"
] as const) {
  patchModel(modelName, { delete: historicalMutation, deleteMany: historicalMutation, update: historicalMutation, updateMany: historicalMutation });
}

(prisma as unknown as { $transaction: (callback: (tx: typeof prisma) => Promise<unknown>) => Promise<unknown> }).$transaction = (callback) => {
  state.transactionCalls += 1;
  return callback(prisma);
};

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/members", membersRouter);
app.use("/api/resources", resourcesRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  await assertDeactivateStatus("admin cannot deactivate self", "admin-user", "admin-user", 400);
  const issuedAdminToken = signToken(requiredUser("other-admin"));
  const initialAdminSessionVersion = requiredUser("other-admin").sessionVersion;
  const adminResponse = await assertDeactivateStatus("admin can deactivate another admin", "admin-user", "other-admin", 200);
  const adminBody = await adminResponse.json() as { user?: { isActive?: boolean } };
  assert.equal(adminBody.user?.isActive, false, "the other Admin account should be inactive");
  assert.equal(requiredUser("other-admin").sessionVersion, initialAdminSessionVersion + 1, "deactivation increments sessionVersion");

  const inactiveTokenResponse = await requestWithToken("GET", "/api/auth/me", issuedAdminToken);
  assert.equal(inactiveTokenResponse.status, 401, "a previously issued token is rejected immediately after deactivation");

  const inactiveLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: requiredUser("other-admin").email, password: testPassword })
  });
  assert.equal(inactiveLoginResponse.status, 403, "an inactive account receives an explicit login rejection");
  assert.equal((await inactiveLoginResponse.json() as { message: string }).message, "This account is inactive. Contact an administrator for help.");

  await assertReactivateStatus("admin can reactivate another admin", "admin-user", "other-admin", [], 200);
  assert.equal(requiredUser("other-admin").isActive, true, "the Admin account should be active after reactivation");
  assert.equal((await requestWithToken("GET", "/api/auth/me", issuedAdminToken)).status, 401, "reactivation does not restore a pre-deactivation token");
  assert.equal((await authenticatedRequest("GET", "/api/auth/me", requiredUser("other-admin"))).status, 200, "a newly issued token works after reactivation");

  state.forceNoOtherActiveAdmins = true;
  await assertDeactivateStatus("last active admin cannot be deactivated", "admin-user", "other-admin", 409);
  await assertUpdateStatus("last active admin cannot be demoted", "admin-user", "other-admin", Role.CENTER_DIRECTOR, 409);
  state.forceNoOtherActiveAdmins = false;
  assert.equal(requiredUser("other-admin").role, Role.ADMIN, "a blocked demotion keeps the Admin role");
  assert.equal(requiredUser("other-admin").isActive, true, "a blocked deactivation keeps the Admin active");

  await assertDeactivateStatus("Facilitator cannot deactivate an Admin", "facilitator-caller", "other-admin", 403);
  await assertDeactivateStatus("Center Director cannot deactivate an Admin", "director-caller", "other-admin", 403);
  await assertDeactivateStatus("Student cannot deactivate an Admin", "student-caller", "other-admin", 403);
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
  const membershipsBeforeReactivation = memberships.size;
  const reactivatedStudentResponse = await assertReactivateStatus("admin restores selected member club access", "admin-user", "student-user", [selectedClubId], 200);
  const reactivatedStudentBody = await reactivatedStudentResponse.json() as { user: { isActive: boolean }; activeClubIds: string[] };
  assert.equal(state.transactionCalls, transactionsBeforeReactivation + 1, "member reactivation uses one transaction");
  assert.equal(reactivatedStudentBody.user.isActive, true, "member account access is restored");
  assert.deepEqual(reactivatedStudentBody.activeClubIds, [selectedClubId]);
  assert.equal(memberships.get(membershipKey("student-profile", selectedClubId))?.status, "ACTIVE", "selected inactive membership is restored");
  assert.equal(memberships.get(membershipKey("student-profile", selectedClubId))?.endDate, null, "restored membership is reopened");
  assert.equal(memberships.get(membershipKey("student-profile", historicalClubId))?.status, "INACTIVE", "unselected historical membership stays inactive");
  assert.equal(memberships.size, membershipsBeforeReactivation, "reactivation updates the existing membership instead of duplicating it");

  const reactivatedLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: requiredUser("student-user").email, password: testPassword })
  });
  assert.equal(reactivatedLoginResponse.status, 200, "the member can log in after reactivation");

  const activeMembersResponse = await authenticatedRequest("GET", "/api/members?status=active", requiredUser("admin-user"));
  assert.equal(activeMembersResponse.status, 200);
  const activeMembersBody = await activeMembersResponse.json() as { members: Array<{ userId: string; clubId: string; isActive: boolean }> };
  assert.equal(
    activeMembersBody.members.some((member) => member.userId === "student-user" && member.clubId === selectedClubId && member.isActive),
    true,
    "the reactivated member appears in the active filter after refresh"
  );

  const meetingsResponse = await authenticatedRequest("GET", "/api/meetings", requiredUser("student-user"));
  assert.equal(meetingsResponse.status, 200);
  const meetingsBody = await meetingsResponse.json() as { meetings: Array<{ clubId: string }> };
  assert.deepEqual(meetingsBody.meetings.map((meeting) => meeting.clubId), [selectedClubId], "member sees meetings for the restored club only");

  const resourcesResponse = await authenticatedRequest("GET", "/api/resources", requiredUser("student-user"));
  assert.equal(resourcesResponse.status, 200, resourcesResponse.status === 200 ? undefined : await resourcesResponse.clone().text());
  const resourcesBody = await resourcesResponse.json() as { resources: Array<{ id: string }> };
  assert.deepEqual(resourcesBody.resources.map((resource) => resource.id), ["junior-resource"], "member sees resources after selected club access is restored");

  const noClubMembershipCount = memberships.size;
  const noClubResponse = await assertReactivateStatus("one safe previous membership is restored automatically", "admin-user", "student-no-club", [], 200);
  const noClubBody = await noClubResponse.json() as { warning: string; activeClubIds: string[] };
  assert.deepEqual(noClubBody.activeClubIds, [historicalClubId]);
  assert.equal(noClubBody.warning, null);
  assert.equal(memberships.get(membershipKey("student-no-club-profile", historicalClubId))?.status, "ACTIVE", "the one safe previous membership is restored");
  assert.equal(memberships.size, noClubMembershipCount, "automatic restoration does not duplicate the previous membership");

  await assertReactivateStatus("member without a valid previous club requires a selection", "admin-user", "student-new-club", [], 400);
  assert.equal(requiredUser("student-new-club").isActive, false, "a member is not activated without club access");
  await assertReactivateStatus("selected access creates a membership when none exists", "admin-user", "student-new-club", [selectedClubId], 200);
  assert.equal(memberships.get(membershipKey("student-new-club-profile", selectedClubId))?.status, "ACTIVE", "selected new membership is created active");

  await assertReactivateStatus("multiple previous clubs require an explicit selection", "admin-user", "student-multiple-clubs", [], 400);
  assert.equal(requiredUser("student-multiple-clubs").isActive, false, "an ambiguous member remains inactive");
  await assertReactivateStatus("admin selects one of multiple previous clubs", "admin-user", "student-multiple-clubs", [selectedClubId], 200);
  assert.equal(memberships.get(membershipKey("student-multiple-clubs-profile", selectedClubId))?.status, "ACTIVE");
  assert.equal(memberships.get(membershipKey("student-multiple-clubs-profile", historicalClubId))?.status, "INACTIVE");

  await assertReactivateStatus("out-of-scope Center Director cannot reactivate a member", "director-caller", "student-outside-scope", [outsideClubId], 403);
  assert.equal(requiredUser("student-outside-scope").isActive, false, "an out-of-scope denial leaves the member inactive");
  await assertReactivateStatus("member cannot reactivate another member", "student-caller", "student-outside-scope", [outsideClubId], 403);

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

function assertUpdateStatus(label: string, callerId: string, targetId: string, role: Role, expectedStatus: number) {
  const target = requiredUser(targetId);
  return authenticatedRequest("PATCH", `/api/admin/users/${targetId}`, requiredUser(callerId), {
    email: target.email,
    firstName: target.firstName,
    lastName: target.lastName,
    role,
    isActive: target.isActive,
    clubIds: [],
    facilitatorClubIds: [],
    centreIds: []
  }).then((response) => {
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
  return requestWithToken(method, path, signToken(user), body);
}

function requestWithToken(method: string, path: string, token: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function requiredUser(userId: string) {
  const user = users.get(userId);
  if (!user) throw new Error(`Missing test user: ${userId}`);
  return user;
}

function testUser(id: string, role: Role, isActive = true): TestUser {
  return {
    id,
    email: `${id}@example.com`,
    firstName: "Test",
    lastName: "User",
    role,
    isActive,
    passwordHash: testPasswordHash,
    sessionVersion: 0,
    studentProfile: null
  };
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
  if (typeof where.status === "string" && entry.status !== where.status) return false;
  if (where.status?.not && entry.status === where.status.not) return false;
  if (where.clubId && typeof where.clubId === "string" && entry.clubId !== where.clubId) return false;
  if (where.clubId?.in && !where.clubId.in.includes(entry.clubId)) return false;
  if (where.clubId?.notIn?.includes(entry.clubId)) return false;
  return true;
}

function filteredMemberships(where: any = {}) {
  const studentId = where.student?.userId ? users.get(where.student.userId)?.studentProfile?.id : where.studentId;

  return [...memberships.values()].filter((entry) => {
    const user = [...users.values()].find((candidate) => candidate.studentProfile?.id === entry.studentId);
    if (studentId && entry.studentId !== studentId) return false;
    if (!matchesMembershipWhere(entry, where)) return false;
    if (where.student?.user?.role && user?.role !== where.student.user.role) return false;
    if (where.student?.user?.isActive !== undefined && user?.isActive !== where.student.user.isActive) return false;
    if (where.club?.isActive && !isActiveClubId(entry.clubId)) return false;
    if (where.club?.centre?.isActive && clubRecord(entry.clubId).centre.isActive !== true) return false;

    for (const condition of where.AND ?? []) {
      if (condition.status && !matchesMembershipWhere(entry, condition)) return false;
      const requiredActive = condition.student?.user?.isActive;
      if (requiredActive !== undefined && user?.isActive !== requiredActive) return false;
      if (condition.OR) {
        const matchesAny = condition.OR.some((option: any) => (
          (option.status && matchesMembershipWhere(entry, option))
          || (option.student?.user?.isActive !== undefined && user?.isActive === option.student.user.isActive)
        ));
        if (!matchesAny) return false;
      }
    }

    return true;
  });
}

function isActiveClubId(clubId: string) { return [selectedClubId, historicalClubId, facilitatorClubId, outsideClubId].includes(clubId); }
function clubIdsFromFilter(filter: any) { return filter?.in ?? [selectedClubId, historicalClubId, facilitatorClubId, outsideClubId]; }

function clubRecord(clubId: string) {
  const centreId = clubId === outsideClubId ? "centre-2" : "centre-1";
  return { id: clubId, centreId, name: clubId, program: "Junior Regular Meeting", isActive: true, centre: { id: centreId, name: centreId === "centre-1" ? "Test Centre" : "Outside Centre", isActive: true } };
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
