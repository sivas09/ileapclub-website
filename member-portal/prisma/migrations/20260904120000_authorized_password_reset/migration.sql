-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PasswordResetAudit" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "resetByUserId" TEXT NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordResetAudit_targetUserId_resetAt_idx" ON "PasswordResetAudit"("targetUserId", "resetAt");

-- CreateIndex
CREATE INDEX "PasswordResetAudit_resetByUserId_resetAt_idx" ON "PasswordResetAudit"("resetByUserId", "resetAt");
