import "dotenv/config";
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
    update: { passwordHash },
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
    update: { passwordHash },
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
    update: { passwordHash },
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
    update: { passwordHash },
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

  const roleDefinitions = [
    ["iChair", "Lead the meeting, transitions, introductions, and closing."],
    ["iGrammarian", "Introduce the phrase or idiom of the day and report language usage."],
    ["iFiller Counter", "Track filler words and repeated phrases."],
    ["iFinesMaster", "Lead the fine, quiz, or participation challenge."],
    ["iTimer", "Track timing and present the timer report."],
    ["Prepared Speech 1", "Deliver prepared speech 1."],
    ["Prepared Speech 2", "Deliver prepared speech 2."],
    ["Prepared Speech 3", "Deliver prepared speech 3."],
    ["Prepared Speech 4", "Deliver prepared speech 4."],
    ["Prepared Speech Evaluator 1", "Evaluate prepared speech 1."],
    ["Prepared Speech Evaluator 2", "Evaluate prepared speech 2."],
    ["Prepared Speech Evaluator 3", "Evaluate prepared speech 3."],
    ["Prepared Speech Evaluator 4", "Evaluate prepared speech 4."],
    ["Prepared Presentation 1", "Deliver prepared presentation 1."],
    ["Prepared Presentation 2", "Deliver prepared presentation 2."],
    ["Prepared Presentation 3", "Deliver prepared presentation 3."],
    ["Prepared Presentation 4", "Deliver prepared presentation 4."],
    ["Prepared Presentation Evaluator 1", "Evaluate prepared presentation 1."],
    ["Prepared Presentation Evaluator 2", "Evaluate prepared presentation 2."],
    ["Prepared Presentation Evaluator 3", "Evaluate prepared presentation 3."],
    ["Prepared Presentation Evaluator 4", "Evaluate prepared presentation 4."],
    ["iThink on My Feet Master", "Lead the impromptu speaking segment."],
    ["iThink on My Feet Participant 1", "Complete impromptu speaking participant role 1."],
    ["iThink on My Feet Participant 2", "Complete impromptu speaking participant role 2."],
    ["iThink on My Feet Participant 3", "Complete impromptu speaking participant role 3."],
    ["iThink on My Feet Participant 4", "Complete impromptu speaking participant role 4."],
    ["iThink on My Feet Evaluator 1", "Evaluate impromptu participant 1."],
    ["iThink on My Feet Evaluator 2", "Evaluate impromptu participant 2."],
    ["iThink on My Feet Evaluator 3", "Evaluate impromptu participant 3."],
    ["iThink on My Feet Evaluator 4", "Evaluate impromptu participant 4."],
    ["iStory and Joke Master", "Lead the story and joke segment."],
    ["iStory and Joke Speaker 1", "Deliver story or joke role 1."],
    ["iStory and Joke Speaker 2", "Deliver story or joke role 2."],
    ["iStory and Joke Evaluator 1", "Evaluate story or joke role 1."],
    ["iStory and Joke Evaluator 2", "Evaluate story or joke role 2."],
    ["Case Study Lead (20 Mins)", "Lead the 20-minute case study discussion."],
    ["iChair Report", "Present the chair report."],
    ["iGrammarian Report", "Present the grammarian report."],
    ["iFiller Counter Report", "Present the filler counter report."],
    ["iFinesMaster Report", "Present the fines master report."],
    ["iTimer Report", "Present the timer report."]
  ] as const;

  for (const [name, description] of roleDefinitions) {
    await prisma.roleDefinition.upsert({
      where: { name },
      update: { description, isActive: true },
      create: { name, description }
    });
  }

  await prisma.roleDefinition.updateMany({
    where: {
      name: {
        in: [
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
        ]
      }
    },
    data: { isActive: false }
  });

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
    where: { name: { in: roleDefinitions.map(([name]) => name) } }
  });

  const seededRoleOrder = roleDefinitions.map(([name]) => name);
  const seededRoleByName = new Map(seededRoles.map((role) => [role.name, role]));

  for (const [index, roleName] of seededRoleOrder.entries()) {
    const role = seededRoleByName.get(roleName);

    if (!role) {
      continue;
    }

    await prisma.meetingRoleSlot.upsert({
      where: {
        meetingId_sortOrder: {
          meetingId: sampleMeeting.id,
          sortOrder: index + 1
        }
      },
      update: {
        roleDefinitionId: role.id,
        slotLabel: role.name
      },
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
      roleDefinition: { name: "Prepared Speech 1" }
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
