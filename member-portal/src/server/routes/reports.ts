import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { publicUserSelect } from "../services/safeUser.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

reportsRouter.get("/facilitator-feedback", asyncRoute(async (request, response) => {
  const user = request.user!;
  const where = await feedbackVisibilityFilter(user.id, user.role);

  if (where === false) {
    response.status(403).json({ message: "You do not have permission to view feedback reports." });
    return;
  }

  const scores = await prisma.studentMeetingFeedback.findMany({
    where,
    orderBy: [
      { meeting: { meetingDate: "desc" } },
      { scoredAt: "desc" }
    ],
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
      },
      student: {
        include: {
          user: { select: publicUserSelect }
        }
      }
    }
  });

  const scorerIds = [...new Set(scores.map((score) => score.scoredByUserId).filter(Boolean))] as string[];
  const scorers = scorerIds.length
    ? await prisma.user.findMany({
      where: { id: { in: scorerIds } },
      select: publicUserSelect
    })
    : [];
  const scorerById = new Map(scorers.map((scorer) => [scorer.id, scorer]));

  response.json({
    feedback: scores.map((score) => {
      const scorer = score.scoredByUserId ? scorerById.get(score.scoredByUserId) : null;

      return {
        id: score.id,
        studentName: `${score.student.user.firstName} ${score.student.user.lastName}`,
        clubName: score.meeting.club.name,
        meetingTitle: score.meeting.title,
        meetingDate: score.meeting.meetingDate,
        roleName: roleNamesForFeedback(score).join(", ") || "General meeting feedback",
        score: score.score,
        feedback: score.feedback,
        evaluatorName: scorer ? `${scorer.firstName} ${scorer.lastName}` : "Not recorded",
        evaluatorRole: scorer?.role ?? null,
        scoredAt: score.scoredAt
      };
    })
  });
}));

type FeedbackWithMeetingRoles = Awaited<ReturnType<typeof prisma.studentMeetingFeedback.findMany>>[number] & {
  roleSlotId: string | null;
  studentId: string;
  meeting: {
    roleSlots: Array<{
      id: string;
      assignedStudentId: string | null;
      slotLabel: string;
      roleDefinition: { name: string };
    }>;
  };
};

function roleNamesForFeedback(score: FeedbackWithMeetingRoles) {
  const relatedRole = score.roleSlotId
    ? score.meeting.roleSlots.find((slot) => slot.id === score.roleSlotId)
    : null;

  if (relatedRole) {
    return [relatedRole.slotLabel || relatedRole.roleDefinition.name];
  }

  return score.meeting.roleSlots
    .filter((slot) => slot.assignedStudentId === score.studentId)
    .map((slot) => slot.slotLabel || slot.roleDefinition.name);
}

async function feedbackVisibilityFilter(userId: string, role: Role) {
  if (role === Role.ADMIN) {
    return {};
  }

  if (role === Role.FACILITATOR) {
    const clubIds = await getFacilitatorClubIds(userId);

    return {
      meeting: {
        clubId: { in: clubIds }
      }
    };
  }

  if (role === Role.STUDENT) {
    return {
      student: {
        userId
      }
    };
  }

  return false;
}

async function getFacilitatorClubIds(facilitatorId: string) {
  const clubAssignments = await prisma.clubFacilitator.findMany({
    where: {
      facilitatorId,
      club: {
        isActive: true,
        centre: { isActive: true }
      }
    },
    select: { clubId: true }
  });

  return clubAssignments.map((assignment) => assignment.clubId);
}
