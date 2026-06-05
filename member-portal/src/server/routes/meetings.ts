import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { agendaFileName, buildAgendaRtf } from "../services/agenda.js";

const createMeetingSchema = z.object({
  clubId: z.string().min(1),
  title: z.string().trim().min(2),
  templateType: z.string().trim().min(2),
  meetingDate: z.string().min(10),
  startTime: z.string().trim().min(1),
  location: z.string().trim().optional(),
  roleDefinitionIds: z.array(z.string()).min(1)
});

const assignRoleSchema = z.object({
  studentId: z.string().nullable().optional()
});

const attendanceSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  notes: z.string().trim().optional()
});

const scoreSchema = z.object({
  score: z.coerce.number().int().min(0).max(100),
  feedback: z.string().trim().optional()
});

export const meetingsRouter = Router();

meetingsRouter.use(requireAuth);

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

meetingsRouter.get("/", asyncRoute(async (request, response) => {
  const user = request.user!;
  const clubFilter = await getVisibleClubFilter(user.id, user.role);

  const [meetings, roleDefinitions, clubs, students] = await Promise.all([
    prisma.meeting.findMany({
      where: clubFilter ? { clubId: { in: clubFilter } } : {},
      orderBy: [{ meetingDate: "asc" }, { startTime: "asc" }],
      include: meetingInclude
    }),
    prisma.roleDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    }),
    prisma.club.findMany({
      where: clubFilter ? { id: { in: clubFilter } } : {},
      orderBy: { name: "asc" },
      include: { centre: true }
    }),
    prisma.student.findMany({
      where: clubFilter ? { clubId: { in: clubFilter } } : {},
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      include: { user: true, club: true }
    })
  ]);

  response.json({ meetings, roleDefinitions, clubs, students });
}));

meetingsRouter.post("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can create meetings." });
    return;
  }

  const parsed = createMeetingSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter meeting details and choose at least one role." });
    return;
  }

  const data = parsed.data;
  const canManageClub = await canManageClubId(user.id, user.role, data.clubId);

  if (!canManageClub) {
    response.status(403).json({ message: "You cannot create meetings for this club." });
    return;
  }

  const meeting = await prisma.$transaction(async (tx) => {
    const createdMeeting = await tx.meeting.create({
      data: {
        clubId: data.clubId,
        title: data.title,
        templateType: data.templateType,
        meetingDate: new Date(`${data.meetingDate}T00:00:00.000Z`),
        startTime: data.startTime,
        location: data.location || null
      }
    });

    await tx.meetingRoleSlot.createMany({
      data: data.roleDefinitionIds.map((roleDefinitionId, index) => ({
        meetingId: createdMeeting.id,
        roleDefinitionId,
        slotLabel: `Role ${index + 1}`,
        sortOrder: index + 1
      }))
    });

    return tx.meeting.findUniqueOrThrow({
      where: { id: createdMeeting.id },
      include: meetingInclude
    });
  });

  response.status(201).json({ meeting });
}));

meetingsRouter.get("/:meetingId/agenda.rtf", asyncRoute(async (request, response) => {
  const user = request.user!;
  const meetingId = String(request.params.meetingId);
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: meetingInclude
  });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  const canView = await canViewMeeting(user.id, user.role, meeting.clubId);

  if (!canView) {
    response.status(403).json({ message: "You cannot download this meeting agenda." });
    return;
  }

  const rtf = buildAgendaRtf(meeting);

  response.setHeader("Content-Type", "application/rtf; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${agendaFileName(meeting)}"`);
  response.send(rtf);
}));

meetingsRouter.post("/:meetingId/slots/:slotId/claim", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.STUDENT) {
    response.status(403).json({ message: "Only students can self-claim roles." });
    return;
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.id }
  });

  if (!student) {
    response.status(404).json({ message: "Student profile not found." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const slotId = String(request.params.slotId);
  const slot = await prisma.meetingRoleSlot.findUnique({
    where: { id: slotId },
    include: { meeting: true }
  });

  if (!slot || slot.meetingId !== meetingId) {
    response.status(404).json({ message: "Role slot not found." });
    return;
  }

  if (slot.meeting.isRoleLocked) {
    response.status(409).json({ message: "Roles are locked for this meeting." });
    return;
  }

  if (slot.meeting.clubId !== student.clubId) {
    response.status(403).json({ message: "You can only claim roles in your club." });
    return;
  }

  if (slot.assignedStudentId && slot.assignedStudentId !== student.id) {
    response.status(409).json({ message: "This role has already been claimed." });
    return;
  }

  await prisma.meetingRoleSlot.update({
    where: { id: slot.id },
    data: {
      assignedStudentId: student.id,
      assignedByUserId: user.id,
      assignedAt: new Date()
    }
  });

  const meeting = await getMeeting(meetingId);
  response.json({ meeting });
}));

meetingsRouter.put("/:meetingId/slots/:slotId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can override role assignments." });
    return;
  }

  const parsed = assignRoleSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a valid student assignment." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const slotId = String(request.params.slotId);
  const slot = await prisma.meetingRoleSlot.findUnique({
    where: { id: slotId },
    include: { meeting: true }
  });

  if (!slot || slot.meetingId !== meetingId) {
    response.status(404).json({ message: "Role slot not found." });
    return;
  }

  const canManage = await canManageClubId(user.id, user.role, slot.meeting.clubId);

  if (!canManage) {
    response.status(403).json({ message: "You cannot manage roles for this meeting." });
    return;
  }

  if (parsed.data.studentId) {
    const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });

    if (!student || student.clubId !== slot.meeting.clubId) {
      response.status(400).json({ message: "Choose a student assigned to this club." });
      return;
    }
  }

  await prisma.meetingRoleSlot.update({
    where: { id: slot.id },
    data: {
      assignedStudentId: parsed.data.studentId || null,
      assignedByUserId: parsed.data.studentId ? user.id : null,
      assignedAt: parsed.data.studentId ? new Date() : null
    }
  });

  const meeting = await getMeeting(meetingId);
  response.json({ meeting });
}));

meetingsRouter.patch("/:meetingId/lock", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can lock roles." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  const canManage = await canManageClubId(user.id, user.role, meeting.clubId);

  if (!canManage) {
    response.status(403).json({ message: "You cannot manage this meeting." });
    return;
  }

  const updatedMeeting = await prisma.meeting.update({
    where: { id: meeting.id },
    data: { isRoleLocked: !meeting.isRoleLocked },
    include: meetingInclude
  });

  response.json({ meeting: updatedMeeting });
}));

meetingsRouter.put("/:meetingId/attendance", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can mark attendance." });
    return;
  }

  const parsed = attendanceSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Choose a student and attendance status." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  const canManage = await canManageClubId(user.id, user.role, meeting.clubId);

  if (!canManage) {
    response.status(403).json({ message: "You cannot mark attendance for this meeting." });
    return;
  }

  const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });

  if (!student || student.clubId !== meeting.clubId) {
    response.status(400).json({ message: "Choose a student assigned to this club." });
    return;
  }

  await prisma.meetingAttendance.upsert({
    where: {
      meetingId_studentId: {
        meetingId,
        studentId: student.id
      }
    },
    update: {
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      markedByUserId: user.id,
      markedAt: new Date()
    },
    create: {
      meetingId,
      studentId: student.id,
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      markedByUserId: user.id
    }
  });

  const updatedMeeting = await getMeeting(meetingId);
  response.json({ meeting: updatedMeeting });
}));

meetingsRouter.put("/:meetingId/slots/:slotId/score", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can score role performance." });
    return;
  }

  const parsed = scoreSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a score between 0 and 100." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const slotId = String(request.params.slotId);
  const slot = await prisma.meetingRoleSlot.findUnique({
    where: { id: slotId },
    include: { meeting: true }
  });

  if (!slot || slot.meetingId !== meetingId) {
    response.status(404).json({ message: "Role slot not found." });
    return;
  }

  const canManage = await canManageClubId(user.id, user.role, slot.meeting.clubId);

  if (!canManage) {
    response.status(403).json({ message: "You cannot score this meeting." });
    return;
  }

  if (!slot.assignedStudentId) {
    response.status(400).json({ message: "Assign a student before scoring this role." });
    return;
  }

  await prisma.meetingRoleScore.upsert({
    where: { roleSlotId: slot.id },
    update: {
      score: parsed.data.score,
      feedback: parsed.data.feedback || null,
      scoredByUserId: user.id,
      scoredAt: new Date()
    },
    create: {
      meetingId,
      roleSlotId: slot.id,
      studentId: slot.assignedStudentId,
      score: parsed.data.score,
      feedback: parsed.data.feedback || null,
      scoredByUserId: user.id
    }
  });

  const updatedMeeting = await getMeeting(meetingId);
  response.json({ meeting: updatedMeeting });
}));

const meetingInclude = {
  club: {
    include: { centre: true }
  },
  roleSlots: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      roleDefinition: true,
      assignedStudent: {
        include: { user: true }
      },
      score: true
    }
  },
  attendance: {
    include: {
      student: {
        include: { user: true }
      }
    }
  },
  roleScores: true
} satisfies Prisma.MeetingInclude;

async function getMeeting(meetingId: string) {
  return prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: meetingInclude
  });
}

async function getVisibleClubFilter(userId: string, role: Role) {
  if (role === Role.ADMIN) {
    return null;
  }

  if (role === Role.FACILITATOR) {
    const assignments = await prisma.clubFacilitator.findMany({
      where: { facilitatorId: userId },
      select: { clubId: true }
    });
    return assignments.map((assignment) => assignment.clubId);
  }

  if (role === Role.STUDENT) {
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { clubId: true }
    });
    return student?.clubId ? [student.clubId] : [];
  }

  return [];
}

async function canManageClubId(userId: string, role: Role, clubId: string) {
  if (role === Role.ADMIN) {
    return true;
  }

  if (role !== Role.FACILITATOR) {
    return false;
  }

  const assignment = await prisma.clubFacilitator.findUnique({
    where: {
      clubId_facilitatorId: {
        clubId,
        facilitatorId: userId
      }
    }
  });

  return Boolean(assignment);
}

async function canViewMeeting(userId: string, role: Role, clubId: string) {
  if (role === Role.ADMIN) {
    return true;
  }

  if (role === Role.FACILITATOR) {
    return canManageClubId(userId, role, clubId);
  }

  if (role === Role.STUDENT) {
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { clubId: true }
    });

    return student?.clubId === clubId;
  }

  if (role === Role.PARENT) {
    const childInClub = await prisma.studentParent.findFirst({
      where: {
        parentId: userId,
        student: { clubId }
      }
    });

    return Boolean(childInClub);
  }

  return false;
}
