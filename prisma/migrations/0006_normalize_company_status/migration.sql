UPDATE "Company"
SET "status" = 'new'
WHERE "status" NOT IN ('new', 'priority', 'archived');
