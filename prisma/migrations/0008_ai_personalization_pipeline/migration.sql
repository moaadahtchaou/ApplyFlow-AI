ALTER TABLE "Company" ADD COLUMN "researchData" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Company" ADD COLUMN "researchWarnings" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Company" ADD COLUMN "researchStatus" TEXT NOT NULL DEFAULT 'not_analyzed';
ALTER TABLE "Company" ADD COLUMN "researchVersion" TEXT;
ALTER TABLE "Company" ADD COLUMN "researchInputHash" TEXT;
ALTER TABLE "Company" ADD COLUMN "researchAnalyzedAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "researchConfidence" REAL;

ALTER TABLE "GeneratedMessage" ADD COLUMN "matchId" TEXT REFERENCES "CandidateCompanyMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedMessage" ADD COLUMN "providerModel" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "fallbackUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GeneratedMessage" ADD COLUMN "promptVersion" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "companyFactUsed" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "companyFactSourceUrl" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "candidateEvidenceUsed" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "selectedProject" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "matchingAngle" TEXT;
ALTER TABLE "GeneratedMessage" ADD COLUMN "evaluationData" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GeneratedMessage" ADD COLUMN "qualityScore" REAL;
ALTER TABLE "GeneratedMessage" ADD COLUMN "automaticRewriteUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GeneratedMessage" ADD COLUMN "generatedAt" DATETIME;

ALTER TABLE "UserSettings" ADD COLUMN "structuredProfile" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserSettings" ADD COLUMN "cvExtractionData" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserSettings" ADD COLUMN "cvAnalysisStatus" TEXT NOT NULL DEFAULT 'not_analyzed';
ALTER TABLE "UserSettings" ADD COLUMN "cvAnalysisVersion" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "cvAnalysisProvider" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "cvAnalysisModel" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "cvInputHash" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "cvAnalyzedAt" DATETIME;
ALTER TABLE "UserSettings" ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CandidateCompanyMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "targetRole" TEXT NOT NULL,
    "jobOfferHash" TEXT,
    "inputHash" TEXT NOT NULL,
    "matchData" TEXT NOT NULL,
    "matchScore" REAL NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateCompanyMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Company_researchStatus_idx" ON "Company"("researchStatus");
CREATE INDEX "Company_researchAnalyzedAt_idx" ON "Company"("researchAnalyzedAt");
CREATE INDEX "GeneratedMessage_matchId_idx" ON "GeneratedMessage"("matchId");
CREATE INDEX "CandidateCompanyMatch_companyId_createdAt_idx" ON "CandidateCompanyMatch"("companyId", "createdAt");
CREATE INDEX "CandidateCompanyMatch_inputHash_idx" ON "CandidateCompanyMatch"("inputHash");
CREATE INDEX "CandidateCompanyMatch_status_idx" ON "CandidateCompanyMatch"("status");
CREATE INDEX "UserSettings_cvAnalysisStatus_idx" ON "UserSettings"("cvAnalysisStatus");
