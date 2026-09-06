-- The link that makes "was this recommendation performed?" answerable from
-- domain evidence rather than from a string comparison. See the comments on
-- Task.decisionItemId in schema.prisma.

ALTER TABLE "tasks" ADD COLUMN "decisionItemId" TEXT;

CREATE INDEX "tasks_decisionItemId_idx" ON "tasks"("decisionItemId");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_decisionItemId_fkey"
  FOREIGN KEY ("decisionItemId") REFERENCES "customer_decision_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
