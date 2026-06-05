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
      club: {
        include: {
          centre: true
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
          meeting: true,
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

  response.json({
    student,
    requirements: await buildRequirementProgress(student.id, student.bandLevel),
    summary: {
      bandLevel: student.bandLevel,
      clubName: student.club?.name ?? "No club assigned",
      centreName: student.club?.centre.name ?? "No centre assigned",
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
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.bandRequirement.findUnique({ where: { id: requirementId } })
  ]);

  if (!student || !requirement) {
    response.status(404).json({ message: "Student or requirement not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && student.clubId) {
    const assignment = await prisma.clubFacilitator.findUnique({
      where: {
        clubId_facilitatorId: {
          clubId: student.clubId,
          facilitatorId: user.id
        }
      }
    });

    if (!assignment) {
      response.status(403).json({ message: "You cannot update this student's requirements." });
      return;
    }
  }

  const isCompleted = parsed.data.isCompleted ?? parsed.data.currentCount >= requirement.targetCount;

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
      updatedByUserId: user.id
    },
    create: {
      studentId,
      requirementId,
      currentCount: parsed.data.currentCount,
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
      notes: parsed.data.notes || null,
      updatedByUserId: user.id
    },
    include: {
      requirement: true
    }
  });

  response.json({ progress });
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
      club: { include: { centre: true } }
    }
  });

  if (!student) {
    response.status(404).json({ message: "Student not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && student.clubId) {
    const assignment = await prisma.clubFacilitator.findUnique({
      where: {
        clubId_facilitatorId: {
          clubId: student.clubId,
          facilitatorId: user.id
        }
      }
    });

    if (!assignment) {
      response.status(403).json({ message: "You cannot view this student's requirements." });
      return;
    }
  }

  response.json({
    student,
    requirements: await buildRequirementProgress(student.id, student.bandLevel),
    summary: {
      bandLevel: student.bandLevel,
      clubName: student.club?.name ?? "No club assigned",
      centreName: student.club?.centre.name ?? "No centre assigned",
      attendanceRate: null,
      totalMeetingsMarked: 0,
      rolesCompleted: 0,
      scoredRoles: 0,
      averageScore: null
    }
  });
}));

async function buildRequirementProgress(studentId: string, bandLevel: string) {
  const requirements = await prisma.bandRequirement.findMany({
    where: {
      isActive: true,
      OR: [
        { bandLevel },
        { bandLevel: "White" }
      ]
    },
    orderBy: [{ bandLevel: "asc" }, { sortOrder: "asc" }]
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
      notes: entry?.notes ?? null
    };
  });
}
