/**
 * Data Analyst -- Inventory Analytics and Feature Adoption Analytics,
 * against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { InventoryReportsService } from "../inventory/inventory-reports.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const inventoryReports = new InventoryReportsService(asService);
const inventoryAnalytics = new InventoryAnalyticsService(asService, inventoryReports);
const featureAdoption = new FeatureAdoptionAnalyticsService(asService);

const SUFFIX = `ainv-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let warehouseId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Analytics Inv Test",
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
      name: `AInv WS ${SUFFIX}`,
      nameNormalized: `ainv ws ${SUFFIX}`,
      slug: `ainv-ws-${SUFFIX}`,
      customerRegistrationCode: `AINV-${SUFFIX}`,
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
  const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Central", code: `CTR-${SUFFIX}` } });
  warehouseId = warehouse.id;
  await prisma.branchWarehouseAccess.create({ data: { tenantId, branchId, warehouseId } });
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Rania", phone: "0100000009" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.inspection.deleteMany({ where: { tenantId } });
  await prisma.warehouseStockBalance.deleteMany({ where: { tenantId } });
  await prisma.inventoryItem.deleteMany({ where: { tenantId } });
  await prisma.branchWarehouseAccess.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("InventoryAnalyticsService", () => {
  it("resolves branch scope into warehouse scope via BranchWarehouseAccess, and gates value on cost visibility", async () => {
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Oil filter", itemType: "PART", sellingPrice: 40, cost: 20 },
    });
    await prisma.warehouseStockBalance.create({ data: { tenantId, inventoryItemId: item.id, warehouseId, availableQty: 10 } });

    const withoutCost = await inventoryAnalytics.build(tenantId, { branchIds: [branchId], categoryIds: [] }, false);
    expect(withoutCost.inventoryValue).toBeNull();

    const withCost = await inventoryAnalytics.build(tenantId, { branchIds: [branchId], categoryIds: [] }, true);
    expect(withCost.inventoryValue).toBe(200); // 10 * cost(20)
  });

  it("returns unscoped when no branch scope is set", async () => {
    const report = await inventoryAnalytics.build(tenantId, { branchIds: [], categoryIds: [] }, false);
    expect(report.operational).toBeDefined();
  });
});

describe("FeatureAdoptionAnalyticsService", () => {
  it("counts Quick vs Full inspection usage separately, and names untrackable features honestly", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    await prisma.inspection.create({ data: { tenantId, workOrderId: wo.id, technicianId: "staff-1", type: "QUICK", fields: {} } });

    const report = await featureAdoption.build(tenantId, {});
    const quick = report.features.find((f) => f.feature === "Quick Inspection");
    expect(quick?.usageCount).toBeGreaterThanOrEqual(1);
    expect(report.notTrackable.some((n) => n.feature === "Custom Fields")).toBe(true);
    expect(report.notTrackable.some((n) => n.feature === "Message Templates")).toBe(true);
  });
});
