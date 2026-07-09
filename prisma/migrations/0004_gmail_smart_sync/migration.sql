-- CreateTable
CREATE TABLE "GmailThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gmailThreadId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "applicationId" TEXT,
    "subject" TEXT,
    "participants" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'unknown',
    "firstMessageAt" DATETIME,
    "lastMessageAt" DATETIME,
    "inferredJobTitle" TEXT,
    "summary" TEXT,
    "classification" TEXT NOT NULL DEFAULT 'neutral',
    "confidence" REAL NOT NULL DEFAULT 0,
    "aiProvider" TEXT NOT NULL DEFAULT 'mock',
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GmailThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GmailThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GmailThread_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GmailMessageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "sender" TEXT,
    "recipients" TEXT,
    "subject" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'unknown',
    "sentAt" DATETIME,
    "summary" TEXT,
    "classification" TEXT NOT NULL DEFAULT 'neutral',
    "confidence" REAL NOT NULL DEFAULT 0,
    "aiProvider" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailMessageRecord_gmailThreadId_fkey" FOREIGN KEY ("gmailThreadId") REFERENCES "GmailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GmailThread_gmailThreadId_key" ON "GmailThread"("gmailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "GmailThread_applicationId_key" ON "GmailThread"("applicationId");

-- CreateIndex
CREATE INDEX "GmailThread_companyId_idx" ON "GmailThread"("companyId");

-- CreateIndex
CREATE INDEX "GmailThread_contactId_idx" ON "GmailThread"("contactId");

-- CreateIndex
CREATE INDEX "GmailThread_applicationId_idx" ON "GmailThread"("applicationId");

-- CreateIndex
CREATE INDEX "GmailThread_reviewStatus_lastMessageAt_idx" ON "GmailThread"("reviewStatus", "lastMessageAt");

-- CreateIndex
CREATE INDEX "GmailThread_classification_idx" ON "GmailThread"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "GmailMessageRecord_gmailMessageId_key" ON "GmailMessageRecord"("gmailMessageId");

-- CreateIndex
CREATE INDEX "GmailMessageRecord_gmailThreadId_idx" ON "GmailMessageRecord"("gmailThreadId");

-- CreateIndex
CREATE INDEX "GmailMessageRecord_sentAt_idx" ON "GmailMessageRecord"("sentAt");

-- CreateIndex
CREATE INDEX "GmailMessageRecord_classification_idx" ON "GmailMessageRecord"("classification");
