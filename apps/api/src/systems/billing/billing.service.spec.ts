import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@mop/database";
import type {
  BillingCountryAdapter,
  BillingDocumentArtifact,
  BillingValidationResult,
  ClearanceSubmissionResult,
  CreditNoteDocument,
  DebitNoteDocument,
  InvoiceCandidate,
  InvoiceSnapshot,
  QrPayload,
} from "@mop/shared";
import { BillingService } from "./billing.service";

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function candidate(overrides: Partial<InvoiceCandidate> = {}): InvoiceCandidate {
  return {
    tenantId: "tenant-1",
    branchId: "branch-1",
    customerId: "customer-1",
    workOrderId: "work-order-1",
    currency: "EGP",
    country: "EG",
    billingProfile: "DEFAULT",
    invoiceType: "STANDARD",
    lines: [],
    taxBreakdown: [],
    subtotal: "100.00",
    discountTotal: "0.00",
    taxTotal: "0.00",
    total: "100.00",
    amountPaid: "0.00",
    createdById: "finance-1",
    createdAt: "2026-08-22T10:00:00.000Z",
    ...overrides,
  };
}

function snapshot(overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
  return {
    tenantId: "tenant-1",
    invoiceId: "invoice-1",
    invoiceNumber: "INV-000001",
    currency: "EGP",
    country: "EG",
    lines: [],
    taxBreakdown: [],
    subtotal: "100.00",
    discountTotal: "0.00",
    taxTotal: "0.00",
    total: "100.00",
    issuedAt: "2026-08-22T10:00:00.000Z",
    ...overrides,
  };
}

class TestAdapter implements BillingCountryAdapter {
  readonly name = "TEST";

  validateInvoice(_candidate: InvoiceCandidate): BillingValidationResult {
    return { valid: true, errors: [] };
  }

  generateDocument(invoice: InvoiceSnapshot): BillingDocumentArtifact {
    return {
      adapterName: this.name,
      documentNumber: `DOC-${invoice.invoiceNumber}`,
      qr: this.generateQr(invoice),
      renderedAt: "2026-08-22T10:00:00.000Z",
    };
  }

  submitForClearance(_invoice: InvoiceSnapshot): ClearanceSubmissionResult {
    return { status: "NOT_REQUIRED", clearanceReference: null, rejectionReason: null };
  }

  getClearanceStatus(_invoiceId: string) {
    return "NOT_REQUIRED" as const;
  }

  generateQr(invoice: InvoiceSnapshot): QrPayload {
    return { format: "TEST", data: `qr:${invoice.invoiceNumber}` };
  }

  generateCreditNote(invoice: InvoiceSnapshot, amount: string, reason: string, creditNoteNumber: string): CreditNoteDocument {
    return {
      adapterName: this.name,
      creditNoteNumber,
      originalInvoiceNumber: invoice.invoiceNumber,
      amount,
      reason,
      issuedAt: "2026-08-22T10:00:00.000Z",
    };
  }

  generateDebitNote(invoice: InvoiceSnapshot, amount: string, reason: string, debitNoteNumber: string): DebitNoteDocument {
    return {
      adapterName: this.name,
      debitNoteNumber,
      originalInvoiceNumber: invoice.invoiceNumber,
      amount,
      reason,
      issuedAt: "2026-08-22T10:00:00.000Z",
    };
  }
}

function harness() {
  const prisma = {
    financeConfiguration: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    billingDocument: {
      create: jest.fn().mockResolvedValue({ id: "document-1", documentNumber: "DOC-INV-000001" }),
      findFirst: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
    },
    creditNote: {
      create: jest.fn().mockResolvedValue({ id: "credit-1", creditNoteNumber: "CN-000001" }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ lastNumber: 1 }]),
  };
  const adapter = new TestAdapter();
  const service = new BillingService(prisma as never, adapter as never, adapter);
  return { service, prisma };
}

describe("BillingService tenant boundaries", () => {
  it("rejects a billing document contract whose candidate and snapshot disagree on tenant", async () => {
    const { service, prisma } = harness();

    await expect(service.issueDocument(candidate(), snapshot({ tenantId: "tenant-2" }))).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.financeConfiguration.findUnique).not.toHaveBeenCalled();
    expect(prisma.financeConfiguration.upsert).not.toHaveBeenCalled();
    expect(prisma.billingDocument.create).not.toHaveBeenCalled();
  });

  it("scopes credit-note invoice and document reads to the input tenant", async () => {
    const { service, prisma } = harness();
    prisma.billingDocument.findFirst.mockResolvedValue({ id: "document-1", snapshot: snapshot() });
    prisma.invoice.findFirst.mockResolvedValue({
      id: "invoice-1",
      tenantId: "tenant-1",
      invoiceNumber: "INV-000001",
      subtotal: decimal("100.00"),
      discount: decimal("0.00"),
      tax: decimal("0.00"),
      total: decimal("100.00"),
      issuedAt: new Date("2026-08-22T10:00:00.000Z"),
      lines: [],
    });

    await service.issueCreditNote({
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      amount: "25.00",
      reason: "Customer refund",
      issuedById: "finance-1",
    });

    expect(prisma.billingDocument.findFirst).toHaveBeenCalledWith({ where: { invoiceId: "invoice-1", tenantId: "tenant-1" } });
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({ where: { id: "invoice-1", tenantId: "tenant-1" }, include: { lines: true } });
    expect(prisma.creditNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "tenant-1", invoiceId: "invoice-1", billingDocumentId: "document-1" }),
      }),
    );
  });

  it("refuses a credit note when the invoice is not visible in the input tenant", async () => {
    const { service, prisma } = harness();
    prisma.billingDocument.findFirst.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(
      service.issueCreditNote({
        tenantId: "tenant-1",
        invoiceId: "invoice-foreign",
        amount: "25.00",
        reason: "Customer refund",
        issuedById: "finance-1",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.creditNote.create).not.toHaveBeenCalled();
  });
});
