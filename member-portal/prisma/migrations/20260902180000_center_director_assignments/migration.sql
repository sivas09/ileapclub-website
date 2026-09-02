-- AlterTable
ALTER TABLE "ResourceLink" ADD COLUMN "centreId" TEXT;

-- CreateTable
CREATE TABLE "CenterDirectorAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "assignedByAdminId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterDirectorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CenterDirectorAssignment_userId_centreId_key" ON "CenterDirectorAssignment"("userId", "centreId");

-- CreateIndex
CREATE INDEX "CenterDirectorAssignment_centreId_isActive_idx" ON "CenterDirectorAssignment"("centreId", "isActive");

-- CreateIndex
CREATE INDEX "CenterDirectorAssignment_assignedByAdminId_idx" ON "CenterDirectorAssignment"("assignedByAdminId");

-- CreateIndex
CREATE INDEX "ResourceLink_centreId_idx" ON "ResourceLink"("centreId");

-- AddForeignKey
ALTER TABLE "CenterDirectorAssignment" ADD CONSTRAINT "CenterDirectorAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterDirectorAssignment" ADD CONSTRAINT "CenterDirectorAssignment_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterDirectorAssignment" ADD CONSTRAINT "CenterDirectorAssignment_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLink" ADD CONSTRAINT "ResourceLink_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
