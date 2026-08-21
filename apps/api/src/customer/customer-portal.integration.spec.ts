/**
 * Customer Portal -- every read is scoped to `session.customerId`, never
 * a parameter. The property that matters most for `SafeHistory`: a
 * customer who bought a used vehicle must never see the previous
 * owner's service entries, which is why the model is scoped by
 * `ownerCustomerId` per ownership period rather than by asset alone.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { CustomerPortalService } from "./customer-portal.service";
import type { PrismaService } from "../runtime/database/prisma.service";

const prisma = new PrismaClient();
const service = new CustomerPortalService(prisma as unknown as PrismaService);

const SUFFIX = `cp-${Date.now()}`;
let planId: string;
let tenantId: string;
let branchId: string;
let previousOwner: string;
let currentOwner: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Portal",
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
      name: `CP ${SUFFIX}`,
      nameNormalized: `cp ${SUFFIX}`,
      slug: `cp-${SUFFIX}`,
      customerRegistrationCode: `CP-${SUFFIX}`,
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

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `B-${SUFFIX}` } });
  branchId = branch.id;

  const [prev, curr] = await Promise.all([
    prisma.customer.create({ data: { tenantId, fullName: "Previous Owner", phone: "0100000010" } }),
    prisma.customer.create({ data: { tenantId, fullName: "Current Owner", phone: "0100000011" } }),
  ]);
  previousOwner = prev.id;
  currentOwner = curr.id;

  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT-${SUFFIX}` } });
  assetId = asset.id;

  const now = new Date();
  const earlier = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  await Promise.all([
    prisma.assetOwnershipHistory.create({ data: { tenantId, assetId, customerId: previousOwner, startedAt: earlier, endedAt: now } }),
    prisma.assetOwnershipHistory.create({ data: { tenantId, assetId, customerId: currentOwner, startedAt: now, endedAt: null } }),
  ]);

  await Promise.all([
    prisma.safeTechnicalHistory.create({
      data: { tenantId, assetId, ownerCustomerId: previousOwner, summary: "Oil change under previous owner", serviceDate: earlier },
    }),
    prisma.safeTechnicalHistory.create({
      data: { tenantId, assetId, ownerCustomerId: currentOwner, summary: "Brake pads replaced", serviceDate: now },
    }),
  ]);

  const wo = await prisma.workOrder.create({
    data: { tenantId, branchId, assetId, customerId: currentOwner, status: "IN_PROGRESS" },
  });

  await prisma.invoice.create({
    data: {
      tenantId,
      workOrderId: wo.id,
      invoiceNumber: `INV-${SUFFIX}`,
      subtotal: "100.00",
      total: "100.00",
      balance: "40.00",
      paid: "60.00",
      issuedById: "staff-1",
    },
  });
}, 180_000);

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.safeTechnicalHistory.deleteMany({ where: { tenantId } });
  await prisma.assetOwnershipHistory.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("safe history, scoped per ownership period", () => {
  it("shows the current owner only their own entries", async () => {
    const rows = await service.safeHistory(tenantId, currentOwner);
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe("Brake pads replaced");
  });

  it("never shows the previous owner's entries to the current owner", async () => {
    const rows = await service.safeHistory(tenantId, currentOwner);
    expect(rows.some((r) => r.summary.includes("previous owner"))).toBe(false);
  });
});

describe("my assets", () => {
  it("lists only currently-owned assets", async () => {
    const assets = await service.myAssets(tenantId, currentOwner);
    expect(assets.map((a) => a.id)).toContain(assetId);
  });

  it("does not list an asset the customer no longer owns", async () => {
    const assets = await service.myAssets(tenantId, previousOwner);
    expect(assets.map((a) => a.id)).not.toContain(assetId);
  });
});

describe("invoice status", () => {
  it("reports total/paid/balance as strings, scoped to the customer's own work orders", async () => {
    const invoices = await service.invoiceStatus(tenantId, currentOwner);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].balance).toBe("40.00");
    expect(typeof invoices[0].balance).toBe("string");
  });

  it("shows nothing for a customer with no invoices", async () => {
    const invoices = await service.invoiceStatus(tenantId, previousOwner);
    expect(invoices).toHaveLength(0);
  });
});

describe("home", () => {
  it("aggregates the portal's own numbers for the signed-in customer", async () => {
    const home = await service.home(tenantId, currentOwner);
    expect(home.assetCount).toBe(1);
    expect(home.currentServiceCount).toBe(1);
    expect(home.openInvoiceBalance).toBe("40.00");
  });
});
