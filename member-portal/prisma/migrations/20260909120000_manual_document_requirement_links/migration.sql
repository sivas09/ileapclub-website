ALTER TABLE "BandDocument"
ADD COLUMN "requirementId" TEXT;

CREATE INDEX "BandDocument_requirementId_idx" ON "BandDocument"("requirementId");

ALTER TABLE "BandDocument"
ADD CONSTRAINT "BandDocument_requirementId_fkey"
FOREIGN KEY ("requirementId") REFERENCES "BandRequirement"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
