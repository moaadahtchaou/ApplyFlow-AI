ALTER TABLE "Company" ADD COLUMN "city" TEXT;
ALTER TABLE "Lead" ADD COLUMN "city" TEXT;

CREATE INDEX "Lead_city_idx" ON "Lead"("city");
