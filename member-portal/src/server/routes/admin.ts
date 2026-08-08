import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";

const centreSchema = z.object({
  name: z.string().trim().min(2),
  province: z.string().trim().min(2),
  city: z.string().trim().min(2),
  address: z.string().trim().optional()
});

const clubSchema = z.object({
  centreId: z.string().min(1),
  name: z.string().trim().min(2),
  program: z.string().trim().min(2)
});

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  role: z.enum([Role.ADMIN, Role.FACILITATOR, Role.STUDENT]),
  grade: z.string().trim().optional(),
  programLevel: z.enum(["JUNIOR", "SENIOR"]).optional(),
  bandLevel: z.string().trim().optional(),
  clubIds: z.array(z.string()).default([]),
  facilitatorClubIds: z.array(z.string()).default([])
});

const updateUserSchema = userSchema.omit({ password: true }).extend({
  isActive: z.boolean()
});

const facilitatorAssignmentSchema = z.object({
  facilitatorId: z.string().min(1)
});

const validBandLevels = new Set([
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
]);

const editableRoles = new Set<Role>([Role.ADMIN, Role.FACILITATOR, Role.STUDENT]);

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole([Role.ADMIN]));

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch((error) => {
      if (error instanceof AdminActionError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      next(error);
    });
  };
}

adminRouter.get("/overview", asyncRoute(async (_request, response) => {
  const [centres, clubs, users, students] = await Promise.all([
    prisma.centre.findMany({
      orderBy: [{ province: "asc" }, { city: "asc" }, { name: "asc" }],
      include: { clubs: true }
    }),
    prisma.club.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        centre: true,
        studentMemberships: {
          include: {
            student: {
              include: { user: true }
            }
          }
        },
        facilitators: {
          include: { facilitator: true }
        }
      }
    }),
    prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.FACILITATOR, Role.STUDENT] }
      },
      orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        studentProfile: {
          select: {
            id: true,
            grade: true,
            programLevel: true,
            bandLevel: true,
            clubMemberships: {
              include: {
                club: {
                  include: { centre: true }
                }
              }
            }
          }
        }
      }
    }),
    prisma.student.findMany({
      where: {
        user: {
          role: Role.STUDENT
        }
      },
      orderBy: [{ user: { lastName: "asc" } }],
      include: {
        user: true,
        clubMemberships: {
          include: {
            club: {
              include: { centre: true }
            }
          }
        },
      }
    })
  ]);

  response.json({
    centres,
    clubs,
    users,
    students
  });
}));

adminRouter.post("/centres", asyncRoute(async (request, response) => {
  const parsed = centreSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter centre name, province, and city." });
    return;
  }

  const centre = await prisma.centre.create({
    data: {
      ...parsed.data,
      address: parsed.data.address || null
    }
  });

  response.status(201).json({ centre });
}));

adminRouter.patch("/centres/:centreId/archive", asyncRoute(async (request, response) => {
  const centreId = String(request.params.centreId);
  const isActive = request.body?.isActive === true;
  const centre = await prisma.centre.update({
    where: { id: centreId },
    data: { isActive },
    include: { clubs: true }
  });

  response.json({ centre });
}));

adminRouter.post("/clubs", asyncRoute(async (request, response) => {
  const parsed = clubSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Select a centre and enter club details." });
    return;
  }

  const centre = await prisma.centre.findUnique({ where: { id: parsed.data.centreId } });

  if (!centre?.isActive) {
    response.status(400).json({ message: "Choose an active centre before creating a club." });
    return;
  }

  const club = await prisma.club.create({
    data: parsed.data,
    include: { centre: true }
  });

  response.status(201).json({ club });
}));

adminRouter.patch("/clubs/:clubId/archive", asyncRoute(async (request, response) => {
  const clubId = String(request.params.clubId);
  const isActive = request.body?.isActive === true;
  const club = await prisma.club.update({
    where: { id: clubId },
    data: { isActive },
    include: {
      centre: true,
      studentMemberships: {
        include: {
          student: {
            include: { user: true }
          }
        }
      },
      facilitators: {
        include: { facilitator: true }
      }
    }
  });

  response.json({ club });
}));

adminRouter.post("/clubs/:clubId/facilitators", asyncRoute(async (request, response) => {
  const clubId = String(request.params.clubId);
  const parsed = facilitatorAssignmentSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Choose a facilitator to assign." });
    return;
  }

  const [club, facilitator] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      include: { centre: true }
    }),
    prisma.user.findUnique({
      where: { id: parsed.data.facilitatorId }
    })
  ]);

  if (!club?.isActive || !club.centre.isActive) {
    response.status(400).json({ message: "Choose an active club in an active centre." });
    return;
  }

  if (!facilitator || facilitator.role !== Role.FACILITATOR || !facilitator.isActive) {
    response.status(400).json({ message: "Choose an active facilitator." });
    return;
  }

  const assignment = await prisma.clubFacilitator.upsert({
    where: {
      clubId_facilitatorId: {
        clubId,
        facilitatorId: facilitator.id
      }
    },
    update: {},
    create: {
      clubId,
      facilitatorId: facilitator.id
    },
    include: { facilitator: true }
  });

  response.status(201).json({ assignment });
}));

adminRouter.delete("/clubs/:clubId/facilitators/:facilitatorId", asyncRoute(async (request, response) => {
  const clubId = String(request.params.clubId);
  const facilitatorId = String(request.params.facilitatorId);

  await prisma.clubFacilitator.deleteMany({
    where: {
      clubId,
      facilitatorId
    }
  });

  response.json({ ok: true });
}));

adminRouter.post("/users", asyncRoute(async (request, response) => {
  const parsed = userSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid user details. Password must be at least 8 characters." });
    return;
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();
  const requestedClubIds = [...new Set([...data.clubIds, ...data.facilitatorClubIds])];

  if (data.role === Role.STUDENT && data.bandLevel && !validBandLevels.has(data.bandLevel)) {
    response.status(400).json({ message: "Choose a valid current band level." });
    return;
  }

  if (requestedClubIds.length > 0) {
    const activeClubCount = await prisma.club.count({
      where: {
        id: { in: requestedClubIds },
        isActive: true,
        centre: { isActive: true }
      }
    });

    if (activeClubCount !== requestedClubIds.length) {
      response.status(400).json({ message: "Assign users only to active clubs in active centres." });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role
        }
      });

      if (data.role === Role.STUDENT) {
        const student = await tx.student.create({
          data: {
            userId: createdUser.id,
            grade: data.grade || "Not set",
            programLevel: data.programLevel ?? null,
            bandLevel: data.bandLevel || "White"
          }
        });

        if (data.clubIds.length > 0) {
          await tx.studentClubMembership.createMany({
            data: data.clubIds.map((clubId) => ({
              clubId,
              studentId: student.id
            })),
            skipDuplicates: true
          });
        }

      }

      if (data.role === Role.FACILITATOR && data.facilitatorClubIds.length > 0) {
        await tx.clubFacilitator.createMany({
          data: data.facilitatorClubIds.map((clubId) => ({
            clubId,
            facilitatorId: createdUser.id
          })),
          skipDuplicates: true
        });
      }

      return createdUser;
    });

    response.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive
      }
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

adminRouter.patch("/users/:userId", asyncRoute(async (request, response) => {
  const userId = String(request.params.userId);
  const parsed = updateUserSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter valid user details." });
    return;
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();
  const requestedClubIds = [...new Set([
    ...(data.role === Role.STUDENT ? data.clubIds : []),
    ...(data.role === Role.FACILITATOR ? data.facilitatorClubIds : [])
  ])];

  if (userId === request.user?.id && data.role !== Role.ADMIN) {
    response.status(400).json({ message: "You cannot remove your own admin role." });
    return;
  }

  if (userId === request.user?.id && !data.isActive) {
    response.status(400).json({ message: "You cannot deactivate your own admin account." });
    return;
  }

  if (data.role === Role.STUDENT && data.bandLevel && !validBandLevels.has(data.bandLevel)) {
    response.status(400).json({ message: "Choose a valid current band level." });
    return;
  }

  if (requestedClubIds.length > 0) {
    const activeClubCount = await prisma.club.count({
      where: {
        id: { in: requestedClubIds },
        isActive: true,
        centre: { isActive: true }
      }
    });

    if (activeClubCount !== requestedClubIds.length) {
      response.status(400).json({ message: "Assign users only to active clubs in active centres." });
      return;
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true }
  });

  if (!existingUser || !editableRoles.has(existingUser.role)) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          isActive: data.isActive
        }
      });

      if (data.role === Role.STUDENT) {
        const student = existingUser.studentProfile
          ? await tx.student.update({
            where: { id: existingUser.studentProfile.id },
            data: {
              grade: data.grade || "Not set",
              programLevel: data.programLevel ?? null,
              bandLevel: data.bandLevel || "White"
            }
          })
          : await tx.student.create({
            data: {
              userId,
              grade: data.grade || "Not set",
              programLevel: data.programLevel ?? null,
              bandLevel: data.bandLevel || "White"
            }
          });

        await tx.studentClubMembership.deleteMany({
          where: data.clubIds.length
            ? { studentId: student.id, clubId: { notIn: data.clubIds } }
            : { studentId: student.id }
        });

        if (data.clubIds.length > 0) {
          await tx.studentClubMembership.createMany({
            data: data.clubIds.map((clubId) => ({
              clubId,
              studentId: student.id
            })),
            skipDuplicates: true
          });
        }

        await tx.clubFacilitator.deleteMany({ where: { facilitatorId: userId } });
      } else {
        if (existingUser.studentProfile) {
          await tx.studentClubMembership.deleteMany({
            where: { studentId: existingUser.studentProfile.id }
          });
        }

        await tx.clubFacilitator.deleteMany({
          where: data.role === Role.FACILITATOR && data.facilitatorClubIds.length
            ? { facilitatorId: userId, clubId: { notIn: data.facilitatorClubIds } }
            : { facilitatorId: userId }
        });

        if (data.role === Role.FACILITATOR && data.facilitatorClubIds.length > 0) {
          await tx.clubFacilitator.createMany({
            data: data.facilitatorClubIds.map((clubId) => ({
              clubId,
              facilitatorId: userId
            })),
            skipDuplicates: true
          });
        }
      }

      return updatedUser;
    });

    response.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive
      }
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

adminRouter.patch("/users/:userId/active", asyncRoute(async (request, response) => {
  const userId = String(request.params.userId);
  const isActive = request.body?.isActive === true;

  if (userId === request.user?.id && !isActive) {
    response.status(400).json({ message: "You cannot deactivate your own admin account." });
    return;
  }

  const user = await prisma.user.update({
    where: {
      id: userId,
      role: { in: [Role.ADMIN, Role.FACILITATOR, Role.STUDENT] }
    },
    data: { isActive },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true
    }
  });

  response.json({ user });
}));

adminRouter.delete("/users/:userId/demo", asyncRoute(async (request, response) => {
  const userId = String(request.params.userId);
  const result = await deleteSampleUser(userId, request.user!.id);

  response.json(result);
}));

adminRouter.post("/demo/delete-sample-users", asyncRoute(async (request, response) => {
  const sampleUsers = await prisma.user.findMany({
    where: {
      id: { not: request.user!.id },
      role: { in: [Role.STUDENT, Role.FACILITATOR] },
      OR: sampleUserWhere()
    },
    select: { id: true }
  });
  const summaries = [];

  for (const user of sampleUsers) {
    summaries.push(await deleteSampleUser(user.id, request.user!.id));
  }

  response.json({
    deletedUsers: summaries.length,
    summaries
  });
}));

adminRouter.post("/demo/delete-sample-feedback", asyncRoute(async (_request, response) => {
  const summary = await deleteSampleFeedback();

  response.json(summary);
}));

adminRouter.post("/demo/reset-meeting-data", asyncRoute(async (_request, response) => {
  const sampleStudentIds = await getSampleStudentIds();
  const demoMeetings = await prisma.meeting.findMany({
    where: {
      OR: [
        { id: { startsWith: "seed-" } },
        { title: { contains: "Sample", mode: "insensitive" } },
        { title: { contains: "Demo", mode: "insensitive" } },
        { roleSlots: { some: { assignedStudentId: { in: sampleStudentIds } } } }
      ]
    },
    select: { id: true }
  });
  const demoMeetingIds = demoMeetings.map((meeting) => meeting.id);
  const [roleScores, studentFeedback, attendance, roleSlots] = await prisma.$transaction([
    prisma.meetingRoleScore.deleteMany({
      where: {
        studentId: { in: sampleStudentIds }
      }
    }),
    prisma.studentMeetingFeedback.deleteMany({
      where: {
        studentId: { in: sampleStudentIds }
      }
    }),
    prisma.meetingAttendance.deleteMany({
      where: {
        studentId: { in: sampleStudentIds }
      }
    }),
    prisma.meetingRoleSlot.updateMany({
      where: {
        assignedStudentId: { in: sampleStudentIds }
      },
      data: {
        assignedStudentId: null,
        assignedByUserId: null,
        assignedAt: null
      }
    })
  ]);

  response.json({
    demoMeetings: demoMeetingIds.length,
    deletedRoleScores: roleScores.count,
    deletedStudentFeedback: studentFeedback.count,
    deletedAttendance: attendance.count,
    clearedRoleSlots: roleSlots.count
  });
}));

async function deleteSampleUser(userId: string, currentUserId: string) {
  if (userId === currentUserId) {
    throw new AdminActionError(400, "You cannot delete your own account.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true }
  });

  if (!user) {
    throw new AdminActionError(404, "User not found.");
  }

  if (!isSampleUser(user)) {
    throw new AdminActionError(400, "Only sample/test students or facilitators can be deleted.");
  }

  if (user.role === Role.ADMIN) {
    throw new AdminActionError(400, "Admin users cannot be hard-deleted.");
  }

  if (user.role === Role.STUDENT && user.studentProfile) {
    const studentId = user.studentProfile.id;
    const result = await prisma.$transaction(async (tx) => {
      const roleScores = await tx.meetingRoleScore.deleteMany({ where: { studentId } });
      const studentFeedback = await tx.studentMeetingFeedback.deleteMany({ where: { studentId } });
      const attendance = await tx.meetingAttendance.deleteMany({ where: { studentId } });
      const requirementProgress = await tx.studentRequirementProgress.deleteMany({ where: { studentId } });
      const memberships = await tx.studentClubMembership.deleteMany({ where: { studentId } });
      const parentLinks = await tx.studentParent.deleteMany({ where: { studentId } });
      const clearedRoleSlots = await tx.meetingRoleSlot.updateMany({
        where: { assignedStudentId: studentId },
        data: {
          assignedStudentId: null,
          assignedByUserId: null,
          assignedAt: null
        }
      });

      await tx.student.delete({ where: { id: studentId } });
      await tx.user.delete({ where: { id: user.id } });

      return {
        deletedUser: user.email,
        deletedRoleScores: roleScores.count,
        deletedStudentFeedback: studentFeedback.count,
        deletedAttendance: attendance.count,
        deletedRequirementProgress: requirementProgress.count,
        deletedMemberships: memberships.count,
        deletedParentLinks: parentLinks.count,
        clearedRoleSlots: clearedRoleSlots.count
      };
    });

    return result;
  }

  const result = await prisma.$transaction(async (tx) => {
    const clubAssignments = await tx.clubFacilitator.deleteMany({ where: { facilitatorId: user.id } });
    const centreAssignments = await tx.centreFacilitator.deleteMany({ where: { facilitatorId: user.id } });

    await tx.user.delete({ where: { id: user.id } });

    return {
      deletedUser: user.email,
      deletedClubAssignments: clubAssignments.count,
      deletedCentreAssignments: centreAssignments.count
    };
  });

  return result;
}

async function deleteSampleFeedback() {
  const sampleStudentIds = await getSampleStudentIds();
  const sampleUserIds = await getSampleUserIds();
  const [roleScores, studentFeedback] = await prisma.$transaction([
    prisma.meetingRoleScore.deleteMany({
      where: {
        OR: [
          { studentId: { in: sampleStudentIds } },
          { scoredByUserId: { in: sampleUserIds } }
        ]
      }
    }),
    prisma.studentMeetingFeedback.deleteMany({
      where: {
        OR: [
          { studentId: { in: sampleStudentIds } },
          { scoredByUserId: { in: sampleUserIds } }
        ]
      }
    })
  ]);

  return {
    deletedRoleScores: roleScores.count,
    deletedStudentFeedback: studentFeedback.count
  };
}

async function getSampleStudentIds() {
  const students = await prisma.student.findMany({
    where: {
      user: {
        role: Role.STUDENT,
        OR: sampleUserWhere()
      }
    },
    select: { id: true }
  });

  return students.map((student) => student.id);
}

async function getSampleUserIds() {
  const users = await prisma.user.findMany({
    where: {
      role: { in: [Role.STUDENT, Role.FACILITATOR] },
      OR: sampleUserWhere()
    },
    select: { id: true }
  });

  return users.map((user) => user.id);
}

function sampleUserWhere() {
  return [
    { email: { contains: "example.com", mode: "insensitive" as const } },
    { firstName: { contains: "Sample", mode: "insensitive" as const } },
    { lastName: { contains: "Sample", mode: "insensitive" as const } }
  ];
}

function isSampleUser(user: { email: string; firstName: string; lastName: string; role: Role }) {
  if (user.role !== Role.STUDENT && user.role !== Role.FACILITATOR) {
    return false;
  }

  const marker = `${user.email} ${user.firstName} ${user.lastName}`.toLowerCase();

  return marker.includes("example.com") || marker.includes("sample");
}

class AdminActionError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
