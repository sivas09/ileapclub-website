import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";

export const studentRouter = Router();

studentRouter.use(requireAuth, requireRole([Role.STUDENT]));

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

studentRouter.get("/me/progress", asyncRoute(async (request, response) => {
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
