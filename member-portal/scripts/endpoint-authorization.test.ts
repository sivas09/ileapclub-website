import express from "express";
import type { Server } from "node:http";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { documentsRouter } from "../src/server/routes/documents.js";
import { meetingsRouter } from "../src/server/routes/meetings.js";
import { membersRouter } from "../src/server/routes/members.js";
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

const state = {
  roleUpdates: 0,
  studentRequirementUpserts: 0,
  documentCreates: 0,
  resourceCreates: 0
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
  update: ({ where }: any) => studentRecord(where.id, users.student.id, assignedClubId),
  delete: () => ({ id: assignedStudentId })
});
patchModel("meeting", {
  findMany: () => [],
  findUnique: ({ where }: any) => where.id === "assigned-meeting"
    ? meetingRecord(assignedClubId)
    : where.id === "other-meeting"
      ? meetingRecord(otherClubId)
      : null,
  findUniqueOrThrow: () => meetingRecord(assignedClubId),
  update: () => meetingRecord(assignedClubId)
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
  groupBy: () => []
});
patchModel("meetingAttendance", {
  count: () => 0
});
patchModel("meetingRoleScore", {
  count: () => 0,
  groupBy: () => []
});
patchModel("studentMeetingFeedback", {
  count: () => 0,
  groupBy: () => []
});
patchModel("bandDocument", {
  findMany: () => [],
  create: () => {
    state.documentCreates += 1;
    return documentRecord(assignedClubId);
  },
  findUnique: ({ where }: any) => where.id === "document-1" ? documentRecord(assignedClubId) : null,
  delete: () => documentRecord(assignedClubId),
  count: () => 0,
  deleteMany: () => ({ count: 0 })
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
    return callbackOrQueries(prisma);
  }

  return Promise.all(callbackOrQueries);
};

const app = express();
app.use(express.json());
app.use("/api/members", membersRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/documents", documentsRouter);
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

  await assertStatus("admin can assign a meeting role", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.ADMIN, 200, { studentId: assignedStudentId });
  await assertStatus("facilitator can assign a role in assigned club", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.FACILITATOR, 200, { studentId: assignedStudentId });
  await assertStatus("facilitator cannot assign a role in unassigned club", "PUT", "/api/meetings/other-meeting/slots/other-club-slot", Role.FACILITATOR, 403, { studentId: otherStudentId });
  await assertStatus("student cannot use manager role assignment endpoint", "PUT", "/api/meetings/assigned-meeting/slots/assigned-slot", Role.STUDENT, 403, { studentId: assignedStudentId });
  await assertStatus("student can claim own-club role", "POST", "/api/meetings/assigned-meeting/slots/assigned-slot/claim", Role.STUDENT, 200);
  await assertStatus("student cannot release another student's role", "POST", "/api/meetings/assigned-meeting/slots/other-student-slot/release", Role.STUDENT, 403);
  await assertStatus("student can release own claimed role", "POST", "/api/meetings/assigned-meeting/slots/student-slot/release", Role.STUDENT, 200);

  await assertStatus("admin can add documents", "POST", "/api/documents", Role.ADMIN, 201, documentPayload(null));
  await assertStatus("facilitator can add assigned-club documents", "POST", "/api/documents", Role.FACILITATOR, 201, documentPayload(assignedClubId));
  await assertStatus("facilitator cannot add unassigned-club documents", "POST", "/api/documents", Role.FACILITATOR, 403, documentPayload(otherClubId));
  await assertStatus("student cannot add documents", "POST", "/api/documents", Role.STUDENT, 403, documentPayload(assignedClubId));
  await assertStatus("facilitator cannot view unassigned-club documents", "GET", `/api/documents?clubId=${otherClubId}`, Role.FACILITATOR, 403);
  await assertStatus("admin can delete documents", "DELETE", "/api/documents/document-1", Role.ADMIN, 200);
  await assertStatus("facilitator cannot permanently delete documents", "DELETE", "/api/documents/document-1", Role.FACILITATOR, 403);

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

function meetingRecord(clubId: string) {
  return {
    id: clubId === assignedClubId ? "assigned-meeting" : "other-meeting",
    clubId,
    title: "Weekly Meeting",
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
    status: "ACTIVE",
    club: clubId ? { id: clubId, name: "Assigned Club" } : null,
    uploadedBy: { firstName: "Admin", lastName: "User" }
  };
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
