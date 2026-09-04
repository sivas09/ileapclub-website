import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { canAccessStudent } from "../permissions.js";

export const reflectionsRouter = Router();

reflectionsRouter.use(requireAuth);

const reflectionFields = {
  meetingId: z.string().trim().min(1).nullable().optional(),
  reflectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate).optional(),
  whatLearned: z.string().trim().min(1).max(200),
  whatDidWell: z.string().trim().min(1).max(200),
  whatToImprove: z.string().trim().min(1).max(200),
  bandRequirementId: z.string().trim().min(1).nullable().optional(),
  thinksBandRequirementCompleted: z.boolean().default(false)
};

const createReflectionSchema = z.object(reflectionFields).strict();
const updateReflectionSchema = z.object(reflectionFields).strict();
const responseSchema = z.object({
  facilitatorResponse: z.string().trim().max(300).nullable()
}).strict();
const staffRoles = [Role.ADMIN, Role.CENTER_DIRECTOR, Role.FACILITATOR];

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

const reflectionInclude = {
  meeting: { select: { id: true, title: true, meetingDate: true } },
  bandRequirement: { select: { id: true, name: true, bandLevel: true } },
  respondedBy: { select: { firstName: true, lastName: true, role: true } }
} as const;

reflectionsRouter.get("/me", requireRole([Role.STUDENT]), asyncRoute(async (request, response) => {
  const student = await findOwnStudent(request.user!.id);

  if (!student) {
    response.status(404).json({ message: "Member profile not found." });
    return;
  }

  const reflections = await prisma.memberLearningReflection.findMany({
    where: { studentId: student.id },
    include: reflectionInclude,
    orderBy: [{ reflectionDate: "desc" }, { createdAt: "desc" }]
  });

  response.json({ reflections: reflections.map(serializeReflection) });
}));

reflectionsRouter.post("/", requireRole([Role.STUDENT]), asyncRoute(async (request, response) => {
  const parsed = createReflectionSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Complete all three reflection fields using no more than 200 characters each." });
    return;
  }

  const student = await findOwnStudent(request.user!.id);

  if (!student) {
    response.status(404).json({ message: "Member profile not found." });
    return;
  }

  if (!(await relatedRecordsAreValid(student.id, parsed.data.meetingId, parsed.data.bandRequirementId))) {
    response.status(400).json({ message: "Select a session and band requirement available to your member profile." });
    return;
  }

  const reflection = await prisma.memberLearningReflection.create({
    data: {
      studentId: student.id,
      meetingId: parsed.data.meetingId ?? null,
      reflectionDate: reflectionDateValue(parsed.data.reflectionDate),
      whatLearned: parsed.data.whatLearned,
      whatDidWell: parsed.data.whatDidWell,
      whatToImprove: parsed.data.whatToImprove,
      bandRequirementId: parsed.data.bandRequirementId ?? null,
      thinksBandRequirementCompleted: parsed.data.thinksBandRequirementCompleted
    },
    include: reflectionInclude
  });

  response.status(201).json({ reflection: serializeReflection(reflection) });
}));

reflectionsRouter.patch("/:reflectionId", requireRole([Role.STUDENT]), asyncRoute(async (request, response) => {
  const parsed = updateReflectionSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Complete all three reflection fields using no more than 200 characters each." });
    return;
  }

  const student = await findOwnStudent(request.user!.id);
  const existing = student ? await prisma.memberLearningReflection.findFirst({
    where: { id: String(request.params.reflectionId), studentId: student.id }
  }) : null;

  if (!existing) {
    response.status(404).json({ message: "Reflection not found." });
    return;
  }

  if (!(await relatedRecordsAreValid(student!.id, parsed.data.meetingId, parsed.data.bandRequirementId))) {
    response.status(400).json({ message: "Select a session and band requirement available to your member profile." });
    return;
  }

  const reflection = await prisma.memberLearningReflection.update({
    where: { id: existing.id },
    data: {
      meetingId: parsed.data.meetingId === undefined ? existing.meetingId : parsed.data.meetingId,
      reflectionDate: parsed.data.reflectionDate ? reflectionDateValue(parsed.data.reflectionDate) : existing.reflectionDate,
      whatLearned: parsed.data.whatLearned,
      whatDidWell: parsed.data.whatDidWell,
      whatToImprove: parsed.data.whatToImprove,
      bandRequirementId: parsed.data.bandRequirementId ?? null,
      thinksBandRequirementCompleted: parsed.data.thinksBandRequirementCompleted
    },
    include: reflectionInclude
  });

  response.json({ reflection: serializeReflection(reflection) });
}));

reflectionsRouter.delete("/:reflectionId", requireRole([Role.STUDENT]), asyncRoute(async (request, response) => {
  const student = await findOwnStudent(request.user!.id);
  const existing = student ? await prisma.memberLearningReflection.findFirst({
    where: { id: String(request.params.reflectionId), studentId: student.id }
  }) : null;

  if (!existing) {
    response.status(404).json({ message: "Reflection not found." });
    return;
  }

  if (existing.facilitatorResponse) {
    response.status(409).json({ message: "A reflection with a staff response cannot be deleted." });
    return;
  }

  await prisma.memberLearningReflection.delete({ where: { id: existing.id } });
  response.json({ deletedReflection: { id: existing.id } });
}));

reflectionsRouter.get("/student/:studentId", requireRole(staffRoles), asyncRoute(async (request, response) => {
  const studentId = String(request.params.studentId);

  if (!(await canAccessReflectionStudent(request.user!, studentId))) {
    response.status(403).json({ message: "You cannot view reflections outside your assigned scope." });
    return;
  }

  const reflections = await prisma.memberLearningReflection.findMany({
    where: { studentId },
    include: reflectionInclude,
    orderBy: [{ reflectionDate: "desc" }, { createdAt: "desc" }]
  });

  response.json({ reflections: reflections.map(serializeReflection) });
}));

reflectionsRouter.patch("/:reflectionId/response", requireRole(staffRoles), asyncRoute(async (request, response) => {
  const parsed = responseSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Staff response must be no more than 300 characters." });
    return;
  }

  const existing = await prisma.memberLearningReflection.findUnique({
    where: { id: String(request.params.reflectionId) },
    select: { id: true, studentId: true }
  });

  if (!existing) {
    response.status(404).json({ message: "Reflection not found." });
    return;
  }

  if (!(await canAccessReflectionStudent(request.user!, existing.studentId))) {
    response.status(403).json({ message: "You cannot respond to reflections outside your assigned scope." });
    return;
  }

  const facilitatorResponse = parsed.data.facilitatorResponse || null;
  const reflection = await prisma.memberLearningReflection.update({
    where: { id: existing.id },
    data: {
      facilitatorResponse,
      respondedByUserId: facilitatorResponse ? request.user!.id : null,
      respondedAt: facilitatorResponse ? new Date() : null
    },
    include: reflectionInclude
  });

  response.json({ reflection: serializeReflection(reflection) });
}));

async function findOwnStudent(userId: string) {
  return prisma.student.findUnique({ where: { userId }, select: { id: true } });
}

async function canAccessReflectionStudent(user: { id: string; role: Role }, studentId: string) {
  if (user.role === Role.ADMIN) {
    return true;
  }

  if (user.role === Role.CENTER_DIRECTOR) {
    return canAccessStudent(user, studentId);
  }

  if (user.role !== Role.FACILITATOR) {
    return false;
  }

  return (await prisma.studentClubMembership.count({
    where: {
      studentId,
      status: "ACTIVE",
      club: { facilitators: { some: { facilitatorId: user.id } } }
    }
  })) > 0;
}

async function relatedRecordsAreValid(studentId: string, meetingId?: string | null, bandRequirementId?: string | null) {
  const [meetingCount, requirementCount] = await Promise.all([
    meetingId
      ? prisma.meeting.count({
        where: { id: meetingId, club: { studentMemberships: { some: { studentId } } } }
      })
      : Promise.resolve(1),
    bandRequirementId
      ? prisma.bandRequirement.count({ where: { id: bandRequirementId, isActive: true } })
      : Promise.resolve(1)
  ]);

  return meetingCount > 0 && requirementCount > 0;
}

type ReflectionRecord = Awaited<ReturnType<typeof prisma.memberLearningReflection.findFirst>> & {
  meeting?: { id: string; title: string; meetingDate: Date } | null;
  bandRequirement?: { id: string; name: string; bandLevel: string } | null;
  respondedBy?: { firstName: string; lastName: string; role: Role } | null;
};

function serializeReflection(reflection: NonNullable<ReflectionRecord>) {
  return {
    id: reflection.id,
    studentId: reflection.studentId,
    meeting: reflection.meeting ?? null,
    reflectionDate: reflection.reflectionDate,
    whatLearned: reflection.whatLearned,
    whatDidWell: reflection.whatDidWell,
    whatToImprove: reflection.whatToImprove,
    bandRequirement: reflection.bandRequirement ?? null,
    thinksBandRequirementCompleted: reflection.thinksBandRequirementCompleted,
    facilitatorResponse: reflection.facilitatorResponse,
    respondedBy: reflection.respondedBy
      ? `${reflection.respondedBy.firstName} ${reflection.respondedBy.lastName}`
      : null,
    respondedAt: reflection.respondedAt,
    createdAt: reflection.createdAt,
    updatedAt: reflection.updatedAt,
    canDelete: !reflection.facilitatorResponse
  };
}

function reflectionDateValue(value?: string) {
  const dateText = value ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  return new Date(`${dateText}T00:00:00.000Z`);
}

function isCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
