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

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole([Role.ADMIN]));

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
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
