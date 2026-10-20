ALTER TABLE "UserSettings" ADD COLUMN "profileManualFields" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "GeneratedMessage" ADD COLUMN "ownerSettingsId" TEXT REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedMessage" ADD COLUMN "saveFingerprint" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "companyNameSnapshot" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "companyWebsiteSnapshot" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "contactSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GeneratedMessage" ADD COLUMN "signatureSnapshot" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'spontaneous_application';
ALTER TABLE "GeneratedMessage" ADD COLUMN "evidenceSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GeneratedMessage" ADD COLUMN "profileVersion" INTEGER;
ALTER TABLE "GeneratedMessage" ADD COLUMN "researchVersion" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "matchVersion" TEXT;

UPDATE "GeneratedMessage"
SET "ownerSettingsId" = (
  SELECT "id" FROM "UserSettings" WHERE "singletonKey" = 'default' LIMIT 1
)
WHERE "ownerSettingsId" IS NULL;

UPDATE "GeneratedMessage"
SET "companyNameSnapshot" = (
  SELECT "name" FROM "Company" WHERE "Company"."id" = "GeneratedMessage"."companyId"
)
WHERE "companyNameSnapshot" IS NULL;

UPDATE "GeneratedMessage"
SET "companyWebsiteSnapshot" = (
  SELECT "website" FROM "Company" WHERE "Company"."id" = "GeneratedMessage"."companyId"
)
WHERE "companyWebsiteSnapshot" IS NULL;

CREATE UNIQUE INDEX "GeneratedMessage_saveFingerprint_key" ON "GeneratedMessage"("saveFingerprint");
CREATE INDEX "GeneratedMessage_ownerSettingsId_createdAt_idx" ON "GeneratedMessage"("ownerSettingsId", "createdAt");
