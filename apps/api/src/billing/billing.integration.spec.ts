/**
 * Billing -- a separate bounded system from Finance Core, against a real
 * database.
 *
 * The rule being defended: Finance decides how much, Billing decides
 * whether the document is legally sufficient, and Billing never touches
 * the amount it was handed.
 *
 * Integration because the guarantees here are about persistence and
 * concurrency: a BillingDocument is created in the same transaction as
 * the invoice it documents, External Billing Mode genuinely suppresses
 * document creation rather than merely being read somewhere, and the
 * seam is provably swappable -- a second, deliberately different test
 * adapter produces a differently-shaped document from the same snapshot,
 * which is this phase's stated exit criterion, not merely an assertion
 * about the generic adapter alone.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
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
import { FinanceService } from "../finance/finance.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { CustomerSafeProjectionService } from "../operations/customer-safe-projection.service";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "./billing.service";
import { GenericBillingAdapter } from "./generic-billing-adapter.service";
import { PriceCatalogService } from "../finance/price-catalog.service";
import type { PrismaService } from "../database/prisma.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

/**
 * Policies read at runtime by the services under test. Backed by the
 * real Prisma client, so a test that writes a WorkshopPolicy row sees
 * the behaviour change -- a stub here would prove nothing about the
 * thing these tests exist to prove.
 */
const policiesForTest = new PolicyResolutionService(
  asService,
  new AuditService(asService),
  new CapabilityResolutionService(asService),
);
const priceCatalog = new PriceCatalogService(asService, new AuditService(asService));

const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const capabilities = new CapabilityResolutionService(asService);
const genericBilling = new BillingService(asService, new GenericBillingAdapter());
const financeWithGeneric = new FinanceService(asService, capabilities, events, genericBilling, priceCatalog, policiesForTest);

const ACTOR = { accountId: "cashier-1", displayName: "Cashier", actorType: "TENANT_STAFF" as const };
const SUFFIX = `bill-${Date.now()}`;

interface Shop {
  tenantId: string;
  branchId: string;
  customerId: string;
  assetId: string;
}

let planId: string;
let shop: Shop;

async function makeShop(name: string): Promise<Shop> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `${name} ${SUFFIX}`,
      nameNormalized: `${name.toLowerCase()} ${SUFFIX}`,
      slug: `${name.toLowerCase()}-${SUFFIX}`,
      customerRegistrationCode: `${name.toUpperCase()}-${SUFFIX}`,
      status: "ACTIVE",
      planId,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  });

  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: "Main", code: "MAIN" } });
  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, fullName: `${name} Customer`, phone: `01${Math.floor(Math.random() * 100000000)}` },
  });
  const asset = await prisma.asset.create({
    data: {
      tenantId: tenant.id,
      category: "CARS",
      plateNumber: `${name.slice(0, 3)}-${Date.now() % 100000}`,
      currentOwnerCustomerId: customer.id,
    },
  });

  return { tenantId: tenant.id, branchId: branch.id, customerId: customer.id, assetId: asset.id };
}

async function makeJob(target: Shop): Promise<string> {
  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId: target.tenantId,
      branchId: target.branchId,
      assetId: target.assetId,
      customerId: target.customerId,
      status: "IN_PROGRESS",
    },
  });
  return workOrder.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Billing",
      maxBranches: 5,
      maxUsers: 50,
      maxWarehouses: 5,
      allowedCategories: ["CARS"],
      allowedModules: [],
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
  planId = plan.id;
  shop = await makeShop("Billing WS");
}, 240_000);

afterAll(async () => {
  const where = { tenantId: shop.tenantId };
  await prisma.payment.deleteMany({ where });
  await prisma.creditNote.deleteMany({ where });
  await prisma.billingDocument.deleteMany({ where });
  await prisma.invoiceLine.deleteMany({ where });
  await prisma.invoice.deleteMany({ where });
  await prisma.creditNoteSequence.deleteMany({ where: { tenantId: shop.tenantId } });
  await prisma.invoiceSequence.deleteMany({ where: { tenantId: shop.tenantId } });
  await prisma.financeConfiguration.deleteMany({ where: { tenantId: shop.tenantId } });
  await prisma.runningInvoiceLine.deleteMany({ where });
  await prisma.runningInvoice.deleteMany({ where });
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: shop.tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 240_000);

describe("issuing an invoice creates its billing document, in the same transaction", () => {
  it("produces a BillingDocument carrying the generic adapter's number and an immutable snapshot", async () => {
    const job = await makeJob(shop);
    await financeWithGeneric.addLine(
      { tenantId: shop.tenantId, workOrderId: job, name: "Service", itemType: "LABOUR", quantity: 1, unitPrice: "200.00" },
      ACTOR,
    );

    const settlement = await financeWithGeneric.issueInvoice(shop.tenantId, job, ACTOR);

    const document = await prisma.billingDocument.findUnique({ where: { invoiceId: settlement.invoiceId } });
    expect(document).not.toBeNull();
    expect(document?.adapterName).toBe("GENERIC");
    expect(document?.status).toBe("CLEARED");
    // Honest absence, not a fabricated code -- the generic adapter has
    // no real QR authority to call.
    expect(document?.qrPayload).toBeNull();

    const snapshot = document?.snapshot as unknown as { total: string; invoiceNumber: string };
    expect(snapshot.total).toBe("200.00");
    expect(snapshot.invoiceNumber).toMatch(/^INV-/);
  });
});

describe("External Billing Mode suppresses document creation", () => {
  it("issues the invoice normally but writes no BillingDocument", async () => {
    await prisma.financeConfiguration.upsert({
      where: { tenantId: shop.tenantId },
      create: { tenantId: shop.tenantId, externalBillingEnabled: true, externalInvoiceReference: "QB-4471" },
      update: { externalBillingEnabled: true, externalInvoiceReference: "QB-4471" },
    });

    const job = await makeJob(shop);
    await financeWithGeneric.addLine(
      { tenantId: shop.tenantId, workOrderId: job, name: "Oil change", itemType: "SERVICE", quantity: 1, unitPrice: "150.00" },
      ACTOR,
    );

    const settlement = await financeWithGeneric.issueInvoice(shop.tenantId, job, ACTOR);

    // The invoice itself -- Finance's own settlement record -- still
    // exists and is correct.
    expect(settlement.total).toBe("150.00");

    // No document, because the tenant's own accounting software owns it.
    const document = await prisma.billingDocument.findUnique({ where: { invoiceId: settlement.invoiceId } });
    expect(document).toBeNull();

    await prisma.financeConfiguration.update({
      where: { tenantId: shop.tenantId },
      data: { externalBillingEnabled: false },
    });
  });
});

/**
 * A deliberately different adapter, built only for this test, never
 * shipped. Its whole job is to prove the seam is real: the same
 * InvoiceSnapshot, run through two different adapters, must produce two
 * differently-shaped documents while the underlying amounts never move.
 */
class TestOnlyAdapter implements BillingCountryAdapter {
  readonly name = "TEST_ONLY";

  validateInvoice(candidate: InvoiceCandidate): BillingValidationResult {
    return { valid: candidate.lines.length > 0, errors: [] };
  }

  generateDocument(invoice: InvoiceSnapshot): BillingDocumentArtifact {
    return {
      adapterName: this.name,
      documentNumber: `TEST-${invoice.invoiceNumber}`,
      qr: this.generateQr(invoice),
      renderedAt: new Date().toISOString(),
    };
  }

  submitForClearance(_invoice: InvoiceSnapshot): ClearanceSubmissionResult {
    // Deliberately different from the generic adapter: this one always
    // requires a wait, proving the seam can express a real jurisdiction's
    // asynchronous clearance rather than only the trivial synchronous case.
    return { status: "PENDING", clearanceReference: "TEST-REF-1", rejectionReason: null };
  }

  getClearanceStatus(_invoiceId: string): ClearanceStatus {
    return "PENDING";
  }

  generateQr(invoice: InvoiceSnapshot): QrPayload {
    return { format: "TEST", data: `qr:${invoice.invoiceNumber}` };
  }

  generateCreditNote(invoice: InvoiceSnapshot, amount: string, reason: string, creditNoteNumber: string): CreditNoteDocument {
    return {
      adapterName: this.name,
      creditNoteNumber: `TEST-${creditNoteNumber}`,
      originalInvoiceNumber: invoice.invoiceNumber,
      amount,
      reason,
      issuedAt: new Date().toISOString(),
    };
  }

  generateDebitNote(invoice: InvoiceSnapshot, amount: string, reason: string, debitNoteNumber: string): DebitNoteDocument {
    return {
      adapterName: this.name,
      debitNoteNumber: `TEST-${debitNoteNumber}`,
      originalInvoiceNumber: invoice.invoiceNumber,
      amount,
      reason,
      issuedAt: new Date().toISOString(),
    };
  }
}

describe("the adapter seam is provably swappable", () => {
  it("produces a differently-shaped document from a different adapter, without the amount changing", async () => {
    const testBilling = new BillingService(asService, new GenericBillingAdapter(), new TestOnlyAdapter());
    const financeWithTestAdapter = new FinanceService(asService, capabilities, events, testBilling, priceCatalog, policiesForTest);

    const job = await makeJob(shop);
    await financeWithTestAdapter.addLine(
      { tenantId: shop.tenantId, workOrderId: job, name: "Brake pads", itemType: "PART", quantity: 2, unitPrice: "75.00" },
      ACTOR,
    );

    const settlement = await financeWithTestAdapter.issueInvoice(shop.tenantId, job, ACTOR);

    const document = await prisma.billingDocument.findUniqueOrThrow({ where: { invoiceId: settlement.invoiceId } });

    // Different adapter, different document shape.
    expect(document.adapterName).toBe("TEST_ONLY");
    expect(document.documentNumber).toMatch(/^TEST-INV-/);
    expect(document.status).toBe("PENDING");
    expect(document.qrPayload).toMatch(/^qr:/);
    expect(document.clearanceReference).toBe("TEST-REF-1");

    // Same amount either way -- Billing never touches how much.
    expect(settlement.total).toBe("150.00");
  });
});

describe("credit notes get their own real, sequential number", () => {
  it("issues a credit note with a CN- number distinct from the invoice number", async () => {
    const job = await makeJob(shop);
    await financeWithGeneric.addLine(
      { tenantId: shop.tenantId, workOrderId: job, name: "Diagnostic", itemType: "SERVICE", quantity: 1, unitPrice: "80.00" },
      ACTOR,
    );
    const settlement = await financeWithGeneric.issueInvoice(shop.tenantId, job, ACTOR);

    const result = await genericBilling.issueCreditNote({
      tenantId: shop.tenantId,
      invoiceId: settlement.invoiceId,
      amount: "80.00",
      reason: "Customer disputed the diagnostic charge",
      issuedById: ACTOR.accountId,
    });

    expect(result.creditNoteNumber).toMatch(/^CN-\d{6}$/);

    const stored = await prisma.creditNote.findUniqueOrThrow({ where: { id: result.creditNoteId } });
    expect(stored.amount.toFixed(2)).toBe("80.00");
    expect(stored.billingDocumentId).not.toBeNull();
  });

  it("may credit less than the full invoice -- a partial refund", async () => {
    const job = await makeJob(shop);
    await financeWithGeneric.addLine(
      { tenantId: shop.tenantId, workOrderId: job, name: "Full service", itemType: "SERVICE", quantity: 1, unitPrice: "300.00" },
      ACTOR,
    );
    const settlement = await financeWithGeneric.issueInvoice(shop.tenantId, job, ACTOR);

    const result = await genericBilling.issueCreditNote({
      tenantId: shop.tenantId,
      invoiceId: settlement.invoiceId,
      amount: "50.00",
      reason: "One line overcharged",
      issuedById: ACTOR.accountId,
    });

    const stored = await prisma.creditNote.findUniqueOrThrow({ where: { id: result.creditNoteId } });
    expect(stored.amount.toFixed(2)).toBe("50.00");
  });

  it("gives every simultaneously-issued credit note on one tenant a distinct number", async () => {
    const jobs = await Promise.all(Array.from({ length: 6 }, () => makeJob(shop)));
    await Promise.all(
      jobs.map((job) =>
        financeWithGeneric.addLine(
          { tenantId: shop.tenantId, workOrderId: job, name: "Item", itemType: "PART", quantity: 1, unitPrice: "10.00" },
          ACTOR,
        ),
      ),
    );
    const settlements = await Promise.all(jobs.map((job) => financeWithGeneric.issueInvoice(shop.tenantId, job, ACTOR)));

    const results = await Promise.all(
      settlements.map((settlement) =>
        genericBilling.issueCreditNote({
          tenantId: shop.tenantId,
          invoiceId: settlement.invoiceId,
          amount: "10.00",
          reason: "Bulk test",
          issuedById: ACTOR.accountId,
        }),
      ),
    );

    const numbers = results.map((result) => result.creditNoteNumber);
    expect(new Set(numbers).size).toBe(6);
  });
});
