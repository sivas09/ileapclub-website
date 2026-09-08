import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { getOperationalScope, scopeIncludesClub } from "../permissions.js";
import { publicUserSelect } from "../services/safeUser.js";

const teachingModuleSchema = z.object({
  title: z.string().trim().min(2).max(160),
  moduleCode: z.string().trim().min(1).max(80),
  resourceUrl: z.string().trim().max(2048).url().refine((value) => new URL(value).protocol === "https:", {
    message: "Resource URL must use https."
  }),
  description: z.string().trim().max(500).optional()
}).strict();

const viewingRoles = [Role.ADMIN, Role.CENTER_DIRECTOR, Role.FACILITATOR];
const managingRoles = [Role.ADMIN, Role.CENTER_DIRECTOR];

export const teachingModulesRouter = Router();

teachingModulesRouter.use(requireAuth, requireRole(viewingRoles));
teachingModulesRouter.use((_request, response, next) => {
  response.setHeader("Cache-Control", "private, no-store");
  next();
});

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

teachingModulesRouter.get("/", asyncRoute(async (request, response) => {
  const clubIds = await visibleTeachingModuleClubIds(request.user!);
  const clubs = await prisma.club.findMany({
    where: clubIds === null ? {} : { id: { in: clubIds } },
    orderBy: [{ centre: { name: "asc" } }, { name: "asc" }],
    include: {
      centre: true,
      currentTeachingModule: {
        include: {
          updatedBy: { select: publicUserSelect }
        }
      }
    }
  });

  response.json({
    clubs: clubs.map((club) => ({
      id: club.id,
      name: club.name,
      program: club.program,
      isActive: club.isActive,
      centre: {
        id: club.centre.id,
        name: club.centre.name,
        isActive: club.centre.isActive
      },
      currentTeachingModule: club.currentTeachingModule
        ? serializeTeachingModule(club.currentTeachingModule)
        : null
    }))
  });
}));

teachingModulesRouter.put("/:clubId", requireRole(managingRoles), asyncRoute(async (request, response) => {
  const parsed = teachingModuleSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a title, module number or code, and a valid https:// resource URL." });
    return;
  }

  const clubId = String(request.params.clubId);

  if (!(await canManageTeachingModuleClub(request.user!, clubId))) {
    response.status(403).json({ message: "You cannot manage the current teaching module for this club." });
    return;
  }

  const data = parsed.data;
  const teachingModule = await prisma.clubTeachingModule.upsert({
    where: { clubId },
    update: {
      title: data.title,
      moduleCode: data.moduleCode,
      resourceUrl: data.resourceUrl,
      description: data.description || null,
      updatedByUserId: request.user!.id
    },
    create: {
      clubId,
      title: data.title,
      moduleCode: data.moduleCode,
      resourceUrl: data.resourceUrl,
      description: data.description || null,
      updatedByUserId: request.user!.id
    },
    include: {
      updatedBy: { select: publicUserSelect }
    }
  });

  response.json({ teachingModule: serializeTeachingModule(teachingModule) });
}));

teachingModulesRouter.delete("/:clubId", requireRole(managingRoles), asyncRoute(async (request, response) => {
  const clubId = String(request.params.clubId);

  if (!(await canManageTeachingModuleClub(request.user!, clubId))) {
    response.status(403).json({ message: "You cannot manage the current teaching module for this club." });
    return;
  }

  const result = await prisma.clubTeachingModule.deleteMany({ where: { clubId } });

  response.json({ removed: result.count > 0 });
}));

async function visibleTeachingModuleClubIds(user: { id: string; role: Role }) {
  if (user.role === Role.ADMIN) {
    return null;
  }

  if (user.role === Role.CENTER_DIRECTOR) {
    return (await getOperationalScope(user)).clubIds ?? [];
  }

  const assignments = await prisma.clubFacilitator.findMany({
    where: {
      facilitatorId: user.id,
      club: {
        isActive: true,
        centre: { isActive: true }
      }
    },
    select: { clubId: true }
  });

  return assignments.map((assignment) => assignment.clubId);
}

async function canManageTeachingModuleClub(user: { id: string; role: Role }, clubId: string) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });

  if (!club) {
    return false;
  }

  if (user.role === Role.ADMIN) {
    return true;
  }

  if (user.role !== Role.CENTER_DIRECTOR) {
    return false;
  }

  return scopeIncludesClub(await getOperationalScope(user), clubId);
}

const teachingModuleInclude = {
  updatedBy: { select: publicUserSelect }
} satisfies Prisma.ClubTeachingModuleInclude;

function serializeTeachingModule(
  teachingModule: Prisma.ClubTeachingModuleGetPayload<{ include: typeof teachingModuleInclude }>
) {
  return {
    id: teachingModule.id,
    clubId: teachingModule.clubId,
    title: teachingModule.title,
    moduleCode: teachingModule.moduleCode,
    resourceUrl: teachingModule.resourceUrl,
    description: teachingModule.description,
    updatedAt: teachingModule.updatedAt,
    updatedBy: teachingModule.updatedBy
      ? {
        id: teachingModule.updatedBy.id,
        firstName: teachingModule.updatedBy.firstName,
        lastName: teachingModule.updatedBy.lastName,
        role: teachingModule.updatedBy.role
      }
      : null
  };
}
