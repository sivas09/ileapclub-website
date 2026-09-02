import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { canManageOperationalData, getOperationalScope, isCenterDirector, scopeIncludesCentre } from "../permissions.js";
import { publicUserSelect } from "../services/safeUser.js";
import { roleResourceKey } from "../services/standardRoles.js";
import { bandLevels, type ProgramLevel, programLevels } from "../../shared/portalConstants.js";

export const resourcesRouter = Router();

resourcesRouter.use(requireAuth);

const optionalUrl = z.string().trim().refine((value) => !value || isHttpUrl(value), {
  message: "Enter a valid http or https URL."
});

const resourceSchema = z.object({
  title: z.string().trim().min(2),
  explanation: z.string().trim().min(5),
  youtubeUrl: optionalUrl.optional(),
  documentUrl: optionalUrl.optional(),
  programLevel: z.enum(programLevels).nullable().optional(),
  bandLevel: z.enum(bandLevels).nullable().optional(),
  roleKey: z.string().trim().nullable().optional(),
  requirementId: z.string().trim().nullable().optional(),
  centreId: z.string().trim().nullable().optional(),
  category: z.string().trim().min(2).max(80),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional()
});

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

resourcesRouter.get("/", asyncRoute(async (request, response) => {
  const user = request.user!;
  const roleKey = stringQuery(request.query.roleKey);
  const requirementId = stringQuery(request.query.requirementId);
  const status = stringQuery(request.query.status);
  const category = stringQuery(request.query.category);
  const search = stringQuery(request.query.search);
  const studentContext = user.role === Role.STUDENT ? await getStudentResourceContext(user.id) : null;
  const scope = await getOperationalScope(user);

  const where: Prisma.ResourceLinkWhereInput = {
    ...(roleKey ? { roleKey } : {}),
    ...(requirementId ? { requirementId } : {}),
    ...(category ? { category } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    ...(canManageOperationalData(user) && status ? { status } : { status: "ACTIVE" })
  };

  if (user.role === Role.STUDENT) {
    if (!studentContext) {
      response.json({ resources: [], studentContext });
      return;
    }

    where.AND = [
      { status: "ACTIVE" },
      { OR: [{ centreId: null }, { centreId: { in: scope.centreIds ?? [] } }] },
      {
        OR: [
          studentContext.roleKeys.length ? { roleKey: { in: studentContext.roleKeys } } : {},
          studentContext.roleResourceKeys.length ? { roleKey: { in: studentContext.roleResourceKeys } } : {},
          studentContext.requirementIds.length ? { requirementId: { in: studentContext.requirementIds } } : {},
          studentContext.programLevel && studentContext.currentBandOrder
            ? {
              programLevel: studentContext.programLevel,
              bandOrder: { lte: studentContext.currentBandOrder }
            }
            : {}
        ].filter((condition) => Object.keys(condition).length > 0)
      }
    ];

    if (!studentContext.roleKeys.length && !studentContext.roleResourceKeys.length && !studentContext.requirementIds.length && (!studentContext.programLevel || !studentContext.currentBandOrder)) {
      response.json({ resources: [], studentContext });
      return;
    }
  } else if (isCenterDirector(user)) {
    where.centreId = { in: scope.centreIds ?? [] };
  } else if (user.role === Role.FACILITATOR) {
    where.AND = [{ OR: [{ centreId: null }, { centreId: { in: scope.centreIds ?? [] } }] }];
  }

  const [resources, centres] = await Promise.all([
    prisma.resourceLink.findMany({
      where,
      orderBy: [{ category: "asc" }, { bandOrder: "asc" }, { title: "asc" }],
      include: resourceInclude
    }),
    canManageOperationalData(user)
      ? prisma.centre.findMany({
        where: scope.centreIds === null ? { isActive: true } : { id: { in: scope.centreIds }, isActive: true },
        orderBy: { name: "asc" }
      })
      : Promise.resolve([])
  ]);

  response.json({
    resources: resources.map(serializeResource),
    centres,
    studentContext
  });
}));

resourcesRouter.post("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user)) {
    response.status(403).json({ message: "Only operational managers can add resource links." });
    return;
  }

  const parsed = resourceSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid resource link details." });
    return;
  }

  const data = await normalizeResourcePayload(parsed.data);
  const centreId = parsed.data.centreId ?? null;

  if (isCenterDirector(user) && (!centreId || !scopeIncludesCentre(await getOperationalScope(user), centreId))) {
    response.status(403).json({ message: "Center Directors must assign resources to one of their centres." });
    return;
  }

  const resource = await prisma.resourceLink.create({
    data: {
      ...data,
      title: data.title!,
      explanation: data.explanation!,
      category: data.category!,
      centreId,
      createdById: user.id,
      status: parsed.data.status ?? "ACTIVE"
    },
    include: resourceInclude
  });

  response.status(201).json({ resource: serializeResource(resource) });
}));

resourcesRouter.patch("/:resourceId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user)) {
    response.status(403).json({ message: "Only operational managers can edit resource links." });
    return;
  }

  const parsed = resourceSchema.partial().safeParse(request.body);

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ message: "Enter resource changes." });
    return;
  }

  const resourceId = String(request.params.resourceId);
  const existing = await prisma.resourceLink.findUnique({ where: { id: resourceId } });

  if (!existing) {
    response.status(404).json({ message: "Resource link not found." });
    return;
  }

  const targetCentreId = parsed.data.centreId === undefined ? existing.centreId : parsed.data.centreId;

  if (isCenterDirector(user)) {
    const scope = await getOperationalScope(user);

    if (!existing.centreId || !scopeIncludesCentre(scope, existing.centreId)
      || !targetCentreId || !scopeIncludesCentre(scope, targetCentreId)) {
      response.status(403).json({ message: "You cannot edit a resource outside your centre scope." });
      return;
    }
  }

  const data = await normalizeResourcePayload(parsed.data);
  const resource = await prisma.resourceLink.update({
    where: { id: existing.id },
    data: {
      ...data,
      centreId: targetCentreId,
      updatedById: user.id
    },
    include: resourceInclude
  });

  response.json({ resource: serializeResource(resource) });
}));

resourcesRouter.delete("/:resourceId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canPermanentlyDeleteResourceLink(user.role)) {
    response.status(403).json({ message: "Only operational managers can delete resource links." });
    return;
  }

  const resourceId = String(request.params.resourceId);
  const existing = await prisma.resourceLink.findUnique({
    where: { id: resourceId },
    include: resourceInclude
  });

  if (!existing) {
    response.status(404).json({ message: "Resource link not found." });
    return;
  }

  if (isCenterDirector(user) && (!existing.centreId || !scopeIncludesCentre(await getOperationalScope(user), existing.centreId))) {
    response.status(403).json({ message: "You cannot delete a resource outside your centre scope." });
    return;
  }

  await prisma.resourceLink.delete({ where: { id: existing.id } });

  response.json({ deletedResource: serializeResource(existing) });
}));

export function canPermanentlyDeleteResourceLink(role: Role) {
  return canManageOperationalData(role);
}

const resourceInclude = {
  requirement: true,
  centre: true,
  createdBy: {
    select: publicUserSelect
  },
  updatedBy: {
    select: publicUserSelect
  }
} satisfies Prisma.ResourceLinkInclude;

async function normalizeResourcePayload(data: Partial<z.infer<typeof resourceSchema>>) {
  const requirement = data.requirementId
    ? await prisma.bandRequirement.findUnique({ where: { id: data.requirementId } })
    : null;

  if (data.requirementId && !requirement) {
    throw new ResourceValidationError("Choose an existing band requirement.");
  }

  return {
    title: data.title,
    explanation: data.explanation,
    youtubeUrl: data.youtubeUrl === undefined ? undefined : data.youtubeUrl || null,
    documentUrl: data.documentUrl === undefined ? undefined : data.documentUrl || null,
    programLevel: requirement?.programLevel ?? nullableString(data.programLevel),
    bandLevel: requirement?.bandLevel ?? nullableString(data.bandLevel),
    bandOrder: requirement?.bandOrder ?? (data.bandLevel ? getBandOrder(data.bandLevel) : data.bandLevel === null ? null : undefined),
    roleKey: normalizeRoleKeyInput(data.roleKey),
    requirementId: nullableString(data.requirementId),
    centreId: data.centreId === undefined ? undefined : nullableString(data.centreId),
    category: data.category,
    status: data.status
  };
}

resourcesRouter.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (error instanceof ResourceValidationError) {
    response.status(400).json({ message: error.message });
    return;
  }

  next(error);
});

async function getStudentResourceContext(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: {
      clubMemberships: {
        where: {
          status: "ACTIVE",
          club: { isActive: true, centre: { isActive: true } }
        },
        include: { club: true }
      },
      roleSlots: {
        include: { roleDefinition: true }
      },
      requirementProgress: {
        include: { requirement: true }
      }
    }
  });

  if (!student) {
    return null;
  }

  const programLevel = getStudentProgramLevel(student);
  const currentBandOrder = getBandOrder(student.bandLevel);
  const clubIds = student.clubMemberships.map((membership) => membership.clubId);
  const visibleMeetingRoleSlots = clubIds.length
    ? await prisma.meetingRoleSlot.findMany({
      where: {
        meeting: {
          clubId: { in: clubIds },
          club: { isActive: true, centre: { isActive: true } }
        },
        roleDefinition: { isActive: true }
      },
      include: { roleDefinition: true }
    })
    : [];
  const visibleRoleNames = [
    ...student.roleSlots.map((slot) => slot.roleDefinition.name),
    ...visibleMeetingRoleSlots.map((slot) => slot.roleDefinition.name),
    ...visibleMeetingRoleSlots.map((slot) => slot.slotLabel).filter(Boolean)
  ];
  const currentAndPreviousRequirements = programLevel && currentBandOrder
    ? await prisma.bandRequirement.findMany({
      where: {
        programLevel,
        isActive: true,
        bandOrder: { lte: currentBandOrder }
      },
      select: { id: true }
    })
    : [];

  return {
    programLevel,
    currentBandLevel: student.bandLevel,
    currentBandOrder,
    roleKeys: [...new Set(visibleRoleNames)],
    roleResourceKeys: [...new Set(visibleRoleNames.map(roleResourceKey))],
    requirementIds: [...new Set([
      ...student.requirementProgress.map((entry) => entry.requirementId),
      ...currentAndPreviousRequirements.map((requirement) => requirement.id)
    ])]
  };
}

function serializeResource(resource: Prisma.ResourceLinkGetPayload<{ include: typeof resourceInclude }>) {
  return {
    id: resource.id,
    title: resource.title,
    explanation: resource.explanation,
    youtubeUrl: resource.youtubeUrl,
    documentUrl: resource.documentUrl,
    programLevel: resource.programLevel,
    bandLevel: resource.bandLevel,
    bandOrder: resource.bandOrder,
    roleKey: resource.roleKey,
    requirementId: resource.requirementId,
    requirementName: resource.requirement?.name ?? null,
    centreId: resource.centreId,
    centreName: resource.centre?.name ?? "All centres",
    category: resource.category,
    status: resource.status,
    createdAt: resource.createdAt,
    createdBy: `${resource.createdBy.firstName} ${resource.createdBy.lastName}`,
    updatedBy: resource.updatedBy ? `${resource.updatedBy.firstName} ${resource.updatedBy.lastName}` : null
  };
}

function getStudentProgramLevel(student: { programLevel?: string | null; clubMemberships: Array<{ club: { program: string } }> }): ProgramLevel | null {
  if (student.programLevel === "JUNIOR" || student.programLevel === "SENIOR") {
    return student.programLevel;
  }

  const program = student.clubMemberships[0]?.club.program.toLowerCase() ?? "";

  if (program.includes("junior")) {
    return "JUNIOR";
  }

  if (program.includes("senior")) {
    return "SENIOR";
  }

  return null;
}

function getBandOrder(bandLevel: string) {
  const index = bandLevels.findIndex((level) => level === bandLevel);

  return index === -1 ? null : index + 1;
}

function nullableString(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
}

function normalizeRoleKeyInput(value: string | null | undefined) {
  const roleKey = nullableString(value);

  return roleKey ? roleResourceKey(roleKey) : roleKey;
}

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

class ResourceValidationError extends Error {}
