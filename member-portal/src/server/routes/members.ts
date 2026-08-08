import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";

export const membersRouter = Router();

membersRouter.use(requireAuth);

const bandOrder = [
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

type ProgramLevel = "JUNIOR" | "SENIOR";

type StudentWithClubs = {
  bandLevel: string;
  programLevel?: string | null;
  clubMemberships: Array<{
    status: string;
    club: {
      id?: string;
      program: string;
      name: string;
      centre: { name: string };
    };
  }>;
};

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

membersRouter.get("/", asyncRoute(async (request, response) => {
  const user = request.user!;
  const page = clampNumber(Number(request.query.page ?? 1), 1, 100000);
  const pageSize = clampNumber(Number(request.query.pageSize ?? 25), 1, 50);
  const visibleClubIds = await getVisibleClubIds(user.id, user.role);

  if (visibleClubIds !== null && visibleClubIds.length === 0) {
    response.json({ members: [], total: 0, page, pageSize, centres: [], clubs: [] });
    return;
  }

  const requestedClubId = stringQuery(request.query.clubId);
  const requestedCentreId = stringQuery(request.query.centreId);
  const search = stringQuery(request.query.search);
  const programLevel = stringQuery(request.query.programLevel);
  const currentBandLevel = stringQuery(request.query.currentBandLevel);
  const status = stringQuery(request.query.status);
  const clubFilter = requestedClubId
    ? requestedClubId
    : visibleClubIds === null
      ? undefined
      : { in: visibleClubIds };
  const where: Prisma.StudentClubMembershipWhereInput = {
    ...(clubFilter ? { clubId: clubFilter } : {}),
    ...(requestedCentreId ? { club: { centreId: requestedCentreId } } : {}),
    ...(status === "inactive" ? {} : { status: "ACTIVE" }),
    club: {
      ...(requestedCentreId ? { centreId: requestedCentreId } : {}),
      ...(user.role === Role.STUDENT ? { isActive: true, centre: { isActive: true } } : {})
    },
    student: {
      ...(programLevel === "JUNIOR" || programLevel === "SENIOR" ? { programLevel } : {}),
      ...(currentBandLevel ? { bandLevel: currentBandLevel } : {}),
      user: {
        role: Role.STUDENT,
        ...(status === "active" || user.role === Role.STUDENT ? { isActive: true } : {}),
        ...(status === "inactive" ? { isActive: false } : {}),
        ...(search ? {
          OR: user.role === Role.STUDENT
            ? [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } }
              ]
            : [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } }
              ]
        } : {})
      }
    }
  };

  if (requestedClubId && visibleClubIds !== null && !visibleClubIds.includes(requestedClubId)) {
    response.status(403).json({ message: "You cannot view members for this club." });
    return;
  }

  const [memberships, total, centres, clubs] = await Promise.all([
    prisma.studentClubMembership.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [
        { club: { name: "asc" } },
        { student: { user: { lastName: "asc" } } },
        { student: { user: { firstName: "asc" } } }
      ],
      include: {
        club: { include: { centre: true } },
        student: {
          include: {
            user: true
          }
        }
      }
    }),
    prisma.studentClubMembership.count({ where }),
    prisma.centre.findMany({
      where: visibleClubIds === null
        ? {}
        : { clubs: { some: { id: { in: visibleClubIds } } } },
      orderBy: [{ province: "asc" }, { city: "asc" }, { name: "asc" }]
    }),
    prisma.club.findMany({
      where: visibleClubIds === null
        ? {}
        : { id: { in: visibleClubIds } },
      orderBy: { name: "asc" },
      include: { centre: true }
    })
  ]);

  if (user.role === Role.STUDENT) {
    response.json({
      members: memberships.map((membership) => publicMemberRow(membership)),
      total,
      page,
      pageSize,
      centres: [],
      clubs: clubs.map((club) => ({ id: club.id, name: club.name, centreId: club.centreId, program: club.program }))
    });
    return;
  }

  const studentIds = [...new Set(memberships.map((membership) => membership.studentId))];
  const [roleCounts, feedbackStats] = await Promise.all([
    prisma.meetingRoleSlot.groupBy({
      by: ["assignedStudentId"],
      where: { assignedStudentId: { in: studentIds } },
      _count: { _all: true }
    }),
    prisma.studentMeetingFeedback.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds } },
      _avg: { score: true },
      _max: { scoredAt: true }
    })
  ]);
  const roleCountByStudentId = new Map(roleCounts.map((entry) => [entry.assignedStudentId, entry._count._all]));
  const feedbackByStudentId = new Map(feedbackStats.map((entry) => [entry.studentId, entry]));

  response.json({
    members: memberships.map((membership) => {
      const feedback = feedbackByStudentId.get(membership.studentId);

      return {
        id: membership.student.id,
        userId: membership.student.userId,
        displayName: displayName(membership.student.user),
        email: membership.student.user.email,
        programLevel: membership.student.programLevel ?? inferProgramLevel(membership.club.program),
        currentBandLevel: membership.student.bandLevel,
        clubId: membership.clubId,
        clubName: membership.club.name,
        centreId: membership.club.centreId,
        centreName: membership.club.centre.name,
        rolesCompleted: roleCountByStudentId.get(membership.studentId) ?? 0,
        averageScore: feedback?._avg.score === null || feedback?._avg.score === undefined ? null : Math.round(feedback._avg.score),
        lastFeedbackDate: feedback?._max.scoredAt ?? null,
        isActive: membership.student.user.isActive && membership.status === "ACTIVE"
      };
    }),
    total,
    page,
    pageSize,
    centres,
    clubs
  });
}));

membersRouter.get("/:studentId", asyncRoute(async (request, response) => {
  const user = request.user!;
  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      clubMemberships: {
        include: {
          club: {
            include: { centre: true }
          }
        }
      },
      attendance: {
        orderBy: { markedAt: "desc" },
        include: { meeting: { include: { club: true } } }
      },
      roleSlots: {
        orderBy: { meeting: { meetingDate: "desc" } },
        include: {
          roleDefinition: true,
          meeting: { include: { club: true } }
        }
      },
      meetingFeedbacks: {
        orderBy: { scoredAt: "desc" },
        include: {
          meeting: {
            include: {
              club: true,
              roleSlots: { include: { roleDefinition: true } }
            }
          }
        }
      },
      requirementProgress: {
        include: { requirement: true }
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (user.role === Role.STUDENT) {
    if (!(await canStudentViewPublicMember(user.id, student.id))) {
      response.status(403).json({ message: "You can only view members in your own club." });
      return;
    }

    response.json({
      member: {
        id: student.id,
        displayName: displayName(student.user),
        programLevel: getStudentProgramLevel(student),
        currentBandLevel: student.bandLevel,
        clubs: activeClubSummaries(student)
      }
    });
    return;
  }

  if (user.role !== Role.ADMIN && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot view this member." });
    return;
  }

  const selectedProgramLevel = getStudentProgramLevel(student);
  const scorerIds = [...new Set(student.meetingFeedbacks.map((feedback) => feedback.scoredByUserId).filter(Boolean))] as string[];
  const scorers = scorerIds.length
    ? await prisma.user.findMany({
      where: { id: { in: scorerIds } },
      select: { id: true, firstName: true, lastName: true, role: true }
    })
    : [];
  const scorerById = new Map(scorers.map((scorer) => [scorer.id, scorer]));
  const requirements = await buildRequirementProgress(student.id, selectedProgramLevel);
  const completedRequirements = requirements.filter((entry) => entry.isCompleted).length;

  response.json({
    member: {
      id: student.id,
      userId: student.userId,
      displayName: displayName(student.user),
      email: student.user.email,
      grade: student.grade,
      programLevel: selectedProgramLevel,
      currentBandLevel: student.bandLevel,
      isActive: student.user.isActive,
      clubs: student.clubMemberships.map((membership) => ({
        id: membership.clubId,
        name: membership.club.name,
        centreName: membership.club.centre.name,
        status: membership.status
      })),
      trackingSummary: {
        currentBand: student.bandLevel,
        completedRequirements,
        remainingRequirements: requirements.length - completedRequirements
      },
      requirements,
      roleHistory: student.roleSlots.map((slot) => {
        const attendance = student.attendance.find((entry) => entry.meetingId === slot.meetingId);

        return {
          id: slot.id,
          meetingDate: slot.meeting.meetingDate,
          meetingTitle: slot.meeting.title,
          clubName: slot.meeting.club.name,
          roleName: slot.slotLabel || slot.roleDefinition.name,
          attendanceStatus: attendance?.status ?? null
        };
      }),
      feedback: student.meetingFeedbacks.map((feedback) => {
        const scorer = feedback.scoredByUserId ? scorerById.get(feedback.scoredByUserId) : null;
        const roles = feedback.meeting.roleSlots
          .filter((slot) => slot.assignedStudentId === student.id)
          .map((slot) => slot.slotLabel || slot.roleDefinition.name);

        return {
          id: feedback.id,
          meetingDate: feedback.meeting.meetingDate,
          meetingTitle: feedback.meeting.title,
          clubName: feedback.meeting.club.name,
          score: feedback.score,
          feedback: feedback.feedback,
          facilitatorName: scorer ? displayName(scorer) : "Not recorded",
          roleName: roles.join(", ") || "General meeting feedback"
        };
      })
    }
  });
}));

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

async function canStudentViewPublicMember(userId: string, targetStudentId: string) {
  const clubIds = await getVisibleClubIds(userId, Role.STUDENT);

  return prisma.studentClubMembership.count({
    where: {
      studentId: targetStudentId,
      clubId: { in: clubIds ?? [] },
      status: "ACTIVE",
      club: { isActive: true, centre: { isActive: true } },
      student: { user: { role: Role.STUDENT, isActive: true } }
    }
  }).then((count) => count > 0);
}

async function canFacilitatorAccessStudent(facilitatorId: string, studentId: string) {
  const clubIds = await getVisibleClubIds(facilitatorId, Role.FACILITATOR);

  return prisma.studentClubMembership.count({
    where: {
      studentId,
      clubId: { in: clubIds ?? [] },
      status: "ACTIVE"
    }
  }).then((count) => count > 0);
}

async function buildRequirementProgress(studentId: string, programLevel: ProgramLevel | null) {
  if (!programLevel) {
    return [];
  }

  const requirements = await prisma.bandRequirement.findMany({
    where: { programLevel, isActive: true },
    orderBy: [{ bandOrder: "asc" }, { sortOrder: "asc" }]
  });
  const progress = await prisma.studentRequirementProgress.findMany({
    where: {
      studentId,
      requirementId: { in: requirements.map((requirement) => requirement.id) }
    }
  });
  const progressByRequirement = new Map(progress.map((entry) => [entry.requirementId, entry]));

  return requirements.map((requirement) => {
    const entry = progressByRequirement.get(requirement.id);

    return {
      requirement,
      currentCount: entry?.currentCount ?? 0,
      isCompleted: entry?.isCompleted ?? false,
      completedAt: entry?.completedAt ?? null,
      notes: entry?.notes ?? null,
      facilitatorSignedOffAt: entry?.facilitatorSignedOffAt ?? null,
      facilitatorSignedOffByUserId: entry?.facilitatorSignedOffByUserId ?? null,
      adminOverrideAt: entry?.adminOverrideAt ?? null,
      adminOverrideByUserId: entry?.adminOverrideByUserId ?? null
    };
  });
}

function publicMemberRow(membership: Prisma.StudentClubMembershipGetPayload<{
  include: {
    club: { include: { centre: true } };
    student: { include: { user: true } };
  };
}>) {
  return {
    id: membership.student.id,
    displayName: displayName(membership.student.user),
    programLevel: membership.student.programLevel ?? inferProgramLevel(membership.club.program),
    currentBandLevel: membership.student.bandLevel,
    clubName: membership.club.name
  };
}

function activeClubSummaries(student: StudentWithClubs & { clubMemberships: Array<{ status: string; club: { id?: string; name: string; centre: { name: string } } }> }) {
  return student.clubMemberships
    .filter((membership) => membership.status === "ACTIVE")
    .map((membership) => ({
      id: membership.club.id,
      name: membership.club.name,
      centreName: membership.club.centre.name
    }));
}

function getStudentProgramLevel(student: StudentWithClubs): ProgramLevel | null {
  if (student.programLevel === "JUNIOR" || student.programLevel === "SENIOR") {
    return student.programLevel;
  }

  const activeMembership = student.clubMemberships.find((membership) => membership.status === "ACTIVE") ?? student.clubMemberships[0];

  return inferProgramLevel(activeMembership?.club.program ?? "");
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

function displayName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`;
}

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
