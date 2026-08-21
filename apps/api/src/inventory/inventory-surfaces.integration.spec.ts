/**
 * Inventory Home, Catalog Control and Reports, against a real database.
 *
 * The property under test in all three is the same one, and it is the
 * reason this role has its own reporting at all:
 *
 *   A stock number is a fact about a room, never about a company.
 *
 * The case that proves it is an item that is low in one warehouse and
 * healthy in another. Summing balances first and comparing the total
 * against the threshold hides exactly that -- and it is the only case
 * worth catching, because it is the one where a technician is standing
 * in front of an empty shelf while the report says there is plenty.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ConflictException } from "@nestjs/common";
import { InventoryHomeService } from "./inventory-home.service";
import { CatalogService } from "./catalog.service";
import { InventoryReportsService } from "./inventory-reports.service";
import { StockService } from "./stock.service";
import type { PrismaService } from "../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const home = new InventoryHomeService(asService);
const catalog = new CatalogService(asService);
const reports = new InventoryReportsService(asService);
const stock = new StockService(asService);

const SUFFIX = `surf-${Date.now()}`;
const ACTOR = "store-1";

let tenantId: string;
let planId: string;
let mainId: string;
let annexeId: string;
/** Low in Main, healthy in Annexe -- the case the whole page exists for. */
let splitItemId: string;
/** No thresholds, never counted: must not appear as "out of stock". */
let untrackedItemId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Surfaces",
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
      name: `Surfaces WS ${SUFFIX}`,
      nameNormalized: `surfaces ws ${SUFFIX}`,
      slug: `surfaces-ws-${SUFFIX}`,
      customerRegistrationCode: `SF-${SUFFIX}`,
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

  mainId = (await prisma.warehouse.create({ data: { tenantId, name: "Main store", code: "MS" } })).id;
  annexeId = (await prisma.warehouse.create({ data: { tenantId, name: "Annexe", code: "AX" } })).id;

  splitItemId = (
    await prisma.inventoryItem.create({
      data: {
        tenantId,
        sku: `SPLIT-${SUFFIX}`,
        name: "Brake pad",
        itemType: "PART",
        sellingPrice: "300.00",
        cost: "180.00",
        category: "Brakes",
        lowStockThreshold: 10,
        criticalStockThreshold: 4,
      },
    })
  ).id;

  untrackedItemId = (
    await prisma.inventoryItem.create({
      data: {
        tenantId,
        sku: `UNTRACKED-${SUFFIX}`,
        name: "Washer",
        itemType: "PART",
        sellingPrice: "2.00",
        stockTracked: false,
        lowStockThreshold: 100,
        criticalStockThreshold: 50,
      },
    })
  ).id;

  const receive = (warehouseId: string, inventoryItemId: string, quantity: number) =>
    stock.record({ tenantId, inventoryItemId, warehouseId, type: "SUPPLIER_RECEIPT", quantity, actorId: ACTOR });

  // Main ends on 6 (below low 10, above critical 4). Annexe ends on 40.
  await receive(mainId, splitItemId, 6);
  await receive(annexeId, splitItemId, 40);

  // The untracked item is driven to zero the only way stock ever
  // changes -- in, then out. There is no back door that writes a
  // balance without a movement, and the test must not invent one.
  await receive(mainId, untrackedItemId, 1);
  await stock.record({
    tenantId,
    inventoryItemId: untrackedItemId,
    warehouseId: mainId,
    type: "ISSUE",
    quantity: 1,
    actorId: ACTOR,
  });
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.stockMovement.deleteMany({ where });
  await prisma.warehouseStockBalance.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.warehouse.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("Inventory Home: stock health is per warehouse", () => {
  it("counts an item low in one warehouse and healthy in another exactly once", async () => {
    const page = await home.build(tenantId, []);

    // 6 against a low threshold of 10 in Main. 40 in Annexe is fine.
    // A blended total of 46 would report nothing at all.
    expect(page.lowStock.total).toBe(1);
  });

  it("says which warehouse, because that is the question this role asks", async () => {
    const page = await home.build(tenantId, []);

    expect(page.lowStock.byWarehouse.map((slice) => slice.code)).toEqual(["MS"]);
    expect(page.lowStock.byWarehouse[0]?.count).toBe(1);
  });

  it("keeps low, critical and out of stock as three separate counts", async () => {
    const page = await home.build(tenantId, []);

    // They mean different things and are acted on differently. One
    // combined "low stock" bucket would erase that.
    expect(page.criticalStock.total).toBe(0);
    expect(page.outOfStock.total).toBe(0);
    expect(page.lowStock.total).toBe(1);
  });

  it("ignores an untracked item rather than calling it out of stock", async () => {
    // It exists in the catalog for pricing only. Counting its zero would
    // fill the card with things nobody is waiting for.
    const page = await home.build(tenantId, []);

    expect(page.outOfStock.total).toBe(0);
    expect(page.outOfStock.byWarehouse).toEqual([]);
  });

  it("reports only the warehouses in scope", async () => {
    const scoped = await home.build(tenantId, [annexeId]);

    expect(scoped.warehouses.map((warehouse) => warehouse.code)).toEqual(["AX"]);
    // Main's shortage belongs to a room this manager does not cover.
    expect(scoped.lowStock.total).toBe(0);
  });

  it("moves an item into critical when its balance crosses that threshold", async () => {
    await stock.record({
      tenantId,
      inventoryItemId: splitItemId,
      warehouseId: mainId,
      type: "ISSUE",
      quantity: 3,
      actorId: ACTOR,
    });

    const page = await home.build(tenantId, []);

    // 3 left, critical threshold 4: it leaves low and enters critical
    // rather than appearing in both.
    expect(page.criticalStock.total).toBe(1);
    expect(page.lowStock.total).toBe(0);
  });
});

describe("Catalog Control", () => {
  it("omits cost entirely when the reader may not see it", async () => {
    const page = await catalog.list(tenantId, {}, false);
    const row = page.items.find((item) => item.id === splitItemId);

    // Absent, not blanked client-side -- anyone can open dev tools.
    expect(row?.cost).toBeNull();
    expect(row?.sellingPrice).toBe("300.00");
  });

  it("returns cost when the reader may see it", async () => {
    const page = await catalog.list(tenantId, {}, true);

    expect(page.items.find((item) => item.id === splitItemId)?.cost).toBe("180.00");
  });

  it("gives money as a string, never a number", async () => {
    const page = await catalog.list(tenantId, {}, true);
    const row = page.items.find((item) => item.id === splitItemId);

    expect(typeof row?.sellingPrice).toBe("string");
    expect(typeof row?.cost).toBe("string");
  });

  it("refuses a duplicate SKU rather than quietly suffixing it", async () => {
    // Two items nobody can tell apart is worse than a rejected form.
    await expect(
      catalog.create(
        tenantId,
        { sku: `SPLIT-${SUFFIX}`, name: "Brake pad (copy)", itemType: "PART", sellingPrice: "10.00" },
        false,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates an item without touching stock", async () => {
    const created = await catalog.create(
      tenantId,
      {
        sku: `NEW-${SUFFIX}`,
        name: "Air filter",
        itemType: "PART",
        sellingPrice: "95.50",
        compatibleCategories: ["CARS", "MOTORCYCLES"],
      },
      false,
    );

    expect(created.onHand).toBe(0);
    expect(created.compatibleCategories).toEqual(["CARS", "MOTORCYCLES"]);

    // The point: no movement was written, because nothing moved.
    const movements = await prisma.stockMovement.count({ where: { inventoryItemId: created.id } });
    expect(movements).toBe(0);
  });

  it("keeps a part usable on two categories as one entry", async () => {
    const page = await catalog.list(tenantId, { query: "Air filter" }, false);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.compatibleCategories).toEqual(["CARS", "MOTORCYCLES"]);
  });

  it("pages server-side and reports the full total", async () => {
    const page = await catalog.list(tenantId, { page: 1, pageSize: 1 }, false);

    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThan(1);
  });

  it("allows an update that keeps the item's own SKU", async () => {
    // The clash check must not fire against the row being edited.
    const updated = await catalog.update(
      tenantId,
      splitItemId,
      { sku: `SPLIT-${SUFFIX}`, name: "Brake pad (front)", itemType: "PART", sellingPrice: "310.00" },
      true,
    );

    expect(updated.name).toBe("Brake pad (front)");
    expect(updated.sellingPrice).toBe("310.00");
  });
});

describe("Reports & Stock Insights", () => {
  it("returns null for the warehouse comparison when scope is one warehouse", async () => {
    const report = await reports.build(tenantId, [mainId]);

    // Not an empty array: a chart with one bar is not a comparison, and
    // the shape of the answer is what tells the page not to draw one.
    expect(report.warehouseComparison).toBeNull();
  });

  it("returns a comparison when there is more than one warehouse", async () => {
    const report = await reports.build(tenantId, []);

    expect(report.warehouseComparison).not.toBeNull();
    expect(report.warehouseComparison?.map((row) => row.code).sort()).toEqual(["AX", "MS"]);
  });

  it("measures stock risk against the same warehouse the consumption happened in", async () => {
    const report = await reports.build(tenantId, []);
    const risk = report.stockRisk.find((row) => row.itemId === splitItemId);

    // 3 units issued from Main in the window, 3 left there. Annexe's 40
    // must not rescue it -- that stock is in another room.
    expect(risk?.warehouseCode).toBe("MS");
    expect(risk?.available).toBe(3);
    expect(risk?.daysLeft).not.toBeNull();
  });

  it("does not report risk for a warehouse where nothing has moved", async () => {
    const report = await reports.build(tenantId, []);

    // Annexe has 40 and no consumption. Infinite runway is not risk.
    expect(report.stockRisk.some((row) => row.warehouseCode === "AX")).toBe(false);
  });

  it("counts usage by both units and movements", async () => {
    const report = await reports.build(tenantId, []);
    const usage = report.usage.find((row) => row.itemId === splitItemId);

    expect(usage?.issued).toBe(3);
    expect(usage?.movements).toBe(1);
  });

  it("splits returns into what went back on the shelf and what was written off", async () => {
    await stock.record({
      tenantId,
      inventoryItemId: splitItemId,
      warehouseId: mainId,
      type: "RETURN_TO_STOCK",
      quantity: 2,
      actorId: ACTOR,
    });

    const report = await reports.build(tenantId, []);

    expect(report.returns.backToStock).toBe(2);
    expect(report.returns.damaged).toBe(0);
    expect(report.returns.total).toBe(2);
  });

  it("scopes every section to the warehouses this manager covers", async () => {
    const scoped = await reports.build(tenantId, [annexeId]);

    // All the movement happened in Main.
    expect(scoped.usage).toEqual([]);
    expect(scoped.returns.total).toBe(0);
  });
});
