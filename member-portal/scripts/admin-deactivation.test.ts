import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { adminRouter } from "../src/server/routes/admin.js";

type TestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  studentProfile?: { id: string } | null;
};

const users = new Map<string, TestUser>([
  ["admin-user", testUser("admin-user", Role.ADMIN)],
  ["other-admin", testUser("other-admin", Role.ADMIN)],
  ["student-user", { ...testUser("student-user", Role.STUDENT), studentProfile: { id: "student-profile" } }],
  ["facilitator-user", testUser("facilitator-user", Role.FACILITATOR)],
  ["facilitator-caller", testUser("facilitator-caller", Role.FACILITATOR)]
]);

const state = {
  membershipUpdates: [] as Array<{ where: unknown; data: unknown }>,
  roleSlotUpdates: [] as Array<{ where: unknown; data: unknown }>,
  clubFacilitatorDeletes: [] as unknown[],
  centreFacilitatorDeletes: [] as unknown[],
  historicalDeleteCalls: 0
};

patchModel("user", {
  findUnique: ({ where }: { where: { id: string } }) => {
    const user = users.get(where.id);
    return user ? { ...user } : null;
  },
  update: ({ where, data }: { where: { id: string }; data: { isActive?: boolean } }) => {
    const user = users.get(where.id);

    if (!user) {
      throw new Error("Test user not found.");
    }

    const updatedUser = { ...user, ...data };
    users.set(user.id, updatedUser);
    return updatedUser;
  }
});
patchModel("studentClubMembership", {
  updateMany: ({ where, data }: { where: unknown; data: unknown }) => {
    state.membershipUpdates.push({ where, data });
    return { count: 2 };
  }
});
patchModel("meetingRoleSlot", {
  updateMany: ({ where, data }: { where: unknown; data: unknown }) => {
    state.roleSlotUpdates.push({ where, data });
    return { count: 3 };
  }
});
patchModel("clubFacilitator", {
  deleteMany: ({ where }: { where: unknown }) => {
    state.clubFacilitatorDeletes.push(where);
    return { count: 2 };
  }
});
patchModel("centreFacilitator", {
  deleteMany: ({ where }: { where: unknown }) => {
    state.centreFacilitatorDeletes.push(where);
    return { count: 1 };
  }
});

for (const modelName of ["meeting", "meetingAttendance", "meetingRoleScore", "studentMeetingFeedback"] as const) {
  patchModel(modelName, {
    delete: historicalDelete,
    deleteMany: historicalDelete,
    update: historicalDelete,
    updateMany: historicalDelete
  });
}

(prisma as unknown as { $transaction: (callback: (tx: typeof prisma) => Promise<unknown>) => Promise<unknown> }).$transaction = (callback) => callback(prisma);

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test error." });
});

const server = await listen(app);
const address = server.address();

if (!address || typeof address === "string") {
  throw new Error("Admin deactivation test server did not expose a TCP port.");
}

const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  await assertStatus("admin cannot deactivate self", "admin-user", "admin-user", 400);
  await assertStatus("admin cannot deactivate another admin", "admin-user", "other-admin", 400);
  await assertStatus("non-admin cannot deactivate users", "facilitator-caller", "student-user", 403);
  await assertActiveStatus("legacy active route cannot bypass safe deactivation", "student-user", false, 400);

  const studentResponse = await assertStatus("admin can safely deactivate a student", "admin-user", "student-user", 200);
  const studentBody = await studentResponse.json() as {
    user?: { isActive?: boolean };
    deactivatedMemberships?: number;
    clearedUpcomingRoleSlots?: number;
  };

  assert.equal(studentBody.user?.isActive, false, "Student account should be inactive.");
  assert.equal(studentBody.deactivatedMemberships, 2, "Active memberships should be closed.");
  assert.equal(studentBody.clearedUpcomingRoleSlots, 3, "Upcoming unscored role slots should be released.");
  assert.deepEqual(state.membershipUpdates[0]?.where, { studentId: "student-profile", status: "ACTIVE" });
  assert.ok((state.membershipUpdates[0]?.data as { endDate?: unknown }).endDate instanceof Date, "Membership end date should be recorded.");
  assert.deepEqual(state.roleSlotUpdates[0]?.where, {
    assignedStudentId: "student-profile",
    score: null,
    meeting: { meetingDate: { gte: (state.membershipUpdates[0]?.data as { endDate: Date }).endDate } }
  });
  assert.deepEqual(state.roleSlotUpdates[0]?.data, {
    assignedStudentId: null,
    assignedByUserId: null,
    assignedAt: null
  });
  assert.equal(state.historicalDeleteCalls, 0, "Historical scores, feedback, attendance, and meetings must be preserved.");

  const reactivatedStudentResponse = await assertActiveStatus("existing workflow can reactivate the student", "student-user", true, 200);
  const reactivatedStudentBody = await reactivatedStudentResponse.json() as { user?: { isActive?: boolean } };
  assert.equal(reactivatedStudentBody.user?.isActive, true, "Reactivation should restore account access without recreating assignments.");

  await assertStatus("admin can safely deactivate a facilitator", "admin-user", "facilitator-user", 200);
  assert.deepEqual(state.clubFacilitatorDeletes, [{ facilitatorId: "facilitator-user" }]);
  assert.deepEqual(state.centreFacilitatorDeletes, [{ facilitatorId: "facilitator-user" }]);

  console.log("Admin deactivation tests passed.");
} finally {
  await close(server);
}

async function assertStatus(label: string, callerId: string, targetId: string, expectedStatus: number) {
  const caller = users.get(callerId);

  if (!caller) {
    throw new Error(`Missing caller fixture: ${callerId}`);
  }

  const response = await fetch(`${baseUrl}/api/admin/users/${targetId}/deactivate`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${signToken(caller)}` }
  });

  assert.equal(response.status, expectedStatus, label);
  return response;
}

async function assertActiveStatus(label: string, targetId: string, isActive: boolean, expectedStatus: number) {
  const caller = users.get("admin-user");

  if (!caller) {
    throw new Error("Missing admin caller fixture.");
  }

  const response = await fetch(`${baseUrl}/api/admin/users/${targetId}/active`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${signToken(caller)}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ isActive })
  });

  assert.equal(response.status, expectedStatus, label);
  return response;
}

function testUser(id: string, role: Role): TestUser {
  return {
    id,
    email: `${id}@example.com`,
    firstName: "Test",
    lastName: "User",
    role,
    isActive: true,
    studentProfile: null
  };
}

function historicalDelete() {
  state.historicalDeleteCalls += 1;
  throw new Error("Safe deactivation must not mutate historical records.");
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
