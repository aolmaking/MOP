-- The three moments the live Work Order Journey has to be able to date
-- and, before this, could not date honestly.
--
-- Each one is an event the journey shows ("the customer opened the
-- request", "the store approved the part", "the store asked the
-- technician a question"). The fact was already recorded -- as a status,
-- or as a nullable question -- but WHEN it happened was not, and
-- `updatedAt` is the time of the last write to the row, which for a
-- request that moved on afterwards is a different moment entirely.
-- Inferring the timestamp from current state is exactly the fabricated
-- history the journey exists to avoid.

ALTER TABLE "customer_decision_requests" ADD COLUMN "viewedAt" TIMESTAMP(3);
ALTER TABLE "part_requests" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "part_return_requests" ADD COLUMN "clarificationAskedAt" TIMESTAMP(3);
ALTER TABLE "part_return_requests" ADD COLUMN "clarificationAnsweredAt" TIMESTAMP(3);
