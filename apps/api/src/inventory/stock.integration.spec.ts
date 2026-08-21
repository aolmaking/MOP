/**
 * The stock ledger, against a real database.
 *
 * Integration because every guarantee here is a database guarantee: the
 * balance and its movement are written in one transaction, the buckets
 * cannot go negative even if service code is bypassed, and the ledger can
 * be replayed and compared. None of that is provable against a mock.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { StockService } from "./stock.service";
import type { PrismaService } from "../runtime/database/prisma.service";

const prisma = new PrismaClient();
const stock = new StockService(prisma as unknown as PrismaService);

const SUFFIX = `stock-${Date.now()}`;
const ACTOR = "store-1";

let tenantId: string;
let planId: string;
let warehouseId: string;
let otherWarehouseId: string;
let itemId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Stock",
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
      name: `Stock WS ${SUFFIX}`,
      nameNormalized: `stock ws ${SUFFIX}`,
      slug: `stock-ws-${SUFFIX}`,
      customerRegistrationCode: `SK-${SUFFIX}`,
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

  warehouseId = (await prisma.warehouse.create({ data: { tenantId, name: "Main store", code: "MS" } })).id;
  otherWarehouseId = (await prisma.warehouse.create({ data: { tenantId, name: "Annexe", code: "AX" } })).id;
  itemId = (
    await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Oil filter", itemType: "PART", sellingPrice: "120.00" },
    })
  ).id;
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

const move = (type: Parameters<typeof stock.record>[0]["type"], quantity: number, warehouse = warehouseId) =>
  stock.record({ tenantId, inventoryItemId: itemId, warehouseId: warehouse, type, quantity, actorId: ACTOR });

describe("stock movements", () => {
  it("creates the balance on the first movement", async () => {
    const balance = await move("SUPPLIER_RECEIPT", 10);

    expect(balance.availableQty).toBe(10);
  });

  it("writes a movement beside every balance change", async () => {
    await move("ISSUE", 3);

    const movements = await prisma.stockMovement.findMany({
      where: { inventoryItemId: itemId, warehouseId },
      orderBy: { createdAt: "asc" },
    });

    expect(movements).toHaveLength(2);
    // before/after are stored rather than derived, so the ledger can be
    // replayed without trusting the balance to check itself.
    expect(movements[1]).toMatchObject({ type: "ISSUE", quantity: 3, beforeQty: 10, afterQty: 7 });
  });

  it("refuses to go negative rather than clamping to zero", async () => {
    // Clamping would make the number look plausible while silently
    // disagreeing with the room -- the exact failure this system exists
    // to prevent.
    await expect(move("ISSUE", 99)).rejects.toMatchObject({ status: 400 });

    // And nothing was written: no half-applied movement left behind.
    expect((await stock.balanceOf(itemId, warehouseId)).availableQty).toBe(7);
    const count = await prisma.stockMovement.count({ where: { inventoryItemId: itemId, warehouseId } });
    expect(count).toBe(2);
  });

  it("puts damaged returns in their own bucket, never back into sellable stock", async () => {
    // SCENARIOS.md 3.3.
    const balance = await move("DAMAGED", 2);

    expect(balance.damagedQty).toBe(2);
    expect(balance.availableQty).toBe(7);
  });

  it("returns good stock to sellable", async () => {
    const balance = await move("RETURN_TO_STOCK", 1);

    expect(balance.availableQty).toBe(8);
  });

  it("keeps warehouses independent", async () => {
    // A workshop with two stores must never see one store's shortage
    // covered by the other's surplus.
    await move("SUPPLIER_RECEIPT", 5, otherWarehouseId);

    expect((await stock.balanceOf(itemId, warehouseId)).availableQty).toBe(8);
    expect((await stock.balanceOf(itemId, otherWarehouseId)).availableQty).toBe(5);
  });

  it("allows a negative ADJUSTMENT, because corrections are the point", async () => {
    // SCENARIOS.md 3.4 -- a wrong issue is corrected by an explicit,
    // audited movement, never by editing the balance.
    const balance = await stock.record({
      tenantId,
      inventoryItemId: itemId,
      warehouseId,
      type: "ADJUSTMENT",
      quantity: -1,
      actorId: ACTOR,
      referenceType: "StockCount",
      referenceId: "count-1",
    });

    expect(balance.availableQty).toBe(7);
  });

  it("refuses a negative quantity on any type except ADJUSTMENT", async () => {
    await expect(move("ISSUE", -1)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a movement of zero", async () => {
    await expect(move("ISSUE", 0)).rejects.toMatchObject({ status: 400 });
  });

  it("THE RULE: the stored balance still equals its replayed ledger", async () => {
    // PHASE_7.md section 1 -- every number traceable to the movements
    // that produced it. If this ever fails, some code changed a balance
    // without recording why.
    const stored = await stock.balanceOf(itemId, warehouseId);
    const replayed = await stock.replay(itemId, warehouseId, "availableQty");

    expect(replayed).toBe(stored.availableQty);

    const storedDamaged = stored.damagedQty;
    const replayedDamaged = await stock.replay(itemId, warehouseId, "damagedQty");
    expect(replayedDamaged).toBe(storedDamaged);
  });
});

describe("the database enforces it too, not only the service", () => {
  it("rejects a negative balance written directly, bypassing StockService", async () => {
    // Service code is a promise; a constraint is a fact. A seed script or
    // a future service that has not read PHASE_7.md must still be unable
    // to write a negative quantity of a physical object.
    await expect(
      prisma.warehouseStockBalance.update({
        where: { inventoryItemId_warehouseId: { inventoryItemId: itemId, warehouseId } },
        data: { availableQty: -5 },
      }),
    ).rejects.toThrow();
  });

  it("rejects a zero-quantity movement written directly", async () => {
    await expect(
      prisma.stockMovement.create({
        data: {
          tenantId,
          inventoryItemId: itemId,
          warehouseId,
          type: "ISSUE",
          quantity: 0,
          beforeQty: 7,
          afterQty: 7,
          actorId: ACTOR,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a negative ISSUE written directly, while allowing a negative ADJUSTMENT", async () => {
    await expect(
      prisma.stockMovement.create({
        data: {
          tenantId,
          inventoryItemId: itemId,
          warehouseId,
          type: "ISSUE",
          quantity: -2,
          beforeQty: 7,
          afterQty: 9,
          actorId: ACTOR,
        },
      }),
    ).rejects.toThrow();

    const allowed = await prisma.stockMovement.create({
      data: {
        tenantId,
        inventoryItemId: itemId,
        warehouseId,
        type: "ADJUSTMENT",
        quantity: -1,
        beforeQty: 7,
        afterQty: 6,
        actorId: ACTOR,
      },
    });
    expect(allowed.quantity).toBe(-1);
    await prisma.stockMovement.delete({ where: { id: allowed.id } });
  });
});

/**
 * Concurrency. Edge case H6/E16 (docs/scenarios3/EDGE_CASE_REGISTER.md):
 * the "locked for the duration" comment on StockService.record() used to
 * describe a plain `findUnique`, which under Postgres's default READ
 * COMMITTED isolation takes no row lock at all. Two technicians issuing
 * the last unit of a part at the same instant could both read the same
 * "before" value and both succeed -- over-issuing stock that was only
 * ever there once, with the never-negative CHECK constraint powerless to
 * catch it because neither individual transaction ever asked for a
 * negative result.
 *
 * This suite fires genuinely concurrent requests -- not sequential
 * awaits -- against a balance of exactly one unit, and proves only one
 * of them can win.
 */
describe("concurrent issues of the last unit", () => {
  let raceItemId: string;
  let raceWarehouseId: string;

  beforeAll(async () => {
    raceWarehouseId = (await prisma.warehouse.create({ data: { tenantId, name: "Race store", code: `RC-${SUFFIX}` } }))
      .id;
    raceItemId = (
      await prisma.inventoryItem.create({
        data: { tenantId, sku: `RACE-${SUFFIX}`, name: "Contested filter", itemType: "PART", sellingPrice: "50.00" },
      })
    ).id;
    await stock.record({
      tenantId,
      inventoryItemId: raceItemId,
      warehouseId: raceWarehouseId,
      type: "SUPPLIER_RECEIPT",
      quantity: 1,
      actorId: ACTOR,
    });
  }, 60_000);

  it("lets exactly one of two simultaneous issues of the last unit succeed", async () => {
    const attempt = () =>
      stock.record({
        tenantId,
        inventoryItemId: raceItemId,
        warehouseId: raceWarehouseId,
        type: "ISSUE",
        quantity: 1,
        actorId: ACTOR,
      });

    // Fired together, not sequentially -- Promise.allSettled so the loser
    // rejecting does not fail the other before both have had a chance to
    // race. Without a real row lock, both could read availableQty: 1 and
    // both compute 0, issuing one unit twice.
    const [first, second] = await Promise.allSettled([attempt(), attempt()]);
    const outcomes = [first, second];

    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);

    const final = await stock.balanceOf(raceItemId, raceWarehouseId);
    expect(final.availableQty).toBe(0);

    const movements = await prisma.stockMovement.count({
      where: { tenantId, inventoryItemId: raceItemId, type: "ISSUE" },
    });
    expect(movements).toBe(1);
  }, 30_000);
});
