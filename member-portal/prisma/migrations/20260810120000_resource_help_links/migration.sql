CREATE TABLE "ResourceLink" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    "documentUrl" TEXT,
    "programLevel" TEXT,
    "bandLevel" TEXT,
    "bandOrder" INTEGER,
    "roleKey" TEXT,
    "requirementId" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResourceLink_status_idx" ON "ResourceLink"("status");
CREATE INDEX "ResourceLink_roleKey_idx" ON "ResourceLink"("roleKey");
CREATE INDEX "ResourceLink_programLevel_bandOrder_idx" ON "ResourceLink"("programLevel", "bandOrder");
CREATE INDEX "ResourceLink_requirementId_idx" ON "ResourceLink"("requirementId");
CREATE INDEX "ResourceLink_category_idx" ON "ResourceLink"("category");

ALTER TABLE "ResourceLink" ADD CONSTRAINT "ResourceLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "BandRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResourceLink" ADD CONSTRAINT "ResourceLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceLink" ADD CONSTRAINT "ResourceLink_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
