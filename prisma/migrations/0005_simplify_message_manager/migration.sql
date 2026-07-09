PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "GmailMessageRecord";
DROP TABLE IF EXISTS "GmailThread";
DROP TABLE IF EXISTS "FollowUpTask";
DROP TABLE IF EXISTS "Application";
DROP TABLE IF EXISTS "GmailConnection";

CREATE TABLE "new_GeneratedMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT,
    "contactId" TEXT,
    "purpose" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'English',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GeneratedMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_GeneratedMessage" ("id", "companyId", "contactId", "purpose", "tone", "language", "subject", "body", "provider", "createdAt")
SELECT "id", "companyId", "contactId", "jobTitle", "tone", "language", "subject", "body", "provider", "createdAt"
FROM "GeneratedMessage";

DROP TABLE "GeneratedMessage";
ALTER TABLE "new_GeneratedMessage" RENAME TO "GeneratedMessage";
CREATE INDEX "GeneratedMessage_companyId_idx" ON "GeneratedMessage"("companyId");
CREATE INDEX "GeneratedMessage_contactId_idx" ON "GeneratedMessage"("contactId");
CREATE INDEX "GeneratedMessage_createdAt_idx" ON "GeneratedMessage"("createdAt");

ALTER TABLE "UserSettings" ADD COLUMN "aiProvider" TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE "UserSettings" ADD COLUMN "nvidiaApiKey" TEXT NOT NULL DEFAULT '';

DELETE FROM "ActivityLog"
WHERE "entityType" IN ('Application', 'Reply', 'FollowUpTask', 'GmailThread', 'GmailMessageRecord');

PRAGMA foreign_keys=ON;
