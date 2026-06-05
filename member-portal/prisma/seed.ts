import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || "admin@ileapclub.com";
const seedPassword = process.env.SEED_DEMO_PASSWORD || "ChangeMe123!";

async function main() {
  if (seedPassword.length < 8) {
    throw new Error("SEED_DEMO_PASSWORD must be at least 8 characters.");
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: {},
    create: {
      email: seedAdminEmail,
      passwordHash,
      firstName: "iLEAP",
      lastName: "Admin",
      role: Role.ADMIN
    }
  });

  const facilitator = await prisma.user.upsert({
    where: { email: "facilitator@ileapclub.com" },
    update: {},
    create: {
      email: "facilitator@ileapclub.com",
      passwordHash,
      firstName: "Sample",
      lastName: "Facilitator",
      role: Role.FACILITATOR
    }
  });

  const parent = await prisma.user.upsert({
    where: { email: "parent@example.com" },
    update: {},
    create: {
      email: "parent@example.com",
      passwordHash,
      firstName: "Sample",
      lastName: "Parent",
      role: Role.PARENT
    }
  });

  const studentUser = await prisma.user.upsert({
    where: { email: "student@example.com" },
    update: {},
    create: {
      email: "student@example.com",
      passwordHash,
      firstName: "Sample",
      lastName: "Student",
      role: Role.STUDENT
    }
  });

  const centre = await prisma.centre.upsert({
    where: { id: "seed-ottawa-centre" },
    update: {},
    create: {
      id: "seed-ottawa-centre",
      name: "Ottawa Centre",
      province: "Ontario",
      city: "Ottawa"
    }
  });

  const club = await prisma.club.upsert({
    where: { id: "seed-senior-club" },
    update: {},
    create: {
      id: "seed-senior-club",
      centreId: centre.id,
      name: "Saturday Senior Club",
      program: "Senior Regular Meeting"
    }
  });

  const student = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      grade: "Grade 7"
    }
  });

  await prisma.studentClubMembership.upsert({
    where: {
      studentId_clubId: {
        studentId: student.id,
        clubId: club.id
      }
    },
    update: { status: "ACTIVE" },
    create: {
      studentId: student.id,
      clubId: club.id
    }
  });

  await prisma.studentParent.upsert({
    where: {
      parentId_studentId: {
        parentId: parent.id,
        studentId: student.id
      }
    },
    update: {},
    create: {
      parentId: parent.id,
      studentId: student.id
    }
  });

  await prisma.clubFacilitator.upsert({
    where: {
      clubId_facilitatorId: {
        clubId: club.id,
        facilitatorId: facilitator.id
      }
    },
    update: {},
    create: {
      clubId: club.id,
      facilitatorId: facilitator.id
    }
  });

  await prisma.centreFacilitator.upsert({
    where: {
      centreId_facilitatorId: {
        centreId: centre.id,
        facilitatorId: facilitator.id
      }
    },
    update: {},
    create: {
      centreId: centre.id,
      facilitatorId: facilitator.id
    }
  });

  const roleNames = [
    "Chair",
    "Toast",
    "Timer",
    "Grammarian",
    "Speaker 1",
    "Speaker 2",
    "Evaluator 1",
    "Evaluator 2",
    "Table Topics Master",
    "General Evaluator",
    "Debate Moderator",
    "Town Hall Lead",
    "Vote Counter",
    "Ah Counter",
    "Quiz Master"
  ];

  for (const name of roleNames) {
    await prisma.roleDefinition.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  const sampleMeeting = await prisma.meeting.upsert({
    where: { id: "seed-senior-meeting" },
    update: {},
    create: {
      id: "seed-senior-meeting",
      clubId: club.id,
      title: "Senior Regular Meeting",
      templateType: "Senior Regular Meeting",
      meetingDate: new Date("2026-07-04T14:00:00.000Z"),
      startTime: "10:00 AM",
      location: "Ottawa Centre"
    }
  });

  const seededRoles = await prisma.roleDefinition.findMany({
    where: { name: { in: ["Chair", "Timer", "Speaker 1", "Evaluator 1", "Table Topics Master"] } }
  });

  for (const [index, role] of seededRoles.entries()) {
    await prisma.meetingRoleSlot.upsert({
      where: {
        meetingId_sortOrder: {
          meetingId: sampleMeeting.id,
          sortOrder: index + 1
        }
      },
      update: {},
      create: {
        meetingId: sampleMeeting.id,
        roleDefinitionId: role.id,
        slotLabel: role.name,
        sortOrder: index + 1
      }
    });
  }

  await prisma.meetingAttendance.upsert({
    where: {
      meetingId_studentId: {
        meetingId: sampleMeeting.id,
        studentId: student.id
      }
    },
    update: {},
    create: {
      meetingId: sampleMeeting.id,
      studentId: student.id,
      status: "PRESENT",
      markedByUserId: facilitator.id
    }
  });

  const speakerSlot = await prisma.meetingRoleSlot.findFirst({
    where: {
      meetingId: sampleMeeting.id,
      roleDefinition: { name: "Speaker 1" }
    }
  });

  if (speakerSlot) {
    await prisma.meetingRoleSlot.update({
      where: { id: speakerSlot.id },
      data: {
        assignedStudentId: student.id,
        assignedByUserId: facilitator.id,
        assignedAt: new Date()
      }
    });

    await prisma.meetingRoleScore.upsert({
      where: { roleSlotId: speakerSlot.id },
      update: {},
      create: {
        meetingId: sampleMeeting.id,
        roleSlotId: speakerSlot.id,
        studentId: student.id,
        score: 85,
        feedback: "Clear structure and confident delivery.",
        scoredByUserId: facilitator.id
      }
    });
  }

  const bandRequirements = [
    ["White", "Attend orientation", "Complete the first club orientation and understand meeting roles.", "ATTENDANCE", 1],
    ["White", "First speaking role", "Complete one short speaking role.", "ROLE", 1],
    ["Yellow", "Prepared speech", "Deliver one prepared speech with opening, body, and conclusion.", "SPEECH", 1],
    ["Yellow", "Listening role", "Complete one listening or observation role.", "ROLE", 1],
    ["Orange", "Impromptu speaking", "Complete two impromptu speaking activities.", "SPEECH", 2],
    ["Orange", "Peer feedback", "Give constructive feedback to another student.", "FEEDBACK", 1],
    ["Green", "Leadership role", "Lead a meeting segment or team activity.", "LEADERSHIP", 1],
    ["Green", "Attendance consistency", "Attend four marked meetings.", "ATTENDANCE", 4],
    ["Pink", "Debate participation", "Participate in a debate or persuasive speaking activity.", "DEBATE", 1],
    ["Red", "Evaluator role", "Complete two evaluator or feedback roles.", "FEEDBACK", 2],
    ["Brown", "Town hall challenge", "Participate in a town hall leadership challenge.", "LEADERSHIP", 1],
    ["Black", "Competition readiness", "Complete a competition-style speech or debate round.", "COMPETITION", 1],
    ["Purple", "Mentor contribution", "Support or mentor another student's preparation.", "LEADERSHIP", 1],
    ["Blue", "Capstone presentation", "Deliver a polished capstone presentation or leadership project.", "CAPSTONE", 1]
  ] as const;

  for (const [index, requirement] of bandRequirements.entries()) {
    const [bandLevel, name, description, requirementType, targetCount] = requirement;
    const savedRequirement = await prisma.bandRequirement.upsert({
      where: {
        bandLevel_name: {
          bandLevel,
          name
        }
      },
      update: {
        description,
        requirementType,
        targetCount,
        sortOrder: index + 1
      },
      create: {
        bandLevel,
        name,
        description,
        requirementType,
        targetCount,
        sortOrder: index + 1
      }
    });

    if (bandLevel === "White") {
      await prisma.studentRequirementProgress.upsert({
        where: {
          studentId_requirementId: {
            studentId: student.id,
            requirementId: savedRequirement.id
          }
        },
        update: {},
        create: {
          studentId: student.id,
          requirementId: savedRequirement.id,
          currentCount: targetCount,
          isCompleted: true,
          completedAt: new Date(),
          notes: "Seeded sample progress.",
          updatedByUserId: facilitator.id
        }
      });
    }
  }

  console.log("Seeded demo portal data.");
  console.log(`Admin: ${admin.email} / ${seedPassword}`);
  console.log(`Facilitator: ${facilitator.email} / ${seedPassword}`);
  console.log(`Parent: ${parent.email} / ${seedPassword}`);
  console.log(`Student: ${studentUser.email} / ${seedPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
