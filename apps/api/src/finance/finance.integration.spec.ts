/**
 * Finance Core against a real database.
 *
 * The rule being defended: never move money you did not mean to move, and
 * never move it twice.
 *
 * Integration because every guarantee here is about persistence -- the
 * uniqueness of an idempotency key, the immutability of an issued
 * invoice, and the fact that `paid` is summed from rows rather than read
 * from a column that a bug could leave stale.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { FinanceService } from "./finance.service";
import { ChargeableItemsService } from "../operations/chargeable-items.service";
import { WorkOrderLifecycleService } from "../operations/work-order-lifecycle.service";
import { GateEvaluatorService } from "../operations/gate-evaluator.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { CustomerSafeProjectionService } from "../operations/customer-safe-projection.service";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { GenericBillingAdapter } from "../billing/generic-billing-adapter.service";
import { PriceCatalogService } from "./price-catalog.service";
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
const billing = new BillingService(asService, new GenericBillingAdapter());
const finance = new FinanceService(
  asService,
  new CapabilityResolutionService(asService),
  events,
  billing,
  priceCatalog,
  policiesForTest,
  new ChargeableItemsService(asService),
  // Real, not a stub: settling an invoice is supposed to move the work
  // order, and a stub would prove nothing about whether it does.
  new WorkOrderLifecycleService(
    asService,
    new CapabilityResolutionService(asService),
    events,
    new GateEvaluatorService(asService, policiesForTest),
  ),
);

const ACTOR = { accountId: "cashier-1", displayName: "Cashier", actorType: "TENANT_STAFF" as const };
const SUFFIX = `fin-${Date.now()}`;

interface Shop {
  tenantId: string;
  branchId: string;
  customerId: string;
  assetId: string;
}

let planId: string;
let paid: Shop;
let free: Shop;

async function makeShop(name: string, overrides: Record<string, string> = {}): Promise<Shop> {
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

  for (const [capabilityKey, status] of Object.entries(overrides)) {
    await prisma.tenantCapability.create({
      data: {
        tenantId: tenant.id,
        capabilityKey,
        status: status as never,
        source: "PLATFORM",
        effectiveFrom: new Date(Date.now() - 60_000),
        configuredBy: "seed",
      },
    });
  }

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

async function makeJob(shop: Shop): Promise<string> {
  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      assetId: shop.assetId,
      customerId: shop.customerId,
      status: "IN_PROGRESS",
    },
  });
  return workOrder.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Finance",
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

  paid = await makeShop("Paid");
  free = await makeShop("Free", { FINANCE_CORE: "DISABLED" });
}, 240_000);

afterAll(async () => {
  for (const shop of [paid, free]) {
    if (!shop) continue;
    const where = { tenantId: shop.tenantId };
    await prisma.payment.deleteMany({ where });
    await prisma.creditNote.deleteMany({ where });
    await prisma.refundRequest.deleteMany({ where });
    await prisma.billingDocument.deleteMany({ where });
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.creditNoteSequence.deleteMany({ where: { tenantId: shop.tenantId } });
    await prisma.invoiceSequence.deleteMany({ where: { tenantId: shop.tenantId } });
    await prisma.financeConfiguration.deleteMany({ where: { tenantId: shop.tenantId } });
    await prisma.runningInvoiceLine.deleteMany({ where });
    await prisma.runningInvoice.deleteMany({ where });
    await prisma.workOrderPartLine.deleteMany({ where });
    await prisma.task.deleteMany({ where });
    await prisma.customerDecisionItem.deleteMany({ where });
    await prisma.customerDecisionRequest.deleteMany({ where });
    await prisma.priceCatalogEntry.deleteMany({ where });
    await prisma.operationEvent.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.customerTimelineEvent.deleteMany({ where });
    await prisma.workOrder.deleteMany({ where });
    await prisma.assetOwnershipHistory.deleteMany({ where });
    await prisma.asset.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.inventoryItem.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenantCapability.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: shop.tenantId } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 240_000);

describe("the running total", () => {
  it("adds up the lines exactly, with no float drift", async () => {
    const job = await makeJob(paid);

    // 0.07 x 3 is the classic float trap: 0.07*3 === 0.21000000000000002.
    await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Washer", itemType: "PART", quantity: 3, unitPrice: "0.07" },
      ACTOR,
    );
    const total = await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Labour", itemType: "LABOUR", quantity: 1, unitPrice: "150.00" },
      ACTOR,
    );

    expect(total.lines.map((line) => line.total)).toEqual(["0.21", "150.00"]);
    expect(total.total).toBe("150.21");
  });

  it("returns a zero total for a job nobody has charged anything to", async () => {
    const job = await makeJob(paid);
    await expect(finance.jobTotal(paid.tenantId, job)).resolves.toMatchObject({ total: "0.00", lines: [] });
  });
});

describe("issuing an invoice", () => {
  it("prints lines that add up to the printed total, to the cent", async () => {
    // The decision PHASE_8.md section 2 argues: sum the ROUNDED lines. If
    // this ever produces a total the column does not reach, a customer
    // adding it up themselves will find the discrepancy before we do.
    const job = await makeJob(paid);
    for (const price of ["3.33", "3.33", "3.33"]) {
      await finance.addLine(
        { tenantId: paid.tenantId, workOrderId: job, name: "Bolt", itemType: "PART", quantity: 1, unitPrice: price },
        ACTOR,
      );
    }

    const settlement = await finance.issueInvoice(paid.tenantId, job, ACTOR, { taxPercent: 14 });
    const lines = await prisma.invoiceLine.findMany({
      where: { invoice: { workOrderId: job } },
      select: { total: true },
    });

    const printed = lines.reduce((running, line) => running + Number(line.total.toFixed(2)) * 100, 0);
    expect(Math.round(printed) / 100).toBeCloseTo(Number(settlement.total), 2);
  });

  it("snapshots the price, so a later catalog change cannot rewrite history", async () => {
    const job = await makeJob(paid);
    await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Pad", itemType: "PART", quantity: 2, unitPrice: "100.00" },
      ACTOR,
    );
    await finance.issueInvoice(paid.tenantId, job, ACTOR);

    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoice: { workOrderId: job } } });
    expect(line.lockedUnitPrice.toFixed(2)).toBe("100.00");
  });

  it("refuses to add a line once the invoice is issued", async () => {
    // A bill must not change behind the person who was given it.
    const job = await makeJob(paid);
    await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Oil", itemType: "PART", quantity: 1, unitPrice: "80.00" },
      ACTOR,
    );
    await finance.issueInvoice(paid.tenantId, job, ACTOR);

    await expect(
      finance.addLine(
        { tenantId: paid.tenantId, workOrderId: job, name: "Extra", itemType: "PART", quantity: 1, unitPrice: "10.00" },
        ACTOR,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to invoice a job with nothing on it", async () => {
    const job = await makeJob(paid);
    await expect(finance.issueInvoice(paid.tenantId, job, ACTOR)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to issue twice", async () => {
    const job = await makeJob(paid);
    await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Filter", itemType: "PART", quantity: 1, unitPrice: "60.00" },
      ACTOR,
    );
    await finance.issueInvoice(paid.tenantId, job, ACTOR);

    await expect(finance.issueInvoice(paid.tenantId, job, ACTOR)).rejects.toMatchObject({ status: 409 });
  });
});

describe("payments: never twice", () => {
  async function invoicedJob(total: string): Promise<string> {
    const job = await makeJob(paid);
    await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Service", itemType: "LABOUR", quantity: 1, unitPrice: total },
      ACTOR,
    );
    const settlement = await finance.issueInvoice(paid.tenantId, job, ACTOR);
    return settlement.invoiceId;
  }

  it("records a partial payment and reports what is still owed", async () => {
    const invoiceId = await invoicedJob("100.00");

    const after = await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "40.00", method: "CASH", idempotencyKey: `pay-${SUFFIX}-partial` },
      ACTOR,
    );

    expect(after).toMatchObject({ paid: "40.00", outstanding: "60.00", settled: false });
  });

  it("treats the same key and the same amount as ONE payment", async () => {
    // A double-tap on a counter tablet with bad signal.
    const invoiceId = await invoicedJob("100.00");
    const key = `pay-${SUFFIX}-retry`;

    await finance.recordPayment(paid.tenantId, invoiceId, { amount: "100.00", method: "CASH", idempotencyKey: key }, ACTOR);
    const second = await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "100.00", method: "CASH", idempotencyKey: key },
      ACTOR,
    );

    expect(second.paid).toBe("100.00");
    const count = await prisma.payment.count({ where: { invoiceId } });
    expect(count).toBe(1);
  });

  it("REFUSES the same key with a different amount", async () => {
    // The case that matters. A client reusing a key for a different
    // amount is not retrying -- it is confused, or two people are taking
    // money for the same job at once. Replaying the first silently would
    // leave a customer charged an amount nobody recorded.
    const invoiceId = await invoicedJob("100.00");
    const key = `pay-${SUFFIX}-conflict`;

    await finance.recordPayment(paid.tenantId, invoiceId, { amount: "40.00", method: "CASH", idempotencyKey: key }, ACTOR);

    await expect(
      finance.recordPayment(paid.tenantId, invoiceId, { amount: "60.00", method: "CASH", idempotencyKey: key }, ACTOR),
    ).rejects.toMatchObject({ status: 409, response: { code: "idempotency_conflict" } });

    // And nothing was taken the second time.
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(1);
  });

  it("derives paid from the rows, not from the cached column", async () => {
    const invoiceId = await invoicedJob("100.00");
    await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "100.00", method: "CASH", idempotencyKey: `pay-${SUFFIX}-derived` },
      ACTOR,
    );

    // Corrupt the convenience column the way a bug would.
    await prisma.invoice.update({ where: { id: invoiceId }, data: { paid: "0.00", balance: "100.00" } });

    // settlement() must still tell the truth.
    const settlement = await finance.settlement(invoiceId);
    expect(settlement.paid).toBe("100.00");
    expect(settlement.settled).toBe(true);
  });

  it("refuses to take money against an invoice already paid in full", async () => {
    const invoiceId = await invoicedJob("50.00");
    await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "50.00", method: "CASH", idempotencyKey: `pay-${SUFFIX}-full` },
      ACTOR,
    );

    await expect(
      finance.recordPayment(
        paid.tenantId,
        invoiceId,
        { amount: "10.00", method: "CASH", idempotencyKey: `pay-${SUFFIX}-extra` },
        ACTOR,
      ),
    ).rejects.toMatchObject({ status: 409, response: { code: "already_settled" } });
  });

  it("survives the same key arriving genuinely simultaneously (H5) -- one payment row, no crash", async () => {
    // The upfront findUnique() can't see a write that hasn't happened
    // yet: fire the SAME key at the SAME invoice concurrently so both
    // calls read "not found" before either has inserted, exactly the
    // race docs/scenarios3/EDGE_CASE_REGISTER.md's H5 describes. Without
    // the fix, the loser hits the DB's unique-constraint error and it
    // propagates as an unhandled 500 instead of resolving as a retry.
    const invoiceId = await invoicedJob("100.00");
    const key = `pay-${SUFFIX}-race`;

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        finance.recordPayment(paid.tenantId, invoiceId, { amount: "100.00", method: "CASH", idempotencyKey: key }, ACTOR),
      ),
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) {
      if (r.status === "fulfilled") expect(r.value.paid).toBe("100.00");
    }

    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(1);
  });

  it("still refuses a genuinely concurrent key reuse at a different amount (H5, conflict branch)", async () => {
    const invoiceId = await invoicedJob("100.00");
    const key = `pay-${SUFFIX}-race-conflict`;

    const results = await Promise.allSettled([
      finance.recordPayment(paid.tenantId, invoiceId, { amount: "40.00", method: "CASH", idempotencyKey: key }, ACTOR),
      finance.recordPayment(paid.tenantId, invoiceId, { amount: "60.00", method: "CASH", idempotencyKey: key }, ACTOR),
    ]);

    // Exactly one side wins the write; the other resolves to a real
    // 409 conflict, whichever call actually lost the DB-level race --
    // never a raw, unhandled Prisma error and never two payment rows.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 409,
      response: { code: "idempotency_conflict" },
    });

    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(1);
  });
});

describe("a workshop that does not handle money through MOP", () => {
  it("refuses to create any finance record at all", async () => {
    const job = await makeJob(free);

    await expect(
      finance.addLine(
        { tenantId: free.tenantId, workOrderId: job, name: "Service", itemType: "LABOUR", quantity: 1, unitPrice: "100.00" },
        ACTOR,
      ),
    ).rejects.toMatchObject({ status: 403 });

    expect(await prisma.runningInvoice.count({ where: { tenantId: free.tenantId } })).toBe(0);
    expect(await prisma.invoice.count({ where: { tenantId: free.tenantId } })).toBe(0);
  });

  it("still lets the job reach CLOSED, because no invoice gate exists there", async () => {
    // The exit criterion. If a workshop with no finance cannot finish a
    // job, the capability engine has become decoration.
    const job = await makeJob(free);
    await prisma.workOrder.update({ where: { id: job }, data: { status: "CLOSED", closedAt: new Date() } });

    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { id: job }, select: { status: true } });
    expect(stored.status).toBe("CLOSED");
  });
});

/**
 * Edge case H3 (docs/scenarios3/EDGE_CASE_REGISTER.md): invoice numbering
 * used to be `tx.invoice.count({ where: { tenantId } }) + 1`, computed
 * inside the caller's own transaction, with the (tenantId, invoiceNumber)
 * unique constraint as "the backstop" per its own comment. Two branches
 * of the same tenant closing out at the same moment could both count N
 * and race the constraint -- a real transaction abort at the worst
 * possible moment. This fires genuinely concurrent invoice issuance
 * against ten separate jobs on the same tenant and proves every number
 * that comes out is unique, sequential, and none were lost to a retry
 * nobody wrote.
 */
describe("invoice numbering under real concurrency", () => {
  it("gives every simultaneously-issued invoice on one tenant a distinct, sequential number", async () => {
    const jobs = await Promise.all(Array.from({ length: 10 }, () => makeJob(paid)));

    await Promise.all(
      jobs.map((job) =>
        finance.addLine(
          { tenantId: paid.tenantId, workOrderId: job, name: "Service", itemType: "LABOUR", quantity: 1, unitPrice: "50.00" },
          ACTOR,
        ),
      ),
    );

    // Fired together, not sequentially -- this is the whole point.
    // Without the fix, some of these could throw on the unique
    // constraint, or worse, two could silently agree on the same number
    // if the constraint were ever loosened.
    const results = await Promise.allSettled(jobs.map((job) => finance.issueInvoice(paid.tenantId, job, ACTOR)));

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const invoices = await prisma.invoice.findMany({
      where: { workOrderId: { in: jobs } },
      select: { invoiceNumber: true },
    });
    const numbers = invoices.map((invoice) => invoice.invoiceNumber);

    expect(new Set(numbers).size).toBe(10);
  });
});

async function invoicedJobWithPayment(total: string, paidAmount: string): Promise<string> {
  const job = await makeJob(paid);
  await finance.addLine(
    { tenantId: paid.tenantId, workOrderId: job, name: "Service", itemType: "LABOUR", quantity: 1, unitPrice: total },
    ACTOR,
  );
  const settlement = await finance.issueInvoice(paid.tenantId, job, ACTOR);
  await finance.recordPayment(
    paid.tenantId,
    settlement.invoiceId,
    { amount: paidAmount, method: "CASH", idempotencyKey: `refund-setup-${SUFFIX}-${job}` },
    ACTOR,
  );
  return settlement.invoiceId;
}

/**
 * Phase 9's other deferred item, closed this pass: RefundRequest and
 * CreditNote existed since Phase 8 with no workflow driving them. The
 * property that matters is the one PHASE_9.md states directly --
 * "paid" nets out a completed refund from the payment rows rather than
 * editing them, and an approved refund produces a real, numbered
 * document through Billing, never just a status flip.
 */
describe("refunds: request, approve, and the credit note it produces", () => {
  it("moves paid down and outstanding up once a refund is approved", async () => {
    const invoiceId = await invoicedJobWithPayment("100.00", "100.00");
    const before = await finance.settlement(invoiceId);
    expect(before).toMatchObject({ paid: "100.00", settled: true });

    const refund = await finance.requestRefund(paid.tenantId, invoiceId, "30.00", "Customer disputed one line", ACTOR);
    expect(refund.status).toBe("PENDING");

    // A request alone must not move money.
    const stillFull = await finance.settlement(invoiceId);
    expect(stillFull.paid).toBe("100.00");

    const approval = await finance.approveRefund(refund.id, ACTOR);
    expect(approval.creditNoteNumber).toMatch(/^CN-\d{6}$/);

    const after = await finance.settlement(invoiceId);
    expect(after.paid).toBe("70.00");
    expect(after.outstanding).toBe("30.00");
    expect(after.settled).toBe(false);
  });

  it("Phase 19.C -- defaults the reason category to ROUTINE, and honours an explicit DISPUTE_REMEDIATION", async () => {
    const invoiceId = await invoicedJobWithPayment("40.00", "40.00");
    const routine = await finance.requestRefund(paid.tenantId, invoiceId, "10.00", "Standard reversal", ACTOR);
    const storedRoutine = await prisma.refundRequest.findUniqueOrThrow({ where: { id: routine.id } });
    expect(storedRoutine.reasonCategory).toBe("ROUTINE");

    const invoiceId2 = await invoicedJobWithPayment("40.00", "40.00");
    const disputed = await finance.requestRefund(
      paid.tenantId,
      invoiceId2,
      "10.00",
      "Charge under investigation",
      ACTOR,
      "DISPUTE_REMEDIATION",
    );
    const storedDisputed = await prisma.refundRequest.findUniqueOrThrow({ where: { id: disputed.id } });
    expect(storedDisputed.reasonCategory).toBe("DISPUTE_REMEDIATION");
  });

  it("writes a real CreditNote row, not just a status change", async () => {
    const invoiceId = await invoicedJobWithPayment("50.00", "50.00");
    const refund = await finance.requestRefund(paid.tenantId, invoiceId, "50.00", "Full refund, job cancelled", ACTOR);
    await finance.approveRefund(refund.id, ACTOR);

    const stored = await prisma.creditNote.findFirst({ where: { invoiceId } });
    expect(stored).not.toBeNull();
    expect(stored?.amount.toFixed(2)).toBe("50.00");
    expect(stored?.billingDocumentId).not.toBeNull();
  });

  it("refuses to refund more than was actually paid", async () => {
    const invoiceId = await invoicedJobWithPayment("100.00", "40.00");

    await expect(finance.requestRefund(paid.tenantId, invoiceId, "60.00", "Too much", ACTOR)).rejects.toMatchObject({
      status: 400,
      response: { code: "over_refund" },
    });
  });

  it("rejecting a refund leaves the payment untouched and cannot be approved afterward", async () => {
    const invoiceId = await invoicedJobWithPayment("80.00", "80.00");
    const refund = await finance.requestRefund(paid.tenantId, invoiceId, "20.00", "Reconsidering", ACTOR);

    await finance.rejectRefund(refund.id, ACTOR, "Customer withdrew the complaint");

    const settlement = await finance.settlement(invoiceId);
    expect(settlement.paid).toBe("80.00");

    await expect(finance.approveRefund(refund.id, ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "refund_not_pending" },
    });
  });

  it("refuses to decide the same refund twice", async () => {
    const invoiceId = await invoicedJobWithPayment("60.00", "60.00");
    const refund = await finance.requestRefund(paid.tenantId, invoiceId, "10.00", "Partial dispute", ACTOR);
    await finance.approveRefund(refund.id, ACTOR);

    await expect(finance.approveRefund(refund.id, ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "refund_not_pending" },
    });
  });
});

/**
 * compliantBlocked: visibility only, per PHASE_9.md section 6 -- no
 * invoice is ever refused because of it. Kept current on every issue
 * rather than on a schedule, since FinanceConfiguration had no writer
 * at all before this phase.
 */
describe("compliantBlocked", () => {
  it("is set true for a country with no adapter beyond generic, and does not block issuing", async () => {
    const invoiceId = await invoicedJob_forCompliance();

    const configuration = await prisma.financeConfiguration.findUnique({ where: { tenantId: paid.tenantId } });
    expect(configuration?.compliantBlocked).toBe(true);

    // The invoice itself issued normally -- visibility only.
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(stored.status).not.toBeNull();
  });

  it("is false once External Billing Mode is on, even with no adapter", async () => {
    await prisma.financeConfiguration.upsert({
      where: { tenantId: paid.tenantId },
      create: { tenantId: paid.tenantId, externalBillingEnabled: true },
      update: { externalBillingEnabled: true },
    });

    await invoicedJob_forCompliance();

    const configuration = await prisma.financeConfiguration.findUniqueOrThrow({ where: { tenantId: paid.tenantId } });
    expect(configuration.compliantBlocked).toBe(false);

    await prisma.financeConfiguration.update({ where: { tenantId: paid.tenantId }, data: { externalBillingEnabled: false } });
  });

  async function invoicedJob_forCompliance(): Promise<string> {
    const job = await makeJob(paid);
    await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Service", itemType: "LABOUR", quantity: 1, unitPrice: "20.00" },
      ACTOR,
    );
    const settlement = await finance.issueInvoice(paid.tenantId, job, ACTOR);
    return settlement.invoiceId;
  }
});

/**
 * The Service Catalog governs money.
 *
 * Before PriceCatalogService.resolve() existed, PriceCatalogEntry was
 * written by the Owner's Pricing page and read by nothing: addLine took
 * whatever unitPrice the caller passed, so pricing "Replace battery" at
 * 450 changed no number anywhere and the figure was retyped by hand at
 * the point of sale. These tests are what keep the catalogue connected.
 */
describe("the Service Catalog is the source of truth for a line's price", () => {
  const CATALOG_ACTOR = { accountId: "owner-1", displayName: "Owner" };

  it("prices a line from the catalogue when the caller states no price", async () => {
    await priceCatalog.setPrice(
      paid.tenantId,
      { itemKey: "Replace battery", itemType: "SERVICE", unitPrice: 450, laborPrice: 50 },
      CATALOG_ACTOR,
    );

    const job = await makeJob(paid);
    const total = await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Replace battery", itemType: "SERVICE", quantity: 1 },
      ACTOR,
    );

    // 450 unit + 50 labour, straight off the Owner's Pricing page.
    expect(total.lines[0].total).toBe("500.00");
  });

  it("follows a price change, so editing Pricing changes what the next job bills", async () => {
    await priceCatalog.setPrice(
      paid.tenantId,
      { itemKey: "Oil change", itemType: "SERVICE", unitPrice: 200 },
      CATALOG_ACTOR,
    );
    await priceCatalog.setPrice(
      paid.tenantId,
      { itemKey: "Oil change", itemType: "SERVICE", unitPrice: 260 },
      CATALOG_ACTOR,
    );

    const job = await makeJob(paid);
    const total = await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Oil change", itemType: "SERVICE", quantity: 1 },
      ACTOR,
    );

    // The superseded 200 row is still on the table, closed. Only the open
    // row may price a new line.
    expect(total.lines[0].total).toBe("260.00");
  });

  it("lets an explicit price win, so a one-off charge does not need cataloguing first", async () => {
    await priceCatalog.setPrice(
      paid.tenantId,
      { itemKey: "Diagnostics", itemType: "SERVICE", unitPrice: 300 },
      CATALOG_ACTOR,
    );

    const job = await makeJob(paid);
    const total = await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Diagnostics", itemType: "SERVICE", quantity: 1, unitPrice: "120.00" },
      ACTOR,
    );

    expect(total.lines[0].total).toBe("120.00");
  });

  it("refuses an uncatalogued line rather than silently billing zero", async () => {
    const job = await makeJob(paid);
    await expect(
      finance.addLine(
        { tenantId: paid.tenantId, workOrderId: job, name: "Never priced", itemType: "SERVICE", quantity: 1 },
        ACTOR,
      ),
    ).rejects.toThrow(/Service Catalog/);
  });

  it("will not price one workshop's line from another workshop's catalogue", async () => {
    await priceCatalog.setPrice(
      paid.tenantId,
      { itemKey: "Wheel alignment", itemType: "SERVICE", unitPrice: 180 },
      CATALOG_ACTOR,
    );

    const job = await makeJob(free);
    await expect(
      finance.addLine(
        { tenantId: free.tenantId, workOrderId: job, name: "Wheel alignment", itemType: "SERVICE", quantity: 1 },
        ACTOR,
      ),
    ).rejects.toThrow();
  });
});

/**
 * A part fitted on the shop floor reaches the bill.
 *
 * The hole this closes: `WorkOrderPartLine` was read by three subsystems
 * and written by none, and even once written it was invisible to
 * Finance, whose totals come from `RunningInvoiceLine`. A workshop could
 * issue a part, fit it, invoice the job and charge the customer nothing
 * for the part.
 *
 * Finance pulls these through the `ChargeableWorkItem` contract; it
 * never reads a part table itself, and Inventory never calls Finance.
 */
describe("parts fitted on the job are billed", () => {
  async function partOnJob(
    shop: Shop,
    workOrderId: string,
    price: string,
    quantity = 1,
  ): Promise<{ itemId: string; partRequestId: string }> {
    const item = await prisma.inventoryItem.create({
      data: {
        tenantId: shop.tenantId,
        sku: `BILL-${Math.random().toString(36).slice(2, 10)}`,
        name: "Alternator",
        itemType: "PART",
        sellingPrice: price,
      },
    });
    const request = await prisma.partRequest.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId,
        inventoryItemId: item.id,
        requestedById: ACTOR.accountId,
        quantity,
        status: "ISSUED",
      },
    });
    await prisma.workOrderPartLine.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId,
        provenance: "INVENTORY",
        inventoryItemId: item.id,
        name: item.name,
        quantity,
        sellingPrice: price,
        partRequestId: request.id,
        addedById: ACTOR.accountId,
      },
    });
    return { itemId: item.id, partRequestId: request.id };
  }

  it("appears on the running total without anyone adding a line by hand", async () => {
    const job = await makeJob(paid);
    await partOnJob(paid, job, "2200.00");

    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines).toHaveLength(1);
    expect(total.lines[0].name).toBe("Alternator");
    expect(total.total).toBe("2200.00");
  });

  it("is billed exactly once no matter how often the total is read", async () => {
    const job = await makeJob(paid);
    await partOnJob(paid, job, "500.00");

    await finance.jobTotal(paid.tenantId, job);
    await finance.jobTotal(paid.tenantId, job);
    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines).toHaveLength(1);
    expect(total.total).toBe("500.00");
  });

  it("sits alongside hand-entered labour rather than replacing it", async () => {
    const job = await makeJob(paid);
    await partOnJob(paid, job, "300.00");
    await finance.addLine(
      { tenantId: paid.tenantId, workOrderId: job, name: "Fitting", itemType: "LABOUR", quantity: 1, unitPrice: "150.00" },
      ACTOR,
    );

    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines).toHaveLength(2);
    expect(total.total).toBe("450.00");
  });

  it("carries onto the issued invoice, and stays there when the catalogue is repriced", async () => {
    const job = await makeJob(paid);
    const { itemId } = await partOnJob(paid, job, "1000.00");

    const settlement = await finance.issueInvoice(paid.tenantId, job, ACTOR);
    expect(settlement.total).toBe("1000.00");

    // The Owner puts the price up afterwards. An issued invoice is
    // immutable, and the snapshot is what defends that.
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { sellingPrice: "9999.00" } });

    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoice: { workOrderId: job } } });
    expect(line.lockedUnitPrice.toFixed(2)).toBe("1000.00");
  });

  it("drops off the total when the part is returned and its line goes", async () => {
    const job = await makeJob(paid);
    const { partRequestId } = await partOnJob(paid, job, "800.00");

    expect((await finance.jobTotal(paid.tenantId, job)).total).toBe("800.00");

    // What PartRequestService.completeReturn does once nothing is left.
    await prisma.workOrderPartLine.delete({ where: { partRequestId } });

    const after = await finance.jobTotal(paid.tenantId, job);
    expect(after.lines).toHaveLength(0);
    expect(after.total).toBe("0.00");
  });

  it("a workshop with no finance capability never absorbs anything", async () => {
    const job = await makeJob(free);
    await partOnJob(free, job, "400.00");

    // requireFinance refuses before any of this is reached.
    await expect(finance.jobTotal(free.tenantId, job)).resolves.toBeDefined();
    const lines = await prisma.runningInvoiceLine.findMany({ where: { tenantId: free.tenantId } });
    expect(lines).toHaveLength(0);
  });
});

/**
 * Settling the bill releases the car.
 *
 * `SETTLE_PAYMENT` has been an edge in WORK_ORDER_GRAPH since Phase 2
 * and nothing in production ever applied it, so a fully paid job stayed
 * in PAYMENT_PENDING forever and Delivery & Payments went on reporting
 * "The invoice has not been settled." about an invoice it had just been
 * paid in full. Same class of dead edge as REQUEST_PART was.
 */
describe("paying in full moves the job on", () => {
  async function invoicedJob(shop: Shop, amount: string): Promise<{ workOrderId: string; invoiceId: string }> {
    const workOrderId = await makeJob(shop);
    await finance.addLine(
      { tenantId: shop.tenantId, workOrderId, name: "Service", itemType: "SERVICE", quantity: 1, unitPrice: amount },
      ACTOR,
    );
    const settlement = await finance.issueInvoice(shop.tenantId, workOrderId, ACTOR);
    // The graph only offers SETTLE_PAYMENT from PAYMENT_PENDING, which is
    // where FINISH would have left a job in a workshop with finance.
    await prisma.workOrder.update({ where: { id: workOrderId }, data: { status: "PAYMENT_PENDING" } });
    return { workOrderId, invoiceId: settlement.invoiceId };
  }

  it("leaves a part-paid job where it is", async () => {
    const { workOrderId, invoiceId } = await invoicedJob(paid, "500.00");

    await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "200.00", method: "CASH", idempotencyKey: `partial-${Date.now()}` },
      ACTOR,
    );

    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { status: true } });
    expect(after.status).toBe("PAYMENT_PENDING");
  });

  it("moves a fully paid job to READY_FOR_DELIVERY", async () => {
    const { workOrderId, invoiceId } = await invoicedJob(paid, "500.00");

    await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "500.00", method: "CASH", idempotencyKey: `full-${Date.now()}` },
      ACTOR,
    );

    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { status: true } });
    expect(after.status).toBe("READY_FOR_DELIVERY");
  });

  it("moves it once the LAST instalment lands, not before", async () => {
    const { workOrderId, invoiceId } = await invoicedJob(paid, "900.00");
    const key = Date.now();

    await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "400.00", method: "CASH", idempotencyKey: `i1-${key}` },
      ACTOR,
    );
    expect(
      (await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { status: true } })).status,
    ).toBe("PAYMENT_PENDING");

    await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "500.00", method: "CARD", idempotencyKey: `i2-${key}` },
      ACTOR,
    );
    expect(
      (await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { status: true } })).status,
    ).toBe("READY_FOR_DELIVERY");
  });

  it("still records the payment when the job cannot move", async () => {
    const { invoiceId, workOrderId } = await invoicedJob(paid, "300.00");
    // A job somewhere the graph has no SETTLE_PAYMENT edge from. The
    // money must land regardless -- a lifecycle refusal must never roll
    // back a payment the customer actually made.
    await prisma.workOrder.update({ where: { id: workOrderId }, data: { status: "IN_PROGRESS" } });

    const settlement = await finance.recordPayment(
      paid.tenantId,
      invoiceId,
      { amount: "300.00", method: "CASH", idempotencyKey: `stuck-${Date.now()}` },
      ACTOR,
    );

    expect(settlement.settled).toBe(true);
    expect(settlement.paid).toBe("300.00");
  });
});

/**
 * A catalogued service that was actually performed reaches the bill.
 *
 * The other half of the chain: a `Task` names a Service Catalog row via
 * `serviceKey`, and nothing turned a completed one into a charge -- so a
 * job whose only work was labour reached the counter with "There is
 * nothing on this job to invoice."
 */
describe("services performed on the job are billed", () => {
  async function doneTask(shop: Shop, workOrderId: string, serviceKey: string | null): Promise<string> {
    const task = await prisma.task.create({
      data: { tenantId: shop.tenantId, workOrderId, title: serviceKey ?? "Ad-hoc work", serviceKey, status: "DONE" },
    });
    return task.id;
  }

  it("prices a finished task from the workshop's own catalogue", async () => {
    const job = await makeJob(paid);
    await prisma.priceCatalogEntry.create({
      data: { tenantId: paid.tenantId, itemKey: "Brake service", itemType: "SERVICE", unitPrice: "800.00", laborPrice: "200.00", isActive: true },
    });
    await doneTask(paid, job, "Brake service");

    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines).toHaveLength(1);
    expect(total.lines[0].name).toBe("Brake service");
    expect(total.total).toBe("1000.00");
  });

  it("does not bill work that is not finished", async () => {
    const job = await makeJob(paid);
    await prisma.priceCatalogEntry.create({
      data: { tenantId: paid.tenantId, itemKey: "Half done", itemType: "SERVICE", unitPrice: "500.00", isActive: true },
    });
    await prisma.task.create({
      data: { tenantId: paid.tenantId, workOrderId: job, title: "Half done", serviceKey: "Half done", status: "IN_PROGRESS" },
    });

    const total = await finance.jobTotal(paid.tenantId, job);
    expect(total.lines).toHaveLength(0);
  });

  it("skips uncatalogued work rather than billing it at zero", async () => {
    const job = await makeJob(paid);
    await doneTask(paid, job, "Never catalogued");

    const total = await finance.jobTotal(paid.tenantId, job);
    // A zero line reads as "free", which is a claim nobody made.
    expect(total.lines).toHaveLength(0);
  });

  it("ignores ad-hoc work with no service key at all", async () => {
    const job = await makeJob(paid);
    await doneTask(paid, job, null);

    const total = await finance.jobTotal(paid.tenantId, job);
    expect(total.lines).toHaveLength(0);
  });

  it("bills a service exactly once however often the total is read", async () => {
    const job = await makeJob(paid);
    await prisma.priceCatalogEntry.create({
      data: { tenantId: paid.tenantId, itemKey: "Repeatable", itemType: "SERVICE", unitPrice: "300.00", isActive: true },
    });
    await doneTask(paid, job, "Repeatable");

    await finance.jobTotal(paid.tenantId, job);
    await finance.jobTotal(paid.tenantId, job);
    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines).toHaveLength(1);
    expect(total.total).toBe("300.00");
  });

  it("keeps the agreed price when the Owner reprices the catalogue afterwards", async () => {
    const job = await makeJob(paid);
    const entry = await prisma.priceCatalogEntry.create({
      data: { tenantId: paid.tenantId, itemKey: "Repriced later", itemType: "SERVICE", unitPrice: "400.00", isActive: true },
    });
    await doneTask(paid, job, "Repriced later");

    expect((await finance.jobTotal(paid.tenantId, job)).total).toBe("400.00");

    await prisma.priceCatalogEntry.update({ where: { id: entry.id }, data: { unitPrice: "9999.00" } });

    // The running line was snapshotted when the work was absorbed.
    expect((await finance.jobTotal(paid.tenantId, job)).total).toBe("400.00");
  });
});

/**
 * What the customer approved is what the customer is charged.
 *
 * The money hole this closes: a customer approving "Front brake discs,
 * 2800.00" produced no charge at all -- only tasks and parts were ever
 * collected -- so the workshop did the work it was told to do and billed
 * nothing for it. The approval loop existed to get consent to a number,
 * and the number was then thrown away.
 */
describe("approved customer decisions are billed at the agreed price", () => {
  async function decisionOn(
    shop: Shop,
    workOrderId: string,
    items: readonly { name: string; price: string; labour?: string; decision: "APPROVED" | "REJECTED" | "PENDING" }[],
  ): Promise<void> {
    const request = await prisma.customerDecisionRequest.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId,
        customerId: shop.customerId,
        status: "SENT",
        secureToken: `tok-${Math.random().toString(36).slice(2)}`,
        createdById: "tech-1",
        sentAt: new Date(),
      },
    });
    for (const item of items) {
      const labour = item.labour ?? "0.00";
      await prisma.customerDecisionItem.create({
        data: {
          tenantId: shop.tenantId,
          decisionRequestId: request.id,
          name: item.name,
          explanation: "Found during inspection.",
          importance: "MEDIUM",
          price: item.price,
          laborPrice: labour,
          total: item.price,
          decision: item.decision,
          decidedAt: item.decision === "PENDING" ? null : new Date(),
        },
      });
    }
  }

  it("puts an approved extra on the bill at exactly the price shown to the customer", async () => {
    const job = await makeJob(paid);
    await decisionOn(paid, job, [{ name: "Front brake discs", price: "2400.00", labour: "400.00", decision: "APPROVED" }]);

    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines).toHaveLength(1);
    expect(total.lines[0].name).toBe("Front brake discs");
    expect(total.lines[0].unitPrice).toBe("2400.00");
    expect(total.lines[0].labour).toBe("400.00");
    expect(total.total).toBe("2800.00");
  });

  it("never bills something the customer declined", async () => {
    const job = await makeJob(paid);
    await decisionOn(paid, job, [
      { name: "Wanted", price: "100.00", decision: "APPROVED" },
      { name: "Declined", price: "900.00", decision: "REJECTED" },
    ]);

    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines.map((line) => line.name)).toEqual(["Wanted"]);
    expect(total.total).toBe("100.00");
  });

  it("never bills something the customer has not answered yet", async () => {
    const job = await makeJob(paid);
    await decisionOn(paid, job, [{ name: "Still thinking", price: "500.00", decision: "PENDING" }]);

    const total = await finance.jobTotal(paid.tenantId, job);
    expect(total.lines).toHaveLength(0);
  });

  it("bills an approved extra exactly once however often the total is read", async () => {
    const job = await makeJob(paid);
    await decisionOn(paid, job, [{ name: "Once only", price: "700.00", decision: "APPROVED" }]);

    await finance.jobTotal(paid.tenantId, job);
    await finance.jobTotal(paid.tenantId, job);
    const total = await finance.jobTotal(paid.tenantId, job);

    expect(total.lines).toHaveLength(1);
    expect(total.total).toBe("700.00");
  });

  it("charges the agreed price even when the catalogue says something else", async () => {
    const job = await makeJob(paid);
    await prisma.priceCatalogEntry.create({
      data: { tenantId: paid.tenantId, itemKey: "Agreed extra", itemType: "SERVICE", unitPrice: "50.00", isActive: true },
    });
    // The customer was shown 1200.00 and said yes to 1200.00. A cheaper
    // catalogue row must not silently rewrite what was agreed, in either
    // direction.
    await decisionOn(paid, job, [{ name: "Agreed extra", price: "1200.00", decision: "APPROVED" }]);

    const total = await finance.jobTotal(paid.tenantId, job);
    expect(total.total).toBe("1200.00");
  });
});
