-- Store one storage-provider-neutral current teaching module assignment per club.
CREATE TABLE "ClubTeachingModule" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "resourceUrl" TEXT NOT NULL,
    "description" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubTeachingModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubTeachingModule_clubId_key" ON "ClubTeachingModule"("clubId");
CREATE INDEX "ClubTeachingModule_updatedByUserId_idx" ON "ClubTeachingModule"("updatedByUserId");

ALTER TABLE "ClubTeachingModule"
ADD CONSTRAINT "ClubTeachingModule_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClubTeachingModule"
ADD CONSTRAINT "ClubTeachingModule_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
