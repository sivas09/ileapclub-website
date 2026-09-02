import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { canManageOperationalData } from "../permissions.js";
import { publicUserSelect } from "../services/safeUser.js";
import { noticeLimits, noticeStatuses } from "../../shared/portalConstants.js";

export const noticesRouter = Router();

noticesRouter.use(requireAuth);

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(noticeLimits.title),
  message: z.string().trim().min(1).max(noticeLimits.message),
  clubId: z.string().trim().min(1).nullable().optional(),
  status: z.enum(noticeStatuses).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  isPinned: z.boolean().optional()
});

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

noticesRouter.get("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR && user.role !== Role.STUDENT) {
    response.status(403).json({ message: "You do not have permission to view notices." });
    return;
  }

  const clubId = stringQuery(request.query.clubId);
  const status = stringQuery(request.query.status);

  if (status && !noticeStatuses.includes(status as typeof noticeStatuses[number])) {
    response.status(400).json({ message: "Select a valid notice status." });
    return;
  }

  const visibleClubIds = await getVisibleClubIds(user.id, user.role);

  if (user.role === Role.STUDENT && clubId) {
    response.status(403).json({ message: "Member notice scope is determined by club membership." });
    return;
  }

  if (clubId && visibleClubIds !== null && !visibleClubIds.includes(clubId)) {
    response.status(403).json({ message: "You cannot view notices for this club." });
    return;
  }

  const where: Prisma.NoticeWhereInput = {};

  if (user.role === Role.STUDENT) {
    where.status = "ACTIVE";
    where.AND = [
      { OR: [{ clubId: null }, { clubId: { in: visibleClubIds ?? [] } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }
    ];
  } else {
    if (status) {
      where.status = status;
    }

    if (visibleClubIds !== null) {
      where.OR = [{ clubId: null }, { clubId: { in: visibleClubIds } }];
    }

    if (clubId) {
      where.clubId = clubId;
      delete where.OR;
    }
  }

  const [notices, clubs] = await Promise.all([
    prisma.notice.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: noticeInclude
    }),
    user.role === Role.STUDENT
      ? Promise.resolve([])
      : prisma.club.findMany({
        where: visibleClubIds === null
          ? { isActive: true, centre: { isActive: true } }
          : { id: { in: visibleClubIds }, isActive: true, centre: { isActive: true } },
        orderBy: { name: "asc" },
        include: { centre: true }
      })
  ]);

  response.json({
    notices: notices.map(serializeNotice),
    clubs
  });
}));

noticesRouter.post("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only operational managers and facilitators can create notices." });
    return;
  }

  const parsed = noticeSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a valid notice title, message, club, and expiry date." });
    return;
  }

  const data = parsed.data;
  const clubId = data.clubId ?? null;

  if (user.role === Role.FACILITATOR && !clubId) {
    response.status(403).json({ message: "Facilitators must select one of their assigned clubs." });
    return;
  }

  if (clubId && !(await canManageNoticeClub(user.id, user.role, clubId))) {
    response.status(403).json({ message: "You cannot create notices for this club." });
    return;
  }

  const notice = await prisma.notice.create({
    data: {
      title: data.title,
      message: data.message,
      clubId,
      createdByUserId: user.id,
      status: canManageOperationalData(user) ? data.status ?? "ACTIVE" : "ACTIVE",
      expiresAt: parseExpiry(data.expiresAt),
      isPinned: data.isPinned ?? false
    },
    include: noticeInclude
  });

  response.status(201).json({ notice: serializeNotice(notice) });
}));

noticesRouter.patch("/:noticeId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only operational managers and facilitators can edit notices." });
    return;
  }

  const parsed = noticeSchema.partial().safeParse(request.body);

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ message: "Enter valid notice changes." });
    return;
  }

  const existing = await prisma.notice.findUnique({ where: { id: String(request.params.noticeId) } });

  if (!existing) {
    response.status(404).json({ message: "Notice not found." });
    return;
  }

  const targetClubId = parsed.data.clubId === undefined ? existing.clubId : parsed.data.clubId;

  if (user.role === Role.FACILITATOR) {
    if (!existing.clubId || !(await canManageNoticeClub(user.id, user.role, existing.clubId))) {
      response.status(403).json({ message: "You cannot edit this notice." });
      return;
    }

    if (!targetClubId || !(await canManageNoticeClub(user.id, user.role, targetClubId))) {
      response.status(403).json({ message: "You cannot move this notice to that club." });
      return;
    }
  } else if (parsed.data.clubId !== undefined && targetClubId && !(await canManageNoticeClub(user.id, user.role, targetClubId))) {
    response.status(403).json({ message: "You cannot move this notice to that club." });
    return;
  }

  const notice = await prisma.notice.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      message: parsed.data.message,
      clubId: targetClubId,
      status: parsed.data.status,
      expiresAt: parsed.data.expiresAt === undefined ? undefined : parseExpiry(parsed.data.expiresAt),
      isPinned: parsed.data.isPinned
    },
    include: noticeInclude
  });

  response.json({ notice: serializeNotice(notice) });
}));

noticesRouter.delete("/:noticeId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user)) {
    response.status(403).json({ message: "Only operational managers can permanently delete notices." });
    return;
  }

  const existing = await prisma.notice.findUnique({
    where: { id: String(request.params.noticeId) },
    include: noticeInclude
  });

  if (!existing) {
    response.status(404).json({ message: "Notice not found." });
    return;
  }

  await prisma.notice.delete({ where: { id: existing.id } });
  response.json({ deletedNotice: serializeNotice(existing) });
}));

const noticeInclude = {
  club: true,
  createdBy: {
    select: publicUserSelect
  }
} satisfies Prisma.NoticeInclude;

async function getVisibleClubIds(userId: string, role: Role) {
  if (canManageOperationalData(role)) {
    return null;
  }

  if (role === Role.FACILITATOR) {
    const assignments = await prisma.clubFacilitator.findMany({
      where: {
        facilitatorId: userId,
        club: { isActive: true, centre: { isActive: true } }
      },
      select: { clubId: true }
    });

    return assignments.map((assignment) => assignment.clubId);
  }

  if (role === Role.STUDENT) {
    const memberships = await prisma.studentClubMembership.findMany({
      where: {
        student: { userId },
        status: "ACTIVE",
        club: { isActive: true, centre: { isActive: true } }
      },
      select: { clubId: true }
    });

    return memberships.map((membership) => membership.clubId);
  }

  return [];
}

async function canManageNoticeClub(userId: string, role: Role, clubId: string) {
  if (canManageOperationalData(role)) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { isActive: true, centre: { select: { isActive: true } } }
    });

    return Boolean(club?.isActive && club.centre.isActive);
  }

  if (role !== Role.FACILITATOR) {
    return false;
  }

  const assignment = await prisma.clubFacilitator.findFirst({
    where: {
      facilitatorId: userId,
      clubId,
      club: { isActive: true, centre: { isActive: true } }
    }
  });

  return Boolean(assignment);
}

function serializeNotice(notice: Prisma.NoticeGetPayload<{ include: typeof noticeInclude }>) {
  return {
    id: notice.id,
    title: notice.title,
    message: notice.message,
    clubId: notice.clubId,
    clubName: notice.club?.name ?? "All clubs",
    createdBy: `${notice.createdBy.firstName} ${notice.createdBy.lastName}`,
    status: notice.status,
    expiresAt: notice.expiresAt,
    isPinned: notice.isPinned,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt
  };
}

function parseExpiry(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
