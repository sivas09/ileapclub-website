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
  studentId: string;
  paymentMonth: Date;
  status: PaymentStatus;
  updatedByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
};

const activeStudentId = "active-student";
const inactiveStudentId = "inactive-student";
const assignedClubId = "assigned-club";
const users = {
  admin: { id: "admin-user", email: "admin@example.com", role: Role.ADMIN, isActive: true },
  facilitator: { id: "facilitator-user", email: "facilitator@example.com", role: Role.FACILITATOR, isActive: true },
  student: { id: "student-user", email: "student@example.com", role: Role.STUDENT, isActive: true }
};
const payments = new Map<string, StoredPayment>();
let lastResetStudentIds: string[] = [];
let ownPaymentRecord: StoredPayment | null = null;
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

    return null;
  },
  findMany: ({ where }: any = {}) => {
    if (where?.user?.isActive === true && where?.clubMemberships?.some?.status === "ACTIVE") {
      return [{ id: activeStudentId }];
    }

    return [];
  }
});
patchModel("monthlyMemberPayment", {
  findUnique: ({ where }: any) => {
    lastOwnPaymentStudentId = where.studentId_paymentMonth.studentId;
    lastOwnPaymentMonth = monthKey(where.studentId_paymentMonth.paymentMonth);
    return ownPaymentRecord;
  },
  findMany: ({ where }: any) => Array.from(payments.values())
    .filter((payment) => monthKey(payment.paymentMonth) === monthKey(where.paymentMonth))
    .map(publicPayment),
  upsert: ({ where, create, update }: any) => {
    const compoundKey = where.studentId_paymentMonth;
    const key = paymentKey(compoundKey.studentId, compoundKey.paymentMonth);
    const existing = payments.get(key);
    const now = new Date("2026-09-02T16:00:00.000Z");
    const payment: StoredPayment = existing
      ? { ...existing, ...update, updatedAt: now }
      : { ...create, createdAt: now, updatedAt: now };
    payments.set(key, payment);
    return publicPayment(payment);
  },
  createMany: ({ data }: any) => {
    let count = 0;

    for (const entry of data) {
      const key = paymentKey(entry.studentId, entry.paymentMonth);
      if (!payments.has(key)) {
        const now = new Date("2026-09-02T16:00:00.000Z");
        payments.set(key, { ...entry, createdAt: now, updatedAt: now });
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
const currentMonth = "2026-09";
const previousMonth = "2026-08";

try {
  const paidResponse = await request("PUT", `/api/members/payments/${activeStudentId}`, Role.ADMIN, 200, {
    paymentMonth: currentMonth,
    status: PaymentStatus.PAID
  });
  assert.equal((await paidResponse.json() as any).payment.status, PaymentStatus.PAID, "Admin can mark a member Paid.");
  assert.equal(storedStatus(activeStudentId, currentMonth), PaymentStatus.PAID, "Paid status is stored for the selected member and month.");

  const notPaidResponse = await request("PUT", `/api/members/payments/${activeStudentId}`, Role.ADMIN, 200, {
    paymentMonth: currentMonth,
    status: PaymentStatus.NOT_PAID
  });
  assert.equal((await notPaidResponse.json() as any).payment.status, PaymentStatus.NOT_PAID, "Admin can mark a member Not Paid.");

  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.ADMIN, 200, {
    paymentMonth: previousMonth,
    status: PaymentStatus.PAID
  });
  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.ADMIN, 200, {
    paymentMonth: currentMonth,
    status: PaymentStatus.PAID
  });
  await request("PUT", `/api/members/payments/${inactiveStudentId}`, Role.ADMIN, 200, {
    paymentMonth: currentMonth,
    status: PaymentStatus.PAID
  });

  await request("POST", "/api/members/payments/reset", Role.ADMIN, 400, {
    paymentMonth: currentMonth,
    confirmed: false
  });
  const resetResponse = await request("POST", "/api/members/payments/reset", Role.ADMIN, 200, {
    paymentMonth: currentMonth,
    confirmed: true
  });
  const resetBody = await resetResponse.json() as any;
  assert.equal(resetBody.resetCount, 1, "Reset reports only active members.");
  assert.equal(storedStatus(activeStudentId, currentMonth), PaymentStatus.NOT_PAID, "Reset marks active members Not Paid.");
  assert.equal(storedStatus(inactiveStudentId, currentMonth), PaymentStatus.PAID, "Inactive members are not reset.");
  assert.equal(storedStatus(activeStudentId, previousMonth), PaymentStatus.PAID, "Reset preserves previous-month payment history.");
  assert.deepEqual(lastResetStudentIds, [activeStudentId], "Reset persistence is scoped to active members only.");

  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.FACILITATOR, 403, {
    paymentMonth: currentMonth,
    status: PaymentStatus.PAID
  });
  await request("PUT", `/api/members/payments/${activeStudentId}`, Role.STUDENT, 403, {
    paymentMonth: currentMonth,
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
  await request("GET", `/api/members/payments?paymentMonth=${currentMonth}`, Role.FACILITATOR, 403);
  await request("GET", `/api/members/payments?paymentMonth=${currentMonth}`, Role.STUDENT, 403);

  const listResponse = await request("GET", `/api/members/payments?paymentMonth=${currentMonth}`, Role.ADMIN, 200);
  const listBody = await listResponse.json() as any;
  assert.equal(listBody.paymentMonth, currentMonth, "Admin can retrieve payment statuses for the selected month.");
  assertNoSensitiveFields(listBody);
  assert.equal(JSON.stringify(listBody).includes("password"), false, "Payment responses do not expose sensitive account fields.");

  ownPaymentRecord = {
    studentId: activeStudentId,
    paymentMonth: new Date(`${currentMonth}-01T00:00:00.000Z`),
    status: PaymentStatus.PAID,
    updatedByAdminId: users.admin.id,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-02T12:00:00.000Z")
  };
  const ownPaidResponse = await request("GET", "/api/student/me/payment-status", Role.STUDENT, 200);
  const ownPaidBody = await ownPaidResponse.json() as any;
  assert.equal(ownPaidBody.status, PaymentStatus.PAID, "Student can see their own current-month Paid status.");
  assert.deepEqual(Object.keys(ownPaidBody).sort(), ["paymentMonth", "status", "updatedAt"], "Student payment response contains only safe fields.");
  assert.equal(lastOwnPaymentStudentId, activeStudentId, "Student payment lookup is derived from the authenticated member account.");
  assert.equal(lastOwnPaymentMonth, ownPaidBody.paymentMonth, "Student payment lookup is limited to the current month returned by the endpoint.");
  assertNoSensitiveFields(ownPaidBody);

  ownPaymentRecord = null;
  const ownDefaultResponse = await request("GET", "/api/student/me/payment-status", Role.STUDENT, 200);
  const ownDefaultBody = await ownDefaultResponse.json() as any;
  assert.equal(ownDefaultBody.status, PaymentStatus.NOT_PAID, "Student sees Not Paid when the current month has no payment record.");
  assert.equal(ownDefaultBody.updatedAt, null, "Missing payment records do not expose an update timestamp.");

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

  if (role === Role.FACILITATOR) {
    return users.facilitator;
  }

  return users.student;
}

function publicPayment(payment: StoredPayment) {
  return {
    studentId: payment.studentId,
    status: payment.status,
    updatedByAdminId: payment.updatedByAdminId,
    updatedAt: payment.updatedAt
  };
}

function paymentKey(studentId: string, paymentMonth: Date | string) {
  return `${studentId}|${monthKey(paymentMonth)}`;
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
