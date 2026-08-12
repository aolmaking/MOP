-- Phase 9, Billing/Invoicing. BillingDocument is the legal artifact,
-- deliberately separate from Invoice (Finance's settlement record):
-- Invoice keeps the running balance and numbering; this table gets its
-- own lifecycle, an immutable rendered snapshot, and room for a real
-- clearance adapter later without touching Finance at all.
--
-- CreditNote gets the same sequential-numbering treatment InvoiceSequence
-- already proved out (credit_note_sequences), created but never wired
-- since Phase 8. compliantBlocked flags a tenant whose country has no
-- adapter beyond generic -- visibility only in this phase, never a hard
-- block.

-- CreateEnum
CREATE TYPE "BillingDocumentStatus" AS ENUM ('PENDING', 'CLEARED', 'REJECTED', 'CLEARANCE_FAILED');

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "billingDocumentId" TEXT,
ADD COLUMN     "creditNoteNumber" TEXT;

-- AlterTable
ALTER TABLE "finance_configuration" ADD COLUMN     "compliantBlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "credit_note_sequences" (
    "tenantId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_sequences_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "billing_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "adapterName" TEXT NOT NULL,
    "status" "BillingDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "qrPayload" TEXT,
    "clearanceReference" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_documents_invoiceId_key" ON "billing_documents"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_documents_tenantId_documentNumber_key" ON "billing_documents"("tenantId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_tenantId_creditNoteNumber_key" ON "credit_notes"("tenantId", "creditNoteNumber");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_billingDocumentId_fkey" FOREIGN KEY ("billingDocumentId") REFERENCES "billing_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

