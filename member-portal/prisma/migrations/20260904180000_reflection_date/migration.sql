-- Add the explicit reflection date and preserve existing entries using their creation date.
ALTER TABLE "MemberLearningReflection" ADD COLUMN "reflectionDate" DATE;

UPDATE "MemberLearningReflection"
SET "reflectionDate" = "createdAt"::date;

ALTER TABLE "MemberLearningReflection"
ALTER COLUMN "reflectionDate" SET NOT NULL,
ALTER COLUMN "reflectionDate" SET DEFAULT CURRENT_TIMESTAMP;
