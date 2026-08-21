-- CreateTable
CREATE TABLE "MemberFeedback" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberFeedback_studentId_createdAt_idx" ON "MemberFeedback"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberFeedback_clubId_createdAt_idx" ON "MemberFeedback"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberFeedback_createdByUserId_idx" ON "MemberFeedback"("createdByUserId");

-- AddForeignKey
ALTER TABLE "MemberFeedback" ADD CONSTRAINT "MemberFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFeedback" ADD CONSTRAINT "MemberFeedback_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFeedback" ADD CONSTRAINT "MemberFeedback_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
