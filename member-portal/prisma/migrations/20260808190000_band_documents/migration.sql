-- CreateTable
CREATE TABLE "BandDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "programLevel" TEXT NOT NULL,
    "bandLevel" TEXT NOT NULL,
    "bandOrder" INTEGER NOT NULL,
    "clubId" TEXT,
    "category" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BandDocument_programLevel_bandOrder_idx" ON "BandDocument"("programLevel", "bandOrder");

-- CreateIndex
CREATE INDEX "BandDocument_clubId_idx" ON "BandDocument"("clubId");

-- CreateIndex
CREATE INDEX "BandDocument_status_idx" ON "BandDocument"("status");

-- CreateIndex
CREATE INDEX "BandDocument_category_idx" ON "BandDocument"("category");

-- AddForeignKey
ALTER TABLE "BandDocument" ADD CONSTRAINT "BandDocument_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandDocument" ADD CONSTRAINT "BandDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
