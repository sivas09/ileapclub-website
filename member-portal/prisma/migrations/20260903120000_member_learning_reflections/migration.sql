-- CreateTable
CREATE TABLE "MemberLearningReflection" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "meetingId" TEXT,
    "whatLearned" VARCHAR(200) NOT NULL,
    "whatDidWell" VARCHAR(200) NOT NULL,
    "whatToImprove" VARCHAR(200) NOT NULL,
    "bandRequirementId" TEXT,
    "thinksBandRequirementCompleted" BOOLEAN NOT NULL DEFAULT false,
    "facilitatorResponse" VARCHAR(300),
    "respondedByUserId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberLearningReflection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberLearningReflection_studentId_createdAt_idx" ON "MemberLearningReflection"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberLearningReflection_meetingId_idx" ON "MemberLearningReflection"("meetingId");

-- CreateIndex
CREATE INDEX "MemberLearningReflection_bandRequirementId_idx" ON "MemberLearningReflection"("bandRequirementId");

-- CreateIndex
CREATE INDEX "MemberLearningReflection_respondedByUserId_idx" ON "MemberLearningReflection"("respondedByUserId");

-- AddForeignKey
ALTER TABLE "MemberLearningReflection" ADD CONSTRAINT "MemberLearningReflection_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberLearningReflection" ADD CONSTRAINT "MemberLearningReflection_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberLearningReflection" ADD CONSTRAINT "MemberLearningReflection_bandRequirementId_fkey" FOREIGN KEY ("bandRequirementId") REFERENCES "BandRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberLearningReflection" ADD CONSTRAINT "MemberLearningReflection_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
