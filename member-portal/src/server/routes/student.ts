import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";

export const studentRouter = Router();

studentRouter.use(requireAuth);

const progressSchema = z.object({
  currentCount: z.coerce.number().int().min(0),
  isCompleted: z.boolean().optional(),
  notes: z.string().trim().optional()
});

const profileSchema = z.object({
  programLevel: z.enum(["JUNIOR", "SENIOR"]),
  bandLevel: z.enum([
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
  ])
});

type StudentWithClubs = {
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

type ProgramLevel = "JUNIOR" | "SENIOR";

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
      requirementProgress: {
        include: {
          requirement: true
        }
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Student profile not found." });
    return;
  }

  const totalAttendance = student.attendance.length;
  const presentCount = student.attendance.filter((entry) => entry.status === "PRESENT" || entry.status === "LATE").length;
  const scoredRoles = student.roleScores.length;
  const averageScore = scoredRoles
    ? Math.round(student.roleScores.reduce((sum, entry) => sum + entry.score, 0) / scoredRoles)
    : null;
  const scorerIds = [...new Set(student.roleScores.map((score) => score.scoredByUserId).filter(Boolean))] as string[];
  const scorers = scorerIds.length
    ? await prisma.user.findMany({
      where: { id: { in: scorerIds } },
      select: { id: true, firstName: true, lastName: true, role: true }
    })
    : [];
  const scorerById = new Map(scorers.map((scorer) => [scorer.id, scorer]));
  const selectedProgramLevel = getStudentProgramLevel(student);

  response.json({
    student,
    feedback: student.roleScores.map((score) => {
      const scorer = score.scoredByUserId ? scorerById.get(score.scoredByUserId) : null;
      const attendance = student.attendance.find((entry) => entry.meetingId === score.meetingId);

      return {
        id: score.id,
        meetingDate: score.meeting.meetingDate,
        meetingTitle: score.meeting.title,
        clubName: score.meeting.club.name,
        roleName: score.roleSlot.slotLabel || score.roleSlot.roleDefinition.name,
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
      scoredRoles,
      averageScore
    }
  });
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
    response.status(404).json({ message: "Student or requirement not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot update this student's requirements." });
    return;
  }

  const selectedProgramLevel = getStudentProgramLevel(student);

  if (!selectedProgramLevel || requirement.programLevel !== selectedProgramLevel) {
    response.status(400).json({ message: "Choose a requirement from this student's program ladder." });
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
      ...adminOverrideData
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
      ...adminOverrideData
    },
    include: {
      requirement: true
    }
  });

  response.json({ progress });
}));

studentRouter.patch("/:studentId/profile", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can update student band placement." });
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
      user: true,
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
    response.status(404).json({ message: "Student not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot update this student's band placement." });
    return;
  }

  const updatedStudent = await prisma.student.update({
    where: { id: student.id },
    data: {
      programLevel: parsed.data.programLevel,
      bandLevel: parsed.data.bandLevel
    },
    include: {
      user: true,
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
    response.status(403).json({ message: "Only admins and facilitators can view managed student progress." });
    return;
  }

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
      }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Student not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot view this student's requirements." });
    return;
  }

  const selectedProgramLevel = getStudentProgramLevel(student);

  response.json({
    student,
    feedback: [],
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

function formatClubNames(memberships: Array<{ club: { name: string } }>) {
  return memberships.length ? memberships.map((membership) => membership.club.name).join(", ") : "No club assigned";
}

function formatCentreNames(memberships: Array<{ club: { centre: { name: string } } }>) {
  const centreNames = [...new Set(memberships.map((membership) => membership.club.centre.name))];

  return centreNames.length ? centreNames.join(", ") : "No centre assigned";
}
