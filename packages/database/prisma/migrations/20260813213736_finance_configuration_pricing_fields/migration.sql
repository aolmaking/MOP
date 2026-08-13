-- AlterTable
ALTER TABLE "finance_configuration" ADD COLUMN     "defaultDueInDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "depositRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceNumberPrefix" TEXT NOT NULL DEFAULT 'INV',
ADD COLUMN     "maxDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxInclusive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
