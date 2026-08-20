import express from "express";
import type { Server } from "node:http";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { documentsRouter } from "../src/server/routes/documents.js";
import { meetingsRouter } from "../src/server/routes/meetings.js";
import { membersRouter } from "../src/server/routes/members.js";
import { noticesRouter } from "../src/server/routes/notices.js";
import { resourcesRouter } from "../src/server/routes/resources.js";
import { studentRouter } from "../src/server/routes/student.js";

type MockFn = (...args: any[]) => any;

const users = {
  admin: { id: "admin-user", email: "admin@example.com", role: Role.ADMIN, isActive: true },
  facilitator: { id: "facilitator-user", email: "facilitator@example.com", role: Role.FACILITATOR, isActive: true },
  student: { id: "student-user", email: "student@example.com", role: Role.STUDENT, isActive: true }
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
  ["student-delete-meeting", assignedClubId]
]);

const state = {
  roleUpdates: 0,
  studentRequirementUpserts: 0,
  documentCreates: 0,
  noticeCreates: 0,
  resourceCreates: 0,
  meetingDeleteTransactions: 0,
  deletedMeetingIds: new Set<string>(),
  meetingDeletionSteps: {} as Record<string, string[]>,
  meetingRelatedDeleteCounts: {} as Record<string, Record<string, number>>,
  lastDocumentWhere: null as any,
  lastNoticeWhere: null as any,
  lastStudentUpdate: null as any
};

patchModel("user", {
  findUnique: ({ where }: any) => {
    const user = Object.values(users).find((candidate) => candidate.id === where.id);

    return user ? { ...user } : null;
  }
});
patchModel("club", {
  count: ({ where }: any) => where.id?.in?.every((clubId: string) => clubId === assignedClubId || clubId === otherClubId) ? where.id.in.length : 0,
  findMany: () => [],
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
  count: () => 0
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
  count: () => 0,
  deleteMany: () => ({ count: 0 }),
  createMany: () => ({ count: 1 }),
  updateMany: () => ({ count: 1 })
});
patchModel("student", {
  findMany: () => [],
  findUnique: ({ where }: any) => {
    if (where.userId === users.student.id || where.id === assignedStudentId) {
      return studentRecord(assignedStudentId, users.student.id, assignedClubId);
    }

    if (where.id === otherStudentId) {
      return studentRecord(otherStudentId, "other-user", otherClubId);
    }

    return null;
  },
  create: () => studentRecord(assignedStudentId, users.student.id, assignedClubId),
  update: ({ where, data }: any) => {
    state.lastStudentUpdate = data;
    return studentRecord(where.id, users.student.id, assignedClubId);
  },
  delete: () => ({ id: assignedStudentId })
});
patchModel("roleDefinition", {
  findMany: () => []
});
patchModel("meeting", {
  findMany: () => Array.from(meetingClubIds.entries())
    .filter(([meetingId]) => !state.deletedMeetingIds.has(meetingId))
    .map(([meetingId, clubId]) => meetingRecord(clubId, meetingId)),
  findUnique: ({ where }: any) => meetingRecordForId(where.id),
  findUniqueOrThrow: () => meetingRecord(assignedClubId),
  update: () => meetingRecord(assignedClubId),
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
  findMany: () => [],
  update: () => {
    state.roleUpdates += 1;
    return roleSlot("assigned-slot", "assigned-meeting", assignedClubId, assignedStudentId);
  },
  updateMany: () => {
    state.roleUpdates += 1;
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
  count: ({ where }: any = {}) => where?.roleSlotId === "feedback-slot" ? 1 : 0,
  groupBy: () => [],
  deleteMany: ({ where }: any) => recordMeetingDelete(where.meetingId, "studentFeedbacks", 1)
});
patchModel("bandDocument", {
  findMany: ({ where }: any) => {
    state.lastDocumentWhere = where;
    return [];
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
  findMany: () => [],
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
app.use("/api/members", membersRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/notices", noticesRouter);
app.use("/api/resources", resourcesRouter);
app.use("/api/student", studentRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  await assertStatus("unauthenticated members request is rejected", "GET", "/api/members", null, 401);

  await assertStatus("admin can view all members", "GET", "/api/members", Role.ADMIN, 200);
  await assertStatus("facilitator can view assigned club members", "GET", `/api/members?clubId=${assignedClubId}`, Role.FACILITATOR, 200);
  await assertStatus("facilitator cannot view unassigned club members", "GET", `/api/members?clubId=${otherClubId}`, Role.FACILITATOR, 403);
  await assertStatus("student cannot create members", "POST", "/api/members", Role.STUDENT, 403, memberPayload([assignedClubId]));
  await assertStatus("facilitator cannot assign student to unassigned club", "POST", "/api/members", Role.FACILITATOR, 403, memberPayload([otherClubId]));
  await assertStatus("facilitator can update assigned student learning levels", "PATCH", `/api/members/${assignedStudentId}`, Role.FACILITATOR, 200, { programLevel: "JUNIOR", bandLevel: "Yellow" });
  assertEqual(Object.keys(state.lastStudentUpdate ?? {}).sort().join(","), "bandLevel,programLevel", "member update changes only facilitator-safe fields");
  await assertStatus("facilitator cannot update member identity fields", "PATCH", `/api/members/${assignedStudentId}`, Role.FACILITATOR, 400, { programLevel: "JUNIOR", bandLevel: "Yellow", email: "tampered@example.com" });
  await assertStatus("facilitator cannot update unassigned student learning levels", "PATCH", `/api/members/${otherStudentId}`, Role.FACILITATOR, 403, { programLevel: "JUNIOR", bandLevel: "Yellow" });
  await assertStatus("student cannot update member learning levels", "PATCH", `/api/members/${assignedStudentId}`, Role.STUDENT, 403, { programLevel: "JUNIOR", bandLevel: "Yellow" });

  await assertStatus("admin can assign a meeting role", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.ADMIN, 200, { studentId: assignedStudentId });
  await assertStatus("facilitator can assign a role in assigned club", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.FACILITATOR, 200, { studentId: assignedStudentId });
  await assertStatus("facilitator cannot assign a role in unassigned club", "PUT", "/api/meetings/other-meeting/slots/other-club-slot", Role.FACILITATOR, 403, { studentId: otherStudentId });
  await assertStatus("student cannot use manager role assignment endpoint", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.STUDENT, 403, { studentId: assignedStudentId });
  await assertStatus("student can claim own-club role", "POST", "/api/meetings/assigned-meeting/slots/assigned-slot/claim", Role.STUDENT, 200);
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

  return response;
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

function studentRecord(studentId: string, userId: string, clubId: string) {
  return {
    id: studentId,
    userId,
    grade: "6",
    programLevel: "JUNIOR",
    bandLevel: "White",
    user: {
      id: userId,
      email: `${userId}@example.com`,
      firstName: userId === users.student.id ? "Current" : "Other",
      lastName: "Student",
      role: Role.STUDENT,
      isActive: true
    },
    clubMemberships: [{
      clubId,
      status: "ACTIVE",
      club: {
        id: clubId,
        name: clubId === assignedClubId ? "Assigned Club" : "Other Club",
        program: "Junior Regular Meeting",
        centre: { name: "Centre", isActive: true }
      }
    }]
  };
}

function meetingRecord(clubId: string, id = clubId === assignedClubId ? "assigned-meeting" : "other-meeting") {
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
    roleSlots: [],
    attendance: [],
    roleScores: [],
    studentFeedbacks: []
  };
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

function roleSlot(id: string, meetingId: string, clubId: string, assignedStudentId: string | null) {
  return {
    id,
    meetingId,
    assignedStudentId,
    assignedByUserId: null,
    assignedAt: null,
    meeting: meetingRecord(clubId),
    roleDefinition: {
      id: "role-definition-1",
      name: "Prepared Speech",
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
