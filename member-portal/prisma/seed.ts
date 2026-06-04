import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  await prisma.user.upsert({
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

  console.log("Seeded admin@ileapclub.com with password ChangeMe123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
