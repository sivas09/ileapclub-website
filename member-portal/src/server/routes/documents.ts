import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

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

const categories = [
  "Speech Guide",
  "Presentation Guide",
  "Worksheet",
  "Rubric",
  "Sample",
  "Training Material",
  "Other"
] as const;

const optionalDocumentUrl = z.string().trim().refine((value) => !value || isHttpUrl(value), {
  message: "Enter a valid http or https document link."
});

const documentSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
  fileUrl: optionalDocumentUrl.optional(),
  programLevel: z.enum(["JUNIOR", "SENIOR"]),
  bandLevel: z.enum(bandLevels),
  clubId: z.string().nullable().optional(),
  category: z.enum(categories).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional()
});

type ProgramLevel = "JUNIOR" | "SENIOR";

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

documentsRouter.get("/", asyncRoute(async (request, response) => {
  const user = request.user!;
  const visibleClubIds = await getVisibleClubIds(user.id, user.role);
  const studentContext = user.role === Role.STUDENT ? await getStudentDocumentContext(user.id) : null;

  if (visibleClubIds !== null && visibleClubIds.length === 0) {
    response.json({ documents: [], clubs: [], studentContext });
    return;
  }

  const programLevel = stringQuery(request.query.programLevel);
  const bandLevel = stringQuery(request.query.bandLevel);
  const clubId = stringQuery(request.query.clubId);
  const category = stringQuery(request.query.category);
  const search = stringQuery(request.query.search);
  const status = stringQuery(request.query.status);

  if (clubId && visibleClubIds !== null && !visibleClubIds.includes(clubId)) {
    response.status(403).json({ message: "You cannot view documents for this club." });
    return;
  }

  const where: Prisma.BandDocumentWhereInput = {
    ...(programLevel ? { programLevel } : {}),
    ...(bandLevel ? { bandLevel } : {}),
    ...(category ? { category } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    ...(user.role === Role.ADMIN && status ? { status } : { status: "ACTIVE" })
  };

  if (user.role === Role.STUDENT) {
    if (!studentContext?.programLevel || !studentContext.currentBandOrder) {
      response.json({ documents: [], clubs: [], studentContext });
      return;
    }

    where.programLevel = studentContext.programLevel;
    where.bandOrder = { lte: studentContext.currentBandOrder };
    where.OR = [
      { clubId: null },
      { clubId: { in: studentContext.clubIds } }
    ];
  } else if (visibleClubIds !== null) {
    where.OR = [
      { clubId: null },
      { clubId: { in: visibleClubIds } }
    ];
  }

  if (clubId) {
    where.clubId = clubId;
    delete where.OR;
  }

  const [documents, clubs] = await Promise.all([
    prisma.bandDocument.findMany({
      where,
      orderBy: [{ programLevel: "asc" }, { bandOrder: "asc" }, { title: "asc" }],
      include: {
        club: true,
        uploadedBy: {
          select: { firstName: true, lastName: true }
        }
      }
    }),
    prisma.club.findMany({
      where: visibleClubIds === null
        ? { isActive: true, centre: { isActive: true } }
        : { id: { in: visibleClubIds }, isActive: true, centre: { isActive: true } },
      orderBy: { name: "asc" },
      include: { centre: true }
    })
  ]);

  response.json({
    documents: documents.map((document) => serializeDocument(document)),
    clubs,
    studentContext
  });
}));

documentsRouter.post("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can add documents." });
    return;
  }

  const parsed = documentSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid document details and URL." });
    return;
  }

  const data = parsed.data;
  let clubId = data.clubId || null;

  if (user.role === Role.FACILITATOR && !clubId) {
    const assignedClubIds = await getVisibleClubIds(user.id, user.role);
    clubId = assignedClubIds?.[0] ?? null;

    if (!clubId) {
      response.status(400).json({ message: "Facilitators need an assigned active club before adding documents." });
      return;
    }
  }

  if (clubId && !(await canManageDocumentClub(user.id, user.role, clubId))) {
    response.status(403).json({ message: "You cannot add documents for this club." });
    return;
  }

  const document = await prisma.bandDocument.create({
    data: {
      title: data.title,
      description: data.description || null,
      fileName: getDocumentFileName(data.fileName, data.fileUrl, data.title),
      fileUrl: data.fileUrl ?? "",
      programLevel: data.programLevel,
      bandLevel: data.bandLevel,
      bandOrder: getBandOrder(data.bandLevel),
      clubId,
      category: data.category ?? "Other",
      uploadedById: user.id,
      status: user.role === Role.ADMIN ? data.status ?? "ACTIVE" : "ACTIVE"
    },
    include: documentInclude
  });

  response.status(201).json({ document: serializeDocument(document) });
}));

documentsRouter.patch("/:documentId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can edit documents." });
    return;
  }

  const parsed = documentSchema.partial().safeParse(request.body);

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ message: "Enter document changes." });
    return;
  }

  const documentId = String(request.params.documentId);
  const existing = await prisma.bandDocument.findUnique({ where: { id: documentId } });

  if (!existing) {
    response.status(404).json({ message: "Document not found." });
    return;
  }

  const targetClubId = parsed.data.clubId === undefined ? existing.clubId : parsed.data.clubId || null;

  if (!canEditDocumentScope(user.role, existing.clubId, targetClubId)) {
    response.status(403).json({ message: "Facilitators can only edit documents assigned to their clubs." });
    return;
  }

  if (user.role === Role.FACILITATOR && existing.clubId && !(await canManageDocumentClub(user.id, user.role, existing.clubId))) {
    response.status(403).json({ message: "You cannot edit documents for this club." });
    return;
  }

  if (targetClubId && !(await canManageDocumentClub(user.id, user.role, targetClubId))) {
    response.status(403).json({ message: "You cannot assign documents to this club." });
    return;
  }

  const updatedDocument = await prisma.bandDocument.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
      fileName: parsed.data.fileName !== undefined || parsed.data.fileUrl !== undefined || parsed.data.title !== undefined
        ? getDocumentFileName(parsed.data.fileName, parsed.data.fileUrl ?? existing.fileUrl, parsed.data.title ?? existing.title)
        : undefined,
      fileUrl: parsed.data.fileUrl,
      programLevel: parsed.data.programLevel,
      bandLevel: parsed.data.bandLevel,
      bandOrder: parsed.data.bandLevel ? getBandOrder(parsed.data.bandLevel) : undefined,
      clubId: targetClubId,
      category: parsed.data.category,
      status: user.role === Role.ADMIN ? parsed.data.status : undefined
    },
    include: documentInclude
  });

  response.json({ document: serializeDocument(updatedDocument) });
}));

documentsRouter.delete("/:documentId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canPermanentlyDeleteDocument(user.role)) {
    response.status(403).json({ message: "Only admins can delete documents." });
    return;
  }

  const documentId = String(request.params.documentId);
  const existing = await prisma.bandDocument.findUnique({
    where: { id: documentId },
    include: documentInclude
  });

  if (!existing) {
    response.status(404).json({ message: "Document not found." });
    return;
  }

  await prisma.bandDocument.delete({ where: { id: existing.id } });

  response.json({ deletedDocument: serializeDocument(existing) });
}));

export function canPermanentlyDeleteDocument(role: Role) {
  return role === Role.ADMIN;
}

const documentInclude = {
  club: true,
  uploadedBy: {
    select: { firstName: true, lastName: true }
  }
} satisfies Prisma.BandDocumentInclude;

async function getVisibleClubIds(userId: string, role: Role) {
  if (role === Role.ADMIN) {
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

async function getStudentDocumentContext(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: {
      clubMemberships: {
        where: {
          status: "ACTIVE",
          club: { isActive: true, centre: { isActive: true } }
        },
        include: { club: true }
      }
    }
  });

  if (!student) {
    return null;
  }

  const programLevel = getStudentProgramLevel(student);

  return {
    programLevel,
    currentBandLevel: student.bandLevel,
    currentBandOrder: getBandOrder(student.bandLevel),
    clubIds: student.clubMemberships.map((membership) => membership.clubId)
  };
}

async function canManageDocumentClub(userId: string, role: Role, clubId: string) {
  if (role === Role.ADMIN) {
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

export function canEditDocumentScope(role: Role, existingClubId: string | null, targetClubId: string | null) {
  if (role === Role.ADMIN) {
    return true;
  }

  if (role !== Role.FACILITATOR) {
    return false;
  }

  return Boolean(existingClubId && targetClubId);
}

function serializeDocument(document: Prisma.BandDocumentGetPayload<{ include: typeof documentInclude }>) {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    programLevel: document.programLevel,
    bandLevel: document.bandLevel,
    bandOrder: document.bandOrder,
    clubId: document.clubId,
    clubName: document.club?.name ?? "All clubs",
    category: document.category,
    uploadedBy: `${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`,
    createdAt: document.createdAt,
    status: document.status
  };
}

function getStudentProgramLevel(student: { programLevel?: string | null; clubMemberships: Array<{ club: { program: string } }> }): ProgramLevel | null {
  if (student.programLevel === "JUNIOR" || student.programLevel === "SENIOR") {
    return student.programLevel;
  }

  return inferProgramLevel(student.clubMemberships[0]?.club.program ?? "");
}

function inferProgramLevel(program: string): ProgramLevel | null {
  const normalizedProgram = program.toLowerCase();

  if (normalizedProgram.includes("junior")) {
    return "JUNIOR";
  }

  if (normalizedProgram.includes("senior")) {
    return "SENIOR";
  }

  return null;
}

function getBandOrder(bandLevel: string) {
  const index = bandLevels.findIndex((level) => level === bandLevel);

  return index === -1 ? 0 : index + 1;
}

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getDocumentFileName(fileName: string | undefined, fileUrl: string | undefined, title: string) {
  if (fileName?.trim()) {
    return fileName.trim();
  }

  if (!fileUrl) {
    return title.trim();
  }

  try {
    const url = new URL(fileUrl);
    const urlFileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");

    if (urlFileName) {
      return urlFileName;
    }
  } catch {
    // URL validation happens before this helper; title fallback keeps the database field populated.
  }

  return title.trim();
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
