ALTER TABLE "RoleDefinition"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Speaking Role',
ADD COLUMN "programLevel" TEXT,
ADD COLUMN "level" TEXT,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "RoleDefinition_programLevel_idx" ON "RoleDefinition"("programLevel");
CREATE INDEX "RoleDefinition_isActive_idx" ON "RoleDefinition"("isActive");
