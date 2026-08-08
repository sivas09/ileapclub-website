import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { standardIleapRoleDefinitions } from "../src/server/services/standardRoles.js";

const prisma = new PrismaClient();
const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || "admin@ileapclub.com";
const seedPassword = process.env.SEED_DEMO_PASSWORD || "ChangeMe123!";

type ProgramLevel = "JUNIOR" | "SENIOR";
type RequirementType = "Speech" | "Presentation" | "Task" | "Leadership" | "Other";

const bandOrder = [
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
] as const;

type CatalogItem = {
  type: RequirementType;
  title: string;
  description: string;
};

const juniorCatalog: Record<(typeof bandOrder)[number], CatalogItem[]> = {
  White: [
    { type: "Speech", title: "Induction Speech", description: "All About Me" },
    { type: "Presentation", title: "Basic Presentation", description: "Show & Tell" }
  ],
  Yellow: [
    { type: "Speech", title: "iStructure Speech", description: "Beginning, middle, end" },
    { type: "Presentation", title: "Show & Tell with a Prop", description: "Bring an object" }
  ],
  "Orange I": [
    { type: "Speech", title: "Storytelling", description: "Retell a favourite story" },
    { type: "Presentation", title: "Read a Poem or Rhyme", description: "Read aloud with feeling" }
  ],
  "Orange II": [
    { type: "Speech", title: "My Hero", description: "Someone I look up to" },
    { type: "Presentation", title: "My Dreams Board", description: "A picture board of goals" }
  ],
  "Green I": [
    { type: "Speech", title: "A Funny Story", description: "Make them smile" },
    { type: "Presentation", title: "iRead a Book and Present", description: "Read and share a book" }
  ],
  "Green II": [
    { type: "Speech", title: "Persuade Me", description: "Why we should, simple" },
    { type: "Presentation", title: "Audio Recording", description: "Record and present" }
  ],
  "Blue I": [
    { type: "Speech", title: "My Favourite Book or Movie", description: "A mini review" },
    { type: "Presentation", title: "Poster Presentation", description: "A poster on a topic" }
  ],
  "Blue II": [
    { type: "Speech", title: "I Think...", description: "My opinion plus reasons" },
    { type: "Presentation", title: "When I Grow Up", description: "My future self" }
  ],
  "Red I": [
    { type: "Speech", title: "My Favourite Saying", description: "A Junior iQuote" },
    { type: "Presentation", title: "How-To Presentation", description: "Teach the club" }
  ],
  "Red II": [
    { type: "Speech", title: "Motivate Us", description: "A short \"you can do it\"" },
    { type: "Presentation", title: "My Mini Project", description: "Present something I made" }
  ],
  "Brown I": [
    { type: "Speech", title: "Special Day Speech", description: "A toast" },
    { type: "Presentation", title: "All About...", description: "A topic/community talk" }
  ],
  "Brown II": [
    { type: "Speech", title: "My Own Story", description: "A story I make up" },
    { type: "Presentation", title: "Show the Club", description: "A longer demonstration" }
  ],
  "Black I": [
    { type: "Speech", title: "Award Accepting Speech", description: "Accept an award with confidence and gratitude" },
    { type: "Leadership", title: "Lead a Fun Activity", description: "Help run a game" }
  ],
  "Black II": [
    { type: "Speech", title: "Graduation Speech", description: "My iLEAP Journey" },
    { type: "Leadership", title: "Helping Hand", description: "Help a newer member" }
  ]
};

const seniorCatalog: Record<(typeof bandOrder)[number], CatalogItem[]> = {
  White: [
    { type: "Speech", title: "Induction Speech", description: "Introduce yourself and begin the iLEAP speaking journey" },
    { type: "Presentation", title: "Basic Presentation", description: "Present a simple topic clearly" }
  ],
  Yellow: [
    { type: "Speech", title: "Structured Speech", description: "Use a clear opening, body, and conclusion" },
    { type: "Presentation", title: "Show & Tell using props", description: "Use props to support a presentation" }
  ],
  "Orange I": [
    { type: "Speech", title: "Storytelling", description: "Tell a story with sequence and expression" },
    { type: "Presentation", title: "Read a Poem", description: "Read a poem with voice and feeling" }
  ],
  "Orange II": [
    { type: "Speech", title: "iLEADER Speech", description: "Speak about leadership and responsibility" },
    { type: "Presentation", title: "Vision Board Presentation", description: "Present a vision board and goals" }
  ],
  "Green I": [
    { type: "Speech", title: "Humorous Speech", description: "Use humour appropriately in a speech" },
    { type: "Presentation", title: "News Reading 2050", description: "Present a future-focused news reading" }
  ],
  "Green II": [
    { type: "Speech", title: "Persuasive Speech", description: "Persuade an audience using reasons and examples" },
    { type: "Presentation", title: "Record & Present an Advertisement A/V", description: "Create, record, and present an advertisement" }
  ],
  "Blue I": [
    { type: "Speech", title: "Movie or Book Review", description: "Review a movie or book with opinion and evidence" },
    { type: "Presentation", title: "PowerPoint Presentation", description: "Use slides to support a presentation" }
  ],
  "Blue II": [
    { type: "Speech", title: "Turn a Poem into a Speech", description: "Adapt a poem into a spoken speech" },
    { type: "Presentation", title: "How to Build a Resume & Cover Letter", description: "Present resume and cover letter basics" }
  ],
  "Red I": [
    { type: "Speech", title: "iQuote Speech", description: "Build a speech around a meaningful quote" },
    { type: "Presentation", title: "Kaizen Presentation", description: "Present continuous improvement ideas" }
  ],
  "Red II": [
    { type: "Speech", title: "Rule of Three & Rhetorical Devices Motivational Speech", description: "Use rhetorical devices in a motivational speech" },
    { type: "Presentation", title: "Instructional Presentation", description: "Teach a process or skill clearly" }
  ],
  "Brown I": [
    { type: "Speech", title: "Special Event Speech", description: "Deliver a speech for a special event" },
    { type: "Presentation", title: "Facilitator Presentation", description: "Present as a facilitator or meeting leader" }
  ],
  "Brown II": [
    { type: "Speech", title: "External Speech", description: "Deliver a speech outside the regular club setting" },
    { type: "Presentation", title: "External Presentation", description: "Deliver a presentation outside the regular club setting" }
  ],
  "Black I": [
    { type: "Task", title: "Analyze a Speech Video", description: "Analyze delivery, structure, and audience impact" },
    { type: "Task", title: "Conduct Case Study", description: "Lead or complete a case study discussion" },
    { type: "Leadership", title: "Assisted Facilitation", description: "Assist with facilitation duties" },
    { type: "Leadership", title: "Volunteer Assistant Facilitation", description: "Volunteer as an assistant facilitator" }
  ],
  "Black II": [
    { type: "Speech", title: "Graduation Speech", description: "Deliver a graduation speech reflecting on growth" },
    { type: "Leadership", title: "Mentoring & Contest Coordination", description: "Mentor members and help coordinate contests" }
  ]
};

function buildBandRequirements() {
  return [
    ...catalogToRequirements("JUNIOR", juniorCatalog),
    ...catalogToRequirements("SENIOR", seniorCatalog)
  ];
}

function catalogToRequirements(programLevel: ProgramLevel, catalog: Record<(typeof bandOrder)[number], CatalogItem[]>) {
  return bandOrder.flatMap((bandLevel, bandIndex) => catalog[bandLevel].map((item, itemIndex) => ({
    programLevel,
    bandLevel,
    bandOrder: bandIndex + 1,
    name: item.title,
    description: item.description,
    requirementType: item.type,
    sortOrder: (bandIndex + 1) * 10 + itemIndex + 1
  })));
}

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

  await prisma.user.updateMany({
    where: { role: Role.PARENT },
    data: { isActive: false }
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

  for (const [name, description] of standardIleapRoleDefinitions) {
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
    where: { name: { in: standardIleapRoleDefinitions.map(([name]) => name) } }
  });

  const seededRoleOrder = standardIleapRoleDefinitions.map(([name]) => name);
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

  await prisma.bandRequirement.updateMany({
    data: { isActive: false }
  });

  const bandRequirements = buildBandRequirements();

  for (const [index, requirement] of bandRequirements.entries()) {
    const savedRequirement = await prisma.bandRequirement.upsert({
      where: {
        programLevel_bandLevel_name: {
          programLevel: requirement.programLevel,
          bandLevel: requirement.bandLevel,
          name: requirement.name
        }
      },
      update: {
        bandOrder: requirement.bandOrder,
        description: requirement.description,
        requirementType: requirement.requirementType,
        targetCount: 1,
        sortOrder: requirement.sortOrder,
        isActive: true
      },
      create: {
        programLevel: requirement.programLevel,
        bandLevel: requirement.bandLevel,
        bandOrder: requirement.bandOrder,
        name: requirement.name,
        description: requirement.description,
        requirementType: requirement.requirementType,
        targetCount: 1,
        sortOrder: requirement.sortOrder,
        isActive: true
      }
    });

    if (requirement.programLevel === "SENIOR" && requirement.bandLevel === "White" && index % 2 === 0) {
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
          currentCount: 1,
          isCompleted: true,
          completedAt: new Date(),
          notes: "Seeded sample progress.",
          updatedByUserId: facilitator.id,
          facilitatorSignedOffByUserId: facilitator.id,
          facilitatorSignedOffAt: new Date()
        }
      });
    }
  }

  console.log("Seeded demo portal data.");
  console.log(`Admin: ${admin.email} / ${seedPassword}`);
  console.log(`Facilitator: ${facilitator.email} / ${seedPassword}`);
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
