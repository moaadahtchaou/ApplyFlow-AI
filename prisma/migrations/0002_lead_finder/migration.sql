ALTER TABLE "Company" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "Company" ADD COLUMN "rating" REAL;
ALTER TABLE "Company" ADD COLUMN "reviewCount" INTEGER;
ALTER TABLE "Company" ADD COLUMN "latitude" REAL;
ALTER TABLE "Company" ADD COLUMN "longitude" REAL;
ALTER TABLE "Company" ADD COLUMN "leadFingerprint" TEXT;

CREATE TABLE "LeadSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "requestedLimit" INTEGER NOT NULL,
    "enrichEmails" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'running',
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "searchId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "rating" REAL,
    "reviewCount" INTEGER,
    "latitude" REAL,
    "longitude" REAL,
    "sourceUrl" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LeadSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Company_leadFingerprint_key" ON "Company"("leadFingerprint");
CREATE INDEX "LeadSearch_createdAt_idx" ON "LeadSearch"("createdAt");
CREATE INDEX "LeadSearch_status_idx" ON "LeadSearch"("status");
CREATE INDEX "Lead_searchId_status_idx" ON "Lead"("searchId", "status");
CREATE INDEX "Lead_fingerprint_idx" ON "Lead"("fingerprint");
CREATE INDEX "Lead_companyId_idx" ON "Lead"("companyId");
