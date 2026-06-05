-- CreateTable
CREATE TABLE "BandRequirement" (
    "id" TEXT NOT NULL,
    "bandLevel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirementType" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentRequirementProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentRequirementProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BandRequirement_bandLevel_name_key" ON "BandRequirement"("bandLevel", "name");

-- CreateIndex
CREATE INDEX "BandRequirement_bandLevel_idx" ON "BandRequirement"("bandLevel");

-- CreateIndex
CREATE UNIQUE INDEX "StudentRequirementProgress_studentId_requirementId_key" ON "StudentRequirementProgress"("studentId", "requirementId");

-- CreateIndex
CREATE INDEX "StudentRequirementProgress_studentId_idx" ON "StudentRequirementProgress"("studentId");

-- AddForeignKey
ALTER TABLE "StudentRequirementProgress" ADD CONSTRAINT "StudentRequirementProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRequirementProgress" ADD CONSTRAINT "StudentRequirementProgress_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "BandRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
