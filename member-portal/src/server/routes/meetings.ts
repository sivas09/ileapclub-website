import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { agendaFileName, buildAgendaRtf } from "../services/agenda.js";
import { standardIleapRoleNames } from "../services/standardRoles.js";
import {
  isReportRoleName,
  leadershipRoleKeys,
  reportRoleNameForMainRole
} from "../../shared/portalConstants.js";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDateOnly);

const createMeetingSchema = z.object({
  clubId: z.string().min(1),
  title: z.string().trim().min(2).max(160),
  templateType: z.string().trim().max(100).optional(),
  meetingDate: dateOnlySchema,
  startTime: z.string().trim().max(40).optional(),
  location: z.string().trim().max(500).optional()
});

const updateMeetingSchema = createMeetingSchema.partial();

const bulkMeetingSchema = z.object({
  clubId: z.string().min(1),
  titlePrefix: z.string().trim().min(2).max(140),
  templateType: z.string().trim().min(2).max(100),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().trim().min(1).max(40),
  location: z.string().trim().max(500).optional()
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

const maximumRolesPerStudentMeeting = 2;
const leadershipRoleKeySet = new Set(leadershipRoleKeys);

const roleDefinitionSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  category: z.string().trim().min(2).default("Speaking Role"),
  programLevel: z.string().trim().optional().nullable(),
  level: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().optional()
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
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
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
    students: user.role === Role.STUDENT ? [] : students
  });
}));

meetingsRouter.get("/role-definitions", asyncRoute(async (request, response) => {
  const user = request.user!;

  const roleDefinitions = await prisma.roleDefinition.findMany({
    where: user.role === Role.ADMIN ? {} : { isActive: true },
    orderBy: [{ programLevel: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
  });

  response.json({ roleDefinitions });
}));

meetingsRouter.post("/role-definitions", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageRoleDefinitions(user.role)) {
    response.status(403).json({ message: "Only admins can create role types." });
    return;
  }

  const parsed = roleDefinitionSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter role type details." });
    return;
  }

  try {
    const roleDefinition = await prisma.roleDefinition.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        category: parsed.data.category || "Speaking Role",
        programLevel: parsed.data.programLevel || null,
        level: parsed.data.level || null,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive ?? true
      }
    });

    response.status(201).json({ roleDefinition });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ message: "A role type with this name already exists." });
      return;
    }

    throw error;
  }
}));

meetingsRouter.patch("/role-definitions/:roleDefinitionId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageRoleDefinitions(user.role)) {
    response.status(403).json({ message: "Only admins can edit role types." });
    return;
  }

  const parsed = roleDefinitionSchema.partial().safeParse(request.body);

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ message: "Enter role type changes." });
    return;
  }

  const roleDefinitionId = String(request.params.roleDefinitionId);
  const existing = await prisma.roleDefinition.findUnique({ where: { id: roleDefinitionId } });

  if (!existing) {
    response.status(404).json({ message: "Role type not found." });
    return;
  }

  try {
    const roleDefinition = await prisma.roleDefinition.update({
      where: { id: existing.id },
      data: normalizeRoleDefinitionPayload(parsed.data)
    });

    response.json({ roleDefinition });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ message: "A role type with this name already exists." });
      return;
    }

    throw error;
  }
}));

meetingsRouter.delete("/role-definitions/:roleDefinitionId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageRoleDefinitions(user.role)) {
    response.status(403).json({ message: "Only admins can remove role types." });
    return;
  }

  const roleDefinitionId = String(request.params.roleDefinitionId);
  const existing = await prisma.roleDefinition.findUnique({
    where: { id: roleDefinitionId },
    include: { _count: { select: { meetingSlots: true } } }
  });

  if (!existing) {
    response.status(404).json({ message: "Role type not found." });
    return;
  }

  if (existing._count.meetingSlots > 0) {
    const roleDefinition = await prisma.roleDefinition.update({
      where: { id: existing.id },
      data: { isActive: false }
    });

    response.json({
      roleDefinition,
      deleted: false,
      archived: true,
      message: "Role type is used by existing meetings, so it was archived instead of deleted."
    });
    return;
  }

  const roleDefinition = await prisma.roleDefinition.delete({ where: { id: existing.id } });
  response.json({ roleDefinition, deleted: true, archived: false });
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
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { club: true }
  });

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

meetingsRouter.delete("/:meetingId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.ADMIN && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only admins and facilitators can delete meetings." });
    return;
  }

  const meetingId = String(request.params.meetingId);
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { club: true }
  });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  if (!(await canManageClubId(user.id, user.role, meeting.clubId))) {
    response.status(403).json({ message: "You cannot delete this meeting." });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.meetingRoleScore.deleteMany({ where: { meetingId } });
    await tx.studentMeetingFeedback.deleteMany({ where: { meetingId } });
    await tx.meetingAttendance.deleteMany({ where: { meetingId } });
    await tx.meetingRoleSlot.deleteMany({ where: { meetingId } });
    await tx.meeting.delete({ where: { id: meetingId } });
  });

  response.json({
    deletedMeeting: {
      id: meeting.id,
      title: meeting.title,
      meetingDate: meeting.meetingDate
    },
    message: "Meeting deleted successfully."
  });
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
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { club: true }
  });

  if (!meeting) {
    response.status(404).json({ message: "Meeting not found." });
    return;
  }

  if (!(await canManageClubId(user.id, user.role, meeting.clubId))) {
    response.status(403).json({ message: "You cannot manage roles for this meeting." });
    return;
  }

  const roleDefinition = await getAvailableRoleDefinitionForClub(parsed.data.roleDefinitionId, meeting.club.program);

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
    response.status(403).json({ message: "Only members can self-claim roles." });
    return;
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.id }
  });

  if (!student) {
    response.status(404).json({ message: "Member profile not found." });
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

  if (slot.meeting.isRoleLocked) {
    response.status(409).json({ message: "Roles are locked for this meeting." });
    return;
  }

  if (!(await isStudentInClub(student.id, slot.meeting.clubId))) {
    response.status(403).json({ message: "You can only claim roles in your club." });
    return;
  }

  if (isReportRoleSlot(slot)) {
    response.status(409).json({ message: "Report roles are assigned automatically with their matching main role." });
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
    const meetingSlots = await tx.meetingRoleSlot.findMany({
      where: { meetingId },
      include: { roleDefinition: true }
    });
    const claimedRoles = meetingSlots.filter((meetingSlot) => meetingSlot.assignedStudentId === student.id);

    const limitViolation = roleAssignmentLimitViolation(claimedRoles, slot);

    if (limitViolation) {
      return { error: limitViolation };
    }

    const updateResult = await tx.meetingRoleSlot.updateMany({
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

    if (updateResult.count > 0) {
      await syncPairedReportAssignment(tx, meetingSlots, slot, student.id, user.id);
    }

    return { updateResult };
  });

  if (updated.error) {
    response.status(409).json({ message: updated.error });
    return;
  }

  if (updated.updateResult?.count === 0) {
    response.status(409).json({ message: "This role has already been claimed." });
    return;
  }

  const meeting = await getMeeting(meetingId);
  response.json({ meeting });
}));

meetingsRouter.post("/:meetingId/slots/:slotId/release", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (user.role !== Role.STUDENT) {
    response.status(403).json({ message: "Only members can release their own role claims." });
    return;
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.id }
  });

  if (!student) {
    response.status(404).json({ message: "Member profile not found." });
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

  if (slot.meeting.isRoleLocked) {
    response.status(409).json({ message: "Roles are locked for this meeting." });
    return;
  }

  if (!(await isStudentInClub(student.id, slot.meeting.clubId))) {
    response.status(403).json({ message: "You can only release roles in your club." });
    return;
  }

  if (isReportRoleSlot(slot)) {
    response.status(409).json({ message: "Release the matching main role to clear its report role." });
    return;
  }

  if (!slot.assignedStudentId) {
    response.status(409).json({ message: "This role is already available." });
    return;
  }

  if (!canReleaseMeetingRole(user.role, slot.assignedStudentId === student.id)) {
    response.status(403).json({ message: "You can only release your own claimed role." });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const meetingSlots = await tx.meetingRoleSlot.findMany({
      where: { meetingId },
      include: { roleDefinition: true }
    });

    await setRoleAssignment(tx, slot.id, null, null);
    await syncPairedReportAssignment(tx, meetingSlots, slot, null, null);
  });

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
    include: {
      meeting: {
        include: { club: true }
      },
      roleDefinition: true
    }
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
    ? await getAvailableRoleDefinitionForClub(parsed.data.roleDefinitionId, slot.meeting.club.program)
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

  const feedbackCount = await prisma.studentMeetingFeedback.count({
    where: { roleSlotId: slot.id }
  });

  if (slot.assignedStudentId || slot.score || feedbackCount > 0) {
    response.status(409).json({ message: "Clear the assignment, scores, and feedback before removing this role slot." });
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
    response.status(400).json({ message: "Enter a valid member assignment." });
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

  const canManage = await canManageClubId(user.id, user.role, slot.meeting.clubId);

  if (!canManage) {
    response.status(403).json({ message: "You cannot manage roles for this meeting." });
    return;
  }

  if (isReportRoleSlot(slot)) {
    response.status(409).json({ message: "Assign or release the matching main role; its report role is managed automatically." });
    return;
  }

  if (parsed.data.studentId) {
    const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });

    if (!student || !(await isStudentInClub(student.id, slot.meeting.clubId))) {
      response.status(400).json({ message: "Choose a member assigned to this club." });
      return;
    }

  }

  const assignmentResult = await prisma.$transaction(async (tx) => {
    const meetingSlots = await tx.meetingRoleSlot.findMany({
      where: { meetingId },
      include: { roleDefinition: true }
    });

    if (parsed.data.studentId) {
      const assignedRoles = meetingSlots.filter((meetingSlot) => (
        meetingSlot.id !== slot.id && meetingSlot.assignedStudentId === parsed.data.studentId
      ));
      const limitViolation = roleAssignmentLimitViolation(assignedRoles, slot);

      if (limitViolation) {
        return { error: limitViolation };
      }
    }

    await setRoleAssignment(tx, slot.id, parsed.data.studentId ?? null, parsed.data.studentId ? user.id : null);
    await syncPairedReportAssignment(
      tx,
      meetingSlots,
      slot,
      parsed.data.studentId ?? null,
      parsed.data.studentId ? user.id : null
    );

    return { error: null };
  });

  if (assignmentResult.error) {
    response.status(409).json({ message: assignmentResult.error });
    return;
  }

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
    response.status(400).json({ message: "Choose a member and attendance status." });
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
    response.status(400).json({ message: "Choose a member assigned to this club." });
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
    response.status(400).json({ message: "Assign a member before scoring this role." });
    return;
  }

  if (!(await isStudentInClub(slot.assignedStudentId, slot.meeting.clubId))) {
    response.status(400).json({ message: "The assigned member is no longer active in this club." });
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
    response.status(403).json({ message: "Only admins and facilitators can save member feedback." });
    return;
  }

  const parsed = studentFeedbackSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Choose a member and enter a score between 0 and 100." });
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
    response.status(400).json({ message: "Choose a member assigned to this club." });
    return;
  }

  if (parsed.data.roleSlotId) {
    const roleSlot = await prisma.meetingRoleSlot.findUnique({ where: { id: parsed.data.roleSlotId } });

    if (!roleSlot || roleSlot.meetingId !== meetingId || roleSlot.assignedStudentId !== student.id) {
      response.status(400).json({ message: "Choose one of this member's assigned roles for this meeting." });
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

export function sanitizeMeetingsForUser<T extends Array<Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>>>(
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
      assignedStudent: publicMeetingStudent(slot.assignedStudent),
      score: slot.assignedStudent?.user.id === userId ? slot.score : null
    })),
    attendance: [],
    roleScores: meeting.roleScores.filter((score) => {
      const slot = meeting.roleSlots.find((candidate) => candidate.id === score.roleSlotId);

      return slot?.assignedStudent?.user.id === userId;
    }),
    studentFeedbacks: meeting.studentFeedbacks
      .filter((feedback) => feedback.student.user.id === userId)
      .map((feedback) => ({
        ...feedback,
        student: publicMeetingStudent(feedback.student)
      }))
  }));
}

function publicMeetingStudent<T extends { id: string; userId?: string; grade?: string; programLevel?: string | null; bandLevel?: string; user: { id: string; firstName: string; lastName: string; role: Role } } | null>(student: T) {
  if (!student) {
    return null;
  }

  return {
    id: student.id,
    userId: student.userId,
    grade: student.grade,
    programLevel: student.programLevel,
    bandLevel: student.bandLevel,
    user: {
      id: student.user.id,
      firstName: student.user.firstName,
      lastName: student.user.lastName,
      role: student.user.role
    }
  };
}

async function getNextRoleSlotSortOrder(meetingId: string) {
  const lastSlot = await prisma.meetingRoleSlot.findFirst({
    where: { meetingId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });

  return (lastSlot?.sortOrder ?? 0) + 1;
}

function setRoleAssignment(
  tx: Prisma.TransactionClient,
  slotId: string,
  studentId: string | null,
  assignedByUserId: string | null
) {
  return tx.meetingRoleSlot.update({
    where: { id: slotId },
    data: studentId
      ? { assignedStudentId: studentId, assignedByUserId, assignedAt: new Date() }
      : { assignedStudentId: null, assignedByUserId: null, assignedAt: null }
  });
}

async function syncPairedReportAssignment(
  tx: Prisma.TransactionClient,
  meetingSlots: RoleSlotDescriptor[],
  mainSlot: RoleSlotDescriptor,
  studentId: string | null,
  assignedByUserId: string | null
) {
  const reportRoleName = reportRoleNameForRoleSlot(mainSlot);

  if (!reportRoleName) {
    return;
  }

  const reportSlotIds = meetingSlots
    .filter((meetingSlot) => roleSlotHasName(meetingSlot, reportRoleName))
    .map((meetingSlot) => meetingSlot.id)
    .filter((slotId): slotId is string => Boolean(slotId));

  if (!reportSlotIds.length) {
    return;
  }

  await tx.meetingRoleSlot.updateMany({
    where: { id: { in: reportSlotIds } },
    data: studentId
      ? { assignedStudentId: studentId, assignedByUserId, assignedAt: new Date() }
      : { assignedStudentId: null, assignedByUserId: null, assignedAt: null }
  });
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

function isValidDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

async function getAvailableRoleDefinitionForClub(roleDefinitionId: string, clubProgram: string) {
  const programLevel = normalizeProgramLevel(clubProgram);

  return prisma.roleDefinition.findFirst({
    where: {
      id: roleDefinitionId,
      isActive: true,
      OR: [
        { programLevel: null },
        { programLevel: "" },
        ...(programLevel ? [{ programLevel }] : [])
      ]
    }
  });
}

export function canManageRoleDefinitions(role: Role) {
  return role === Role.ADMIN;
}

export function canReleaseMeetingRole(role: Role, isOwnClaim = false) {
  return role === Role.ADMIN || role === Role.FACILITATOR || (role === Role.STUDENT && isOwnClaim);
}

export function isLeadershipRoleName(roleName: string) {
  return leadershipRoleKeySet.has(normalizeLeadershipRoleName(roleName) as typeof leadershipRoleKeys[number]);
}

export function roleAssignmentLimitViolation(
  existingRoles: RoleSlotDescriptor[],
  targetRole: RoleSlotDescriptor
) {
  if (isReportRoleSlot(targetRole)) {
    return "Report roles are assigned automatically with their matching main role.";
  }

  const existingClaimableRoles = existingRoles.filter((role) => !isReportRoleSlot(role));

  if (existingClaimableRoles.length >= maximumRolesPerStudentMeeting) {
    return "Members can claim a maximum of 2 roles for this meeting.";
  }

  if (isLeadershipRoleSlot(targetRole) && existingClaimableRoles.some(isLeadershipRoleSlot)) {
    return "Members can claim only 1 leadership role per meeting.";
  }

  return null;
}

type RoleSlotDescriptor = {
  id?: string;
  assignedStudentId?: string | null;
  slotLabel?: string | null;
  roleDefinition: { name: string };
};

export function isReportRoleSlot(slot: RoleSlotDescriptor) {
  return roleSlotNames(slot).some(isReportRoleName);
}

function reportRoleNameForRoleSlot(slot: RoleSlotDescriptor) {
  return roleSlotNames(slot).map(reportRoleNameForMainRole).find(Boolean) ?? null;
}

function roleSlotHasName(slot: RoleSlotDescriptor, roleName: string) {
  const normalizedRoleName = normalizeLeadershipRoleName(roleName);
  return roleSlotNames(slot).some((candidate) => normalizeLeadershipRoleName(candidate) === normalizedRoleName);
}

function roleSlotNames(slot: RoleSlotDescriptor) {
  return [...new Set([slot.slotLabel, slot.roleDefinition.name].filter((roleName): roleName is string => Boolean(roleName)))];
}

function isLeadershipRoleSlot(slot: RoleSlotDescriptor) {
  return isLeadershipRoleName(slot.slotLabel || "") || isLeadershipRoleName(slot.roleDefinition.name);
}

function normalizeLeadershipRoleName(roleName: string) {
  return roleName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeProgramLevel(program: string | null | undefined) {
  const normalizedProgram = (program ?? "").trim().toLowerCase();

  if (normalizedProgram === "junior" || normalizedProgram.includes("junior")) {
    return "JUNIOR";
  }

  if (normalizedProgram === "senior" || normalizedProgram.includes("senior")) {
    return "SENIOR";
  }

  return null;
}

function normalizeRoleDefinitionPayload(data: Partial<z.infer<typeof roleDefinitionSchema>>) {
  return {
    name: data.name,
    description: data.description === undefined ? undefined : data.description || null,
    category: data.category === undefined ? undefined : data.category || "Speaking Role",
    programLevel: data.programLevel === undefined ? undefined : data.programLevel || null,
    level: data.level === undefined ? undefined : data.level || null,
    sortOrder: data.sortOrder,
    isActive: data.isActive
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
