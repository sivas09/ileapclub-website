ALTER TABLE "BandRequirement"
  ADD COLUMN IF NOT EXISTS "programLevel" TEXT NOT NULL DEFAULT 'SENIOR',
  ADD COLUMN IF NOT EXISTS "bandOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StudentRequirementProgress"
  ADD COLUMN IF NOT EXISTS "facilitatorSignedOffByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "facilitatorSignedOffAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminOverrideByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "adminOverrideAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "BandRequirement_bandLevel_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "BandRequirement_programLevel_bandLevel_name_key"
  ON "BandRequirement"("programLevel", "bandLevel", "name");

CREATE INDEX IF NOT EXISTS "BandRequirement_programLevel_idx"
  ON "BandRequirement"("programLevel");
