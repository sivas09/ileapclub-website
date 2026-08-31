import express from "express";
import type { Server } from "node:http";
import { Role } from "@prisma/client";
import { parseStudentProgressResponse } from "../src/client/api.js";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { adminRouter } from "../src/server/routes/admin.js";
import { authRouter } from "../src/server/routes/auth.js";
import { documentsRouter } from "../src/server/routes/documents.js";
import { meetingsRouter } from "../src/server/routes/meetings.js";
import { membersRouter } from "../src/server/routes/members.js";
import { noticesRouter } from "../src/server/routes/notices.js";
import { reportsRouter } from "../src/server/routes/reports.js";
import { resourcesRouter } from "../src/server/routes/resources.js";
import { studentRouter } from "../src/server/routes/student.js";
import {
  facilitatorUserSelect,
  memberUserSelect,
  publicUserSelect
} from "../src/server/services/safeUser.js";

type MockFn = (...args: any[]) => any;

const users = {
  admin: { id: "admin-user", email: "admin@example.com", firstName: "Admin", lastName: "User", role: Role.ADMIN, isActive: true },
  facilitator: { id: "facilitator-user", email: "facilitator@example.com", firstName: "Test", lastName: "Facilitator", role: Role.FACILITATOR, isActive: true },
  student: { id: "student-user", email: "student@example.com", firstName: "Current", lastName: "Student", role: Role.STUDENT, isActive: true }
};

const assignedClubId = "assigned-club";
const otherClubId = "other-club";
const assignedStudentId = "assigned-student";
const otherStudentId = "other-student";
const meetingClubIds = new Map([
  ["assigned-meeting", assignedClubId],
  ["other-meeting", otherClubId],
  ["admin-delete-meeting", assignedClubId],
  ["failure-delete-meeting", assignedClubId],
  ["facilitator-delete-meeting", assignedClubId],
  ["other-delete-meeting", otherClubId],
  ["student-delete-meeting", assignedClubId],
  ["paired-chair-meeting", assignedClubId],
  ["paired-grammarian-meeting", assignedClubId],
  ["paired-manager-meeting", assignedClubId]
]);

const state = {
  roleUpdates: 0,
  studentRequirementUpserts: 0,
  documentCreates: 0,
  noticeCreates: 0,
  resourceCreates: 0,
  memberFeedbackCreates: 0,
  memberFeedbackUpdates: 0,
  memberFeedbackDeletes: 0,
  meetingDeleteTransactions: 0,
  deletedMeetingIds: new Set<string>(),
  meetingDeletionSteps: {} as Record<string, string[]>,
  meetingRelatedDeleteCounts: {} as Record<string, Record<string, number>>,
  lastDocumentWhere: null as any,
  lastNoticeWhere: null as any,
  lastStudentUpdate: null as any,
  roleAssignmentUpdates: [] as Array<{ where: any; data: any }>
};

patchModel("user", {
  findUnique: ({ where, select }: any) => {
    const user = Object.values(users).find((candidate) => candidate.id === where.id);

    return user
      ? projectUser({
        ...rawUser(user.id, user.role),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }, select)
      : null;
  },
  findMany: ({ where, select }: any = {}) => where?.role?.in
    ? [projectUser(rawUser(users.admin.id, Role.ADMIN), select)]
    : []
});
patchModel("club", {
  count: ({ where }: any) => where.id?.in?.every((clubId: string) => clubId === assignedClubId || clubId === otherClubId) ? where.id.in.length : 0,
  findMany: ({ include }: any = {}) => include?.studentMemberships
    ? [{
      id: assignedClubId,
      name: "Assigned Club",
      program: "Junior Regular Meeting",
      centreId: "centre-1",
      isActive: true,
      centre: { id: "centre-1", name: "Centre", isActive: true },
      studentMemberships: [{
        student: studentRecord(
          assignedStudentId,
          users.student.id,
          assignedClubId,
          include.studentMemberships.include.student.include.user.select
        )
      }],
      facilitators: [{
        facilitator: projectUser(
          rawUser(users.facilitator.id, Role.FACILITATOR),
          include.facilitators.include.facilitator.select
        )
      }]
    }]
    : [],
  findUnique: ({ where }: any) => where.id === assignedClubId || where.id === otherClubId
    ? { id: where.id, isActive: true, centre: { isActive: true } }
    : null
});
patchModel("centre", {
  findMany: () => []
});
patchModel("clubFacilitator", {
  findMany: () => [{ clubId: assignedClubId }],
  findFirst: ({ where }: any) => where.facilitatorId === users.facilitator.id && includesClub(where.clubId, assignedClubId)
    ? { id: "club-facilitator" }
    : null,
  count: ({ where }: any) => where.facilitatorId === users.facilitator.id && where.clubId === assignedClubId ? 1 : 0
});
patchModel("centreFacilitator", {
  findFirst: () => null,
  count: () => 0
});
patchModel("studentClubMembership", {
  findMany: ({ where, select }: any = {}) => {
    if (where?.student?.userId === users.student.id) {
      return [{ clubId: assignedClubId }];
    }

    if (where?.studentId === assignedStudentId) {
      return [{ clubId: assignedClubId, status: "ACTIVE", club: { centreId: "centre-1" } }];
    }

    if (where?.studentId === otherStudentId) {
      return [{ clubId: otherClubId, status: "ACTIVE", club: { centreId: "centre-2" } }];
    }

    if (select?.clubId) {
      return [];
    }

    return [];
  },
  findUnique: ({ where }: any) => {
    const key = where.studentId_clubId;

    if (key?.studentId === assignedStudentId && key.clubId === assignedClubId) {
      return activeMembership(assignedClubId);
    }

    if (key?.studentId === otherStudentId && key.clubId === otherClubId) {
      return activeMembership(otherClubId);
    }

    return null;
  },
  count: ({ where }: any = {}) => {
    const isAssignedMembership = where.studentId === assignedStudentId && where.clubId === assignedClubId;
    const isOtherMembership = where.studentId === otherStudentId && where.clubId === otherClubId;
    return isAssignedMembership || isOtherMembership ? 1 : 0;
  },
  deleteMany: () => ({ count: 0 }),
  createMany: () => ({ count: 1 }),
  updateMany: () => ({ count: 1 })
});
patchModel("student", {
  findMany: ({ where, include }: any = {}) => where?.user?.role === Role.STUDENT
    ? [studentRecord(assignedStudentId, users.student.id, assignedClubId, include?.user?.select)]
    : [],
  findUnique: ({ where, include }: any) => {
    if (where.userId === users.student.id || where.id === assignedStudentId) {
      return studentRecord(assignedStudentId, users.student.id, assignedClubId, include?.user?.select);
    }

    if (where.id === otherStudentId) {
      return studentRecord(otherStudentId, "other-user", otherClubId, include?.user?.select);
    }

    return null;
  },
  create: () => studentRecord(assignedStudentId, users.student.id, assignedClubId),
  update: ({ where, data, include }: any) => {
    state.lastStudentUpdate = data;
    return studentRecord(where.id, users.student.id, assignedClubId, include?.user?.select);
  },
  delete: () => ({ id: assignedStudentId })
});
patchModel("roleDefinition", {
  findMany: () => []
});
patchModel("meeting", {
  findMany: ({ include }: any = {}) => Array.from(meetingClubIds.entries())
    .filter(([meetingId]) => !state.deletedMeetingIds.has(meetingId))
    .map(([meetingId, clubId]) => meetingRecord(clubId, meetingId, include)),
  findUnique: ({ where }: any) => meetingRecordForId(where.id),
  findUniqueOrThrow: ({ include }: any = {}) => meetingRecord(assignedClubId, "assigned-meeting", include),
  update: ({ include }: any = {}) => meetingRecord(assignedClubId, "assigned-meeting", include),
  delete: ({ where }: any) => {
    const meeting = meetingRecordForId(where.id);

    if (!meeting) {
      throw new Error("Meeting not found in test mock.");
    }

    state.deletedMeetingIds.add(where.id);
    recordMeetingDelete(where.id, "meeting", 1);
    return meeting;
  }
});
patchModel("meetingRoleSlot", {
  findUnique: ({ where }: any) => {
    const pairedSlot = pairedRoleSlots().find((slot) => slot.id === where.id);

    if (pairedSlot) {
      return pairedSlot;
    }

    if (where.id === "assigned-slot") {
      return roleSlot("assigned-slot", "assigned-meeting", assignedClubId, null);
    }

    if (where.id === "student-slot") {
      return roleSlot("student-slot", "assigned-meeting", assignedClubId, assignedStudentId);
    }

    if (where.id === "other-student-slot") {
      return roleSlot("other-student-slot", "assigned-meeting", assignedClubId, otherStudentId);
    }

    if (where.id === "other-club-slot") {
      return roleSlot("other-club-slot", "other-meeting", otherClubId, null);
    }

    if (where.id === "feedback-slot") {
      return roleSlot("feedback-slot", "assigned-meeting", assignedClubId, null);
    }

    return null;
  },
  findMany: ({ where }: any = {}) => where?.meetingId ? pairedRoleSlots(where.meetingId) : [],
  update: ({ where, data }: any) => {
    state.roleUpdates += 1;
    state.roleAssignmentUpdates.push({ where, data });
    return roleSlot(where.id, "assigned-meeting", assignedClubId, data.assignedStudentId ?? assignedStudentId);
  },
  updateMany: ({ where, data }: any) => {
    state.roleUpdates += 1;
    state.roleAssignmentUpdates.push({ where, data });
    return { count: 1 };
  },
  groupBy: () => [],
  deleteMany: ({ where }: any) => recordMeetingDelete(where.meetingId, "roleSlots", 4)
});
patchModel("meetingAttendance", {
  count: () => 0,
  deleteMany: ({ where }: any) => recordMeetingDelete(where.meetingId, "attendance", 3)
});
patchModel("meetingRoleScore", {
  count: () => 0,
  groupBy: () => [],
  deleteMany: ({ where }: any) => {
    if (where.meetingId === "failure-delete-meeting") {
      throw new Error("Simulated related-record deletion failure.");
    }

    return recordMeetingDelete(where.meetingId, "roleScores", 2);
  }
});
patchModel("studentMeetingFeedback", {
  findMany: ({ include }: any = {}) => [{
    id: "feedback-report-1",
    roleSlotId: null,
    studentId: assignedStudentId,
    score: 88,
    feedback: "Strong preparation.",
    scoredByUserId: null,
    scoredAt: new Date("2026-08-15T16:00:00.000Z"),
    meeting: {
      id: "assigned-meeting",
      title: "Weekly Meeting",
      meetingDate: new Date("2026-08-15T00:00:00.000Z"),
      club: { id: assignedClubId, name: "Assigned Club" },
      roleSlots: []
    },
    student: studentRecord(
      assignedStudentId,
      users.student.id,
      assignedClubId,
      include?.student?.include?.user?.select
    )
  }],
  count: ({ where }: any = {}) => where?.roleSlotId === "feedback-slot" ? 1 : 0,
  groupBy: () => [],
  deleteMany: ({ where }: any) => recordMeetingDelete(where.meetingId, "studentFeedbacks", 1)
});
patchModel("memberFeedback", {
  create: ({ data }: any) => {
    state.memberFeedbackCreates += 1;
    return memberFeedbackRecord("created-feedback", data.studentId, data.clubId, data.createdByUserId, data.feedback);
  },
  findFirst: ({ where }: any) => {
    const record = where.id === "own-feedback"
      ? memberFeedbackRecord("own-feedback", assignedStudentId, assignedClubId, users.facilitator.id)
      : where.id === "other-feedback"
        ? memberFeedbackRecord("other-feedback", assignedStudentId, assignedClubId, "other-facilitator")
        : null;

    return record?.studentId === where.studentId ? record : null;
  },
  update: ({ where, data }: any) => {
    state.memberFeedbackUpdates += 1;
    return memberFeedbackRecord(where.id, assignedStudentId, assignedClubId, where.id === "own-feedback" ? users.facilitator.id : "other-facilitator", data.feedback);
  },
  delete: ({ where }: any) => {
    state.memberFeedbackDeletes += 1;
    return { id: where.id };
  },
  count: () => 0,
  deleteMany: () => ({ count: 0 })
});
patchModel("bandDocument", {
  findMany: ({ where }: any) => {
    state.lastDocumentWhere = where;
    return [documentRecord(assignedClubId)];
  },
  create: () => {
    state.documentCreates += 1;
    return documentRecord(assignedClubId);
  },
  findUnique: ({ where }: any) => where.id === "document-1" ? documentRecord(assignedClubId) : null,
  delete: () => documentRecord(assignedClubId),
  count: () => 0,
  deleteMany: () => ({ count: 0 })
});
patchModel("notice", {
  findMany: ({ where }: any) => {
    state.lastNoticeWhere = where;
    return filterNoticeRecords(where);
  },
  create: ({ data }: any) => {
    state.noticeCreates += 1;
    return noticeRecord("created-notice", data.clubId, data.status, data.expiresAt, data.isPinned);
  },
  findUnique: ({ where }: any) => noticeRecords().find((notice) => notice.id === where.id) ?? null,
  update: ({ where, data }: any) => {
    const existing = noticeRecords().find((notice) => notice.id === where.id) ?? noticeRecord(where.id, assignedClubId);
    return {
      ...existing,
      ...withoutUndefined(data),
      club: data.clubId === undefined ? existing.club : clubRecord(data.clubId)
    };
  },
  delete: ({ where }: any) => noticeRecords().find((notice) => notice.id === where.id) ?? noticeRecord(where.id, assignedClubId)
});
patchModel("resourceLink", {
  findMany: () => [resourceRecord()],
  create: () => {
    state.resourceCreates += 1;
    return resourceRecord();
  },
  findUnique: ({ where }: any) => where.id === "resource-1" ? resourceRecord() : null,
  delete: () => resourceRecord(),
  count: () => 0,
  updateMany: () => ({ count: 0 })
});
patchModel("bandRequirement", {
  findMany: () => [],
  findUnique: ({ where }: any) => where.id === "requirement-1"
    ? requirementRecord()
    : null,
  create: () => requirementRecord(),
  update: () => requirementRecord(),
  delete: () => requirementRecord()
});
patchModel("studentRequirementProgress", {
  findMany: () => [],
  upsert: () => {
    state.studentRequirementUpserts += 1;
    return { id: "progress-1", requirement: requirementRecord() };
  },
  count: () => 0,
  deleteMany: () => ({ count: 0 })
});
patchModel("studentParent", {
  count: () => 0,
  deleteMany: () => ({ count: 0 })
});

(prisma as any).$transaction = async (callbackOrQueries: any) => {
  if (typeof callbackOrQueries === "function") {
    state.meetingDeleteTransactions += 1;
    return callbackOrQueries(prisma);
  }

  return Promise.all(callbackOrQueries);
};

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/members", membersRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/notices", noticesRouter);
app.use("/api/resources", resourcesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/student", studentRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  assertSafeSelector("publicUserSelect", publicUserSelect, ["id", "firstName", "lastName", "role"]);
  assertSafeSelector("memberUserSelect", memberUserSelect, ["id", "firstName", "lastName", "email", "role", "isActive"]);
  assertSafeSelector("facilitatorUserSelect", facilitatorUserSelect, ["id", "firstName", "lastName", "email", "role", "isActive"]);
  assertSensitiveFieldScannerRejectsNestedSecrets();

  await assertStatus("unauthenticated members request is rejected", "GET", "/api/members", null, 401);

  await assertStatus("auth me response excludes confidential fields", "GET", "/api/auth/me", Role.ADMIN, 200);
  await assertStatus("admin overview response excludes confidential fields", "GET", "/api/admin/overview", Role.ADMIN, 200);

  await assertStatus("admin can view all members", "GET", "/api/members", Role.ADMIN, 200);
  await assertStatus("admin member detail excludes confidential fields", "GET", `/api/members/${assignedStudentId}`, Role.ADMIN, 200);
  await assertStatus("facilitator can view assigned club members", "GET", `/api/members?clubId=${assignedClubId}`, Role.FACILITATOR, 200);
  await assertStatus("facilitator cannot view unassigned club members", "GET", `/api/members?clubId=${otherClubId}`, Role.FACILITATOR, 403);
  await assertStatus("student cannot create members", "POST", "/api/members", Role.STUDENT, 403, memberPayload([assignedClubId]));
  await assertStatus("facilitator cannot assign student to unassigned club", "POST", "/api/members", Role.FACILITATOR, 403, memberPayload([otherClubId]));
  await assertStatus("facilitator can update assigned student learning levels", "PATCH", `/api/members/${assignedStudentId}`, Role.FACILITATOR, 200, { programLevel: "JUNIOR", bandLevel: "Yellow" });
  assertEqual(Object.keys(state.lastStudentUpdate ?? {}).sort().join(","), "bandLevel,programLevel", "member update changes only facilitator-safe fields");
  await assertStatus("facilitator cannot update member identity fields", "PATCH", `/api/members/${assignedStudentId}`, Role.FACILITATOR, 400, { programLevel: "JUNIOR", bandLevel: "Yellow", email: "tampered@example.com" });
  await assertStatus("facilitator cannot update unassigned student learning levels", "PATCH", `/api/members/${otherStudentId}`, Role.FACILITATOR, 403, { programLevel: "JUNIOR", bandLevel: "Yellow" });
  await assertStatus("student cannot update member learning levels", "PATCH", `/api/members/${assignedStudentId}`, Role.STUDENT, 403, { programLevel: "JUNIOR", bandLevel: "Yellow" });
  await assertStatus("facilitator can write feedback for an assigned-club member", "POST", `/api/members/${assignedStudentId}/feedback`, Role.FACILITATOR, 201, memberFeedbackPayload(assignedClubId));
  await assertStatus("facilitator cannot write feedback for an unassigned-club member", "POST", `/api/members/${otherStudentId}/feedback`, Role.FACILITATOR, 403, memberFeedbackPayload(otherClubId));
  await assertStatus("admin can write feedback for any active member", "POST", `/api/members/${otherStudentId}/feedback`, Role.ADMIN, 201, memberFeedbackPayload(otherClubId));
  await assertStatus("member cannot write feedback", "POST", `/api/members/${assignedStudentId}/feedback`, Role.STUDENT, 403, memberFeedbackPayload(assignedClubId));
  await assertStatus("facilitator can edit feedback they created", "PATCH", `/api/members/${assignedStudentId}/feedback/own-feedback`, Role.FACILITATOR, 200, { feedback: "Updated by its author." });
  await assertStatus("facilitator cannot edit another facilitator's feedback", "PATCH", `/api/members/${assignedStudentId}/feedback/other-feedback`, Role.FACILITATOR, 403, { feedback: "Tampered feedback." });
  await assertStatus("admin can edit any member feedback", "PATCH", `/api/members/${assignedStudentId}/feedback/other-feedback`, Role.ADMIN, 200, { feedback: "Admin correction." });
  await assertStatus("member cannot edit feedback", "PATCH", `/api/members/${assignedStudentId}/feedback/own-feedback`, Role.STUDENT, 403, { feedback: "Tampered feedback." });
  await assertStatus("facilitator can delete feedback they created", "DELETE", `/api/members/${assignedStudentId}/feedback/own-feedback`, Role.FACILITATOR, 200);
  await assertStatus("facilitator cannot delete another facilitator's feedback", "DELETE", `/api/members/${assignedStudentId}/feedback/other-feedback`, Role.FACILITATOR, 403);
  await assertStatus("admin can delete any member feedback", "DELETE", `/api/members/${assignedStudentId}/feedback/other-feedback`, Role.ADMIN, 200);
  await assertStatus("member cannot delete feedback", "DELETE", `/api/members/${assignedStudentId}/feedback/own-feedback`, Role.STUDENT, 403);

  await assertStatus("admin can assign a meeting role", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.ADMIN, 200, { studentId: assignedStudentId });
  await assertStatus("facilitator can assign a role in assigned club", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.FACILITATOR, 200, { studentId: assignedStudentId });
  await assertStatus("facilitator cannot assign a role in unassigned club", "PUT", "/api/meetings/other-meeting/slots/other-club-slot", Role.FACILITATOR, 403, { studentId: otherStudentId });
  await assertStatus("student cannot use manager role assignment endpoint", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.STUDENT, 403, { studentId: assignedStudentId });
  await assertStatus("student can claim own-club role", "POST", "/api/meetings/assigned-meeting/slots/assigned-slot/claim", Role.STUDENT, 200);
  await assertStatus("claiming iChair assigns the main role", "POST", "/api/meetings/paired-chair-meeting/slots/chair-main-slot/claim", Role.STUDENT, 200);
  assertEqual(wasRoleAssigned("chair-main-slot", assignedStudentId), true, "iChair is assigned to the claiming student");
  assertEqual(wasRoleAssigned("chair-report-slot", assignedStudentId), true, "claiming iChair auto-assigns iChair Report");
  await assertStatus("claiming iGrammarian assigns its report", "POST", "/api/meetings/paired-grammarian-meeting/slots/grammarian-main-slot/claim", Role.STUDENT, 200);
  assertEqual(wasRoleAssigned("grammarian-main-slot", assignedStudentId), true, "iGrammarian is assigned to the claiming student");
  assertEqual(wasRoleAssigned("grammarian-report-slot", assignedStudentId), true, "claiming iGrammarian auto-assigns iGrammarian Report");
  await assertStatus("student cannot claim a report role directly", "POST", "/api/meetings/paired-chair-meeting/slots/chair-report-slot/claim", Role.STUDENT, 409);
  await assertStatus("manager assignment pairs iChair Report", "PUT", "/api/meetings/paired-manager-meeting/slots/manager-chair-main-slot", Role.ADMIN, 200, { studentId: assignedStudentId });
  assertEqual(wasRoleAssigned("manager-chair-main-slot", assignedStudentId), true, "manager assigns the iChair main role");
  assertEqual(wasRoleAssigned("manager-chair-report-slot", assignedStudentId), true, "manager assignment auto-assigns iChair Report");
  await assertStatus("manager cannot assign a report role directly", "PUT", "/api/meetings/paired-manager-meeting/slots/manager-chair-report-slot", Role.ADMIN, 409, { studentId: assignedStudentId });
  await assertStatus("manager clearing iChair also clears its report", "PUT", "/api/meetings/paired-manager-meeting/slots/manager-chair-main-slot", Role.ADMIN, 200, { studentId: null });
  assertEqual(wasRoleCleared("manager-chair-report-slot"), true, "clearing a main role clears its report role");
  await assertStatus("student cannot release another student's role", "POST", "/api/meetings/assigned-meeting/slots/other-student-slot/release", Role.STUDENT, 403);
  await assertStatus("student can release own claimed role", "POST", "/api/meetings/assigned-meeting/slots/student-slot/release", Role.STUDENT, 200);
  await assertStatus("facilitator can edit assigned-club meeting", "PATCH", "/api/meetings/assigned-meeting", Role.FACILITATOR, 200, { title: "Updated Saturday Meeting" });
  await assertStatus("facilitator cannot edit another club meeting by tampering with id", "PATCH", "/api/meetings/other-meeting", Role.FACILITATOR, 403, { title: "Tampered Meeting" });
  await assertStatus("student cannot edit meeting directly", "PATCH", "/api/meetings/assigned-meeting", Role.STUDENT, 403, { title: "Tampered Meeting" });
  await assertStatus("invalid calendar meeting date is rejected", "POST", "/api/meetings", Role.ADMIN, 400, meetingPayload("2026-02-30"));
  await assertStatus("role slot with meeting feedback cannot be removed", "DELETE", "/api/meetings/assigned-meeting/slots/feedback-slot", Role.ADMIN, 409);

  const transactionsBeforeMeetingDeletes = state.meetingDeleteTransactions;
  await assertStatus("unauthenticated meeting deletion is rejected", "DELETE", "/api/meetings/student-delete-meeting", null, 401);
  await assertStatus("admin can delete a meeting with related records", "DELETE", "/api/meetings/admin-delete-meeting", Role.ADMIN, 200);
  assertEqual(state.deletedMeetingIds.has("admin-delete-meeting"), true, "admin deletion removes the meeting");
  assertEqual(
    state.meetingDeletionSteps["admin-delete-meeting"]?.join(","),
    "roleScores,studentFeedbacks,attendance,roleSlots,meeting",
    "meeting records are deleted in foreign-key-safe order"
  );
  assertEqual(state.meetingRelatedDeleteCounts["admin-delete-meeting"]?.roleScores, 2, "meeting role scores are deleted");
  assertEqual(state.meetingRelatedDeleteCounts["admin-delete-meeting"]?.studentFeedbacks, 1, "student feedback is deleted");
  assertEqual(state.meetingRelatedDeleteCounts["admin-delete-meeting"]?.attendance, 3, "meeting attendance is deleted");
  assertEqual(state.meetingRelatedDeleteCounts["admin-delete-meeting"]?.roleSlots, 4, "meeting role assignments are deleted");
  const meetingsAfterDeleteResponse = await assertStatus("admin can list meetings after deletion", "GET", "/api/meetings", Role.ADMIN, 200);
  const meetingsAfterDelete = await responseMeetings(meetingsAfterDeleteResponse);
  assertEqual(meetingsAfterDelete.some((meeting) => meeting.id === "admin-delete-meeting"), false, "deleted meeting no longer appears");
  await assertStatus("repeated meeting deletion returns not found", "DELETE", "/api/meetings/admin-delete-meeting", Role.ADMIN, 404);
  await assertStatus("nonexistent meeting deletion returns not found", "DELETE", "/api/meetings/missing-meeting", Role.ADMIN, 404);
  await assertStatus("facilitator can delete assigned-club meeting", "DELETE", "/api/meetings/facilitator-delete-meeting", Role.FACILITATOR, 200);
  await assertStatus("facilitator cannot delete unassigned-club meeting", "DELETE", "/api/meetings/other-delete-meeting", Role.FACILITATOR, 403);
  assertEqual(state.deletedMeetingIds.has("other-delete-meeting"), false, "tampered meeting id is not deleted");
  await assertStatus("student cannot delete meeting", "DELETE", "/api/meetings/student-delete-meeting", Role.STUDENT, 403);
  assertEqual(state.deletedMeetingIds.has("student-delete-meeting"), false, "student delete attempt leaves meeting intact");
  assertEqual(state.meetingDeleteTransactions, transactionsBeforeMeetingDeletes + 2, "authorized meeting deletions use transactions");
  await assertStatus("related-record deletion failure returns server error", "DELETE", "/api/meetings/failure-delete-meeting", Role.ADMIN, 500);
  assertEqual(state.deletedMeetingIds.has("failure-delete-meeting"), false, "failed related-record deletion leaves meeting intact");

  await assertStatus("admin can add documents", "POST", "/api/documents", Role.ADMIN, 201, documentPayload(null));
  await assertStatus("facilitator can add assigned-club documents", "POST", "/api/documents", Role.FACILITATOR, 201, documentPayload(assignedClubId));
  await assertStatus("facilitator cannot add unassigned-club documents", "POST", "/api/documents", Role.FACILITATOR, 403, documentPayload(otherClubId));
  await assertStatus("student cannot add documents", "POST", "/api/documents", Role.STUDENT, 403, documentPayload(assignedClubId));
  await assertStatus("facilitator cannot view unassigned-club documents", "GET", `/api/documents?clubId=${otherClubId}`, Role.FACILITATOR, 403);
  await assertStatus("admin can view all document statuses", "GET", "/api/documents", Role.ADMIN, 200);
  assertEqual(state.lastDocumentWhere?.status === undefined, true, "admin document list does not force active status");
  await assertStatus("facilitator cannot request archived documents", "GET", "/api/documents?status=ARCHIVED", Role.FACILITATOR, 200);
  assertEqual(state.lastDocumentWhere?.status === "ACTIVE", true, "facilitator document list remains active-only");
  await assertStatus("student cannot request archived documents", "GET", "/api/documents?status=ARCHIVED", Role.STUDENT, 200);
  assertEqual(state.lastDocumentWhere?.status === "ACTIVE", true, "student document list remains active-only");
  await assertStatus("admin can delete documents", "DELETE", "/api/documents/document-1", Role.ADMIN, 200);
  await assertStatus("facilitator cannot permanently delete documents", "DELETE", "/api/documents/document-1", Role.FACILITATOR, 403);

  await assertStatus("admin can create Club A notice", "POST", "/api/notices", Role.ADMIN, 201, noticePayload(assignedClubId));
  await assertStatus("admin can create Club B notice", "POST", "/api/notices", Role.ADMIN, 201, noticePayload(otherClubId));
  await assertStatus("admin can create all-clubs notice", "POST", "/api/notices", Role.ADMIN, 201, noticePayload(null));
  await assertStatus("notice title maximum is enforced", "POST", "/api/notices", Role.ADMIN, 400, { ...noticePayload(assignedClubId), title: "x".repeat(121) });
  await assertStatus("notice message is required", "POST", "/api/notices", Role.ADMIN, 400, { ...noticePayload(assignedClubId), message: "" });
  await assertStatus("notice expiry must be a valid timestamp", "POST", "/api/notices", Role.ADMIN, 400, { ...noticePayload(assignedClubId), expiresAt: "not-a-date" });
  await assertStatus("notice status must be valid", "POST", "/api/notices", Role.ADMIN, 400, { ...noticePayload(assignedClubId), status: "PUBLISHED" });
  const adminNoticesResponse = await assertStatus("admin can view notices across clubs", "GET", "/api/notices", Role.ADMIN, 200);
  const adminNotices = await responseNotices(adminNoticesResponse);
  assertEqual(adminNotices.some((notice) => notice.clubId === assignedClubId), true, "admin sees Club A notice");
  assertEqual(adminNotices.some((notice) => notice.clubId === otherClubId), true, "admin sees Club B notice");
  await assertStatus("admin can edit and archive notice", "PATCH", "/api/notices/notice-a", Role.ADMIN, 200, { title: "Updated reminder", status: "ARCHIVED" });

  await assertStatus("facilitator can create assigned-club notice", "POST", "/api/notices", Role.FACILITATOR, 201, noticePayload(assignedClubId));
  await assertStatus("facilitator cannot create unassigned-club notice", "POST", "/api/notices", Role.FACILITATOR, 403, noticePayload(otherClubId));
  await assertStatus("facilitator cannot submit all-clubs notice", "POST", "/api/notices", Role.FACILITATOR, 403, noticePayload(null));
  await assertStatus("facilitator cannot move notice to unassigned club", "PATCH", "/api/notices/notice-a", Role.FACILITATOR, 403, { clubId: otherClubId });
  await assertStatus("facilitator cannot edit unauthorized Club B notice", "PATCH", "/api/notices/notice-b", Role.FACILITATOR, 403, { message: "Tampered request" });
  await assertStatus("facilitator can edit assigned-club notice", "PATCH", "/api/notices/notice-a", Role.FACILITATOR, 200, { message: "Bring your workbook." });
  await assertStatus("facilitator can archive assigned-club notice", "PATCH", "/api/notices/notice-a", Role.FACILITATOR, 200, { status: "ARCHIVED" });
  const facilitatorNoticesResponse = await assertStatus("facilitator sees only appropriate notices", "GET", "/api/notices?status=ACTIVE", Role.FACILITATOR, 200);
  const facilitatorNotices = await responseNotices(facilitatorNoticesResponse);
  assertEqual(facilitatorNotices.some((notice) => notice.clubId === otherClubId), false, "facilitator cannot see Club B notice");
  await assertStatus("facilitator cannot request unassigned club notices", "GET", `/api/notices?clubId=${otherClubId}`, Role.FACILITATOR, 403);

  const studentNoticesResponse = await assertStatus("student sees active own-club notices", "GET", "/api/notices", Role.STUDENT, 200);
  const studentNotices = await responseNotices(studentNoticesResponse);
  assertEqual(studentNotices.some((notice) => notice.id === "notice-a"), true, "student sees active Club A notice");
  assertEqual(studentNotices.some((notice) => notice.id === "notice-global"), true, "student sees active all-clubs notice");
  assertEqual(studentNotices.some((notice) => notice.id === "notice-b"), false, "student cannot see Club B notice");
  assertEqual(studentNotices.some((notice) => notice.id === "notice-archived"), false, "student cannot see archived notice");
  assertEqual(studentNotices.some((notice) => notice.id === "notice-expired"), false, "student cannot see expired notice");
  const studentArchivedResponse = await assertStatus("student archived filter still returns active notices only", "GET", "/api/notices?status=ARCHIVED", Role.STUDENT, 200);
  const studentArchivedNotices = await responseNotices(studentArchivedResponse);
  assertEqual(studentArchivedNotices.some((notice) => notice.id === "notice-archived"), false, "student cannot force archived notice visibility");
  await assertStatus("student cannot request arbitrary club notice scope", "GET", `/api/notices?clubId=${otherClubId}`, Role.STUDENT, 403);
  await assertStatus("student cannot create notice", "POST", "/api/notices", Role.STUDENT, 403, noticePayload(assignedClubId));
  await assertStatus("student cannot update notice", "PATCH", "/api/notices/notice-a", Role.STUDENT, 403, { message: "Tampered" });
  await assertStatus("student cannot archive notice", "PATCH", "/api/notices/notice-a", Role.STUDENT, 403, { status: "ARCHIVED" });
  await assertStatus("student cannot delete notice", "DELETE", "/api/notices/notice-a", Role.STUDENT, 403);
  await assertStatus("facilitator cannot permanently delete notice", "DELETE", "/api/notices/notice-a", Role.FACILITATOR, 403);
  await assertStatus("admin can permanently delete notice", "DELETE", "/api/notices/notice-a", Role.ADMIN, 200);

  await assertStatus("admin can add resources", "POST", "/api/resources", Role.ADMIN, 201, resourcePayload());
  await assertStatus("facilitator cannot add resources", "POST", "/api/resources", Role.FACILITATOR, 403, resourcePayload());
  await assertStatus("student cannot delete resources", "DELETE", "/api/resources/resource-1", Role.STUDENT, 403);
  await assertStatus("admin can delete resources", "DELETE", "/api/resources/resource-1", Role.ADMIN, 200);
  await assertStatus("admin resource list excludes confidential fields", "GET", "/api/resources", Role.ADMIN, 200);

  await assertStatus("admin feedback report excludes confidential fields", "GET", "/api/reports/facilitator-feedback", Role.ADMIN, 200);
  const studentProgressResponse = await assertStatus("student self progress excludes confidential fields", "GET", "/api/student/me/progress", Role.STUDENT, 200);
  const studentProgress = parseStudentProgressResponse(await studentProgressResponse.json());
  assertEqual(studentProgress.student.id, assignedStudentId, "student self progress includes the member id");
  assertEqual(studentProgress.student.user.firstName, "Current", "student self progress includes the safe member name");
  assertEqual("email" in studentProgress.student.user, false, "student self progress does not expose the member email");
  assertEqual(studentProgress.summary.clubName, "Assigned Club", "student self progress includes the active club");
  assertEqual(studentProgress.summary.programLevel, "JUNIOR", "student self progress includes the program level");
  assertEqual(studentProgress.summary.bandLevel, "White", "student self progress includes the current band");
  await assertStatus("admin student progress excludes confidential fields", "GET", `/api/student/${assignedStudentId}/progress`, Role.ADMIN, 200);

  await assertStatus("admin can update student band progress", "PUT", `/api/student/${otherStudentId}/requirements/requirement-1`, Role.ADMIN, 200, progressPayload());
  await assertStatus("facilitator can update assigned student band progress", "PUT", `/api/student/${assignedStudentId}/requirements/requirement-1`, Role.FACILITATOR, 200, progressPayload());
  await assertStatus("facilitator cannot update unassigned student band progress", "PUT", `/api/student/${otherStudentId}/requirements/requirement-1`, Role.FACILITATOR, 403, progressPayload());
  await assertStatus("student cannot update band progress", "PUT", `/api/student/${assignedStudentId}/requirements/requirement-1`, Role.STUDENT, 403, progressPayload());
  await assertStatus("student cannot manage band requirement definitions", "POST", "/api/student/requirements", Role.STUDENT, 403, requirementPayload());
  await assertStatus("admin can manage band requirement definitions", "POST", "/api/student/requirements", Role.ADMIN, 201, requirementPayload());

  assertEqual(state.roleUpdates > 0, true, "role claim/release tests executed update paths");
  assertEqual(state.documentCreates > 0, true, "document create tests executed create path");
  assertEqual(state.noticeCreates > 0, true, "notice create tests executed create path");
  assertEqual(state.resourceCreates > 0, true, "resource create tests executed create path");
  assertEqual(state.studentRequirementUpserts > 0, true, "band progress tests executed upsert path");
  assertEqual(state.memberFeedbackCreates, 2, "authorized member feedback creates reached persistence");
  assertEqual(state.memberFeedbackUpdates, 2, "only authorized member feedback edits reached persistence");
  assertEqual(state.memberFeedbackDeletes, 2, "only authorized member feedback deletes reached persistence");

  console.log("Endpoint authorization tests passed.");
} finally {
  await close(server);
}

async function assertStatus(label: string, method: string, path: string, role: Role | null, expectedStatus: number, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(role ? { authorization: `Bearer ${signToken(tokenUser(role))}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, received ${response.status}: ${await response.text()}`);
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    assertNoSensitiveResponseFields(await response.clone().json(), label);
  }

  return response;
}

function assertNoSensitiveResponseFields(value: unknown, label: string, path = "response") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveResponseFields(entry, label, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (/password|reset.?token|jwt.?secret|secret|access.?token|refresh.?token/i.test(key)) {
      throw new Error(`${label}: confidential response field found at ${path}.${key}`);
    }

    assertNoSensitiveResponseFields(entry, label, `${path}.${key}`);
  }
}

function assertSensitiveFieldScannerRejectsNestedSecrets() {
  for (const field of ["passwordHash", "password", "tokenSecret", "resetToken", "jwtSecret", "secret"]) {
    let rejected = false;

    try {
      assertNoSensitiveResponseFields({ payload: [{ account: { [field]: "must-not-leak" } }] }, "scanner self-test");
    } catch {
      rejected = true;
    }

    assertEqual(rejected, true, `recursive confidentiality scanner rejects nested ${field}`);
  }
}

function assertSafeSelector(label: string, selector: Record<string, true>, expectedKeys: string[]) {
  const actualKeys = Object.keys(selector).sort().join(",");
  const allowedKeys = [...expectedKeys].sort().join(",");

  if (actualKeys !== allowedKeys) {
    throw new Error(`${label}: expected only ${allowedKeys}, received ${actualKeys}`);
  }
}

async function responseNotices(response: globalThis.Response) {
  const body = await response.json() as { notices: Array<{ id: string; clubId: string | null }> };
  return body.notices;
}

async function responseMeetings(response: globalThis.Response) {
  const body = await response.json() as { meetings: Array<{ id: string }> };
  return body.meetings;
}

function tokenUser(role: Role) {
  if (role === Role.ADMIN) {
    return users.admin;
  }

  if (role === Role.FACILITATOR) {
    return users.facilitator;
  }

  return users.student;
}

function patchModel(model: string, methods: Record<string, MockFn>) {
  Object.assign((prisma as any)[model], methods);
}

function includesClub(value: string | { in?: string[] } | undefined, clubId: string) {
  if (typeof value === "string") {
    return value === clubId;
  }

  return Boolean(value?.in?.includes(clubId));
}

function wasRoleAssigned(slotId: string, studentId: string) {
  return state.roleAssignmentUpdates.some(({ where, data }) => {
    const targetsSlot = where.id === slotId || where.id?.in?.includes(slotId);
    return targetsSlot && data.assignedStudentId === studentId;
  });
}

function wasRoleCleared(slotId: string) {
  return state.roleAssignmentUpdates.some(({ where, data }) => {
    const targetsSlot = where.id === slotId || where.id?.in?.includes(slotId);
    return targetsSlot && data.assignedStudentId === null;
  });
}

function listen(expressApp: express.Express) {
  return new Promise<Server>((resolve) => {
    const startedServer = expressApp.listen(0, "127.0.0.1", () => resolve(startedServer));
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function assertEqual(actual: boolean, expected: boolean, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function memberPayload(clubIds: string[]) {
  return {
    email: "new.student@example.com",
    password: "password123",
    firstName: "New",
    lastName: "Student",
    grade: "6",
    programLevel: "JUNIOR",
    bandLevel: "White",
    clubIds
  };
}

function meetingPayload(meetingDate: string) {
  return {
    clubId: assignedClubId,
    title: "Saturday Meeting",
    templateType: "Senior Regular Meeting",
    meetingDate,
    startTime: "14:00",
    location: "Room 202"
  };
}

function documentPayload(clubId: string | null) {
  return {
    title: "Band checklist",
    description: "Checklist for class",
    fileUrl: "https://example.com/checklist.pdf",
    programLevel: "JUNIOR",
    bandLevel: "White",
    clubId,
    category: "Band Requirements"
  };
}

function noticePayload(clubId: string | null) {
  return {
    title: "Saturday Meeting Reminder",
    message: "Please bring your workbook this Saturday.",
    clubId,
    expiresAt: "2026-08-22T23:59:59.999Z",
    isPinned: true
  };
}

function resourcePayload() {
  return {
    title: "Prepared Speech Guide",
    explanation: "A useful guide for students.",
    youtubeUrl: "https://example.com/video",
    documentUrl: "https://example.com/doc",
    programLevel: "JUNIOR",
    bandLevel: "White",
    category: "Role Guide"
  };
}

function progressPayload() {
  return {
    currentCount: 1,
    isCompleted: true,
    notes: "Completed"
  };
}

function memberFeedbackPayload(clubId: string) {
  return {
    clubId,
    feedback: "A thoughtful and encouraging member comment."
  };
}

function requirementPayload() {
  return {
    programLevel: "JUNIOR",
    bandLevel: "White",
    name: "Complete first speech",
    description: "Student completes the first speech.",
    requirementType: "Speech",
    targetCount: 1,
    sortOrder: 1
  };
}

function activeMembership(clubId: string) {
  return {
    id: `${clubId}-membership`,
    clubId,
    status: "ACTIVE",
    club: {
      id: clubId,
      isActive: true,
      centre: { isActive: true }
    }
  };
}

function studentRecord(studentId: string, userId: string, clubId: string, userSelect?: Record<string, boolean>) {
  return {
    id: studentId,
    userId,
    grade: "6",
    programLevel: "JUNIOR",
    bandLevel: "White",
    user: projectUser(rawUser(userId, Role.STUDENT), userSelect),
    clubMemberships: [{
      clubId,
      status: "ACTIVE",
      club: {
        id: clubId,
        name: clubId === assignedClubId ? "Assigned Club" : "Other Club",
        program: "Junior Regular Meeting",
        centre: { name: "Centre", isActive: true }
      }
    }],
    attendance: [],
    roleSlots: [],
    roleScores: [],
    meetingFeedbacks: [],
    memberFeedback: [],
    requirementProgress: []
  };
}

function memberFeedbackRecord(
  id: string,
  studentId: string,
  clubId: string,
  createdByUserId: string,
  feedback = "A thoughtful and encouraging member comment."
) {
  const now = new Date("2026-08-21T12:00:00.000Z");

  return {
    id,
    studentId,
    clubId,
    feedback,
    createdByUserId,
    createdAt: now,
    updatedAt: now,
    club: { id: clubId, name: clubId === assignedClubId ? "Assigned Club" : "Other Club" },
    createdBy: { id: createdByUserId, firstName: "Test", lastName: "Facilitator", role: Role.FACILITATOR }
  };
}

function meetingRecord(
  clubId: string,
  id = clubId === assignedClubId ? "assigned-meeting" : "other-meeting",
  include?: any
) {
  const meetingStudentSelect = include?.roleSlots?.include?.assignedStudent?.include?.user?.select;
  const includedRoleSlots = include?.roleSlots
    ? [{
      id: `${id}-response-slot`,
      meetingId: id,
      slotLabel: "Prepared Speech",
      sortOrder: 1,
      assignedStudentId,
      assignedByUserId: users.admin.id,
      assignedAt: new Date("2026-08-14T12:00:00.000Z"),
      roleDefinition: { id: "prepared-speech", name: "Prepared Speech", isActive: true },
      assignedStudent: studentRecord(assignedStudentId, users.student.id, clubId, meetingStudentSelect),
      score: null
    }]
    : [];

  return {
    id,
    clubId,
    title: "Weekly Meeting",
    templateType: "Regular Meeting",
    meetingDate: new Date("2026-08-15T00:00:00.000Z"),
    startTime: "14:00",
    location: "Room 202",
    isRoleLocked: false,
    club: {
      id: clubId,
      name: clubId === assignedClubId ? "Assigned Club" : "Other Club",
      program: "Junior Regular Meeting",
      centre: { isActive: true }
    },
    roleSlots: includedRoleSlots,
    attendance: [],
    roleScores: [],
    studentFeedbacks: []
  };
}

function rawUser(id: string, role: Role) {
  return {
    id,
    email: `${id}@example.com`,
    firstName: id === users.student.id ? "Current" : "Test",
    lastName: role === Role.STUDENT ? "Student" : "User",
    role,
    isActive: true,
    passwordHash: "regression-test-password-hash",
    resetToken: "regression-test-reset-token",
    jwtSecret: "regression-test-jwt-secret"
  };
}

function projectUser(user: ReturnType<typeof rawUser>, select?: Record<string, boolean>) {
  if (!select) {
    return user;
  }

  return Object.fromEntries(
    Object.keys(select).map((key) => [key, user[key as keyof typeof user]])
  );
}

function meetingRecordForId(meetingId: string) {
  const clubId = meetingClubIds.get(meetingId);

  if (!clubId || state.deletedMeetingIds.has(meetingId)) {
    return null;
  }

  return meetingRecord(clubId, meetingId);
}

function recordMeetingDelete(meetingId: string, recordType: string, count: number) {
  state.meetingDeletionSteps[meetingId] = [...(state.meetingDeletionSteps[meetingId] ?? []), recordType];
  state.meetingRelatedDeleteCounts[meetingId] = {
    ...(state.meetingRelatedDeleteCounts[meetingId] ?? {}),
    [recordType]: count
  };

  return { count };
}

function pairedRoleSlots(meetingId?: string) {
  const slots = [
    roleSlot("chair-main-slot", "paired-chair-meeting", assignedClubId, null, "iChair"),
    roleSlot("chair-report-slot", "paired-chair-meeting", assignedClubId, null, "iChair Report"),
    roleSlot("grammarian-main-slot", "paired-grammarian-meeting", assignedClubId, null, "iGrammarian"),
    roleSlot("grammarian-report-slot", "paired-grammarian-meeting", assignedClubId, null, "iGrammarian Report"),
    roleSlot("manager-chair-main-slot", "paired-manager-meeting", assignedClubId, null, "iChair"),
    roleSlot("manager-chair-report-slot", "paired-manager-meeting", assignedClubId, null, "iChair Report")
  ];

  return meetingId ? slots.filter((slot) => slot.meetingId === meetingId) : slots;
}

function roleSlot(id: string, meetingId: string, clubId: string, assignedStudentId: string | null, roleName = "Prepared Speech") {
  return {
    id,
    meetingId,
    slotLabel: roleName,
    sortOrder: 1,
    assignedStudentId,
    assignedByUserId: null,
    assignedAt: null,
    meeting: meetingRecord(clubId, meetingId),
    roleDefinition: {
      id: `${id}-role-definition`,
      name: roleName,
      isActive: true
    },
    score: null
  };
}

function documentRecord(clubId: string | null) {
  return {
    id: "document-1",
    title: "Band checklist",
    description: "Checklist",
    fileName: "checklist.pdf",
    fileUrl: "https://example.com/checklist.pdf",
    programLevel: "JUNIOR",
    bandLevel: "White",
    bandOrder: 1,
    sessionModule: null,
    clubId,
    category: "Band Requirements",
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "ACTIVE",
    club: clubId ? { id: clubId, name: "Assigned Club" } : null,
    uploadedBy: { firstName: "Admin", lastName: "User" }
  };
}

function noticeRecords() {
  return [
    noticeRecord("notice-a", assignedClubId),
    noticeRecord("notice-b", otherClubId),
    noticeRecord("notice-archived", assignedClubId, "ARCHIVED"),
    noticeRecord("notice-expired", assignedClubId, "ACTIVE", new Date("2020-01-01T00:00:00.000Z")),
    noticeRecord("notice-global", null, "ACTIVE", null, true)
  ];
}

function noticeRecord(id: string, clubId: string | null, status = "ACTIVE", expiresAt: Date | null = null, isPinned = false) {
  return {
    id,
    title: id === "notice-global" ? "All Clubs Reminder" : "Saturday Meeting Reminder",
    message: "Please bring your workbook this Saturday.",
    clubId,
    createdByUserId: users.admin.id,
    status,
    expiresAt,
    isPinned,
    createdAt: new Date("2026-08-14T12:00:00.000Z"),
    updatedAt: new Date("2026-08-14T12:00:00.000Z"),
    club: clubRecord(clubId),
    createdBy: { firstName: "Admin", lastName: "User" }
  };
}

function clubRecord(clubId: string | null) {
  if (!clubId) {
    return null;
  }

  return {
    id: clubId,
    name: clubId === assignedClubId ? "Assigned Club" : "Other Club"
  };
}

function filterNoticeRecords(where: any) {
  return noticeRecords().filter((notice) => matchesNoticeWhere(notice, where));
}

function matchesNoticeWhere(notice: ReturnType<typeof noticeRecord>, where: any): boolean {
  if (where.status && notice.status !== where.status) {
    return false;
  }

  if (where.clubId !== undefined && notice.clubId !== where.clubId) {
    return false;
  }

  if (Array.isArray(where.OR) && !where.OR.some((clause: any) => matchesNoticeClause(notice, clause))) {
    return false;
  }

  if (Array.isArray(where.AND) && !where.AND.every((clause: any) => matchesNoticeClause(notice, clause))) {
    return false;
  }

  return true;
}

function matchesNoticeClause(notice: ReturnType<typeof noticeRecord>, clause: any): boolean {
  if (Array.isArray(clause.OR)) {
    return clause.OR.some((nestedClause: any) => matchesNoticeClause(notice, nestedClause));
  }

  if (clause.clubId === null) {
    return notice.clubId === null;
  }

  if (clause.clubId?.in) {
    return Boolean(notice.clubId && clause.clubId.in.includes(notice.clubId));
  }

  if (clause.expiresAt === null) {
    return notice.expiresAt === null;
  }

  if (clause.expiresAt?.gte) {
    return Boolean(notice.expiresAt && notice.expiresAt >= clause.expiresAt.gte);
  }

  return true;
}

function withoutUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function resourceRecord() {
  return {
    id: "resource-1",
    title: "Prepared Speech Guide",
    explanation: "A useful guide for students.",
    youtubeUrl: "https://example.com/video",
    documentUrl: "https://example.com/doc",
    programLevel: "JUNIOR",
    bandLevel: "White",
    bandOrder: 1,
    roleKey: null,
    requirementId: null,
    category: "Role Guide",
    status: "ACTIVE",
    createdAt: new Date(),
    requirement: null,
    createdBy: { firstName: "Admin", lastName: "User" },
    updatedBy: null
  };
}

function requirementRecord() {
  return {
    id: "requirement-1",
    programLevel: "JUNIOR",
    bandLevel: "White",
    bandOrder: 1,
    name: "Complete first speech",
    description: "Student completes the first speech.",
    requirementType: "Speech",
    targetCount: 1,
    sortOrder: 1,
    isActive: true
  };
}
