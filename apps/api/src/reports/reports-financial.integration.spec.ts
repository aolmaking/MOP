/**
 * Reports & Analytics -- Financial, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ReportsFinancialService } from "./reports-financial.service";
import type { PrismaService } from "../runtime/database/prisma.service";

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
  opts: { total: number; issuedAt: Date; laborPrice: number; unitPrice: number; lineName: string },
) {
  const wo = await prisma.workOrder.create({
    data: { tenantId, branchId, assetId, customerId, status: "DRAFT" },
  });
  invoiceCounter += 1;
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      workOrderId: wo.id,
      invoiceNumber: `INV-${SUFFIX}-${invoiceCounter}`,
      subtotal: opts.total,
      total: opts.total,
      paid: 0,
      balance: opts.total,
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
});
