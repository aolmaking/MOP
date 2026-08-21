/**
 * Reports & Analytics -- Executive Overview, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ReportsOverviewService } from "./reports-overview.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const overview = new ReportsOverviewService(asService);

const SUFFIX = `rov-${Date.now()}`;
let tenantId: string;
let otherTenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

async function makeTenant(slug: string) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `RO WS ${slug}`,
      nameNormalized: `ro ws ${slug}`,
      slug: `ro-ws-${slug}`,
      customerRegistrationCode: `RO-${slug}`,
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
  return tenant.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Overview Test",
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

  tenantId = await makeTenant(SUFFIX);
  otherTenantId = await makeTenant(`${SUFFIX}-other`);

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}` } });
  branchId = branch.id;
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Nadia", phone: "0100000000" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  for (const id of [tenantId, otherTenantId]) {
    await prisma.payment.deleteMany({ where: { tenantId: id } });
    await prisma.invoiceLine.deleteMany({ where: { tenantId: id } });
    await prisma.invoice.deleteMany({ where: { tenantId: id } });
    await prisma.workOrder.deleteMany({ where: { tenantId: id } });
    await prisma.asset.deleteMany({ where: { tenantId: id } });
    await prisma.customer.deleteMany({ where: { tenantId: id } });
    await prisma.branch.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

async function makeWorkOrder(overrides: { createdAt?: Date; status?: "DRAFT" | "CLOSED"; closedAt?: Date | null } = {}) {
  return prisma.workOrder.create({
    data: {
      tenantId,
      branchId,
      assetId,
      customerId,
      status: overrides.status ?? "DRAFT",
      createdAt: overrides.createdAt ?? new Date(),
      closedAt: overrides.closedAt ?? null,
    },
  });
}

let invoiceCounter = 0;
async function makeInvoice(workOrderId: string, opts: { total: number; paid: number; issuedAt: Date }) {
  invoiceCounter += 1;
  return prisma.invoice.create({
    data: {
      tenantId,
      workOrderId,
      invoiceNumber: `INV-${SUFFIX}-${invoiceCounter}`,
      subtotal: opts.total,
      total: opts.total,
      paid: opts.paid,
      balance: opts.total - opts.paid,
      issuedById: "staff-1",
      issuedAt: opts.issuedAt,
    },
  });
}

describe("ReportsOverviewService -- revenue is never conflated with cash collected", () => {
  it("distinguishes revenue (invoiced) from collected (paid), for a fully-paid invoice", async () => {
    const wo = await makeWorkOrder();
    const now = new Date();
    await makeInvoice(wo.id, { total: 1000, paid: 1000, issuedAt: now });

    const report = await overview.build(tenantId, { from: new Date(now.getTime() - 60_000).toISOString(), to: new Date(now.getTime() + 60_000).toISOString() });

    expect(report.revenue.current).toBe(1000);
    expect(report.collected.current).toBe(0); // No Payment row exists -- Invoice.paid is a snapshot, not what this KPI reads.
    expect(report.outstandingBalance).toBe(0);
  });

  it("counts real Payment rows for `collected`, separately from the invoice total", async () => {
    const wo = await makeWorkOrder();
    const now = new Date();
    const invoice = await makeInvoice(wo.id, { total: 500, paid: 200, issuedAt: now });
    await prisma.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: 200,
        method: "CASH",
        status: "CONFIRMED",
        idempotencyKey: `pay-${SUFFIX}-1`,
        recordedById: "staff-1",
        createdAt: now,
      },
    });

    const report = await overview.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });

    expect(report.collected.current).toBeGreaterThanOrEqual(200);
    expect(report.outstandingBalance).toBeGreaterThanOrEqual(300);
  });

  it("computes average completion hours from real closedAt - createdAt, and is null when nothing closed in range", async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    await makeWorkOrder({ createdAt, status: "CLOSED", closedAt: now });

    const withClosedJob = await overview.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(withClosedJob.averageCompletionHours).not.toBeNull();
    expect(withClosedJob.averageCompletionHours!).toBeGreaterThan(4.9);
    expect(withClosedJob.averageCompletionHours!).toBeLessThan(5.1);

    const farPast = await overview.build(tenantId, {
      from: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400).toISOString(),
      to: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 399).toISOString(),
    });
    expect(farPast.averageCompletionHours).toBeNull();
  });

  it("never leaks across tenants", async () => {
    const wo = await makeWorkOrder();
    const now = new Date();
    await makeInvoice(wo.id, { total: 9999, paid: 0, issuedAt: now });

    const otherReport = await overview.build(otherTenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(otherReport.revenue.current).toBe(0);
  });

  it("handles a brand-new, empty workshop without crashing or dividing by zero", async () => {
    const now = new Date();
    const report = await overview.build(otherTenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(report.averageOrderValue).toBe(0);
    expect(report.activeCustomers.current).toBe(0);
    expect(report.revenue.percentChange).toBe(0);
  });

  it("refuses a reversed date range rather than silently swapping it", async () => {
    await expect(overview.build(tenantId, { from: "2026-06-01", to: "2026-01-01" })).rejects.toThrow(
      "date_range_reversed",
    );
  });
});
