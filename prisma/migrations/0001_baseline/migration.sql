-- Baseline for the schema that existed before Prisma Migrate was introduced.
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT,
    "contactId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "jobUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "sentDate" DATETIME,
    "followUpDate" DATETIME,
    "replyStatus" TEXT NOT NULL DEFAULT 'none',
    "notes" TEXT,
    "generatedMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Application_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Application_generatedMessageId_fkey" FOREIGN KEY ("generatedMessageId") REFERENCES "GeneratedMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "GeneratedMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT,
    "contactId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'English',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "followUpBody" TEXT,
    "linkedinMessage" TEXT,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GeneratedMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpTask_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityName" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "candidateProfile" TEXT NOT NULL DEFAULT '',
    "defaultSignature" TEXT NOT NULL DEFAULT '',
    "defaultTone" TEXT NOT NULL DEFAULT 'professional',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'English',
    "fullName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "targetRole" TEXT NOT NULL DEFAULT '',
    "experienceSummary" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '',
    "languages" TEXT NOT NULL DEFAULT '',
    "preferredLocations" TEXT NOT NULL DEFAULT '',
    "cvText" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "email" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "scope" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Application_generatedMessageId_key" ON "Application"("generatedMessageId");
CREATE INDEX "FollowUpTask_done_dueDate_idx" ON "FollowUpTask"("done", "dueDate");
CREATE UNIQUE INDEX "UserSettings_singletonKey_key" ON "UserSettings"("singletonKey");
