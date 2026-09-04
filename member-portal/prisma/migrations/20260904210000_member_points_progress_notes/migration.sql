-- Add a motivational points ledger and one current staff progress note per member.
CREATE TABLE "MemberPointTransaction" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "reason" VARCHAR(500),
    "awardedByUserId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberPointTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberProgressNote" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberProgressNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberProgressNote_studentId_key" ON "MemberProgressNote"("studentId");
CREATE INDEX "MemberPointTransaction_studentId_awardedAt_idx" ON "MemberPointTransaction"("studentId", "awardedAt");
CREATE INDEX "MemberPointTransaction_awardedByUserId_idx" ON "MemberPointTransaction"("awardedByUserId");
CREATE INDEX "MemberProgressNote_updatedByUserId_idx" ON "MemberProgressNote"("updatedByUserId");

ALTER TABLE "MemberPointTransaction"
ADD CONSTRAINT "MemberPointTransaction_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberPointTransaction"
ADD CONSTRAINT "MemberPointTransaction_awardedByUserId_fkey"
FOREIGN KEY ("awardedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MemberProgressNote"
ADD CONSTRAINT "MemberProgressNote_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberProgressNote"
ADD CONSTRAINT "MemberProgressNote_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
