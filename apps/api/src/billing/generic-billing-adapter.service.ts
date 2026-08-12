import { Injectable } from "@nestjs/common";
import type {
  BillingCountryAdapter,
  BillingDocumentArtifact,
  BillingValidationResult,
  ClearanceSubmissionResult,
  ClearanceStatus,
  CreditNoteDocument,
  DebitNoteDocument,
  InvoiceCandidate,
  InvoiceSnapshot,
  QrPayload,
} from "@mop/shared";

/**
 * The jurisdiction-agnostic adapter. Ships first, per `docs/SYSTEMS.md`;
 * `EgyptETAAdapter` / `SaudiZATCAAdapter` are not built in this phase --
 * proving the seam is real (a second, differently-behaved adapter can
 * stand in without Billing's own service code changing) is the exit
 * criterion, not a second real adapter.
 *
 * Every method here does the minimum a jurisdiction-agnostic invoice
 * needs and nothing a real adapter would need to override silently:
 * `validateInvoice` checks only universal invariants, clearance is
 * synthetic and immediate because there is no real clearance authority
 * to call, and `generateQr` returns null rather than a fabricated
 * payload -- a document with no QR code is honest; one with a QR code
 * encoding nothing a scanner would recognise is not.
 */
@Injectable()
export class GenericBillingAdapter implements BillingCountryAdapter {
  readonly name = "GENERIC";

  validateInvoice(candidate: InvoiceCandidate): BillingValidationResult {
    const errors: { field: string; message: string }[] = [];

    if (!candidate.currency) errors.push({ field: "currency", message: "An invoice needs a currency." });
    if (!candidate.tenantId) errors.push({ field: "tenantId", message: "An invoice needs a workshop." });
    if (candidate.lines.length === 0) {
      errors.push({ field: "lines", message: "An invoice with no lines is not a document." });
    }
    if (Number(candidate.total) <= 0) {
      errors.push({ field: "total", message: "An invoice must total more than zero." });
    }

    return { valid: errors.length === 0, errors };
  }

  generateDocument(invoice: InvoiceSnapshot): BillingDocumentArtifact {
    return {
      adapterName: this.name,
      documentNumber: invoice.invoiceNumber,
      qr: this.generateQr(invoice),
      renderedAt: new Date().toISOString(),
    };
  }

  /**
   * No real clearance authority exists for the generic adapter, so
   * clearance is synthetic and immediate -- CLEARED, not a fabricated
   * PENDING that would never resolve. A real adapter's whole reason to
   * exist is that this method genuinely has to wait and can genuinely
   * fail.
   */
  submitForClearance(_invoice: InvoiceSnapshot): ClearanceSubmissionResult {
    return { status: "CLEARED", clearanceReference: null, rejectionReason: null };
  }

  getClearanceStatus(_invoiceId: string): ClearanceStatus {
    return "CLEARED";
  }

  generateQr(_invoice: InvoiceSnapshot): QrPayload {
    return { format: "NONE", data: null };
  }

  generateCreditNote(
    invoice: InvoiceSnapshot,
    amount: string,
    reason: string,
    creditNoteNumber: string,
  ): CreditNoteDocument {
    return {
      adapterName: this.name,
      creditNoteNumber,
      originalInvoiceNumber: invoice.invoiceNumber,
      amount,
      reason,
      issuedAt: new Date().toISOString(),
    };
  }

  generateDebitNote(
    invoice: InvoiceSnapshot,
    amount: string,
    reason: string,
    debitNoteNumber: string,
  ): DebitNoteDocument {
    return {
      adapterName: this.name,
      debitNoteNumber,
      originalInvoiceNumber: invoice.invoiceNumber,
      amount,
      reason,
      issuedAt: new Date().toISOString(),
    };
  }
}
