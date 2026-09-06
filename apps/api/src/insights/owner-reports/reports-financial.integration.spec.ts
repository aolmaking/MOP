/**
 * Reports & Analytics -- Financial, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ReportsFinancialService } from "./reports-financial.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const financial = new ReportsFinancialService(asService);

const SUFFIX = `rfin-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchAId: string;
let branchBId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Financial Test",
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

  const tenant = await prisma.tenant.create({
    data: {
      name: `RF WS ${SUFFIX}`,
      nameNormalized: `rf ws ${SUFFIX}`,
      slug: `rf-ws-${SUFFIX}`,
      customerRegistrationCode: `RF-${SUFFIX}`,
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
  tenantId = tenant.id;

  const branchA = await prisma.branch.create({ data: { tenantId, name: "Branch A", code: `BA-${SUFFIX}` } });
  branchAId = branchA.id;
  const branchB = await prisma.branch.create({ data: { tenantId, name: "Branch B", code: `BB-${SUFFIX}` } });
  branchBId = branchB.id;
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Karim", phone: "0100000001" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.refundRequest.deleteMany({ where: { tenantId } });
  await prisma.creditNote.deleteMany({ where: { tenantId } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.invoiceLine.deleteMany({ where: { tenantId } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

let invoiceCounter = 0;
async function makeInvoiceWithLine(
  branchId: string,
  opts: {
    total: number;
    issuedAt: Date;
    laborPrice: number;
    unitPrice: number;
    lineName: string;
    discount?: number;
    status?: "ISSUED" | "PARTIALLY_PAID" | "PAID" | "REFUNDED";
    woStatus?: "DRAFT" | "CLOSED" | "CANCELLED";
    invoiceBranchId?: string;
  },
) {
  const wo = await prisma.workOrder.create({
    data: { tenantId, branchId, assetId, customerId, status: opts.woStatus ?? "DRAFT" },
  });
  invoiceCounter += 1;
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      branchId: opts.invoiceBranchId !== undefined ? opts.invoiceBranchId : branchId,
      workOrderId: wo.id,
      invoiceNumber: `INV-${SUFFIX}-${invoiceCounter}`,
      subtotal: opts.total + (opts.discount ?? 0),
      discount: opts.discount ?? 0,
      total: opts.total,
      paid: 0,
      balance: opts.total,
      status: opts.status ?? "ISSUED",
      issuedById: "staff-1",
      issuedAt: opts.issuedAt,
    },
  });
  await prisma.invoiceLine.create({
    data: {
      tenantId,
      invoiceId: invoice.id,
      name: opts.lineName,
      itemType: "SERVICE",
      quantity: 1,
      lockedUnitPrice: opts.unitPrice,
      lockedLaborPrice: opts.laborPrice,
      total: opts.total,
    },
  });
  return { workOrder: wo, invoice };
}

describe("ReportsFinancialService", () => {
  it("splits labor vs parts revenue from the two locked-price columns, not from the free-text itemType", async () => {
    const now = new Date();
    await makeInvoiceWithLine(branchAId, { total: 300, issuedAt: now, laborPrice: 100, unitPrice: 200, lineName: "Oil change" });

    const report = await financial.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });

    expect(report.laborRevenue).toBe(100);
    expect(report.partsRevenue).toBe(200);
  });

  it("compares branch revenue correctly, attributing each invoice to its own work order's branch", async () => {
    const now = new Date();
    await makeInvoiceWithLine(branchAId, { total: 500, issuedAt: now, laborPrice: 500, unitPrice: 0, lineName: "A-job" });
    await makeInvoiceWithLine(branchBId, { total: 100, issuedAt: now, laborPrice: 100, unitPrice: 0, lineName: "B-job" });

    const report = await financial.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });

    const a = report.branchRevenue.find((r) => r.branchId === branchAId);
    const b = report.branchRevenue.find((r) => r.branchId === branchBId);
    expect(a!.revenue).toBeGreaterThanOrEqual(500);
    expect(b!.revenue).toBeGreaterThanOrEqual(100);
    expect(report.branchRevenue[0]!.revenue).toBeGreaterThanOrEqual(report.branchRevenue[1]!.revenue);
  });

  it("buckets the revenue trend by day and sums correctly per bucket", async () => {
    const now = new Date();
    await makeInvoiceWithLine(branchAId, { total: 50, issuedAt: now, laborPrice: 50, unitPrice: 0, lineName: "X" });
    await makeInvoiceWithLine(branchAId, { total: 70, issuedAt: now, laborPrice: 70, unitPrice: 0, lineName: "Y" });

    const report = await financial.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
      groupBy: "day",
    });

    const totalTrendRevenue = report.trend.reduce((sum, point) => sum + point.revenue, 0);
    expect(totalTrendRevenue).toBeGreaterThanOrEqual(120);
  });

  it("ranks top services by revenue using the invoice line's own name", async () => {
    const now = new Date();
    await makeInvoiceWithLine(branchAId, { total: 900, issuedAt: now, laborPrice: 900, unitPrice: 0, lineName: "Engine Overhaul" });

    const report = await financial.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });

    expect(report.topServicesByRevenue[0]!.name).toBe("Engine Overhaul");
  });

  it("returns empty, non-crashing sections for a tenant with zero financial activity", async () => {
    const otherTenant = await prisma.tenant.create({
      data: {
        name: `RF Empty ${SUFFIX}`,
        nameNormalized: `rf empty ${SUFFIX}`,
        slug: `rf-empty-${SUFFIX}`,
        customerRegistrationCode: `RFE-${SUFFIX}`,
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

    const report = await financial.build(otherTenant.id, {});
    expect(report.trend).toEqual([]);
    expect(report.branchRevenue).toEqual([]);
    expect(report.topServicesByRevenue).toEqual([]);
    expect(report.laborRevenue).toBe(0);

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it("excludes cancelled work orders with unpaid invoices from revenue", async () => {
    const targetDate = new Date("2026-03-15T12:00:00.000Z");
    const fromStr = new Date("2026-03-15T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-15T23:59:59.999Z").toISOString();

    // Cancelled WO with unpaid invoice
    await makeInvoiceWithLine(branchAId, {
      total: 800,
      issuedAt: targetDate,
      laborPrice: 800,
      unitPrice: 0,
      lineName: "Cancelled WO Job",
      woStatus: "CANCELLED",
    });

    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    const totalTrend = report.trend.reduce((sum, p) => sum + p.revenue, 0);
    expect(totalTrend).toBe(0);
    const branchA = report.branchRevenue.find((b) => b.branchId === branchAId);
    expect(branchA?.revenue ?? 0).toBe(0);
  });

  it("excludes fully refunded invoices from revenue", async () => {
    const targetDate = new Date("2026-03-16T12:00:00.000Z");
    const fromStr = new Date("2026-03-16T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-16T23:59:59.999Z").toISOString();

    await makeInvoiceWithLine(branchAId, {
      total: 450,
      issuedAt: targetDate,
      laborPrice: 450,
      unitPrice: 0,
      lineName: "Refunded Job",
      status: "REFUNDED",
    });

    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    const totalTrend = report.trend.reduce((sum, p) => sum + p.revenue, 0);
    expect(totalTrend).toBe(0);
  });

  it("aggregates fractional decimal amounts exactly without float drift", async () => {
    const targetDate = new Date("2026-03-17T10:00:00.000Z");
    const fromStr = new Date("2026-03-17T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-17T23:59:59.999Z").toISOString();

    // 10.33 + 20.33 + 30.34 = 61.00 exactly
    await makeInvoiceWithLine(branchAId, { total: 10.33, issuedAt: targetDate, laborPrice: 10.33, unitPrice: 0, lineName: "Part 1" });
    await makeInvoiceWithLine(branchAId, { total: 20.33, issuedAt: targetDate, laborPrice: 20.33, unitPrice: 0, lineName: "Part 2" });
    await makeInvoiceWithLine(branchAId, { total: 30.34, issuedAt: targetDate, laborPrice: 30.34, unitPrice: 0, lineName: "Part 3" });

    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    const totalTrend = report.trend.reduce((sum, p) => sum + p.revenue, 0);
    expect(totalTrend).toBe(61);
  });

  it("accurately aggregates invoice discounts", async () => {
    const targetDate = new Date("2026-03-18T10:00:00.000Z");
    const fromStr = new Date("2026-03-18T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-18T23:59:59.999Z").toISOString();

    await makeInvoiceWithLine(branchAId, {
      total: 200,
      discount: 50,
      issuedAt: targetDate,
      laborPrice: 200,
      unitPrice: 0,
      lineName: "Discounted Service",
    });

    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    expect(report.discountsTotal).toBe(50);
  });

  it("never double-counts invoice totals when an invoice has multiple lines and payments", async () => {
    const targetDate = new Date("2026-03-19T10:00:00.000Z");
    const fromStr = new Date("2026-03-19T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-19T23:59:59.999Z").toISOString();

    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, assetId, customerId, status: "DRAFT" },
    });
    invoiceCounter += 1;
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo.id,
        invoiceNumber: `INV-${SUFFIX}-${invoiceCounter}`,
        subtotal: 300,
        total: 300,
        paid: 300,
        balance: 0,
        issuedById: "staff-1",
        issuedAt: targetDate,
      },
    });

    // 3 lines ($100 each)
    for (let i = 1; i <= 3; i++) {
      await prisma.invoiceLine.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          name: `Multi-Line ${i}`,
          itemType: "SERVICE",
          quantity: 1,
          lockedUnitPrice: 0,
          lockedLaborPrice: 100,
          total: 100,
        },
      });
    }

    // 2 payments ($150 each)
    for (let p = 1; p <= 2; p++) {
      await prisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount: 150,
          method: "CASH",
          status: "CONFIRMED",
          idempotencyKey: `pay-dc-${SUFFIX}-${invoiceCounter}-${p}`,
          recordedById: "staff-1",
          createdAt: targetDate,
        },
      });
    }

    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    const point = report.trend[0];
    expect(point).toBeDefined();
    // Invoiced revenue must be 300 (NOT 3x 300 = 900)
    expect(point.revenue).toBe(300);
    // Collected cash must be 300 (NOT duplicated across lines)
    expect(point.collected).toBe(300);
  });

  it("deducts credit notes from invoiced revenue", async () => {
    const targetDate = new Date("2026-03-20T10:00:00.000Z");
    const fromStr = new Date("2026-03-20T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-20T23:59:59.999Z").toISOString();

    const { invoice } = await makeInvoiceWithLine(branchAId, {
      total: 500,
      issuedAt: targetDate,
      laborPrice: 500,
      unitPrice: 0,
      lineName: "Credited Job",
    });

    await prisma.creditNote.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: 150,
        reason: "Customer goodwill discount",
        issuedById: "staff-1",
        createdAt: targetDate,
        creditNoteNumber: `CN-${SUFFIX}-1`,
      },
    });

    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    const point = report.trend[0];
    expect(point.revenue).toBe(350); // 500 - 150
    const branchA = report.branchRevenue.find((b) => b.branchId === branchAId);
    expect(branchA?.revenue).toBe(350);
  });

  it("does not deduct pending refund requests, but completed refunds reduce cash collections", async () => {
    const targetDate = new Date("2026-03-21T10:00:00.000Z");
    const fromStr = new Date("2026-03-21T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-21T23:59:59.999Z").toISOString();

    const { invoice } = await makeInvoiceWithLine(branchAId, {
      total: 600,
      issuedAt: targetDate,
      laborPrice: 600,
      unitPrice: 0,
      lineName: "Refund Flow Job",
    });

    await prisma.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: 600,
        method: "CARD",
        status: "CONFIRMED",
        idempotencyKey: `pay-rf-${SUFFIX}-1`,
        recordedById: "staff-1",
        createdAt: targetDate,
      },
    });

    // PENDING refund request should NOT reduce collected cash
    const pendingReq = await prisma.refundRequest.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: 200,
        reason: "Pending dispute",
        status: "PENDING",
        requestedById: "staff-1",
        createdAt: targetDate,
      },
    });

    let report = await financial.build(tenantId, { from: fromStr, to: toStr });
    expect(report.trend[0].collected).toBe(600);

    // Now complete a refund of 100 with decidedAt
    await prisma.refundRequest.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: 100,
        reason: "Approved return",
        status: "COMPLETED",
        requestedById: "staff-1",
        decidedById: "staff-1",
        createdAt: targetDate,
        decidedAt: targetDate,
      },
    });

    report = await financial.build(tenantId, { from: fromStr, to: toStr });
    expect(report.trend[0].collected).toBe(500); // 600 - 100
  });

  it("maintains historical branch attribution even after a work order changes branches", async () => {
    const targetDate = new Date("2026-03-22T10:00:00.000Z");
    const fromStr = new Date("2026-03-22T00:00:00.000Z").toISOString();
    const toStr = new Date("2026-03-22T23:59:59.999Z").toISOString();

    // Invoice stamped with Branch A
    const { workOrder } = await makeInvoiceWithLine(branchAId, {
      total: 750,
      issuedAt: targetDate,
      laborPrice: 750,
      unitPrice: 0,
      lineName: "Stable Branch Job",
      invoiceBranchId: branchAId,
    });

    // Mutate workOrder.branchId to Branch B (simulating later reassignment)
    await prisma.workOrder.update({
      where: { id: workOrder.id },
      data: { branchId: branchBId },
    });

    // Query report for the invoice date
    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    const branchA = report.branchRevenue.find((b) => b.branchId === branchAId);
    const branchB = report.branchRevenue.find((b) => b.branchId === branchBId);

    // Branch A retains the revenue; Branch B receives none
    expect(branchA?.revenue).toBe(750);
    expect(branchB?.revenue ?? 0).toBe(0);

    // Direct filter by Branch A should find it
    const filteredA = await financial.build(tenantId, { from: fromStr, to: toStr, branchId: branchAId });
    expect(filteredA.branchRevenue.find((b) => b.branchId === branchAId)?.revenue).toBe(750);

    // Direct filter by Branch B should return 0
    const filteredB = await financial.build(tenantId, { from: fromStr, to: toStr, branchId: branchBId });
    expect(filteredB.branchRevenue.find((b) => b.branchId === branchBId)?.revenue ?? 0).toBe(0);
  });

  it("respects inclusive date boundaries strictly at range start and end", async () => {
    const rangeStart = new Date("2026-03-25T08:00:00.000Z");
    const rangeEnd = new Date("2026-03-25T18:00:00.000Z");
    const fromStr = rangeStart.toISOString();
    const toStr = rangeEnd.toISOString();

    // Exact start
    await makeInvoiceWithLine(branchAId, { total: 100, issuedAt: rangeStart, laborPrice: 100, unitPrice: 0, lineName: "At Start" });
    // Exact end
    await makeInvoiceWithLine(branchAId, { total: 200, issuedAt: rangeEnd, laborPrice: 200, unitPrice: 0, lineName: "At End" });
    // 1 second before start
    await makeInvoiceWithLine(branchAId, {
      total: 999,
      issuedAt: new Date(rangeStart.getTime() - 1000),
      laborPrice: 999,
      unitPrice: 0,
      lineName: "Before Start",
    });
    // 1 second after end
    await makeInvoiceWithLine(branchAId, {
      total: 888,
      issuedAt: new Date(rangeEnd.getTime() + 1000),
      laborPrice: 888,
      unitPrice: 0,
      lineName: "After End",
    });

    const report = await financial.build(tenantId, { from: fromStr, to: toStr });
    const totalTrend = report.trend.reduce((sum, p) => sum + p.revenue, 0);
    // 100 + 200 = 300. The before and after invoices must be strictly excluded.
    expect(totalTrend).toBe(300);
  });
});
