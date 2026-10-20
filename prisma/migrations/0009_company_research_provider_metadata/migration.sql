ALTER TABLE "Company" ADD COLUMN "researchProvider" TEXT;
ALTER TABLE "Company" ADD COLUMN "researchModel" TEXT;
ALTER TABLE "Company" ADD COLUMN "researchFallbackUsed" BOOLEAN NOT NULL DEFAULT false;
