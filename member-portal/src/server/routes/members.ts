import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { PaymentStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { canManageOperationalData, operationalManagerRoles } from "../permissions.js";
import { memberUserSelect, publicUserSelect, safeUserDto } from "../services/safeUser.js";
import { bandLevels, type ProgramLevel, programLevels } from "../../shared/portalConstants.js";

export const membersRouter = Router();

membersRouter.use(requireAuth);

const memberCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  grade: z.string().trim().optional(),
  programLevel: z.enum(programLevels).optional(),
  bandLevel: z.enum(bandLevels).optional(),
  clubIds: z.array(z.string().min(1)).min(1)
});

const memberUpdateSchema = z.object({
  programLevel: z.enum(programLevels),
  bandLevel: z.enum(bandLevels)
}).strict();

const memberFeedbackCreateSchema = z.object({
  clubId: z.string().trim().min(1),
  feedback: z.string().trim().min(1).max(5000)
}).strict();

const memberFeedbackUpdateSchema = z.object({
  feedback: z.string().trim().min(1).max(5000)
}).strict();

const paymentMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const memberPaymentUpdateSchema = z.object({
  paymentMonth: paymentMonthSchema.optional(),
  status: z.nativeEnum(PaymentStatus)
}).strict();

const memberPaymentResetSchema = z.object({
  paymentMonth: paymentMonthSchema.optional(),
  confirmed: z.literal(true)
}).strict();

const historicalDependencyLabels = {
  clubMemberships: "club memberships",
  parentLinks: "parent links",
  assignedRoleSlots: "meeting role claims",
  attendance: "attendance records",
  roleScores: "role scores",
  meetingFeedback: "facilitator feedback",
  memberFeedback: "member feedback",
  requirementProgress: "band progress records",
  uploadedDocuments: "uploaded documents",
  createdResourceLinks: "created resource links",
  facilitatorClubAssignments: "facilitator club assignments",
  facilitatorCentreAssignments: "facilitator centre assignments"
} as const;

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

function paymentMonthStart(paymentMonth?: string) {
  const normalizedMonth = paymentMonth ?? new Date().toISOString().slice(0, 7);
  return new Date(`${normalizedMonth}-01T00:00:00.000Z`);
}

function formatPaymentMonth(paymentMonth: Date) {
  return paymentMonth.toISOString().slice(0, 7);
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
  const statusFilters: Prisma.StudentClubMembershipWhereInput[] = status === "inactive"
    ? [{ OR: [{ status: { not: "ACTIVE" } }, { student: { user: { isActive: false } } }] }]
    : status === ""
      ? []
      : [{ status: "ACTIVE" }, { student: { user: { isActive: true } } }];
  const clubFilter = requestedClubId
    ? requestedClubId
    : visibleClubIds === null
      ? undefined
      : { in: visibleClubIds };
  const where: Prisma.StudentClubMembershipWhereInput = {
    ...(statusFilters.length ? { AND: statusFilters } : {}),
    ...(clubFilter ? { clubId: clubFilter } : {}),
    ...(requestedCentreId ? { club: { centreId: requestedCentreId } } : {}),
    club: {
      ...(requestedCentreId ? { centreId: requestedCentreId } : {}),
      ...(user.role === Role.STUDENT ? { isActive: true, centre: { isActive: true } } : {})
    },
    student: {
      ...(programLevel === "JUNIOR" || programLevel === "SENIOR" ? { programLevel } : {}),
      ...(currentBandLevel ? { bandLevel: currentBandLevel } : {}),
      user: {
        role: Role.STUDENT,
        ...(user.role === Role.STUDENT ? { isActive: true } : {}),
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
            user: { select: memberUserSelect }
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

  response.json({
    members: memberships.map((membership) => ({
      id: membership.student.id,
      userId: membership.student.userId,
      displayName: displayName(membership.student.user),
      firstName: membership.student.user.firstName,
      lastName: membership.student.user.lastName,
      email: membership.student.user.email,
      programLevel: membership.student.programLevel ?? inferProgramLevel(membership.club.program),
      currentBandLevel: membership.student.bandLevel,
      clubId: membership.clubId,
      clubName: membership.club.name,
      centreId: membership.club.centreId,
      centreName: membership.club.centre.name,
      isActive: membership.student.user.isActive && membership.status === "ACTIVE"
    })),
    total,
    page,
    pageSize,
    centres,
    clubs
  });
}));

membersRouter.get("/payments", requireRole(operationalManagerRoles), asyncRoute(async (request, response) => {
  const requestedMonth = stringQuery(request.query.paymentMonth);
  const parsedMonth = paymentMonthSchema.optional().safeParse(requestedMonth || undefined);

  if (!parsedMonth.success) {
    response.status(400).json({ message: "Payment month must use YYYY-MM format." });
    return;
  }

  const paymentMonth = paymentMonthStart(parsedMonth.data);
  const payments = await prisma.monthlyMemberPayment.findMany({
    where: { paymentMonth },
    select: {
      studentId: true,
      status: true,
      updatedByAdminId: true,
      updatedAt: true
    },
    orderBy: { studentId: "asc" }
  });

  response.json({
    paymentMonth: formatPaymentMonth(paymentMonth),
    payments
  });
}));

membersRouter.put("/payments/:studentId", requireRole(operationalManagerRoles), asyncRoute(async (request, response) => {
  const parsed = memberPaymentUpdateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Choose Paid or Not Paid for a valid payment month." });
    return;
  }

  const user = request.user!;
  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      user: { select: { role: true } }
    }
  });

  if (!student || student.user.role !== Role.STUDENT) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  const paymentMonth = paymentMonthStart(parsed.data.paymentMonth);
  const payment = await prisma.monthlyMemberPayment.upsert({
    where: {
      studentId_paymentMonth: {
        studentId,
        paymentMonth
      }
    },
    create: {
      studentId,
      paymentMonth,
      status: parsed.data.status,
      updatedByAdminId: user.id
    },
    update: {
      status: parsed.data.status,
      updatedByAdminId: user.id
    },
    select: {
      studentId: true,
      status: true,
      updatedByAdminId: true,
      updatedAt: true
    }
  });

  response.json({
    paymentMonth: formatPaymentMonth(paymentMonth),
    payment
  });
}));

membersRouter.post("/payments/reset", requireRole(operationalManagerRoles), asyncRoute(async (request, response) => {
  const parsed = memberPaymentResetSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Confirm the reset and provide a valid payment month." });
    return;
  }

  const user = request.user!;
  const paymentMonth = paymentMonthStart(parsed.data.paymentMonth);
  const activeMembers = await prisma.student.findMany({
    where: {
      user: { role: Role.STUDENT, isActive: true },
      clubMemberships: {
        some: {
          status: "ACTIVE",
          club: { isActive: true, centre: { isActive: true } }
        }
      }
    },
    select: { id: true }
  });
  const activeStudentIds = activeMembers.map((member) => member.id);

  if (activeStudentIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.monthlyMemberPayment.createMany({
        data: activeStudentIds.map((studentId) => ({
          studentId,
          paymentMonth,
          status: PaymentStatus.NOT_PAID,
          updatedByAdminId: user.id
        })),
        skipDuplicates: true
      });
      await tx.monthlyMemberPayment.updateMany({
        where: {
          studentId: { in: activeStudentIds },
          paymentMonth
        },
        data: {
          status: PaymentStatus.NOT_PAID,
          updatedByAdminId: user.id
        }
      });
    });
  }

  response.json({
    paymentMonth: formatPaymentMonth(paymentMonth),
    resetCount: activeStudentIds.length,
    status: PaymentStatus.NOT_PAID
  });
}));

membersRouter.post("/", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only operational managers and facilitators can add members." });
    return;
  }

  const parsed = memberCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid member details. Password must be at least 8 characters." });
    return;
  }

  const data = parsed.data;
  const clubIds = [...new Set(data.clubIds)];

  if (!(await canManageRequestedClubs(user.id, user.role, clubIds))) {
    response.status(403).json({ message: "You can only assign members to clubs you manage." });
    return;
  }

  const email = data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    const createdUser = await prisma.$transaction(async (tx) => {
      const studentUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: Role.STUDENT
        },
        select: memberUserSelect
      });

      const student = await tx.student.create({
        data: {
          userId: studentUser.id,
          grade: data.grade || "Not set",
          programLevel: data.programLevel ?? null,
          bandLevel: data.bandLevel || "White"
        }
      });

      await tx.studentClubMembership.createMany({
        data: clubIds.map((clubId) => ({
          clubId,
          studentId: student.id,
          status: "ACTIVE"
        })),
        skipDuplicates: true
      });

      return studentUser;
    });

    response.status(201).json({
      user: safeUserDto(createdUser)
    });
  } catch (error) {
    const prismaError = error as { code?: string };

    if (prismaError.code === "P2002") {
      response.status(409).json({ message: "A user with this email already exists." });
      return;
    }

    throw error;
  }
}));

membersRouter.get("/:studentId", asyncRoute(async (request, response) => {
  const user = request.user!;
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

  if (!canManageOperationalData(user) && !(await canFacilitatorAccessStudent(user.id, student.id, true))) {
    response.status(403).json({ message: "You cannot view this member." });
    return;
  }

  const detailClubIds = user.role === Role.FACILITATOR ? await getVisibleClubIds(user.id, Role.FACILITATOR) : null;
  const visibleClubIdSet = detailClubIds === null ? null : new Set(detailClubIds);
  const visibleMemberships = visibleClubIdSet === null
    ? student.clubMemberships
    : student.clubMemberships.filter((membership) => visibleClubIdSet.has(membership.clubId));
  const visibleRoleSlots = visibleClubIdSet === null
    ? student.roleSlots
    : student.roleSlots.filter((slot) => visibleClubIdSet.has(slot.meeting.clubId));
  const visibleFeedback = visibleClubIdSet === null
    ? student.meetingFeedbacks
    : student.meetingFeedbacks.filter((feedback) => visibleClubIdSet.has(feedback.meeting.clubId));
  const visibleMemberFeedback = visibleClubIdSet === null
    ? student.memberFeedback
    : student.memberFeedback.filter((feedback) => visibleClubIdSet.has(feedback.clubId));
  const visibleAttendance = visibleClubIdSet === null
    ? student.attendance
    : student.attendance.filter((attendance) => visibleClubIdSet.has(attendance.meeting.clubId));
  const selectedProgramLevel = getStudentProgramLevel({
    ...student,
    clubMemberships: visibleMemberships
  });
  const scorerIds = [...new Set(visibleFeedback.map((feedback) => feedback.scoredByUserId).filter(Boolean))] as string[];
  const scorers = scorerIds.length
    ? await prisma.user.findMany({
      where: { id: { in: scorerIds } },
      select: publicUserSelect
    })
    : [];
  const scorerById = new Map(scorers.map((scorer) => [scorer.id, scorer]));
  const requirements = await buildRequirementProgress(student.id, selectedProgramLevel);
  const completedRequirements = requirements.filter((entry) => entry.isCompleted).length;
  const averageScore = visibleFeedback.length
    ? Math.round(visibleFeedback.reduce((total, entry) => total + entry.score, 0) / visibleFeedback.length)
    : null;
  const lastFeedbackDate = visibleFeedback[0]?.scoredAt ?? null;
  const presentAttendance = visibleAttendance.filter((entry) => entry.status === "PRESENT").length;

  response.json({
    member: {
        id: student.id,
        userId: student.userId,
        displayName: displayName(student.user),
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        email: student.user.email,
        role: student.user.role,
        grade: student.grade,
        programLevel: selectedProgramLevel,
        currentBandLevel: student.bandLevel,
        isActive: student.user.isActive,
        clubs: visibleMemberships.map((membership) => ({
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
      summary: {
        rolesCompleted: visibleRoleSlots.length,
        averageScore,
        lastFeedbackDate,
        attendancePresent: presentAttendance,
        attendanceTotal: visibleAttendance.length
      },
      requirements,
      attendance: visibleAttendance.map((entry) => ({
        id: entry.id,
        meetingDate: entry.meeting.meetingDate,
        meetingTitle: entry.meeting.title,
        clubName: entry.meeting.club.name,
        status: entry.status,
        notes: entry.notes
      })),
      roleHistory: visibleRoleSlots.map((slot) => {
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
      feedback: visibleFeedback.map((feedback) => {
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
      }),
      memberFeedback: visibleMemberFeedback.map((entry) => serializeMemberFeedback(
        entry,
        user,
        visibleMemberships.some((membership) => membership.clubId === entry.clubId && membership.status === "ACTIVE")
      ))
    }
  });
}));

membersRouter.post("/:studentId/feedback", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only operational managers and facilitators can write member feedback." });
    return;
  }

  const parsed = memberFeedbackCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter feedback between 1 and 5,000 characters and select a club." });
    return;
  }

  const studentId = String(request.params.studentId);

  if (!(await canWriteMemberFeedback(user.id, user.role, studentId, parsed.data.clubId))) {
    response.status(403).json({ message: "You can only write feedback for active members in clubs you manage." });
    return;
  }

  const feedback = await prisma.memberFeedback.create({
    data: {
      studentId,
      clubId: parsed.data.clubId,
      feedback: parsed.data.feedback,
      createdByUserId: user.id
    },
    include: {
      club: true,
      createdBy: { select: publicUserSelect }
    }
  });

  response.status(201).json({ feedback: serializeMemberFeedback(feedback, user) });
}));

membersRouter.patch("/:studentId/feedback/:feedbackId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only operational managers and facilitators can edit member feedback." });
    return;
  }

  const parsed = memberFeedbackUpdateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter feedback between 1 and 5,000 characters." });
    return;
  }

  const studentId = String(request.params.studentId);
  const feedbackId = String(request.params.feedbackId);
  const existing = await prisma.memberFeedback.findFirst({ where: { id: feedbackId, studentId } });

  if (!existing) {
    response.status(404).json({ message: "Member feedback not found." });
    return;
  }

  if (!(await canModifyMemberFeedback(user.id, user.role, existing))) {
    response.status(403).json({ message: "You can only edit feedback you created for members in clubs you manage." });
    return;
  }

  const feedback = await prisma.memberFeedback.update({
    where: { id: existing.id },
    data: { feedback: parsed.data.feedback },
    include: {
      club: true,
      createdBy: { select: publicUserSelect }
    }
  });

  response.json({ feedback: serializeMemberFeedback(feedback, user) });
}));

membersRouter.delete("/:studentId/feedback/:feedbackId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only operational managers and facilitators can delete member feedback." });
    return;
  }

  const studentId = String(request.params.studentId);
  const feedbackId = String(request.params.feedbackId);
  const existing = await prisma.memberFeedback.findFirst({ where: { id: feedbackId, studentId } });

  if (!existing) {
    response.status(404).json({ message: "Member feedback not found." });
    return;
  }

  if (!(await canModifyMemberFeedback(user.id, user.role, existing))) {
    response.status(403).json({ message: "You can only delete feedback you created for members in clubs you manage." });
    return;
  }

  await prisma.memberFeedback.delete({ where: { id: existing.id } });
  response.json({ deletedFeedback: { id: existing.id } });
}));

membersRouter.patch("/:studentId", asyncRoute(async (request, response) => {
  const user = request.user!;

  if (!canManageOperationalData(user) && user.role !== Role.FACILITATOR) {
    response.status(403).json({ message: "Only operational managers and facilitators can update members." });
    return;
  }

  const parsed = memberUpdateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid member details." });
    return;
  }

  const studentId = String(request.params.studentId);
  const data = parsed.data;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: { select: memberUserSelect } }
  });

  if (!student || student.user.role !== Role.STUDENT) {
    response.status(404).json({ message: "Member not found." });
    return;
  }

  if (user.role === Role.FACILITATOR && !(await canFacilitatorAccessStudent(user.id, student.id))) {
    response.status(403).json({ message: "You cannot update this member." });
    return;
  }

  await prisma.student.update({
    where: { id: student.id },
    data: {
      programLevel: data.programLevel,
      bandLevel: data.bandLevel
    }
  });

  response.json({
    user: safeUserDto(student.user)
  });
}));

membersRouter.delete("/:studentId", asyncRoute(async (request, response) => {
  const user = request.user!;

  const roleDecision = permanentMemberDeleteDecision({
    authenticatedRole: user.role,
    targetRole: Role.STUDENT,
    isSelf: false,
    blockingReasons: []
  });

  if (roleDecision.status !== 200) {
    response.status(roleDecision.status).json({ message: roleDecision.message });
    return;
  }

  const studentId = String(request.params.studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: { select: memberUserSelect } }
  });

  const targetDecision = permanentMemberDeleteDecision({
    authenticatedRole: user.role,
    targetRole: student?.user.role ?? null,
    isSelf: student?.userId === user.id,
    blockingReasons: []
  });

  if (targetDecision.status !== 200) {
    response.status(targetDecision.status).json({ message: targetDecision.message });
    return;
  }

  const deletionSummary = await deleteStudentMemberRecords(student!.id, student!.userId);

  response.json({
    deletedMember: {
      id: student!.id,
      userId: student!.userId,
      displayName: displayName(student!.user),
      email: student!.user.email
    },
    deletionSummary
  });
}));

async function getVisibleClubIds(userId: string, role: Role) {
  if (canManageOperationalData(role)) {
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

export async function canManageRequestedClubs(userId: string, role: Role, clubIds: string[]) {
  if (canManageOperationalData(role)) {
    const activeClubCount = await prisma.club.count({
      where: {
        id: { in: clubIds },
        isActive: true,
        centre: { isActive: true }
      }
    });

    return canManageClubIdSet(role, clubIds, [], activeClubCount);
  }

  if (role === Role.FACILITATOR) {
    const visibleClubIds = await getVisibleClubIds(userId, Role.FACILITATOR);

    return canManageClubIdSet(role, clubIds, visibleClubIds ?? []);
  }

  return canManageClubIdSet(role, clubIds, []);
}

export function canManageClubIdSet(role: Role, requestedClubIds: string[], visibleClubIds: string[], activeClubCount = 0) {
  if (requestedClubIds.length === 0) {
    return false;
  }

  if (canManageOperationalData(role)) {
    return activeClubCount === requestedClubIds.length;
  }

  if (role === Role.FACILITATOR) {
    const visibleClubIdSet = new Set(visibleClubIds);

    return requestedClubIds.every((clubId) => visibleClubIdSet.has(clubId));
  }

  return false;
}

export async function canFacilitatorAccessStudent(facilitatorId: string, studentId: string, includeInactiveMemberships = false) {
  const clubIds = await getVisibleClubIds(facilitatorId, Role.FACILITATOR);

  const memberships = await prisma.studentClubMembership.findMany({
    where: {
      studentId,
      clubId: { in: clubIds ?? [] }
    },
    select: {
      clubId: true,
      status: true
    }
  });

  return canAccessStudentMemberships(clubIds ?? [], memberships, includeInactiveMemberships);
}

export async function canWriteMemberFeedback(userId: string, role: Role, studentId: string, clubId: string) {
  if (!canManageOperationalData(role) && role !== Role.FACILITATOR) {
    return false;
  }

  const membershipCount = await prisma.studentClubMembership.count({
    where: canManageOperationalData(role)
      ? {
          studentId,
          clubId,
          student: { user: { role: Role.STUDENT } }
        }
      : {
          studentId,
          clubId,
          status: "ACTIVE",
          student: { user: { role: Role.STUDENT, isActive: true } },
          club: { isActive: true, centre: { isActive: true } }
        }
  });

  if (membershipCount === 0) {
    return false;
  }

  if (canManageOperationalData(role)) {
    return true;
  }

  const assignmentCount = await prisma.clubFacilitator.count({
    where: {
      facilitatorId: userId,
      clubId,
      club: { isActive: true, centre: { isActive: true } }
    }
  });

  return assignmentCount > 0;
}

async function canModifyMemberFeedback(
  userId: string,
  role: Role,
  feedback: { studentId: string; clubId: string; createdByUserId: string | null }
) {
  if (canManageOperationalData(role)) {
    return true;
  }

  return role === Role.FACILITATOR
    && feedback.createdByUserId === userId
    && await canWriteMemberFeedback(userId, role, feedback.studentId, feedback.clubId);
}

export function canAccessStudentMemberships(
  visibleClubIds: string[],
  memberships: Array<{ clubId: string; status: string }>,
  includeInactiveMemberships = false
) {
  const visibleClubIdSet = new Set(visibleClubIds);

  return memberships.some((membership) =>
    visibleClubIdSet.has(membership.clubId)
    && (includeInactiveMemberships || membership.status === "ACTIVE")
  );
}

export function canPermanentlyDeleteMemberRole(role: Role) {
  return canManageOperationalData(role);
}

export function permanentMemberDeleteDecision(input: {
  authenticatedRole: Role | null;
  targetRole: Role | null;
  isSelf: boolean;
  blockingReasons?: string[];
}) {
  if (!input.authenticatedRole) {
    return { status: 401, message: "Authentication required." };
  }

  if (!canPermanentlyDeleteMemberRole(input.authenticatedRole)) {
    return { status: 403, message: "Only operational managers can permanently delete members." };
  }

  if (input.targetRole !== Role.STUDENT) {
    return { status: 404, message: "Member not found." };
  }

  if (input.isSelf) {
    return { status: 400, message: "You cannot delete your own account." };
  }

  return { status: 200, message: "Member can be permanently deleted." };
}

export type StudentDeleteDependencies = Awaited<ReturnType<typeof getStudentDeleteDependencies>>;

export async function getStudentDeleteDependencies(studentId: string, userId: string) {
  const [
    clubMemberships,
    parentLinks,
    assignedRoleSlots,
    attendance,
    roleScores,
    meetingFeedback,
    memberFeedback,
    requirementProgress,
    uploadedDocuments,
    createdResourceLinks,
    facilitatorClubAssignments,
    facilitatorCentreAssignments
  ] = await Promise.all([
    prisma.studentClubMembership.count({ where: { studentId } }),
    prisma.studentParent.count({ where: { studentId } }),
    prisma.meetingRoleSlot.count({ where: { assignedStudentId: studentId } }),
    prisma.meetingAttendance.count({ where: { studentId } }),
    prisma.meetingRoleScore.count({ where: { studentId } }),
    prisma.studentMeetingFeedback.count({ where: { studentId } }),
    prisma.memberFeedback.count({ where: { studentId } }),
    prisma.studentRequirementProgress.count({ where: { studentId } }),
    prisma.bandDocument.count({ where: { uploadedById: userId } }),
    prisma.resourceLink.count({ where: { createdById: userId } }),
    prisma.clubFacilitator.count({ where: { facilitatorId: userId } }),
    prisma.centreFacilitator.count({ where: { facilitatorId: userId } })
  ]);

  return {
    clubMemberships,
    parentLinks,
    assignedRoleSlots,
    attendance,
    roleScores,
    meetingFeedback,
    memberFeedback,
    requirementProgress,
    uploadedDocuments,
    createdResourceLinks,
    facilitatorClubAssignments,
    facilitatorCentreAssignments
  };
}

export function historicalDependencyReasons(dependencies: Record<keyof typeof historicalDependencyLabels, number>) {
  return Object.entries(dependencies)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${historicalDependencyLabels[key as keyof typeof historicalDependencyLabels]}`);
}

export async function deleteStudentMemberRecords(studentId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const roleScores = await tx.meetingRoleScore.deleteMany({ where: { studentId } });
    const meetingFeedback = await tx.studentMeetingFeedback.deleteMany({ where: { studentId } });
    const memberFeedback = await tx.memberFeedback.deleteMany({ where: { studentId } });
    const attendance = await tx.meetingAttendance.deleteMany({ where: { studentId } });
    const requirementProgress = await tx.studentRequirementProgress.deleteMany({ where: { studentId } });
    const clubMemberships = await tx.studentClubMembership.deleteMany({ where: { studentId } });
    const parentLinks = await tx.studentParent.deleteMany({ where: { studentId } });
    const assignedRoleSlots = await tx.meetingRoleSlot.updateMany({
      where: { assignedStudentId: studentId },
      data: {
        assignedStudentId: null,
        assignedByUserId: null,
        assignedAt: null
      }
    });
    const uploadedDocuments = await tx.bandDocument.deleteMany({ where: { uploadedById: userId } });
    await tx.resourceLink.updateMany({
      where: { updatedById: userId },
      data: { updatedById: null }
    });
    const createdResourceLinks = await tx.resourceLink.deleteMany({ where: { createdById: userId } });

    await tx.student.delete({ where: { id: studentId } });
    await tx.user.delete({ where: { id: userId } });

    return {
      deletedRoleScores: roleScores.count,
      deletedMeetingFeedback: meetingFeedback.count,
      deletedMemberFeedback: memberFeedback.count,
      deletedAttendance: attendance.count,
      deletedRequirementProgress: requirementProgress.count,
      deletedClubMemberships: clubMemberships.count,
      deletedParentLinks: parentLinks.count,
      clearedAssignedRoleSlots: assignedRoleSlots.count,
      deletedUploadedDocuments: uploadedDocuments.count,
      deletedCreatedResourceLinks: createdResourceLinks.count
    };
  });
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
    student: { include: { user: { select: typeof memberUserSelect } } };
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

function serializeMemberFeedback(
  entry: {
    id: string;
    studentId: string;
    clubId: string;
    feedback: string;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    club: { name: string };
    createdBy: { firstName: string; lastName: string } | null;
  },
  viewer: { id: string; role: Role },
  hasActiveMembership = true
) {
  return {
    id: entry.id,
    studentId: entry.studentId,
    clubId: entry.clubId,
    clubName: entry.club.name,
    feedback: entry.feedback,
    facilitatorName: entry.createdBy ? displayName(entry.createdBy) : "Former facilitator",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    canEdit: canManageOperationalData(viewer)
      || (viewer.role === Role.FACILITATOR && hasActiveMembership && entry.createdByUserId === viewer.id)
  };
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
