/**
 * Reports & Analytics -- Inventory, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { InventoryReportsService } from "../../systems/inventory/inventory-reports.service";
import { ReportsInventoryService } from "./reports-inventory.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const inventoryReports = new InventoryReportsService(asService);
const inventory = new ReportsInventoryService(asService, inventoryReports);

const SUFFIX = `rinv-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;
let warehouseId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Inv Test",
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
      name: `RI WS ${SUFFIX}`,
      nameNormalized: `ri ws ${SUFFIX}`,
      slug: `ri-ws-${SUFFIX}`,
      customerRegistrationCode: `RI-${SUFFIX}`,
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
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Mona", phone: "0100000003" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.workOrderPartLine.deleteMany({ where: { tenantId } });
  await prisma.branchWarehouseAccess.deleteMany({ where: { tenantId } });
  await prisma.stockMovement.deleteMany({ where: { tenantId } });
  await prisma.warehouseStockBalance.deleteMany({ where: { tenantId } });
  await prisma.inventoryItem.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("ReportsInventoryService", () => {
  it("computes real per-part profit from WorkOrderPartLine's own sellingPrice/cost, revenue only when cost is unknown", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "DRAFT" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Brake Pad", itemType: "PART", sellingPrice: 100, cost: 60 },
    });

    await prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        provenance: "INVENTORY",
        addedById: "staff-1",
        inventoryItemId: item.id,
        name: "Brake Pad",
        quantity: 2,
        sellingPrice: 100,
        cost: 60,
      },
    });

    const report = await inventory.build(tenantId, {});
    const row = report.partProfitability.find((r) => r.inventoryItemId === item.id);
    expect(row).toBeDefined();
    expect(row!.revenue).toBe(200);
    expect(row!.cost).toBe(120);
    expect(row!.profit).toBe(80);
  });

  it("marks profit as unavailable (null), not a fake zero, when a line never recorded a cost", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "DRAFT" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU2-${SUFFIX}`, name: "Customer-Supplied Filter", itemType: "PART", sellingPrice: 0 },
    });

    await prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        provenance: "CUSTOMER_SUPPLIED",
        addedById: "staff-1",
        inventoryItemId: item.id,
        name: "Customer-Supplied Filter",
        quantity: 1,
        sellingPrice: 0,
        cost: null,
      },
    });

    const report = await inventory.build(tenantId, {});
    const row = report.partProfitability.find((r) => r.inventoryItemId === item.id);
    expect(row!.cost).toBeNull();
    expect(row!.profit).toBeNull();
  });

  it("flags stock with zero ISSUE/TRANSFER_OUT movement ever as dead stock, distinct from merely slow-moving", async () => {
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU3-${SUFFIX}`, name: "Unused Gasket", itemType: "PART", sellingPrice: 50 },
    });
    await prisma.warehouseStockBalance.create({
      data: { tenantId, inventoryItemId: item.id, warehouseId, availableQty: 10 },
    });

    const report = await inventory.build(tenantId, {});
    const dead = report.deadStock.find((r) => r.inventoryItemId === item.id);
    expect(dead).toBeDefined();
    expect(dead!.valueAtSellingPrice).toBe(500);
  });

  it("does not count stock with a real movement as dead", async () => {
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU4-${SUFFIX}`, name: "Moving Filter", itemType: "PART", sellingPrice: 30 },
    });
    await prisma.warehouseStockBalance.create({
      data: { tenantId, inventoryItemId: item.id, warehouseId, availableQty: 5 },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId,
        inventoryItemId: item.id,
        warehouseId,
        type: "ISSUE",
        quantity: 1,
        beforeQty: 6,
        afterQty: 5,
        actorId: "staff-1",
      },
    });

    const report = await inventory.build(tenantId, {});
    expect(report.deadStock.find((r) => r.inventoryItemId === item.id)).toBeUndefined();
  });
});

/**
 * The controller resolved a branch and passed it in; this report ignored it,
 * so a branch manager saw the whole workshop's stock and the whole workshop's
 * part profit. A branch does not own stock -- the warehouses it is allowed to
 * draw from do, which is what BranchWarehouseAccess records.
 */
describe("the branch filter is honoured", () => {
  it("values only the stock in the warehouses that serve the branch", async () => {
    const served = await prisma.warehouse.create({ data: { tenantId, name: "Served", code: `SRV-${SUFFIX}` } });
    const unserved = await prisma.warehouse.create({ data: { tenantId, name: "Unserved", code: `UNS-${SUFFIX}` } });
    const branch = await prisma.branch.create({ data: { tenantId, name: "Scoped", code: `SCP-${SUFFIX}` } });
    await prisma.branchWarehouseAccess.create({ data: { tenantId, branchId: branch.id, warehouseId: served.id } });

    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}-scope`, name: "Scoped Filter", itemType: "PART", sellingPrice: 10, cost: 4 },
    });
    await prisma.warehouseStockBalance.create({
      data: { tenantId, warehouseId: served.id, inventoryItemId: item.id, availableQty: 3 },
    });
    await prisma.warehouseStockBalance.create({
      data: { tenantId, warehouseId: unserved.id, inventoryItemId: item.id, availableQty: 7 },
    });

    const scoped = await inventory.build(tenantId, { branchId: branch.id });
    const whole = await inventory.build(tenantId, {});

    // 3 units at 10, not 10 units at 10.
    expect(scoped.totalInventoryValue).toBe(30);
    expect(whole.totalInventoryValue).toBeGreaterThanOrEqual(100);
  });

  it("shows an empty inventory page for a branch with no serving warehouse, rather than the whole workshop's", async () => {
    // A branch nobody has connected to a warehouse is a real configuration,
    // and the honest answer is nothing -- not everything.
    const orphan = await prisma.branch.create({ data: { tenantId, name: "Orphan", code: `ORP-${SUFFIX}` } });

    const report = await inventory.build(tenantId, { branchId: orphan.id });

    expect(report.totalInventoryValue).toBe(0);
    expect(report.deadStock).toEqual([]);
  });

  it("attributes part profit to the branch whose job sold the part", async () => {
    const other = await prisma.branch.create({ data: { tenantId, name: "Selling", code: `SEL-${SUFFIX}` } });
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: other.id, assetId, customerId, status: "DRAFT" },
    });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}-sold`, name: "Sold Elsewhere", itemType: "PART", sellingPrice: 50, cost: 20 },
    });
    await prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        inventoryItemId: item.id,
        name: "Sold Elsewhere",
        quantity: 2,
        sellingPrice: 50,
        cost: 20,
        provenance: "INVENTORY",
        addedById: "staff-1",
      },
    });

    const selling = await inventory.build(tenantId, { branchId: other.id });
    const main = await inventory.build(tenantId, { branchId });

    expect(selling.partProfitability.find((row) => row.inventoryItemId === item.id)?.profit).toBe(60);
    expect(main.partProfitability.map((row) => row.inventoryItemId)).not.toContain(item.id);
  });
});

/**
 * REC-046, the dead-stock half: a part sold every week through the
 * approve-repair path produced no `ISSUE` movement, so this report called it
 * stock that had never moved in its life.
 */
describe("dead stock knows about consumed reservations", () => {
  it("does not call a part dead when it left the shelf on a job", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Live", code: `LIV-${SUFFIX}` } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}-live`, name: "Sells Every Week", itemType: "PART", sellingPrice: 40 },
    });
    await prisma.warehouseStockBalance.create({
      data: { tenantId, warehouseId: warehouse.id, inventoryItemId: item.id, availableQty: 5 },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId,
        warehouseId: warehouse.id,
        inventoryItemId: item.id,
        type: "CONSUME_RESERVATION",
        quantity: 3,
        actorId: "store-1",
        beforeQty: 3,
        afterQty: 0,
      },
    });

    const report = await inventory.build(tenantId, {});

    expect(report.deadStock.map((row) => row.inventoryItemId)).not.toContain(item.id);
  });

  it("still calls a part dead when nothing has ever moved", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Dusty", code: `DST-${SUFFIX}` } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}-dead`, name: "Never Sold", itemType: "PART", sellingPrice: 40 },
    });
    await prisma.warehouseStockBalance.create({
      data: { tenantId, warehouseId: warehouse.id, inventoryItemId: item.id, availableQty: 5 },
    });

    const report = await inventory.build(tenantId, {});

    expect(report.deadStock.map((row) => row.inventoryItemId)).toContain(item.id);
  });
});
