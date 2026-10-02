import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { PaymentStatus, Role } from "@prisma/client";
import { signToken } from "../src/server/auth.js";
import { prisma } from "../src/server/db.js";
import { membersRouter } from "../src/server/routes/members.js";
import { studentRouter } from "../src/server/routes/student.js";

type MockFn = (...args: any[]) => any;
type StoredPayment = {
  id: string;
  studentId: string;
  paymentMonth: Date;
  status: PaymentStatus;
  updatedByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
};

const activeStudentId = "active-student";
const outsideActiveStudentId = "outside-active-student";
const inactiveStudentId = "inactive-student";
const assignedClubId = "assigned-club";
const outsideClubId = "outside-club";
const users = {
  admin: { id: "admin-user", email: "admin@example.com", role: Role.ADMIN, isActive: true },
  director: { id: "director-user", email: "director@example.com", role: Role.CENTER_DIRECTOR, isActive: true },
  facilitator: { id: "facilitator-user", email: "facilitator@example.com", role: Role.FACILITATOR, isActive: true },
  student: { id: "student-user", email: "student@example.com", role: Role.STUDENT, isActive: true }
};
const payments = new Map<string, StoredPayment>();
let lastResetStudentIds: string[] = [];
let lastOwnPaymentStudentId = "";
let lastOwnPaymentMonth = "";

patchModel("user", {
  findUnique: ({ where }: any) => Object.values(users).find((user) => user.id === where.id) ?? null
});
patchModel("student", {
  findUnique: ({ where }: any) => {
    if (where.userId === users.student.id) {
      return { id: activeStudentId };
    }

    if (where.id === activeStudentId) {
      return { id: activeStudentId, user: { role: Role.STUDENT } };
    }

    if (where.id === inactiveStudentId) {
      return { id: inactiveStudentId, user: { role: Role.STUDENT } };
    }

    if (where.id === outsideActiveStudentId) {
      return { id: outsideActiveStudentId, user: { role: Role.STUDENT } };
    }

    return null;
  },
  findMany: ({ where }: any = {}) => {
    if (where?.user?.isActive === true && where?.clubMemberships?.some?.status === "ACTIVE") {
      const candidates = [
        { id: activeStudentId, clubId: assignedClubId },
        { id: outsideActiveStudentId, clubId: outsideClubId }
      ];
      const allowedClubIds = where.clubMemberships.some.clubId?.in;
      return candidates
        .filter((student) => !allowedClubIds || allowedClubIds.includes(student.clubId))
        .map(({ id }) => ({ id }));
    }

    return [];
  }
});
patchModel("centerDirectorAssignment", {
  findMany: ({ where }: any) => where.userId === users.director.id && where.isActive
    ? [{ centreId: "assigned-centre" }]
    : []
});
patchModel("club", {
  findMany: ({ where }: any) => [
    { id: assignedClubId, centreId: "assigned-centre" },
    { id: outsideClubId, centreId: "outside-centre" }
  ].filter((club) => !where?.centreId?.in || where.centreId.in.includes(club.centreId))
});
patchModel("studentClubMembership", {
  count: ({ where }: any) => {
    const clubId = where.studentId === activeStudentId
      ? assignedClubId
      : where.studentId === outsideActiveStudentId
        ? outsideClubId
        : null;
    return clubId && where.clubId?.in?.includes(clubId) ? 1 : 0;
  }
});
patchModel("monthlyMemberPayment", {
  findFirst: ({ where }: any) => {
    lastOwnPaymentStudentId = where.studentId;
    const payment = latestPayment(where.studentId);
    lastOwnPaymentMonth = payment ? monthKey(payment.paymentMonth) : "";
    return payment ? publicPayment(payment) : null;
  },
  findMany: ({ where, distinct }: any) => {
    const matching = Array.from(payments.values())
      .filter((payment) => {
        const allowedClubIds = where.student?.clubMemberships?.some?.clubId?.in;
        if (!allowedClubIds) return true;
        const clubId = payment.studentId === activeStudentId ? assignedClubId : outsideClubId;
        return allowedClubIds.includes(clubId);
      })
      .sort((left, right) => left.studentId.localeCompare(right.studentId)
        || right.paymentMonth.getTime() - left.paymentMonth.getTime()
        || right.updatedAt.getTime() - left.updatedAt.getTime());

    if (!distinct?.includes("studentId")) return matching.map(publicPayment);

    const seen = new Set<string>();
    return matching
      .filter((payment) => !seen.has(payment.studentId) && Boolean(seen.add(payment.studentId)))
      .map(publicPayment);
  },
  update: ({ where, data }: any) => {
    const entry = [...payments.entries()].find(([, payment]) => payment.id === where.id);
    if (!entry) throw new Error("Payment record not found.");
    const [key, existing] = entry;
    const payment = { ...existing, ...data, updatedAt: new Date("2026-10-02T16:00:00.000Z") };
    payments.set(key, payment);
    return publicPayment(payment);
  },
  createMany: ({ data }: any) => {
    let count = 0;

    for (const entry of data) {
      const key = paymentKey(entry.studentId, entry.paymentMonth);
      if (!payments.has(key)) {
        const now = new Date("2026-10-02T16:00:00.000Z");
        payments.set(key, { id: `payment-${key}`, ...entry, createdAt: now, updatedAt: now });
        count += 1;
      }
    }

    return { count };
  },
  updateMany: ({ where, data }: any) => {
    lastResetStudentIds = [...where.studentId.in];
    let count = 0;

    for (const [key, payment] of payments) {
      if (where.studentId.in.includes(payment.studentId)
        && monthKey(payment.paymentMonth) === monthKey(where.paymentMonth)) {
        payments.set(key, {
          ...payment,
          ...data,
          updatedAt: new Date("2026-09-02T16:01:00.000Z")
        });
        count += 1;
      }
    }

    return { count };
  }
});

(prisma as any).$transaction = async (callback: any) => callback(prisma);

const app = express();
app.use(express.json());
app.use("/api/members", membersRouter);
app.use("/api/student", studentRouter);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ message: error instanceof Error ? error.message : "Unexpected test server error." });
});

const server = await listen(app);
const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
const currentMonth = "2026-10";
const previousMonth = "2026-09";

try {
  const emptyOwnResponse = await request("GET", "/api/student/me/payment-status", Role.STUDENT, 200);
  const emptyOwnBody = await emptyOwnResponse.json() as any;
  assert.equal(emptyOwnBody.status, PaymentStatus.NOT_PAID, "A member without any payment history starts as Not Paid.");
  assert.equal(payments.size, 0, "Reading payment status never creates a monthly record.");

  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.ADMIN, 409, {
    status: PaymentStatus.PAID,
  });
  assert.equal(payments.size, 0, "An individual update cannot silently start a payment cycle.");

  seedPayment(activeStudentId, previousMonth, PaymentStatus.PAID, users.admin.id);
  seedPayment(outsideActiveStudentId, previousMonth, PaymentStatus.PAID, users.admin.id);
  seedPayment(inactiveStudentId, previousMonth, PaymentStatus.PAID, users.admin.id);
  const previousHistoryCount = payments.size;

  const rolloverListResponse = await request("GET", `/api/members/payments?paymentMonth=${currentMonth}`, Role.ADMIN, 200);
  const rolloverListBody = await rolloverListResponse.json() as any;
  const carriedPayment = rolloverListBody.payments.find((payment: any) => payment.studentId === activeStudentId);
  assert.equal(carriedPayment.status, PaymentStatus.PAID, "Paid status carries into the next calendar month.");
  assert.equal(carriedPayment.paymentMonth, previousMonth, "The API returns the existing manually controlled payment cycle.");
  assert.equal(storedStatus(activeStudentId, currentMonth), undefined, "Month rollover does not create a Not Paid record.");
  assert.equal(payments.size, previousHistoryCount, "Month rollover does not create or duplicate payment history.");

  const carriedOwnResponse = await request("GET", "/api/student/me/payment-status", Role.STUDENT, 200);
  const carriedOwnBody = await carriedOwnResponse.json() as any;
  assert.equal(carriedOwnBody.status, PaymentStatus.PAID, "Student self-service retains Paid across the month boundary.");
  assert.equal(carriedOwnBody.paymentMonth, previousMonth, "Student self-service reports the active manual payment cycle.");
  assert.equal(lastOwnPaymentStudentId, activeStudentId, "Student payment lookup is derived from the authenticated account.");
  assert.equal(lastOwnPaymentMonth, previousMonth, "Student payment lookup uses the latest manual cycle instead of the calendar month.");

  const notPaidResponse = await request("PUT", `/api/members/payments/${activeStudentId}`, Role.ADMIN, 200, {
    status: PaymentStatus.NOT_PAID
  });
  const notPaidBody = await notPaidResponse.json() as any;
  assert.equal(notPaidBody.paymentMonth, previousMonth, "Status changes update the current manual cycle.");
  assert.equal(storedStatus(activeStudentId, previousMonth), PaymentStatus.NOT_PAID);
  assert.equal(storedStatus(activeStudentId, currentMonth), undefined, "A status toggle does not silently start a new cycle.");
  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.ADMIN, 200, { status: PaymentStatus.PAID });

  await request("POST", "/api/members/payments/reset", Role.ADMIN, 400, {
    paymentMonth: currentMonth,
    confirmed: false
  });
  const resetResponse = await request("POST", "/api/members/payments/reset", Role.ADMIN, 200, {
    paymentMonth: currentMonth,
    confirmed: true
  });
  const resetBody = await resetResponse.json() as any;
  assert.equal(resetBody.resetCount, 2, "Admin reset reports all active members across the organization.");
  assert.equal(storedStatus(activeStudentId, currentMonth), PaymentStatus.NOT_PAID, "Reset marks active members Not Paid.");
  assert.equal(storedStatus(outsideActiveStudentId, currentMonth), PaymentStatus.NOT_PAID, "Admin reset includes active members outside the director scope.");
  assert.equal(storedStatus(inactiveStudentId, currentMonth), undefined, "Inactive members do not receive a new-cycle record.");
  assert.equal(storedStatus(activeStudentId, previousMonth), PaymentStatus.PAID, "Reset preserves previous-month payment history.");
  assert.equal(storedStatus(outsideActiveStudentId, previousMonth), PaymentStatus.PAID, "Reset preserves all prior payment history.");
  assert.deepEqual(lastResetStudentIds, [activeStudentId, outsideActiveStudentId], "Admin reset persistence is scoped to active members only.");
  assert.equal(payments.size, previousHistoryCount + 2, "Manual reset creates one new-cycle record per active member.");

  const historyCountAfterReset = payments.size;
  await request("POST", "/api/members/payments/reset", Role.ADMIN, 200, {
    paymentMonth: currentMonth,
    confirmed: true
  });
  assert.equal(payments.size, historyCountAfterReset, "Repeating a reset for the same cycle does not create duplicate records.");

  const directorPaidResponse = await request("PUT", `/api/members/payments/${activeStudentId}`, Role.CENTER_DIRECTOR, 200, {
    status: PaymentStatus.PAID
  });
  assert.equal((await directorPaidResponse.json() as any).payment.status, PaymentStatus.PAID, "Center Director can mark a member Paid.");
  await request("PUT", `/api/members/payments/${outsideActiveStudentId}`, Role.CENTER_DIRECTOR, 403, {
    status: PaymentStatus.PAID
  });
  await request("PUT", `/api/members/payments/${outsideActiveStudentId}`, Role.ADMIN, 200, {
    status: PaymentStatus.PAID
  });
  const directorListResponse = await request("GET", "/api/members/payments", Role.CENTER_DIRECTOR, 200);
  const directorListBody = await directorListResponse.json() as any;
  assert.deepEqual(directorListBody.payments.map((payment: any) => payment.studentId), [activeStudentId], "Center Director payment list is limited to assigned-centre members.");
  assertNoSensitiveFields(directorListBody);
  const directorResetResponse = await request("POST", "/api/members/payments/reset", Role.CENTER_DIRECTOR, 200, {
    paymentMonth: currentMonth,
    confirmed: true
  });
  assert.equal((await directorResetResponse.json() as any).resetCount, 1, "Center Director can reset active member payment status.");
  assert.equal(storedStatus(activeStudentId, currentMonth), PaymentStatus.NOT_PAID, "Center Director reset marks active members Not Paid.");
  assert.equal(storedStatus(outsideActiveStudentId, currentMonth), PaymentStatus.PAID, "Center Director reset does not affect members outside assigned centres.");
  assert.equal(storedStatus(inactiveStudentId, currentMonth), undefined, "Center Director reset does not affect inactive members.");
  assert.equal(storedStatus(activeStudentId, previousMonth), PaymentStatus.PAID, "Center Director reset preserves prior payment history.");
  assert.deepEqual(lastResetStudentIds, [activeStudentId], "Center Director reset persistence contains only assigned-centre active members.");

  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.FACILITATOR, 403, {
    status: PaymentStatus.PAID
  });
  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.STUDENT, 403, {
    status: PaymentStatus.PAID
  });
  await request("POST", "/api/members/payments/reset", Role.FACILITATOR, 403, {
    paymentMonth: currentMonth,
    confirmed: true
  });
  await request("POST", "/api/members/payments/reset", Role.STUDENT, 403, {
    paymentMonth: currentMonth,
    confirmed: true
  });
  await request("GET", "/api/members/payments", Role.FACILITATOR, 403);
  await request("GET", "/api/members/payments", Role.STUDENT, 403);

  const listResponse = await request("GET", "/api/members/payments", Role.ADMIN, 200);
  const listBody = await listResponse.json() as any;
  assert.equal(listBody.paymentMonth, currentMonth, "Admin sees the latest manually started payment cycle.");
  assert.equal(listBody.payments.filter((payment: any) => payment.studentId === activeStudentId).length, 1, "Only the latest cycle is returned per member.");
  assertNoSensitiveFields(listBody);
  assert.equal(JSON.stringify(listBody).includes("password"), false, "Payment responses do not expose sensitive account fields.");

  const ownResetResponse = await request("GET", "/api/student/me/payment-status", Role.STUDENT, 200);
  const ownResetBody = await ownResetResponse.json() as any;
  assert.equal(ownResetBody.status, PaymentStatus.NOT_PAID, "Student sees Not Paid after the authorized manual reset.");
  assert.equal(ownResetBody.paymentMonth, currentMonth);
  assert.deepEqual(Object.keys(ownResetBody).sort(), ["paymentMonth", "status", "updatedAt"], "Student payment response contains only safe fields.");
  assertNoSensitiveFields(ownResetBody);

  await request("GET", `/api/student/${inactiveStudentId}/payment-status`, Role.STUDENT, 404);
  await request("GET", "/api/student/me/payment-status", Role.FACILITATOR, 403);
  await request("GET", "/api/student/me/payment-status", Role.ADMIN, 403);
  await request("PUT", `/api/members/payments/${inactiveStudentId}`, Role.STUDENT, 403, {
    paymentMonth: currentMonth,
    status: PaymentStatus.PAID
  });

  console.log("Monthly member payment tests passed.");
} finally {
  await close(server);
}

async function request(method: string, path: string, role: Role, expectedStatus: number, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${signToken(tokenUser(role))}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  assert.equal(response.status, expectedStatus, `${method} ${path} returns ${expectedStatus}.`);
  return response;
}

function tokenUser(role: Role) {
  if (role === Role.ADMIN) {
    return users.admin;
  }

  if (role === Role.CENTER_DIRECTOR) {
    return users.director;
  }

  if (role === Role.FACILITATOR) {
    return users.facilitator;
  }

  return users.student;
}

function publicPayment(payment: StoredPayment) {
  return {
    id: payment.id,
    studentId: payment.studentId,
    paymentMonth: payment.paymentMonth,
    status: payment.status,
    updatedByAdminId: payment.updatedByAdminId,
    updatedAt: payment.updatedAt
  };
}

function latestPayment(studentId: string) {
  return [...payments.values()]
    .filter((payment) => payment.studentId === studentId)
    .sort((left, right) => right.paymentMonth.getTime() - left.paymentMonth.getTime()
      || right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;
}

function paymentKey(studentId: string, paymentMonth: Date | string) {
  return `${studentId}|${monthKey(paymentMonth)}`;
}

function seedPayment(studentId: string, paymentMonth: string, status: PaymentStatus, updatedByAdminId: string) {
  const key = paymentKey(studentId, paymentMonth);
  const timestamp = new Date(`${paymentMonth}-02T12:00:00.000Z`);
  payments.set(key, {
    id: `payment-${key}`,
    studentId,
    paymentMonth: new Date(`${paymentMonth}-01T00:00:00.000Z`),
    status,
    updatedByAdminId,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

function monthKey(paymentMonth: Date | string) {
  return (paymentMonth instanceof Date ? paymentMonth.toISOString() : paymentMonth).slice(0, 7);
}

function storedStatus(studentId: string, paymentMonth: string) {
  return payments.get(paymentKey(studentId, paymentMonth))?.status;
}

function assertNoSensitiveFields(value: unknown, path = "response") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveFields(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    assert.doesNotMatch(key, /password|reset.?token|jwt.?secret|secret|access.?token|refresh.?token/i, `No sensitive field at ${path}.${key}.`);
    assertNoSensitiveFields(entry, `${path}.${key}`);
  }
}

function patchModel(model: string, methods: Record<string, MockFn>) {
  Object.assign((prisma as any)[model], methods);
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
