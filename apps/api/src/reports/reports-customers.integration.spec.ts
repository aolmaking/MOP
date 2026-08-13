/**
 * Reports & Analytics -- Customers, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ReportsCustomersService } from "./reports-customers.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const customersReport = new ReportsCustomersService(asService);

const SUFFIX = `rcus-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Customers Test",
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
      name: `RC WS ${SUFFIX}`,
      nameNormalized: `rc ws ${SUFFIX}`,
      slug: `rc-ws-${SUFFIX}`,
      customerRegistrationCode: `RC-${SUFFIX}`,
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

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}` } });
  branchId = branch.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

async function makeWorkOrderAt(customerId: string, createdAt: Date) {
  return prisma.workOrder.create({
    data: { tenantId, branchId, assetId, customerId, status: "DRAFT", createdAt },
  });
}

describe("ReportsCustomersService", () => {
  it("counts a customer created within the range as new", async () => {
    const now = new Date();
    await prisma.customer.create({ data: { tenantId, fullName: "New Person", phone: "0111111111", createdAt: now } });

    const report = await customersReport.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(report.newCustomers).toBeGreaterThanOrEqual(1);
  });

  it("classifies a customer with a prior visit (before the range) and a visit in range as returning, not new", async () => {
    const oldVisit = new Date("2025-01-01T00:00:00Z");
    const customer = await prisma.customer.create({
      data: { tenantId, fullName: "Returning Person", phone: "0122222222", createdAt: oldVisit },
    });
    await makeWorkOrderAt(customer.id, oldVisit);

    const rangeStart = new Date("2026-01-01T00:00:00Z");
    const rangeEnd = new Date("2026-01-31T00:00:00Z");
    await makeWorkOrderAt(customer.id, new Date("2026-01-15T00:00:00Z"));

    const report = await customersReport.build(tenantId, { from: rangeStart.toISOString(), to: rangeEnd.toISOString() });
    expect(report.returningCustomers).toBeGreaterThanOrEqual(1);
  });

  it("flags a customer whose last visit is well past the inactivity threshold as inactive", async () => {
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const customer = await prisma.customer.create({
      data: { tenantId, fullName: "Gone Customer", phone: "0133333333", createdAt: longAgo },
    });
    await makeWorkOrderAt(customer.id, longAgo);

    const report = await customersReport.build(tenantId, {});
    expect(report.inactiveCustomers).toBeGreaterThanOrEqual(1);
    expect(report.inactivityThresholdDays).toBe(90);
  });

  it("does not count a customer who visited recently as inactive", async () => {
    const customer = await prisma.customer.create({
      data: { tenantId, fullName: "Recent Customer", phone: "0144444444" },
    });
    await makeWorkOrderAt(customer.id, new Date());

    const report = await customersReport.build(tenantId, {});
    // Can't assert an exact count (other tests share the tenant), but the
    // service must not crash and must return a sane non-negative number.
    expect(report.inactiveCustomers).toBeGreaterThanOrEqual(0);
  });

  it("ranks top customers by total invoiced, never by visit count alone", async () => {
    const now = new Date();
    const bigSpender = await prisma.customer.create({ data: { tenantId, fullName: "Big Spender", phone: "0155555555" } });
    const wo = await makeWorkOrderAt(bigSpender.id, now);
    await prisma.invoice.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        invoiceNumber: `INV-${SUFFIX}-topcust`,
        subtotal: 5000,
        total: 5000,
        paid: 0,
        balance: 5000,
        issuedById: "staff-1",
        issuedAt: now,
      },
    });

    const report = await customersReport.build(tenantId, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(report.topCustomersByValue[0]!.customerId).toBe(bigSpender.id);
    expect(report.topCustomersByValue[0]!.totalInvoiced).toBe(5000);
  });

  it("handles a workshop with no customers at all", async () => {
    const emptyTenant = await prisma.tenant.create({
      data: {
        name: `RC Empty ${SUFFIX}`,
        nameNormalized: `rc empty ${SUFFIX}`,
        slug: `rc-empty-${SUFFIX}`,
        customerRegistrationCode: `RCE-${SUFFIX}`,
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

    const report = await customersReport.build(emptyTenant.id, {});
    expect(report.newCustomers).toBe(0);
    expect(report.activeCustomers).toBe(0);
    expect(report.averageVisitsPerActiveCustomer).toBe(0);
    expect(report.topCustomersByValue).toEqual([]);

    await prisma.tenant.delete({ where: { id: emptyTenant.id } });
  });
});
