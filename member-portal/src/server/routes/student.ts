import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { memberUserSelect, publicUserSelect } from "../services/safeUser.js";
import { bandLevels, type ProgramLevel, programLevels } from "../../shared/portalConstants.js";

export const studentRouter = Router();

studentRouter.use(requireAuth);

const progressSchema = z.object({
  currentCount: z.coerce.number().int().min(0),
  isCompleted: z.boolean().optional(),
  notes: z.string().trim().optional()
});

const bandRequirementSchema = z.object({
  programLevel: z.enum(programLevels),
  bandLevel: z.enum(bandLevels),
  name: z.string().trim().min(2),
  description: z.string().trim().min(5),
  requirementType: z.string().trim().min(2),
  targetCount: z.coerce.number().int().min(1).default(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().optional()
});

const profileSchema = z.object({
  programLevel: z.enum(programLevels),
  bandLevel: z.enum(bandLevels)
});

type StudentWithClubs = {
  bandLevel: string;
  programLevel?: string | null;
  clubMemberships: Array<{
    status: string;
    club: {
      program: string;
      name: string;
      centre: { name: string };
    };
  }>;
};

const programLevelWarning = "Program level not set. Please ask Admin or Facilitator to set Junior or Senior.";

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

studentRouter.get("/me/progress", requireRole([Role.STUDENT]), asyncRoute(async (request, response) => {
  const student = await prisma.student.findUnique({
    where: { userId: request.user!.id },
    include: {
      user: { select: publicUserSelect },
      clubMemberships: {
        include: {
          club: {
            include: { centre: true }
          }
        }
      },
      attendance: {
        orderBy: { markedAt: "desc" },
        include: {
          meeting: {
            include: {
              club: true
            }
          }
        }
      },
      roleSlots: {
        orderBy: {
          meeting: {
            meetingDate: "desc"
          }
        },
        include: {
          roleDefinition: true,
          meeting: {
            include: {
              club: true
            }
          },
          score: true
        }
      },
      roleScores: {
        orderBy: { scoredAt: "desc" },
        include: {
          meeting: {
            include: {
              club: true
            }
          },
          roleSlot: {
            include: {
              roleDefinition: true
            }
          }
        }
      },
      meetingFeedbacks: {
        orderBy: { scoredAt: "desc" },
        include: {
          meeting: {
            include: {
              club: true,
              roleSlots: {
                include: {
                  roleDefinition: true
                }
              }
            }
          }
        }
      },
      memberFeedback: {
        orderBy: { createdAt: "desc" },
        include: {
          club: true,
          createdBy: {
            select: publicUserSelect
          }
        }
      },
      requirementProgress: {
        include: {
          requirement: true
        }
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Member profile not found." });
    return;
  }

  const totalAttendance = student.attendance.length;
  const presentCount = student.attendance.filter((entry) => entry.status === "PRESENT" || entry.status === "LATE").length;
  const scoredFeedback = student.meetingFeedbacks.length;
  const averageScore = scoredFeedback
    ? Math.round(student.meetingFeedbacks.reduce((sum, entry) => sum + entry.score, 0) / scoredFeedback)
    : null;
  const scorerIds = [...new Set(student.meetingFeedbacks.map((score) => score.scoredByUserId).filter(Boolean))] as string[];
  const scorers = scorerIds.length
    ? await prisma.user.findMany({
      where: { id: { in: scorerIds } },
      select: publicUserSelect
    })
    : [];
  const scorerById = new Map(scorers.map((scorer) => [scorer.id, scorer]));
  const selectedProgramLevel = getStudentProgramLevel(student);

  response.json({
    student,
    memberFeedback: student.memberFeedback.map((entry) => ({
      id: entry.id,
      clubName: entry.club.name,
      feedback: entry.feedback,
      facilitatorName: entry.createdBy ? `${entry.createdBy.firstName} ${entry.createdBy.lastName}` : "Former facilitator",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })),
    feedback: student.meetingFeedbacks.map((score) => {
      const scorer = score.scoredByUserId ? scorerById.get(score.scoredByUserId) : null;
      const attendance = student.attendance.find((entry) => entry.meetingId === score.meetingId);
      const rolesPerformed = score.meeting.roleSlots
        .filter((slot) => slot.assignedStudentId === student.id)
        .map((slot) => slot.slotLabel || slot.roleDefinition.name);

      return {
        id: score.id,
        meetingDate: score.meeting.meetingDate,
        meetingTitle: score.meeting.title,
        clubName: score.meeting.club.name,
        roleName: rolesPerformed.join(", ") || "General meeting feedback",
        roleNames: rolesPerformed,
        score: score.score,
        feedback: score.feedback,
        facilitatorName: scorer ? `${scorer.firstName} ${scorer.lastName}` : "Not recorded",
        facilitatorRole: scorer?.role ?? null,
        attendanceStatus: attendance?.status ?? null,
        scoredAt: score.scoredAt
      };
    }),
    requirements: await buildRequirementProgress(student.id, selectedProgramLevel),
    summary: {
      bandLevel: student.bandLevel,
      programLevel: selectedProgramLevel,
      programLevelWarning: selectedProgramLevel ? null : programLevelWarning,
      clubName: formatClubNames(student.clubMemberships),
      centreName: formatCentreNames(student.clubMemberships),
      attendanceRate: totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : null,
      totalMeetingsMarked: totalAttendance,
      rolesCompleted: student.roleSlots.filter((slot) => slot.assignedStudentId === student.id).length,
      scoredRoles: scoredFeedback,
      averageScore
    }
  });
}));

studentRouter.get("/me/club-members", requireRole([Role.STUDENT]), asyncRoute(async (request, response) => {
  const student = await prisma.student.findUnique({
    where: { userId: request.user!.id },
    include: {
      clubMemberships: {
        where: {
          status: "ACTIVE",
          club: {
            isActive: true,
            centre: { isActive: true }
          }
        },
        include: {
          club: true
        }
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Member profile not found." });
    return;
  }

  const clubIds = student.clubMemberships.map((membership) => membership.clubId);

  if (!clubIds.length) {
    response.json({ members: [] });
    return;
  }

  const memberships = await prisma.studentClubMembership.findMany({
    where: {
      clubId: { in: clubIds },
      status: "ACTIVE",
      club: {
        isActive: true,
        centre: { isActive: true }
      },
      student: {
        user: {
          role: Role.STUDENT,
          isActive: true
        }
      }
    },
    orderBy: [
      { club: { name: "asc" } },
      { student: { user: { lastName: "asc" } } },
      { student: { user: { firstName: "asc" } } }
    ],
    include: {
      club: true,
      student: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });

  response.json({
    members: memberships.map((membership) => ({
      displayName: `${membership.student.user.firstName} ${membership.student.user.lastName}`,
      programLevel: membership.student.programLevel ?? inferProgramLevel(membership.club.program),
      currentBandLevel: membership.student.bandLevel,
      clubName: membership.club.name
    }))
  });
}));

studentRouter.get("/requirements", requireRole([Role.ADMIN]), asyncRoute(async (_request, response) => {
  const requirements = await prisma.bandRequirement.findMany({
    orderBy: [{ programLevel: "asc" }, { bandOrder: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
  });

  response.json({ requirements });
}));

studentRouter.post("/requirements", requireRole([Role.ADMIN]), asyncRoute(async (request, response) => {
  const parsed = bandRequirementSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid band requirement details." });
    return;
  }

  const duplicate = await prisma.bandRequirement.findUnique({
    where: {
      programLevel_bandLevel_name: {
        programLevel: parsed.data.programLevel,
        bandLevel: parsed.data.bandLevel,
        name: parsed.data.name
      }
    }
  });

  if (duplicate) {
    response.status(409).json({ message: "A requirement with this program, band, and name already exists." });
    return;
  }

  const requirement = await prisma.bandRequirement.create({
    data: {
      ...parsed.data,
      bandOrder: getBandOrder(parsed.data.bandLevel) ?? 0,
      isActive: parsed.data.isActive ?? true
    }
  });

  response.status(201).json({ requirement });
}));

studentRouter.patch("/requirements/:requirementId", requireRole([Role.ADMIN]), asyncRoute(async (request, response) => {
  const parsed = bandRequirementSchema.partial().safeParse(request.body);

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ message: "Enter requirement changes." });
    return;
  }

  const requirementId = String(request.params.requirementId);
  const existing = await prisma.bandRequirement.findUnique({ where: { id: requirementId } });

  if (!existing) {
    response.status(404).json({ message: "Band requirement not found." });
    return;
  }

  const programLevel = parsed.data.programLevel ?? existing.programLevel;
  const bandLevel = parsed.data.bandLevel ?? existing.bandLevel;
  const name = parsed.data.name ?? existing.name;
  const duplicate = await prisma.bandRequirement.findFirst({
    where: {
      id: { not: existing.id },
      programLevel,
      bandLevel,
      name
    }
  });

  if (duplicate) {
    response.status(409).json({ message: "A requirement with this program, band, and name already exists." });
    return;
  }

  const requirement = await prisma.bandRequirement.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      bandOrder: parsed.data.bandLevel ? getBandOrder(parsed.data.bandLevel) ?? existing.bandOrder : undefined
    }
  });

  response.json({ requirement });
}));

studentRouter.delete("/requirements/:requirementId", requireRole([Role.ADMIN]), asyncRoute(async (request, response) => {
  const requirementId = String(request.params.requirementId);
  const existing = await prisma.bandRequirement.findUnique({ where: { id: requirementId } });

  if (!existing) {
    response.status(404).json({ message: "Band requirement not found." });
    return;
  }

  const [progressCount, resourceCount] = await Promise.all([
    prisma.studentRequirementProgress.count({ where: { requirementId: existing.id } }),
    prisma.resourceLink.count({ where: { requirementId: existing.id } })
  ]);

  if (progressCount > 0 || resourceCount > 0) {
    const requirement = await prisma.bandRequirement.update({
      where: { id: existing.id },
      data: { isActive: false }
    });

    response.json({
      requirement,
      deleted: false,
      archived: true,
      message: "Requirement has progress or resource links, so it was marked inactive instead of deleted."
    });
    return;
  }

  await prisma.bandRequirement.delete({ where: { id: existing.id } });

  response.json({ requirement: existing, deleted: true, archived: false });
}));

studentRouter.put("/:studentId/requirements/:requirementId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can update band requirements." });
    return;
  }

  const parsed = progressSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid requirement progress." });
    return;
  }

  const studentId = String(request.params.studentId);
  const requirementId = String(request.params.requirementId);
  const [student, requirement] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: {
        clubMemberships: {
          include: {
            club: {
              include: { centre: true }
            }
          }
        }
      }
    }),
    prisma.bandRequirement.findUnique({ where: { id: requirementId } })
  ]);

  if (!student || !requirement) {
    response.status(404).json({ message: "Member or requirement not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot update this member's requirements." });
    return;
  }

  const selectedProgramLevel = getStudentProgramLevel(student);

  if (!selectedProgramLevel || requirement.programLevel !== selectedProgramLevel) {
    response.status(400).json({ message: "Choose a requirement from this member's program ladder." });
    return;
  }

  const isCompleted = parsed.data.isCompleted ?? parsed.data.currentCount >= requirement.targetCount;
  const signOffData = isCompleted && user.role === Role.FACILITATOR
    ? {
      facilitatorSignedOffByUserId: user.id,
      facilitatorSignedOffAt: new Date()
    }
    : {};
  const adminOverrideData = user.role === Role.ADMIN
    ? {
      adminOverrideByUserId: user.id,
      adminOverrideAt: new Date()
    }
    : {};
  const clearedCompletionData = !isCompleted
    ? {
      facilitatorSignedOffByUserId: null,
      facilitatorSignedOffAt: null,
      adminOverrideByUserId: null,
      adminOverrideAt: null
    }
    : {};

  const progress = await prisma.studentRequirementProgress.upsert({
    where: {
      studentId_requirementId: {
        studentId,
        requirementId
      }
    },
    update: {
      currentCount: parsed.data.currentCount,
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
      notes: parsed.data.notes || null,
      updatedByUserId: user.id,
      ...signOffData,
      ...adminOverrideData,
      ...clearedCompletionData
    },
    create: {
      studentId,
      requirementId,
      currentCount: parsed.data.currentCount,
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
      notes: parsed.data.notes || null,
      updatedByUserId: user.id,
      ...signOffData,
      ...adminOverrideData,
      ...clearedCompletionData
    },
    include: {
      requirement: true
    }
  });

  response.json({ progress });
}));

studentRouter.post("/:studentId/requirements/backfill", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can backfill band requirements." });
    return;
  }

  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      clubMemberships: {
        include: {
          club: {
            include: { centre: true }
          }
        }
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot backfill this member's requirements." });
    return;
  }

  const selectedProgramLevel = getStudentProgramLevel(student);

  if (!selectedProgramLevel) {
    response.status(400).json({ message: programLevelWarning });
    return;
  }

  const currentBandOrder = getBandOrder(student.bandLevel);

  if (!currentBandOrder) {
    response.status(400).json({ message: "Choose a valid current band level before backfilling requirements." });
    return;
  }

  const requirements = await prisma.bandRequirement.findMany({
    where: {
      programLevel: selectedProgramLevel,
      isActive: true,
      bandOrder: { lt: currentBandOrder }
    }
  });

  const completedAt = new Date();
  const progressData = requirements.map((requirement) => ({
    studentId,
    requirementId: requirement.id,
    currentCount: requirement.targetCount,
    isCompleted: true,
    completedAt,
    notes: "Backfilled based on current band level",
    updatedByUserId: user.id,
    facilitatorSignedOffByUserId: user.role === Role.FACILITATOR ? user.id : null,
    facilitatorSignedOffAt: user.role === Role.FACILITATOR ? completedAt : null,
    adminOverrideByUserId: user.role === Role.ADMIN ? user.id : null,
    adminOverrideAt: user.role === Role.ADMIN ? completedAt : null
  }));

  if (progressData.length > 0) {
    await prisma.$transaction(progressData.map((entry) => prisma.studentRequirementProgress.upsert({
      where: {
        studentId_requirementId: {
          studentId: entry.studentId,
          requirementId: entry.requirementId
        }
      },
      update: {
        currentCount: entry.currentCount,
        isCompleted: entry.isCompleted,
        completedAt: entry.completedAt,
        notes: entry.notes,
        updatedByUserId: entry.updatedByUserId,
        facilitatorSignedOffByUserId: entry.facilitatorSignedOffByUserId,
        facilitatorSignedOffAt: entry.facilitatorSignedOffAt,
        adminOverrideByUserId: entry.adminOverrideByUserId,
        adminOverrideAt: entry.adminOverrideAt
      },
      create: entry
    })));
  }

  response.json({ updatedCount: progressData.length });
}));

studentRouter.patch("/:studentId/profile", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can update member band placement." });
    return;
  }

  const parsed = profileSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Choose a valid program level and current band level." });
    return;
  }

  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: memberUserSelect },
      clubMemberships: {
        include: {
          club: {
            include: { centre: true }
          }
        }
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot update this member's band placement." });
    return;
  }

  const updatedStudent = await prisma.student.update({
    where: { id: student.id },
    data: {
      programLevel: parsed.data.programLevel,
      bandLevel: parsed.data.bandLevel
    },
    include: {
      user: { select: memberUserSelect },
      clubMemberships: {
        include: {
          club: {
            include: { centre: true }
          }
        }
      }
    }
  });
  const selectedProgramLevel = getStudentProgramLevel(updatedStudent);

  response.json({
    student: updatedStudent,
    feedback: [],
    memberFeedback: [],
    requirements: await buildRequirementProgress(updatedStudent.id, selectedProgramLevel),
    summary: {
      bandLevel: updatedStudent.bandLevel,
      programLevel: selectedProgramLevel,
      programLevelWarning: selectedProgramLevel ? null : programLevelWarning,
      clubName: formatClubNames(updatedStudent.clubMemberships),
      centreName: formatCentreNames(updatedStudent.clubMemberships),
      attendanceRate: null,
      totalMeetingsMarked: 0,
      rolesCompleted: 0,
      scoredRoles: 0,
      averageScore: null
    }
  });
}));

studentRouter.get("/:studentId/progress", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can view managed member progress." });
    return;
  }

  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: memberUserSelect },
      clubMemberships: {
        include: {
          club: {
            include: { centre: true }
          }
        }
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot view this member's requirements." });
    return;
  }

  const selectedProgramLevel = getStudentProgramLevel(student);

  response.json({
    student,
    feedback: [],
    memberFeedback: [],
    requirements: await buildRequirementProgress(student.id, selectedProgramLevel),
    summary: {
      bandLevel: student.bandLevel,
      programLevel: selectedProgramLevel,
      programLevelWarning: selectedProgramLevel ? null : programLevelWarning,
      clubName: formatClubNames(student.clubMemberships),
      centreName: formatCentreNames(student.clubMemberships),
      attendanceRate: null,
      totalMeetingsMarked: 0,
      rolesCompleted: 0,
      scoredRoles: 0,
      averageScore: null
    }
  });
}));

async function buildRequirementProgress(studentId: string, programLevel: ProgramLevel | null) {
  if (!programLevel) {
    return [];
  }

  const requirements = await prisma.bandRequirement.findMany({
    where: {
      programLevel,
      isActive: true,
    },
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

function getBandOrder(bandLevel: string) {
  const index = bandLevels.findIndex((level) => level === bandLevel);

  return index === -1 ? null : index + 1;
}

async function canFacilitatorAccessStudent(facilitatorId: string, studentId: string) {
  const memberships = await prisma.studentClubMembership.findMany({
    where: {
      studentId,
      status: "ACTIVE"
    },
    select: {
      clubId: true,
      club: {
        select: { centreId: true }
      }
    }
  });
  const clubIds = memberships.map((membership) => membership.clubId);
  const centreIds = memberships.map((membership) => membership.club.centreId);

  if (clubIds.length === 0) {
    return false;
  }

  const [clubAssignment, centreAssignment] = await Promise.all([
    prisma.clubFacilitator.findFirst({
      where: {
        facilitatorId,
        clubId: { in: clubIds }
      }
    }),
    prisma.centreFacilitator.findFirst({
      where: {
        facilitatorId,
        centreId: { in: centreIds }
      }
    })
  ]);

  return Boolean(clubAssignment || centreAssignment);
}

export function canManageBandRequirementDefinitions(role: Role) {
  return role === Role.ADMIN;
}

function formatClubNames(memberships: Array<{ club: { name: string } }>) {
  return memberships.length ? memberships.map((membership) => membership.club.name).join(", ") : "No club assigned";
}

function formatCentreNames(memberships: Array<{ club: { centre: { name: string } } }>) {
  const centreNames = [...new Set(memberships.map((membership) => membership.club.centre.name))];

  return centreNames.length ? centreNames.join(", ") : "No centre assigned";
}
