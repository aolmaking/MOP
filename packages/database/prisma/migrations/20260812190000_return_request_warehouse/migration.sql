-- Fix for a real bug found in code review: completeReturn() was trusting
-- a caller-supplied warehouseId to reverse the RETURN_PENDING movement
-- requestReturn() opened, when that warehouse choice legitimately answers
-- a different question (where the part physically lands on the shelf).
-- A mismatch between the two corrupts an unrelated warehouse's
-- returnPendingQty, silently and permanently.
--
-- part_return_requests now records which warehouse the pending movement
-- was actually opened against, read back rather than trusted.

-- AlterTable
ALTER TABLE "part_return_requests" ADD COLUMN     "warehouseId" TEXT NOT NULL;
