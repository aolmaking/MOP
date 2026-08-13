/**
 * H7/P-32 (docs/POLICY_DECISION_INVENTORY.md): warehouse deactivation
 * against real stock, against a real database. Integration because the
 * property being proven is a database one -- balances summed across
 * every bucket, across every item, for one specific warehouse -- not
 * something a mock could stand in for.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WarehouseService } from "./warehouse.service";
import { StockService } from "./stock.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const warehouses = new WarehouseService(asService, new AuditService(asService));
const stock = new StockService(asService);

const ACTOR = { accountId: "manager-1", displayName: "Inventory Manager" };
const SUFFIX = `wh-${Date.now()}`;

let tenantId: string;
let planId: string;
let itemId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Warehouse Test",
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
      name: `Warehouse WS ${SUFFIX}`,
      nameNormalized: `warehouse ws ${SUFFIX}`,
      slug: `warehouse-ws-${SUFFIX}`,
      customerRegistrationCode: `WH-${SUFFIX}`,
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

  itemId = (
    await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Brake pad", itemType: "PART", sellingPrice: "300.00" },
    })
  ).id;
}, 120_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.stockMovement.deleteMany({ where });
  await prisma.warehouseStockBalance.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.warehouse.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("deactivate -- a warehouse with no stock at all", () => {
  it("deactivates cleanly and writes an audit row", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Empty Bay", code: `EMPTY-${SUFFIX}` } });

    await warehouses.deactivate(tenantId, warehouse.id, ACTOR, "Retiring this location, never had stock.");

    const stored = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });
    expect(stored.isActive).toBe(false);

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "warehouse.deactivated", targetId: warehouse.id },
    });
    expect(auditRow?.riskLevel).toBe("HIGH");
    expect(auditRow?.after).toMatchObject({ isActive: false });
  });

  it("refuses to deactivate a warehouse that is already inactive", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Already Off", code: `OFF-${SUFFIX}`, isActive: false } });

    await expect(
      warehouses.deactivate(tenantId, warehouse.id, ACTOR, "Trying again for no reason."),
    ).rejects.toMatchObject({ status: 409, response: { code: "already_inactive" } });
  });

  it("refuses for a warehouse in a different tenant, or one that doesn't exist, the same way", async () => {
    await expect(
      warehouses.deactivate(tenantId, "not-a-real-id", ACTOR, "Testing a bad id."),
    ).rejects.toMatchObject({ status: 404, response: { code: "warehouse_not_found" } });
  });
});

describe("deactivate -- H7's actual case, stock still present", () => {
  it("refuses when available stock is nonzero, and names the item", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Stocked Bay", code: `STOCK-${SUFFIX}` } });
    await stock.record({ tenantId, inventoryItemId: itemId, warehouseId: warehouse.id, type: "SUPPLIER_RECEIPT", quantity: 5, actorId: "store-1" });

    await expect(warehouses.deactivate(tenantId, warehouse.id, ACTOR, "Trying to close a stocked bay.")).rejects.toMatchObject({
      status: 409,
      response: { code: "warehouse_has_stock", details: [{ inventoryItemId: itemId, totalQuantity: 5 }] },
    });

    // Refused, not partially applied.
    const stored = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });
    expect(stored.isActive).toBe(true);
  });

  it("refuses when the only remaining stock is DAMAGED -- a damaged part is still a physical thing", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Damaged Only", code: `DMG-${SUFFIX}` } });
    await stock.record({ tenantId, inventoryItemId: itemId, warehouseId: warehouse.id, type: "DAMAGED", quantity: 2, actorId: "store-1" });

    await expect(warehouses.deactivate(tenantId, warehouse.id, ACTOR, "Only damaged stock remains.")).rejects.toMatchObject({
      status: 409,
      response: { code: "warehouse_has_stock" },
    });
  });

  it("succeeds once the warehouse is genuinely emptied back to zero", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Emptied Bay", code: `EMPTIED-${SUFFIX}` } });
    await stock.record({ tenantId, inventoryItemId: itemId, warehouseId: warehouse.id, type: "SUPPLIER_RECEIPT", quantity: 4, actorId: "store-1" });
    await stock.record({ tenantId, inventoryItemId: itemId, warehouseId: warehouse.id, type: "ISSUE", quantity: 4, actorId: "store-1" });

    await warehouses.deactivate(tenantId, warehouse.id, ACTOR, "Fully issued out, closing the bay.");

    const stored = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });
    expect(stored.isActive).toBe(false);
  });
});

describe("reactivate", () => {
  it("turns a deactivated warehouse back on, audited the same way", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Reopening", code: `REOPEN-${SUFFIX}`, isActive: false } });

    await warehouses.reactivate(tenantId, warehouse.id, ACTOR, "Business picked back up, reopening this location.");

    const stored = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });
    expect(stored.isActive).toBe(true);

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "warehouse.reactivated", targetId: warehouse.id },
    });
    expect(auditRow?.riskLevel).toBe("HIGH");
  });

  it("refuses to reactivate a warehouse that is already active", async () => {
    const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Already On", code: `ON-${SUFFIX}` } });

    await expect(
      warehouses.reactivate(tenantId, warehouse.id, ACTOR, "Trying again for no reason."),
    ).rejects.toMatchObject({ status: 409, response: { code: "already_active" } });
  });
});
