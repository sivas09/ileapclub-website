import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { agendaFileName, buildAgendaRtf } from "../services/agenda.js";
import { standardIleapRoleNames } from "../services/standardRoles.js";

const createMeetingSchema = z.object({
  clubId: z.string().min(1),
  title: z.string().trim().min(2),
  templateType: z.string().trim().optional(),
  meetingDate: z.string().min(10),
  startTime: z.string().trim().optional(),
  location: z.string().trim().optional()
});

const updateMeetingSchema = createMeetingSchema.partial();

const bulkMeetingSchema = z.object({
  clubId: z.string().min(1),
  titlePrefix: z.string().trim().min(2),
  templateType: z.string().trim().min(2),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().trim().min(1),
  location: z.string().trim().optional()
});

const assignRoleSchema = z.object({
  studentId: z.string().nullable().optional()
});

const roleSlotSchema = z.object({
  roleDefinitionId: z.string().min(1),
  slotLabel: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().min(1).optional()
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

const studentFeedbackSchema = scoreSchema.extend({
  studentId: z.string().min(1),
  roleSlotId: z.string().nullable().optional()
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
      where: {
        club: {
          isActive: true,
          centre: { isActive: true }
        },
        ...(clubFilter ? { clubId: { in: clubFilter } } : {})
      },
      orderBy: [{ meetingDate: "asc" }, { startTime: "asc" }],
      include: meetingInclude
    }),
    prisma.roleDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    }),
    prisma.club.findMany({
      where: {
        isActive: true,
        centre: { isActive: true },
        ...(clubFilter ? { id: { in: clubFilter } } : {})
      },
      orderBy: { name: "asc" },
      include: { centre: true }
    }),
    prisma.student.findMany({
      where: clubFilter ? {
        clubMemberships: {
          some: {
            clubId: { in: clubFilter },
            status: "ACTIVE",
            club: {
              isActive: true,
              centre: { isActive: true }
            }
          }
        }
      } : {},
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
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
    })
  ]);

  response.json({
    meetings: sanitizeMeetingsForUser(meetings, user.id, user.role),
    roleDefinitions,
    clubs,
    students
  });
}));

meetingsRouter.post("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can create meetings." });
    return;
  }

  const parsed = createMeetingSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter meeting details." });
    return;
  }

  const data = parsed.data;
  const canManageClub = await canManageClubId(user.id, user.role, data.clubId);

  if (!canManageClub) {
    response.status(403).json({ message: "You cannot create meetings for this club." });
    return;
  }

  if (!(await isActiveClub(data.clubId))) {
    response.status(400).json({ message: "Choose an active club before creating a meeting." });
    return;
  }

  const roleDefinitions = await getStandardRoleDefinitions();

  if (roleDefinitions.length !== standardIleapRoleNames.length) {
    response.status(400).json({ message: "Standard iLEAP roles are not fully configured. Run the database seed first." });
    return;
  }

  const meeting = await prisma.$transaction(async (tx) => {
    const createdMeeting = await tx.meeting.create({
      data: {
        clubId: data.clubId,
        title: data.title,
        templateType: data.templateType || "Regular Meeting",
        meetingDate: new Date(`${data.meetingDate}T00:00:00.000Z`),
        startTime: data.startTime || "",
        location: data.location || null
      }
    });

    await tx.meetingRoleSlot.createMany({
      data: roleDefinitions.map((roleDefinition, index) => ({
        meetingId: createdMeeting.id,
        roleDefinitionId: roleDefinition.id,
        slotLabel: roleDefinition.name,
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

meetingsRouter.post("/bulk", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can generate meetings." });
    return;
  }

  const parsed = bulkMeetingSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter term dates, meeting day, and time." });
    return;
  }

  const data = parsed.data;
  const canManageClub = await canManageClubId(user.id, user.role, data.clubId);

  if (!canManageClub) {
    response.status(403).json({ message: "You cannot generate meetings for this club." });
    return;
  }

  if (!(await isActiveClub(data.clubId))) {
    response.status(400).json({ message: "Choose an active club before generating meetings." });
    return;
  }

  const meetingDates = getMeetingDates(data.startDate, data.endDate, data.dayOfWeek);

  if (meetingDates.length === 0) {
    response.status(400).json({ message: "No matching meeting dates were found in this term range." });
    return;
  }

  if (meetingDates.length > 40) {
    response.status(400).json({ message: "Generate 40 or fewer meetings at a time." });
    return;
  }

  const roleDefinitions = await getStandardRoleDefinitions();

  if (roleDefinitions.length !== standardIleapRoleNames.length) {
    response.status(400).json({ message: "Standard iLEAP roles are not fully configured. Run the database seed first." });
    return;
  }

  const meetings = await prisma.$transaction(async (tx) => {
    const createdMeetings = [];

    for (const [index, meetingDate] of meetingDates.entries()) {
      const createdMeeting = await tx.meeting.create({
        data: {
          clubId: data.clubId,
          title: `${data.titlePrefix} ${index + 1}`,
          templateType: data.templateType,
          meetingDate,
          startTime: data.startTime,
          location: data.location || null
        }
      });

      await tx.meetingRoleSlot.createMany({
        data: roleDefinitions.map((roleDefinition, roleIndex) => ({
          meetingId: createdMeeting.id,
          roleDefinitionId: roleDefinition.id,
          slotLabel: roleDefinition.name,
          sortOrder: roleIndex + 1
        }))
      });

      createdMeetings.push(await tx.meeting.findUniqueOrThrow({
        where: { id: createdMeeting.id },
        include: meetingInclude
      }));
    }

    return createdMeetings;
  });

  response.status(201).json({ meetings });
}));

meetingsRouter.patch("/:meetingId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can edit meetings." });
    return;
  }

  const parsed = updateMeetingSchema.safeParse(request.body);

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ message: "Enter meeting changes." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  if (!(await canManageClubId(user.id, user.role, meeting.clubId))) {
    response.status(403).json({ message: "You cannot edit this meeting." });
    return;
  }

  const targetClubId = parsed.data.clubId ?? meeting.clubId;

  if (targetClubId !== meeting.clubId && !(await canManageClubId(user.id, user.role, targetClubId))) {
    response.status(403).json({ message: "You cannot move this meeting to that club." });
    return;
  }

  if (!(await isActiveClub(targetClubId))) {
    response.status(400).json({ message: "Choose an active club before saving this meeting." });
    return;
  }

  const updatedMeeting = await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      clubId: targetClubId,
      title: parsed.data.title,
      templateType: parsed.data.templateType === undefined ? undefined : parsed.data.templateType || "Regular Meeting",
      meetingDate: parsed.data.meetingDate ? new Date(`${parsed.data.meetingDate}T00:00:00.000Z`) : undefined,
      startTime: parsed.data.startTime === undefined ? undefined : parsed.data.startTime || "",
      location: parsed.data.location === undefined ? undefined : parsed.data.location || null
    },
    include: meetingInclude
  });

  response.json({ meeting: updatedMeeting });
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

meetingsRouter.post("/:meetingId/slots", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can add role slots." });
    return;
  }

  const parsed = roleSlotSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Choose a valid role slot to add." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  if (!(await canManageClubId(user.id, user.role, meeting.clubId))) {
    response.status(403).json({ message: "You cannot manage roles for this meeting." });
    return;
  }

  const roleDefinition = await prisma.roleDefinition.findFirst({
    where: {
      id: parsed.data.roleDefinitionId,
      isActive: true
    }
  });

  if (!roleDefinition) {
    response.status(400).json({ message: "Choose an active role definition." });
    return;
  }

  const nextSortOrder = parsed.data.sortOrder ?? await getNextRoleSlotSortOrder(meetingId);

  try {
    await prisma.meetingRoleSlot.create({
      data: {
        meetingId,
        roleDefinitionId: roleDefinition.id,
        slotLabel: parsed.data.slotLabel || roleDefinition.name,
        sortOrder: nextSortOrder
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ message: "Choose a role slot order that is not already used in this meeting." });
      return;
    }

    throw error;
  }

  const updatedMeeting = await getMeeting(meetingId);
  response.status(201).json({ meeting: updatedMeeting });
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

  if (!(await isStudentInClub(student.id, slot.meeting.clubId))) {
    response.status(403).json({ message: "You can only claim roles in your club." });
    return;
  }

  if (slot.assignedStudentId && slot.assignedStudentId !== student.id) {
    response.status(409).json({ message: "This role has already been claimed." });
    return;
  }

  if (slot.assignedStudentId === student.id) {
    const meeting = await getMeeting(meetingId);
    response.json({ meeting });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const claimedRoleCount = await tx.meetingRoleSlot.count({
      where: {
        meetingId,
        assignedStudentId: student.id
      }
    });

    if (claimedRoleCount >= 2) {
      return null;
    }

    return tx.meetingRoleSlot.updateMany({
      where: {
        id: slot.id,
        assignedStudentId: null
      },
      data: {
        assignedStudentId: student.id,
        assignedByUserId: user.id,
        assignedAt: new Date()
      }
    });
  });

  if (!updated) {
    response.status(409).json({ message: "You can claim a maximum of 2 roles for this meeting." });
    return;
  }

  if (updated.count === 0) {
    response.status(409).json({ message: "This role has already been claimed." });
    return;
  }

  const meeting = await getMeeting(meetingId);
  response.json({ meeting });
}));

meetingsRouter.patch("/:meetingId/slots/:slotId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can edit role slots." });
    return;
  }

  const parsed = roleSlotSchema.partial().safeParse(request.body);

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ message: "Enter role slot changes." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const slotId = String(request.params.slotId);
  const slot = await prisma.meetingRoleSlot.findUnique({
    where: { id: slotId },
    include: { meeting: true, roleDefinition: true }
  });

  if (!slot || slot.meetingId !== meetingId) {
    response.status(404).json({ message: "Role slot not found." });
    return;
  }

  if (!(await canManageClubId(user.id, user.role, slot.meeting.clubId))) {
    response.status(403).json({ message: "You cannot manage roles for this meeting." });
    return;
  }

  const roleDefinition = parsed.data.roleDefinitionId
    ? await prisma.roleDefinition.findFirst({
      where: {
        id: parsed.data.roleDefinitionId,
        isActive: true
      }
    })
    : null;

  if (parsed.data.roleDefinitionId && !roleDefinition) {
    response.status(400).json({ message: "Choose an active role definition." });
    return;
  }

  try {
    await prisma.meetingRoleSlot.update({
      where: { id: slot.id },
      data: {
        roleDefinitionId: roleDefinition?.id,
        slotLabel: parsed.data.slotLabel || roleDefinition?.name || undefined,
        sortOrder: parsed.data.sortOrder
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ message: "Choose a role slot order that is not already used in this meeting." });
      return;
    }

    throw error;
  }

  const updatedMeeting = await getMeeting(meetingId);
  response.json({ meeting: updatedMeeting });
}));

meetingsRouter.delete("/:meetingId/slots/:slotId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can remove role slots." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const slotId = String(request.params.slotId);
  const slot = await prisma.meetingRoleSlot.findUnique({
    where: { id: slotId },
    include: { meeting: true, score: true }
  });

  if (!slot || slot.meetingId !== meetingId) {
    response.status(404).json({ message: "Role slot not found." });
    return;
  }

  if (!(await canManageClubId(user.id, user.role, slot.meeting.clubId))) {
    response.status(403).json({ message: "You cannot manage roles for this meeting." });
    return;
  }

  if (slot.assignedStudentId || slot.score) {
    response.status(409).json({ message: "Clear the assignment and score before removing this role slot." });
    return;
  }

  await prisma.meetingRoleSlot.delete({ where: { id: slot.id } });

  const updatedMeeting = await getMeeting(meetingId);
  response.json({ meeting: updatedMeeting });
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

    if (!student || !(await isStudentInClub(student.id, slot.meeting.clubId))) {
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

  if (!student || !(await isStudentInClub(student.id, meeting.clubId))) {
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

  if (!(await isStudentInClub(slot.assignedStudentId, slot.meeting.clubId))) {
    response.status(400).json({ message: "The assigned student is no longer active in this club." });
    return;
  }

  await prisma.meetingRoleScore.upsert({
    where: { roleSlotId: slot.id },
    update: {
      studentId: slot.assignedStudentId,
      meetingId,
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

meetingsRouter.put("/:meetingId/student-feedback", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can save student feedback." });
    return;
  }

  const parsed = studentFeedbackSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Choose a student and enter a score between 0 and 100." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  if (!(await canManageClubId(user.id, user.role, meeting.clubId))) {
    response.status(403).json({ message: "You cannot save feedback for this meeting." });
    return;
  }

  const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });

  if (!student || !(await isStudentInClub(student.id, meeting.clubId))) {
    response.status(400).json({ message: "Choose a student assigned to this club." });
    return;
  }

  if (parsed.data.roleSlotId) {
    const roleSlot = await prisma.meetingRoleSlot.findUnique({ where: { id: parsed.data.roleSlotId } });

    if (!roleSlot || roleSlot.meetingId !== meetingId || roleSlot.assignedStudentId !== student.id) {
      response.status(400).json({ message: "Choose one of this student's assigned roles for this meeting." });
      return;
    }
  }

  await prisma.studentMeetingFeedback.upsert({
    where: {
      meetingId_studentId: {
        meetingId,
        studentId: student.id
      }
    },
    update: {
      roleSlotId: parsed.data.roleSlotId || null,
      score: parsed.data.score,
      feedback: parsed.data.feedback || null,
      scoredByUserId: user.id,
      scoredAt: new Date()
    },
    create: {
      meetingId,
      studentId: student.id,
      roleSlotId: parsed.data.roleSlotId || null,
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
  roleScores: true,
  studentFeedbacks: {
    include: {
      student: {
        include: { user: true }
      }
    }
  }
} satisfies Prisma.MeetingInclude;

async function getMeeting(meetingId: string) {
  return prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: meetingInclude
  });
}

function sanitizeMeetingsForUser<T extends Array<Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>>>(
  meetings: T,
  userId: string,
  role: Role
) {
  if (role !== Role.STUDENT) {
    return meetings;
  }

  return meetings.map((meeting) => ({
    ...meeting,
    roleSlots: meeting.roleSlots.map((slot) => ({
      ...slot,
      score: slot.assignedStudent?.user.id === userId ? slot.score : null
    })),
    roleScores: meeting.roleScores.filter((score) => {
      const slot = meeting.roleSlots.find((candidate) => candidate.id === score.roleSlotId);

      return slot?.assignedStudent?.user.id === userId;
    }),
    studentFeedbacks: meeting.studentFeedbacks.filter((feedback) => feedback.student.user.id === userId)
  }));
}

async function getNextRoleSlotSortOrder(meetingId: string) {
  const lastSlot = await prisma.meetingRoleSlot.findFirst({
    where: { meetingId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });

  return (lastSlot?.sortOrder ?? 0) + 1;
}

async function getVisibleClubFilter(userId: string, role: Role) {
  if (role === Role.ADMIN) {
    return null;
  }

  if (role === Role.FACILITATOR) {
    const clubAssignments = await prisma.clubFacilitator.findMany({
      where: {
        facilitatorId: userId,
        club: {
          isActive: true,
          centre: { isActive: true }
        }
      },
      select: { clubId: true }
    });

    return clubAssignments.map((assignment) => assignment.clubId);
  }

  if (role === Role.STUDENT) {
    const memberships = await prisma.studentClubMembership.findMany({
      where: {
        student: { userId },
        status: "ACTIVE",
        club: {
          isActive: true,
          centre: { isActive: true }
        }
      },
      select: { clubId: true }
    });
    return memberships.map((membership) => membership.clubId);
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

  const clubAssignment = await prisma.clubFacilitator.findFirst({
    where: {
      clubId,
      facilitatorId: userId,
      club: {
        isActive: true,
        centre: { isActive: true }
      }
    }
  });

  return Boolean(clubAssignment);
}

async function isStudentInClub(studentId: string, clubId: string) {
  const membership = await prisma.studentClubMembership.findUnique({
    where: {
      studentId_clubId: {
        studentId,
        clubId
      }
    },
    include: {
      club: {
        include: { centre: true }
      }
    }
  });

  return membership?.status === "ACTIVE" && membership.club.isActive && membership.club.centre.isActive;
}

async function isActiveClub(clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      isActive: true,
      centre: {
        select: { isActive: true }
      }
    }
  });

  return Boolean(club?.isActive && club.centre.isActive);
}

async function canViewMeeting(userId: string, role: Role, clubId: string) {
  if (role === Role.ADMIN) {
    return true;
  }

  if (role === Role.FACILITATOR) {
    return canManageClubId(userId, role, clubId);
  }

  if (role === Role.STUDENT) {
    const student = await prisma.student.findUnique({ where: { userId } });

    return student ? isStudentInClub(student.id, clubId) : false;
  }

  return false;
}

function getMeetingDates(startDate: string, endDate: string, dayOfWeek: number) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates: Date[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    if (cursor.getUTCDay() === dayOfWeek) {
      dates.push(new Date(cursor));
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function getStandardRoleDefinitions() {
  const roles = await prisma.roleDefinition.findMany({
    where: {
      name: { in: standardIleapRoleNames },
      isActive: true
    },
    select: { id: true, name: true }
  });
  const roleByName = new Map(roles.map((role) => [role.name, role]));

  return standardIleapRoleNames.flatMap((roleName) => {
    const role = roleByName.get(roleName);

    return role ? [role] : [];
  });
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
