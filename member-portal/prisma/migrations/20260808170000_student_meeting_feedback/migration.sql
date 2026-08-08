-- CreateTable
CREATE TABLE "StudentMeetingFeedback" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "roleSlotId" TEXT,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,
    "scoredByUserId" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentMeetingFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentMeetingFeedback_meetingId_studentId_key" ON "StudentMeetingFeedback"("meetingId", "studentId");

-- CreateIndex
CREATE INDEX "StudentMeetingFeedback_meetingId_idx" ON "StudentMeetingFeedback"("meetingId");

-- CreateIndex
CREATE INDEX "StudentMeetingFeedback_studentId_idx" ON "StudentMeetingFeedback"("studentId");

-- CreateIndex
CREATE INDEX "StudentMeetingFeedback_roleSlotId_idx" ON "StudentMeetingFeedback"("roleSlotId");

-- AddForeignKey
ALTER TABLE "StudentMeetingFeedback" ADD CONSTRAINT "StudentMeetingFeedback_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMeetingFeedback" ADD CONSTRAINT "StudentMeetingFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
