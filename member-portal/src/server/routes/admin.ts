import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { isDemoCleanupEnabled } from "../config.js";
import { prisma } from "../db.js";
import {
  canCreateAccountWithRole,
  canAccessManagedUser,
  canManageUserExclusively,
  canEditAccount,
  canManageAccountAccess,
  canManageAdminAccounts,
  isCenterDirector,
  getOperationalScope,
  scopeIncludesCentre,
  scopeIncludesClub,
  operationalManagerRoles
} from "../permissions.js";
import {
  facilitatorUserSelect,
  memberUserSelect,
  safeUserDto
} from "../services/safeUser.js";

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
  role: z.enum([Role.ADMIN, Role.CENTER_DIRECTOR, Role.FACILITATOR, Role.STUDENT]),
  grade: z.string().trim().optional(),
  programLevel: z.enum(["JUNIOR", "SENIOR"]).optional(),
  bandLevel: z.string().trim().optional(),
  clubIds: z.array(z.string()).default([]),
  facilitatorClubIds: z.array(z.string()).default([]),
  centreIds: z.array(z.string()).default([])
});

const updateUserSchema = userSchema.omit({ password: true }).extend({
  isActive: z.boolean()
});

const facilitatorAssignmentSchema = z.object({
  facilitatorId: z.string().min(1)
});

const passwordResetSchema = z.object({
  newPassword: z.string().min(8)
});

const reactivateUserSchema = z.object({
  isActive: z.literal(true),
  clubIds: z.array(z.string().min(1)).default([])
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

const editableRoles = new Set<Role>([Role.ADMIN, Role.CENTER_DIRECTOR, Role.FACILITATOR, Role.STUDENT]);

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(operationalManagerRoles));

export function canAdminResetPassword(role: Role) {
  return canManageAdminAccounts(role);
}

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

adminRouter.get("/overview", asyncRoute(async (request, response) => {
  const scope = await getOperationalScope(request.user!);
  const visibleUserRoles = isCenterDirector(request.user!)
    ? [Role.FACILITATOR, Role.STUDENT]
    : [Role.ADMIN, Role.CENTER_DIRECTOR, Role.FACILITATOR, Role.STUDENT];
  const [centres, clubs, users, students] = await Promise.all([
    prisma.centre.findMany({
      where: scope.centreIds === null ? {} : { id: { in: scope.centreIds } },
      orderBy: [{ province: "asc" }, { city: "asc" }, { name: "asc" }],
      include: { clubs: true }
    }),
    prisma.club.findMany({
      where: scope.clubIds === null ? {} : { id: { in: scope.clubIds } },
      orderBy: [{ name: "asc" }],
      include: {
        centre: true,
        studentMemberships: {
          include: {
            student: {
              include: { user: { select: memberUserSelect } }
            }
          }
        },
        facilitators: {
          include: { facilitator: { select: facilitatorUserSelect } }
        }
      }
    }),
    prisma.user.findMany({
      where: {
        role: { in: visibleUserRoles },
        ...(scope.clubIds === null ? {} : {
          OR: [
            { role: Role.STUDENT, studentProfile: { clubMemberships: { some: { clubId: { in: scope.clubIds } } } } },
            { role: Role.FACILITATOR, facilitator: { some: { clubId: { in: scope.clubIds } } } }
          ]
        })
      },
      orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        ...memberUserSelect,
        studentProfile: {
          select: {
            id: true,
            grade: true,
            programLevel: true,
            bandLevel: true,
            clubMemberships: {
              ...(scope.clubIds === null ? {} : { where: { clubId: { in: scope.clubIds } } }),
              include: {
                club: {
                  include: { centre: true }
                }
              }
            }
          }
        },
        centerDirectorAssignments: {
          where: { isActive: true },
          select: { centreId: true }
        }
      }
    }),
    prisma.student.findMany({
      where: {
        user: { role: Role.STUDENT },
        ...(scope.clubIds === null ? {} : { clubMemberships: { some: { clubId: { in: scope.clubIds } } } })
      },
      orderBy: [{ user: { lastName: "asc" } }],
      include: {
        user: { select: memberUserSelect },
        clubMemberships: {
          ...(scope.clubIds === null ? {} : { where: { clubId: { in: scope.clubIds } } }),
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
    students,
    scope: {
      assignedCentres: centres.map((centre) => ({ id: centre.id, name: centre.name })),
      hasAssignedCentre: scope.centreIds === null || scope.centreIds.length > 0
    }
  });
}));

adminRouter.post("/centres", requireRole([Role.ADMIN]), asyncRoute(async (request, response) => {
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
  const scope = await getOperationalScope(request.user!);

  if (!scopeIncludesCentre(scope, centreId)) {
    response.status(403).json({ message: "You cannot manage this centre." });
    return;
  }

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

  const scope = await getOperationalScope(request.user!);

  if (!scopeIncludesCentre(scope, parsed.data.centreId)) {
    response.status(403).json({ message: "You cannot create clubs for this centre." });
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
  const scope = await getOperationalScope(request.user!);

  if (!scopeIncludesClub(scope, clubId)) {
    response.status(403).json({ message: "You cannot manage this club." });
    return;
  }

  const isActive = request.body?.isActive === true;
  const club = await prisma.club.update({
    where: { id: clubId },
    data: { isActive },
    include: {
      centre: true,
      studentMemberships: {
        include: {
          student: {
            include: { user: { select: memberUserSelect } }
          }
        }
      },
      facilitators: {
        include: { facilitator: { select: facilitatorUserSelect } }
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
      where: { id: parsed.data.facilitatorId },
      select: facilitatorUserSelect
    })
  ]);
  const scope = await getOperationalScope(request.user!);

  if (!scopeIncludesClub(scope, clubId)) {
    response.status(403).json({ message: "You cannot manage facilitator assignments for this club." });
    return;
  }

  if (isCenterDirector(request.user!) && facilitator && !(await canAccessManagedUser(request.user!, facilitator.id, facilitator.role))) {
    response.status(403).json({ message: "You cannot assign a facilitator from outside your centre scope." });
    return;
  }

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
    include: { facilitator: { select: facilitatorUserSelect } }
  });

  response.status(201).json({ assignment });
}));

adminRouter.delete("/clubs/:clubId/facilitators/:facilitatorId", asyncRoute(async (request, response) => {
  const clubId = String(request.params.clubId);
  const facilitatorId = String(request.params.facilitatorId);
  const scope = await getOperationalScope(request.user!);

  if (!scopeIncludesClub(scope, clubId)) {
    response.status(403).json({ message: "You cannot manage facilitator assignments for this club." });
    return;
  }

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

  if (!canCreateAccountWithRole(request.user!, data.role)) {
    response.status(403).json({ message: "You cannot create an account with that role." });
    return;
  }

  const email = data.email.toLowerCase();
  const requestedClubIds = [...new Set([...data.clubIds, ...data.facilitatorClubIds])];
  const requestedCentreIds = [...new Set(data.centreIds)];

  if (data.role !== Role.CENTER_DIRECTOR && requestedCentreIds.length) {
    response.status(400).json({ message: "Centre assignments apply only to Center Director accounts." });
    return;
  }

  if (data.role === Role.CENTER_DIRECTOR && !(await areActiveCentres(requestedCentreIds))) {
    response.status(400).json({ message: "Assign Center Directors only to active centres." });
    return;
  }

  if (isCenterDirector(request.user!)) {
    const scope = await getOperationalScope(request.user!);

    if (!requestedClubIds.length) {
      response.status(400).json({ message: "Assign the new user to at least one club in your centre scope." });
      return;
    }

    if (requestedClubIds.some((clubId) => !scopeIncludesClub(scope, clubId))) {
      response.status(403).json({ message: "You can assign users only within your centre scope." });
      return;
    }
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
        },
        select: memberUserSelect
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

      if (data.role === Role.CENTER_DIRECTOR && requestedCentreIds.length > 0) {
        await tx.centerDirectorAssignment.createMany({
          data: requestedCentreIds.map((centreId) => ({
            userId: createdUser.id,
            centreId,
            assignedByAdminId: request.user!.id
          })),
          skipDuplicates: true
        });
      }

      return createdUser;
    });

    response.status(201).json({
      user: safeUserDto(user)
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
  const requestedCentreIds = [...new Set(data.centreIds)];

  if (data.role !== Role.CENTER_DIRECTOR && requestedCentreIds.length) {
    response.status(400).json({ message: "Centre assignments apply only to Center Director accounts." });
    return;
  }

  if (data.role === Role.CENTER_DIRECTOR && !(await areActiveCentres(requestedCentreIds))) {
    response.status(400).json({ message: "Assign Center Directors only to active centres." });
    return;
  }

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
    select: {
      ...memberUserSelect,
      studentProfile: true
    }
  });

  if (!existingUser || !editableRoles.has(existingUser.role)) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  if (!canEditAccount(request.user!, existingUser, data.role)) {
    response.status(403).json({ message: "You cannot edit this account or assign that role." });
    return;
  }

  if (isCenterDirector(request.user!) && !(await canManageUserExclusively(request.user!, existingUser.id, existingUser.role))) {
    response.status(403).json({ message: "You cannot edit a user outside your centre scope." });
    return;
  }

  if (isCenterDirector(request.user!)) {
    const scope = await getOperationalScope(request.user!);

    if (!requestedClubIds.length) {
      response.status(400).json({ message: "Keep the user assigned to at least one club in your centre scope." });
      return;
    }

    if (requestedClubIds.some((clubId) => !scopeIncludesClub(scope, clubId))) {
      response.status(403).json({ message: "You can assign users only within your centre scope." });
      return;
    }
  }

  if (data.isActive !== existingUser.isActive) {
    response.status(400).json({ message: "Use the dedicated deactivate or reactivate action to change account status." });
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
        },
        select: memberUserSelect
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

        await syncStudentClubAccess(tx, student.id, data.clubIds);

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

      if (data.role === Role.CENTER_DIRECTOR) {
        await syncCenterDirectorAssignments(tx, userId, requestedCentreIds, request.user!.id);
      } else if (existingUser.role === Role.CENTER_DIRECTOR) {
        await tx.centerDirectorAssignment.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false }
        });
      }

      return updatedUser;
    });

    response.json({
      user: safeUserDto(user)
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
  const parsed = reactivateUserSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Select any clubs to restore and confirm account reactivation." });
    return;
  }

  const clubIds = [...new Set(parsed.data.clubIds)];
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        ...memberUserSelect,
        studentProfile: { select: { id: true } }
      }
    });

    if (!user) {
      throw new AdminActionError(404, "User not found.");
    }

    if (!canManageAccountAccess(request.user!, user.role)) {
      throw new AdminActionError(403, "You cannot reactivate this account.");
    }

    if (isCenterDirector(request.user!) && !(await canManageUserExclusively(request.user!, user.id, user.role))) {
      throw new AdminActionError(403, "You cannot reactivate a user outside your centre scope.");
    }

    if (isCenterDirector(request.user!)) {
      const scope = await getOperationalScope(request.user!);

      if (clubIds.some((clubId) => !scopeIncludesClub(scope, clubId))) {
        throw new AdminActionError(403, "You can restore access only within your centre scope.");
      }
    }

    if (user.role !== Role.STUDENT && user.role !== Role.FACILITATOR && user.role !== Role.CENTER_DIRECTOR) {
      throw new AdminActionError(400, "This account type cannot be reactivated here.");
    }

    if (user.isActive) {
      throw new AdminActionError(400, "This account is already active.");
    }

    await requireActiveClubIds(tx, clubIds);

    if (user.role === Role.STUDENT) {
      if (!user.studentProfile) {
        throw new AdminActionError(409, "This member account has no student profile to reactivate.");
      }

      await syncStudentClubAccess(tx, user.studentProfile.id, clubIds);
    } else if (user.role === Role.FACILITATOR) {
      await syncFacilitatorClubAccess(tx, user.id, clubIds);
    } else if (clubIds.length) {
      throw new AdminActionError(400, "Center Director accounts cannot be assigned to clubs.");
    }

    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { isActive: true },
      select: memberUserSelect
    });

    return {
      user: safeUserDto(updatedUser),
      activeClubIds: clubIds,
      warning: user.role !== Role.CENTER_DIRECTOR && !clubIds.length
        ? "This account will reactivate, but the member/facilitator will not have active club access."
        : null
    };
  });

  response.json(result);
}));

adminRouter.patch("/users/:userId/password", asyncRoute(async (request, response) => {
  const userId = String(request.params.userId);
  const parsed = passwordResetSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a new password of at least 8 characters." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: memberUserSelect
  });

  if (!user || !editableRoles.has(user.role)) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  if (!canManageAccountAccess(request.user!, user.role)) {
    response.status(403).json({ message: "You cannot reset this account's password." });
    return;
  }

  if (isCenterDirector(request.user!) && !(await canManageUserExclusively(request.user!, user.id, user.role))) {
    response.status(403).json({ message: "You cannot reset a password outside your centre scope." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
    select: memberUserSelect
  });

  response.json({ user: safeUserDto(updatedUser) });
}));

adminRouter.patch("/users/:userId/deactivate", asyncRoute(async (request, response) => {
  const userId = String(request.params.userId);

  if (userId === request.user?.id) {
    response.status(400).json({ message: "You cannot deactivate your own account." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...memberUserSelect,
      studentProfile: true
    }
  });

  if (!user || !editableRoles.has(user.role)) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  if (!canManageAccountAccess(request.user!, user.role)) {
    response.status(403).json({ message: "You cannot deactivate this account." });
    return;
  }

  if (isCenterDirector(request.user!) && !(await canManageUserExclusively(request.user!, user.id, user.role))) {
    response.status(403).json({ message: "You cannot deactivate a user outside your centre scope." });
    return;
  }

  if (user.role === Role.ADMIN) {
    response.status(400).json({ message: "Admin users cannot be deactivated." });
    return;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const result = await prisma.$transaction(async (tx) => {
    let deactivatedMemberships = 0;
    let clearedUpcomingRoleSlots = 0;

    if (user.role === Role.STUDENT && user.studentProfile) {
      const memberships = await tx.studentClubMembership.updateMany({
        where: {
          studentId: user.studentProfile.id,
          status: "ACTIVE"
        },
        data: {
          status: "INACTIVE",
          endDate: today
        }
      });
      const roleSlots = await tx.meetingRoleSlot.updateMany({
        where: {
          assignedStudentId: user.studentProfile.id,
          score: null,
          meeting: {
            meetingDate: {
              gte: today
            }
          }
        },
        data: {
          assignedStudentId: null,
          assignedByUserId: null,
          assignedAt: null
        }
      });

      deactivatedMemberships = memberships.count;
      clearedUpcomingRoleSlots = roleSlots.count;
    }

    if (user.role === Role.FACILITATOR) {
      await tx.clubFacilitator.deleteMany({ where: { facilitatorId: user.id } });
      await tx.centreFacilitator.deleteMany({ where: { facilitatorId: user.id } });
    }

    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { isActive: false },
      select: memberUserSelect
    });

    return {
      user: updatedUser,
      deactivatedMemberships,
      clearedUpcomingRoleSlots
    };
  });

  response.json(result);
}));

adminRouter.delete("/users/:userId/demo", requireRole([Role.ADMIN]), requireDemoCleanupEnabled, asyncRoute(async (request, response) => {
  const userId = String(request.params.userId);
  const result = await deleteSampleUser(userId, request.user!.id);

  response.json(result);
}));

adminRouter.get("/demo/cleanup-preview", requireRole([Role.ADMIN]), requireDemoCleanupEnabled, asyncRoute(async (request, response) => {
  const sampleStudentIds = await getSampleStudentIds();
  const [sampleUsers, demoMeetingIds] = await Promise.all([
    prisma.user.count({
      where: {
        id: { not: request.user!.id },
        role: { in: [Role.STUDENT, Role.FACILITATOR] },
        OR: sampleUserWhere()
      }
    }),
    getDemoMeetingIds(sampleStudentIds)
  ]);

  response.json({
    preview: {
      sampleUsers,
      sampleStudents: sampleStudentIds.length,
      demoMeetings: demoMeetingIds.length
    }
  });
}));

adminRouter.post("/demo/delete-sample-users", requireRole([Role.ADMIN]), requireDemoCleanupEnabled, asyncRoute(async (request, response) => {
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

adminRouter.post("/demo/delete-sample-feedback", requireRole([Role.ADMIN]), requireDemoCleanupEnabled, asyncRoute(async (_request, response) => {
  const summary = await deleteSampleFeedback();

  response.json(summary);
}));

adminRouter.post("/demo/reset-meeting-data", requireRole([Role.ADMIN]), requireDemoCleanupEnabled, asyncRoute(async (_request, response) => {
  const sampleStudentIds = await getSampleStudentIds();
  const demoMeetingIds = await getDemoMeetingIds(sampleStudentIds);
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

function requireDemoCleanupEnabled(_request: Request, response: Response, next: NextFunction) {
  if (!isDemoCleanupEnabled()) {
    response.status(403).json({
      message: "Demo cleanup is disabled in production. Set ENABLE_DEMO_CLEANUP=true to enable it explicitly."
    });
    return;
  }

  next();
}

async function deleteSampleUser(userId: string, currentUserId: string) {
  if (userId === currentUserId) {
    throw new AdminActionError(400, "You cannot delete your own account.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...memberUserSelect,
      studentProfile: true
    }
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
    const roleScores = await tx.meetingRoleScore.deleteMany({ where: { scoredByUserId: user.id } });
    const studentFeedback = await tx.studentMeetingFeedback.deleteMany({ where: { scoredByUserId: user.id } });
    const clubAssignments = await tx.clubFacilitator.deleteMany({ where: { facilitatorId: user.id } });
    const centreAssignments = await tx.centreFacilitator.deleteMany({ where: { facilitatorId: user.id } });

    await tx.user.delete({ where: { id: user.id } });

    return {
      deletedUser: user.email,
      deletedRoleScores: roleScores.count,
      deletedStudentFeedback: studentFeedback.count,
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

async function getDemoMeetingIds(sampleStudentIds?: string[]) {
  const studentIds = sampleStudentIds ?? await getSampleStudentIds();
  const demoMeetings = await prisma.meeting.findMany({
    where: {
      OR: [
        { id: { startsWith: "seed-" } },
        { title: { contains: "Sample", mode: "insensitive" } },
        { title: { contains: "Demo", mode: "insensitive" } },
        { roleSlots: { some: { assignedStudentId: { in: studentIds } } } }
      ]
    },
    select: { id: true }
  });

  return demoMeetings.map((meeting) => meeting.id);
}

async function requireActiveClubIds(tx: Prisma.TransactionClient, clubIds: string[]) {
  if (!clubIds.length) {
    return;
  }

  const activeClubCount = await tx.club.count({
    where: {
      id: { in: clubIds },
      isActive: true,
      centre: { isActive: true }
    }
  });

  if (activeClubCount !== clubIds.length) {
    throw new AdminActionError(400, "Restore access only to active clubs in active centres.");
  }
}

async function areActiveCentres(centreIds: string[]) {
  if (!centreIds.length) {
    return true;
  }

  return (await prisma.centre.count({
    where: { id: { in: centreIds }, isActive: true }
  })) === centreIds.length;
}

async function syncCenterDirectorAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
  centreIds: string[],
  assignedByAdminId: string
) {
  await tx.centerDirectorAssignment.updateMany({
    where: centreIds.length
      ? { userId, isActive: true, centreId: { notIn: centreIds } }
      : { userId, isActive: true },
    data: { isActive: false }
  });

  await Promise.all(centreIds.map((centreId) => tx.centerDirectorAssignment.upsert({
    where: { userId_centreId: { userId, centreId } },
    update: { isActive: true, assignedByAdminId },
    create: { userId, centreId, assignedByAdminId }
  })));
}

async function syncStudentClubAccess(tx: Prisma.TransactionClient, studentId: string, clubIds: string[]) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await tx.studentClubMembership.updateMany({
    where: clubIds.length
      ? { studentId, status: "ACTIVE", clubId: { notIn: clubIds } }
      : { studentId, status: "ACTIVE" },
    data: { status: "INACTIVE", endDate: today }
  });

  await Promise.all(clubIds.map((clubId) => tx.studentClubMembership.upsert({
    where: {
      studentId_clubId: { studentId, clubId }
    },
    update: {
      status: "ACTIVE",
      endDate: null
    },
    create: {
      studentId,
      clubId,
      status: "ACTIVE"
    }
  })));
}

async function syncFacilitatorClubAccess(tx: Prisma.TransactionClient, facilitatorId: string, clubIds: string[]) {
  await tx.clubFacilitator.deleteMany({
    where: clubIds.length
      ? { facilitatorId, clubId: { notIn: clubIds } }
      : { facilitatorId }
  });
  await tx.centreFacilitator.deleteMany({ where: { facilitatorId } });

  if (clubIds.length) {
    await tx.clubFacilitator.createMany({
      data: clubIds.map((clubId) => ({ clubId, facilitatorId })),
      skipDuplicates: true
    });
  }
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
