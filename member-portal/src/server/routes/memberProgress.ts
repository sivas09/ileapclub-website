import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { getOperationalScope } from "../permissions.js";
import { publicUserSelect } from "../services/safeUser.js";

const addPointsSchema = z.object({
  points: z.coerce.number().int().positive().max(2_147_483_647),
  reason: z.string().trim().max(500).optional()
}).strict();

const progressNoteSchema = z.object({
  note: z.string().trim().max(1000)
}).strict();

export const memberProgressRouter = Router();

memberProgressRouter.use(requireAuth);

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

memberProgressRouter.get("/me", asyncRoute(async (request, response) => {
  if (request.user!.role !== Role.STUDENT) {
    response.status(403).json({ message: "Only members can use the personal points endpoint." });
    return;
  }

  const student = await prisma.student.findUnique({
    where: { userId: request.user!.id },
    select: { id: true }
  });

  if (!student) {
    response.status(404).json({ message: "Member profile not found." });
    return;
  }

  response.json(await buildMemberProgressResponse(student.id));
}));

memberProgressRouter.get("/:studentId", asyncRoute(async (request, response) => {
  const user = request.user!;
  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, userId: true }
  });

  if (!student) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (!(await canAccessMemberProgress(user, student))) {
    response.status(403).json({ message: "You cannot view points or progress notes for this member." });
    return;
  }

  response.json(await buildMemberProgressResponse(student.id));
}));

memberProgressRouter.post("/:studentId/points", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!isProgressStaff(user.role)) {
    response.status(403).json({ message: "Only authorized staff can add member points." });
    return;
  }

  const parsed = addPointsSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a positive whole-number point award and an optional reason up to 500 characters." });
    return;
  }

  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, userId: true }
  });

  if (!student) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (!(await canAccessMemberProgress(user, student))) {
    response.status(403).json({ message: "You cannot add points for this member." });
    return;
  }

  await prisma.memberPointTransaction.create({
    data: {
      studentId: student.id,
      pointsDelta: parsed.data.points,
      reason: parsed.data.reason || null,
      awardedByUserId: user.id
    }
  });

  response.status(201).json(await buildMemberProgressResponse(student.id));
}));

memberProgressRouter.put("/:studentId/note", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!isProgressStaff(user.role)) {
    response.status(403).json({ message: "Only authorized staff can update member progress notes." });
    return;
  }

  const parsed = progressNoteSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Progress notes must be 1000 characters or fewer." });
    return;
  }

  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, userId: true }
  });

  if (!student) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (!(await canAccessMemberProgress(user, student))) {
    response.status(403).json({ message: "You cannot update progress notes for this member." });
    return;
  }

  await prisma.memberProgressNote.upsert({
    where: { studentId: student.id },
    update: {
      note: parsed.data.note,
      updatedByUserId: user.id
    },
    create: {
      studentId: student.id,
      note: parsed.data.note,
      updatedByUserId: user.id
    }
  });

  response.json(await buildMemberProgressResponse(student.id));
}));

function isProgressStaff(role: Role) {
  return role === Role.ADMIN || role === Role.CENTER_DIRECTOR || role === Role.FACILITATOR;
}

async function canAccessMemberProgress(
  user: { id: string; role: Role },
  student: { id: string; userId: string }
) {
  if (user.role === Role.ADMIN) {
    return true;
  }

  if (user.role === Role.STUDENT) {
    return student.userId === user.id;
  }

  if (user.role === Role.CENTER_DIRECTOR) {
    const scope = await getOperationalScope(user);

    if (!scope.clubIds?.length) {
      return false;
    }

    return (await prisma.studentClubMembership.count({
      where: {
        studentId: student.id,
        clubId: { in: scope.clubIds },
        status: "ACTIVE",
        club: { isActive: true, centre: { isActive: true } }
      }
    })) > 0;
  }

  if (user.role === Role.FACILITATOR) {
    return (await prisma.studentClubMembership.count({
      where: {
        studentId: student.id,
        status: "ACTIVE",
        club: {
          isActive: true,
          centre: { isActive: true },
          facilitators: { some: { facilitatorId: user.id } }
        }
      }
    })) > 0;
  }

  return false;
}

async function buildMemberProgressResponse(studentId: string) {
  const [total, transactions, progressNote] = await Promise.all([
    prisma.memberPointTransaction.aggregate({
      where: { studentId },
      _sum: { pointsDelta: true }
    }),
    prisma.memberPointTransaction.findMany({
      where: { studentId },
      orderBy: [{ awardedAt: "desc" }, { createdAt: "desc" }],
      take: 20,
      include: {
        awardedBy: { select: publicUserSelect }
      }
    }),
    prisma.memberProgressNote.findUnique({
      where: { studentId },
      include: {
        updatedBy: { select: publicUserSelect }
      }
    })
  ]);

  return {
    studentId,
    totalPoints: total._sum.pointsDelta ?? 0,
    progressNote: progressNote ? {
      note: progressNote.note,
      updatedAt: progressNote.updatedAt,
      updatedBy: progressNote.updatedBy ? {
        firstName: progressNote.updatedBy.firstName,
        lastName: progressNote.updatedBy.lastName,
        role: progressNote.updatedBy.role
      } : null
    } : null,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      pointsDelta: transaction.pointsDelta,
      reason: transaction.reason,
      awardedAt: transaction.awardedAt,
      awardedBy: transaction.awardedBy ? {
        firstName: transaction.awardedBy.firstName,
        lastName: transaction.awardedBy.lastName,
        role: transaction.awardedBy.role
      } : null
    }))
  };
}
