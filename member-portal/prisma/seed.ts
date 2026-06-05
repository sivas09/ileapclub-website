import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ileapclub.com" },
    update: {},
    create: {
      email: "admin@ileapclub.com",
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
    update: { clubId: club.id },
    create: {
      userId: studentUser.id,
      clubId: club.id,
      grade: "Grade 7"
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

  console.log(`Seeded demo portal users. Admin: ${admin.email} / ChangeMe123!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
