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
import type { PrismaService } from "../../runtime/database/prisma.service";

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
  await prisma.inventoryTransfer.deleteMany({ where });
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

/**
 * Reservations.
 *
 * `reservedQty` was a column and a `StockBucket` from the start, but no
 * movement type moved it, so the only thing writing it was a hand-rolled
 * `warehouseStockBalance.update` in `OperatorService`. That made it the one
 * bucket in inventory with no ledger behind it -- `replay()` returned 0 for it
 * no matter what the stored balance said, and THE RULE above could not have
 * been asked about it.
 */
describe("reservations move two buckets and stay replayable", () => {
  let reserveItemId: string;

  beforeAll(async () => {
    reserveItemId = (
      await prisma.inventoryItem.create({
        data: { tenantId, sku: `RSV-${SUFFIX}`, name: "Brake pad set", itemType: "PART", sellingPrice: "450.00" },
      })
    ).id;
    await stock.record({
      tenantId,
      inventoryItemId: reserveItemId,
      warehouseId,
      type: "SUPPLIER_RECEIPT",
      quantity: 10,
      actorId: ACTOR,
    });
  });

  it("takes reserved stock off the sellable shelf without destroying it", async () => {
    const after = await stock.record({
      tenantId,
      inventoryItemId: reserveItemId,
      warehouseId,
      type: "RESERVE",
      quantity: 4,
      actorId: ACTOR,
      referenceType: "WorkOrder",
      referenceId: "wo-reserve-1",
    });

    expect(after.availableQty).toBe(6);
    expect(after.reservedQty).toBe(4);
    // Nothing has left the building: the two buckets still hold every unit.
    expect(after.availableQty + after.reservedQty).toBe(10);
  });

  it("writes one movement carrying what caused it", async () => {
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { tenantId, inventoryItemId: reserveItemId, type: "RESERVE" },
      orderBy: { createdAt: "desc" },
    });

    expect(movement.quantity).toBe(4);
    expect(movement.beforeQty).toBe(10);
    expect(movement.afterQty).toBe(6);
    expect(movement.referenceType).toBe("WorkOrder");
    expect(movement.referenceId).toBe("wo-reserve-1");
  });

  it("refuses to reserve more than is on the shelf", async () => {
    await expect(
      stock.record({
        tenantId,
        inventoryItemId: reserveItemId,
        warehouseId,
        type: "RESERVE",
        quantity: 99,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/Not enough stock/);

    const unchanged = await stock.balanceOf(reserveItemId, warehouseId);
    expect(unchanged.availableQty).toBe(6);
    expect(unchanged.reservedQty).toBe(4);
  });

  it("refuses to release more than was ever reserved, rather than inventing stock", async () => {
    await expect(
      stock.record({
        tenantId,
        inventoryItemId: reserveItemId,
        warehouseId,
        type: "RELEASE_RESERVATION",
        quantity: 9,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/Not enough stock/);

    const unchanged = await stock.balanceOf(reserveItemId, warehouseId);
    expect(unchanged.availableQty).toBe(6);
  });

  it("puts a released reservation back on the sellable shelf", async () => {
    const after = await stock.record({
      tenantId,
      inventoryItemId: reserveItemId,
      warehouseId,
      type: "RELEASE_RESERVATION",
      quantity: 1,
      actorId: ACTOR,
    });

    expect(after.reservedQty).toBe(3);
    expect(after.availableQty).toBe(7);
  });

  it("THE RULE holds for reservedQty too, which it never could before", async () => {
    const stored = await stock.balanceOf(reserveItemId, warehouseId);

    expect(await stock.replay(reserveItemId, warehouseId, "reservedQty")).toBe(stored.reservedQty);
    // And the two-sided movements are counted on the other side as well, so
    // adding RESERVE did not quietly break the bucket that already worked.
    expect(await stock.replay(reserveItemId, warehouseId, "availableQty")).toBe(stored.availableQty);
  });

  /**
   * A reservation's end.
   *
   * `RESERVE` existed and nothing ever undid it: the units left the sellable
   * shelf when an operator approved a repair and stayed in `reservedQty`
   * forever, whatever became of the job. A workshop's sellable count bled
   * downward while the parts were still physically on the shelf, and
   * `availableQty + reservedQty` was the only figure that stayed true.
   *
   * `settleReservationsFor` reads what is still outstanding from the ledger
   * rather than from a column, which is both what a ledger is for and what
   * makes it safe to call twice.
   */
  describe("settling what a work order reserved", () => {
    let settleItemId: string;

    beforeEach(async () => {
      settleItemId = (
        await prisma.inventoryItem.create({
          data: {
            tenantId,
            sku: `SETTLE-${SUFFIX}-${Math.random().toString(36).slice(2, 8)}`,
            name: "Settling part",
            itemType: "PART",
            sellingPrice: "60.00",
          },
        })
      ).id;
      await stock.record({
        tenantId,
        inventoryItemId: settleItemId,
        warehouseId,
        type: "SUPPLIER_RECEIPT",
        quantity: 10,
        actorId: ACTOR,
      });
      await stock.record({
        tenantId,
        inventoryItemId: settleItemId,
        warehouseId,
        type: "RESERVE",
        quantity: 3,
        actorId: ACTOR,
        referenceType: "WorkOrder",
        referenceId: "wo-settle",
      });
    });

    it("consumes the reservation when the job is closed -- the part left with the car", async () => {
      await stock.settleReservationsFor("wo-settle", "consume", ACTOR);

      const after = await stock.balanceOf(settleItemId, warehouseId);
      expect(after.reservedQty).toBe(0);
      // Not back on the shelf: those three are gone with the customer.
      expect(after.availableQty).toBe(7);
    });

    it("releases the reservation when the job is cancelled -- the parts go back on sale", async () => {
      await stock.settleReservationsFor("wo-settle", "release", ACTOR);

      const after = await stock.balanceOf(settleItemId, warehouseId);
      expect(after.reservedQty).toBe(0);
      expect(after.availableQty).toBe(10);
    });

    it("settling twice does nothing the second time", async () => {
      // A transition can be retried. Reading what is outstanding from the
      // ledger rather than from a flag is what makes that safe -- a second
      // call finds nothing and writes nothing, instead of releasing stock the
      // workshop no longer has.
      await stock.settleReservationsFor("wo-settle", "release", ACTOR);
      await stock.settleReservationsFor("wo-settle", "release", ACTOR);

      const after = await stock.balanceOf(settleItemId, warehouseId);
      expect(after.availableQty).toBe(10);
      expect(after.reservedQty).toBe(0);

      const releases = await prisma.stockMovement.count({
        where: { inventoryItemId: settleItemId, type: "RELEASE_RESERVATION" },
      });
      expect(releases).toBe(1);
    });

    it("leaves another work order's reservation alone", async () => {
      await stock.record({
        tenantId,
        inventoryItemId: settleItemId,
        warehouseId,
        type: "RESERVE",
        quantity: 2,
        actorId: ACTOR,
        referenceType: "WorkOrder",
        referenceId: "wo-other",
      });

      await stock.settleReservationsFor("wo-settle", "release", ACTOR);

      const after = await stock.balanceOf(settleItemId, warehouseId);
      // The other job's two are still spoken for.
      expect(after.reservedQty).toBe(2);
      expect(after.availableQty).toBe(8);
    });

    it("THE RULE still holds once a reservation has been settled", async () => {
      await stock.settleReservationsFor("wo-settle", "consume", ACTOR);

      const stored = await stock.balanceOf(settleItemId, warehouseId);
      expect(await stock.replay(settleItemId, warehouseId, "reservedQty")).toBe(stored.reservedQty);
      expect(await stock.replay(settleItemId, warehouseId, "availableQty")).toBe(stored.availableQty);
    });
  });

  it("lets exactly one of two simultaneous reservations of the last unit succeed", async () => {
    const lastItemId = (
      await prisma.inventoryItem.create({
        data: { tenantId, sku: `RACE-RSV-${SUFFIX}`, name: "Last coil", itemType: "PART", sellingPrice: "90.00" },
      })
    ).id;
    await stock.record({
      tenantId,
      inventoryItemId: lastItemId,
      warehouseId,
      type: "SUPPLIER_RECEIPT",
      quantity: 1,
      actorId: ACTOR,
    });

    // The write this replaced took no lock on either side, so two operators
    // approving the same part at the same instant both reserved the last unit.
    const attempt = () =>
      stock.record({
        tenantId,
        inventoryItemId: lastItemId,
        warehouseId,
        type: "RESERVE",
        quantity: 1,
        actorId: ACTOR,
      });

    const outcomes = await Promise.allSettled([attempt(), attempt()]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);

    const final = await stock.balanceOf(lastItemId, warehouseId);
    expect(final.availableQty).toBe(0);
    expect(final.reservedQty).toBe(1);
  }, 30_000);
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

/**
 * REC-029: a transfer moved stock and recorded no transfer. Both movements
 * claimed `referenceType: "InventoryTransfer"` while nothing ever wrote one,
 * and each carried the other warehouse's id as the reference -- so the ledger
 * cited a row that did not exist, and nothing reading it back could tell that
 * the two halves were one move.
 */
describe("a transfer is a recorded transfer, not two loose movements", () => {
  it("writes the transfer, and both movements point at it", async () => {
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}-xfer`, name: "Transferred Pad", itemType: "PART", sellingPrice: 10 },
    });
    await stock.record({
      tenantId,
      inventoryItemId: item.id,
      warehouseId,
      type: "SUPPLIER_RECEIPT",
      quantity: 8,
      actorId: ACTOR,
    });

    await stock.transferStock({
      tenantId,
      inventoryItemId: item.id,
      sourceWarehouseId: warehouseId,
      destinationWarehouseId: otherWarehouseId,
      quantity: 3,
      actorId: ACTOR,
    });

    const transfers = await prisma.inventoryTransfer.findMany({ where: { tenantId, inventoryItemId: item.id } });
    expect(transfers).toHaveLength(1);
    expect(transfers[0].sourceWarehouseId).toBe(warehouseId);
    expect(transfers[0].destWarehouseId).toBe(otherWarehouseId);
    expect(transfers[0].quantity).toBe(3);
    expect(transfers[0].status).toBe("RECEIVED");

    const movements = await prisma.stockMovement.findMany({
      where: { tenantId, inventoryItemId: item.id, type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } },
      select: { type: true, referenceType: true, referenceId: true },
    });
    expect(movements).toHaveLength(2);
    for (const movement of movements) {
      expect(movement.referenceType).toBe("InventoryTransfer");
      // The reference resolves to a real row, which is the whole point.
      expect(movement.referenceId).toBe(transfers[0].id);
    }
  });

  it("records nothing at all when the transfer is refused", async () => {
    // The transfer row must not outlive a move that never happened -- it is
    // written inside the same transaction as the movements for that reason.
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}-xfer-short`, name: "Short Pad", itemType: "PART", sellingPrice: 10 },
    });
    await stock.record({
      tenantId,
      inventoryItemId: item.id,
      warehouseId,
      type: "SUPPLIER_RECEIPT",
      quantity: 1,
      actorId: ACTOR,
    });

    await expect(
      stock.transferStock({
        tenantId,
        inventoryItemId: item.id,
        sourceWarehouseId: warehouseId,
        destinationWarehouseId: otherWarehouseId,
        quantity: 5,
        actorId: ACTOR,
      }),
    ).rejects.toMatchObject({ response: { code: "insufficient_transfer_stock" } });

    expect(await prisma.inventoryTransfer.count({ where: { tenantId, inventoryItemId: item.id } })).toBe(0);
  });
});
