import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { roleResourceKey } from "../services/standardRoles.js";

export const resourcesRouter = Router();

resourcesRouter.use(requireAuth);

const bandLevels = [
  "White",
  "Yellow",
  "Orange I",
  "Orange II",
  "Green I",
  "Green II",
  "Blue I",
  "Blue II",
  "Red I",
  "Red II",
  "Brown I",
  "Brown II",
  "Black I",
  "Black II"
] as const;

const optionalUrl = z.string().trim().refine((value) => !value || isHttpUrl(value), {
  message: "Enter a valid http or https URL."
});

const resourceSchema = z.object({
  title: z.string().trim().min(2),
  explanation: z.string().trim().min(5),
  youtubeUrl: optionalUrl.optional(),
  documentUrl: optionalUrl.optional(),
  programLevel: z.enum(["JUNIOR", "SENIOR"]).nullable().optional(),
  bandLevel: z.enum(bandLevels).nullable().optional(),
  roleKey: z.string().trim().nullable().optional(),
  requirementId: z.string().trim().nullable().optional(),
  category: z.string().trim().min(2).max(80),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional()
});

type ProgramLevel = "JUNIOR" | "SENIOR";

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

  const where: Prisma.ResourceLinkWhereInput = {
    ...(roleKey ? { roleKey } : {}),
    ...(requirementId ? { requirementId } : {}),
    ...(category ? { category } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    ...(user.role === Role.ADMIN && status ? { status } : { status: "ACTIVE" })
  };

  if (user.role === Role.STUDENT) {
    if (!studentContext) {
      response.json({ resources: [], studentContext });
      return;
    }

    where.AND = [
      { status: "ACTIVE" },
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
  }

  const resources = await prisma.resourceLink.findMany({
    where,
    orderBy: [{ category: "asc" }, { bandOrder: "asc" }, { title: "asc" }],
    include: resourceInclude
  });

  response.json({
    resources: resources.map(serializeResource),
    studentContext
  });
}));

resourcesRouter.post("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN) {
    response.status(403).json({ message: "Only admins can add resource links." });
    return;
  }

  const parsed = resourceSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid resource link details." });
    return;
  }

  const data = await normalizeResourcePayload(parsed.data);
  const resource = await prisma.resourceLink.create({
    data: {
      ...data,
      title: data.title!,
      explanation: data.explanation!,
      category: data.category!,
      createdById: user.id,
      status: parsed.data.status ?? "ACTIVE"
    },
    include: resourceInclude
  });

  response.status(201).json({ resource: serializeResource(resource) });
}));

resourcesRouter.patch("/:resourceId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN) {
    response.status(403).json({ message: "Only admins can edit resource links." });
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

  const data = await normalizeResourcePayload(parsed.data);
  const resource = await prisma.resourceLink.update({
    where: { id: existing.id },
    data: {
      ...data,
      updatedById: user.id
    },
    include: resourceInclude
  });

  response.json({ resource: serializeResource(resource) });
}));

resourcesRouter.delete("/:resourceId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canPermanentlyDeleteResourceLink(user.role)) {
    response.status(403).json({ message: "Only admins can delete resource links." });
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

  await prisma.resourceLink.delete({ where: { id: existing.id } });

  response.json({ deletedResource: serializeResource(existing) });
}));

export function canPermanentlyDeleteResourceLink(role: Role) {
  return role === Role.ADMIN;
}

const resourceInclude = {
  requirement: true,
  createdBy: {
    select: { firstName: true, lastName: true }
  },
  updatedBy: {
    select: { firstName: true, lastName: true }
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
