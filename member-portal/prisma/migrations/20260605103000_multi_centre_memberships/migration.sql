-- CreateTable
CREATE TABLE "StudentClubMembership" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentClubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentreFacilitator" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "facilitatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentreFacilitator_pkey" PRIMARY KEY ("id")
);

-- Backfill existing single-club students into memberships.
INSERT INTO "StudentClubMembership" ("id", "studentId", "clubId", "updatedAt")
SELECT concat('migrated-', "id", '-', "clubId"), "id", "clubId", CURRENT_TIMESTAMP
FROM "Student"
WHERE "clubId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StudentClubMembership_studentId_clubId_key" ON "StudentClubMembership"("studentId", "clubId");

-- CreateIndex
CREATE INDEX "StudentClubMembership_clubId_idx" ON "StudentClubMembership"("clubId");

-- CreateIndex
CREATE INDEX "StudentClubMembership_studentId_idx" ON "StudentClubMembership"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CentreFacilitator_centreId_facilitatorId_key" ON "CentreFacilitator"("centreId", "facilitatorId");

-- AddForeignKey
ALTER TABLE "StudentClubMembership" ADD CONSTRAINT "StudentClubMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClubMembership" ADD CONSTRAINT "StudentClubMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentreFacilitator" ADD CONSTRAINT "CentreFacilitator_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentreFacilitator" ADD CONSTRAINT "CentreFacilitator_facilitatorId_fkey" FOREIGN KEY ("facilitatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_clubId_fkey";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "clubId";
