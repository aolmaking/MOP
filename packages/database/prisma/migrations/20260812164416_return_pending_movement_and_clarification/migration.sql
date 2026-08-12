-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'RETURN_PENDING';

-- AlterTable
ALTER TABLE "part_return_requests" ADD COLUMN     "clarificationQuestion" TEXT;
