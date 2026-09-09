import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, type StockMovementType } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";

/**
 * Which bucket a movement type moves, and in which direction.
 *
 * Declared as data rather than as a switch, because the invariant tests
 * iterate it: a movement type added later without an entry here fails a
 * test instead of silently moving nothing.
 *
 * `bucket` is the movement's PRIMARY bucket -- the one `replay()` sums and the
 * one an insufficient-stock refusal is measured against. `alsoMoves` exists for
 * the one shape that is genuinely two-sided: a reservation does not create or
 * destroy stock, it moves the same units between two buckets, and both halves
 * have to happen or neither may. Keeping it declarative rather than special-
 * casing reservations inside `record` means the invariant tests still iterate
 * every type, and a future two-sided movement declares itself the same way.
 */
interface BucketEffect {
  readonly bucket: StockBucket;
  readonly direction: 1 | -1;
  readonly alsoMoves?: { readonly bucket: StockBucket; readonly direction: 1 | -1 };
}
const EFFECTS: Record<StockMovementType, BucketEffect> = {
  // Leaves sellable stock for a job.
  ISSUE: { bucket: "availableQty", direction: -1 },
  // Comes back and is sellable again.
  RETURN_TO_STOCK: { bucket: "availableQty", direction: 1 },
  // Comes back broken. Its own bucket, and never sellable -- SCENARIOS 3.3.
  DAMAGED: { bucket: "damagedQty", direction: 1 },
  TRANSFER_IN: { bucket: "availableQty", direction: 1 },
  TRANSFER_OUT: { bucket: "availableQty", direction: -1 },
  SUPPLIER_RECEIPT: { bucket: "availableQty", direction: 1 },
  // A correction. Signed: the caller supplies the direction in `quantity`.
  ADJUSTMENT: { bucket: "availableQty", direction: 1 },
  // Sent back but not yet accepted or rejected -- neither sellable nor
  // still with the technician. Always reversed later by a RETURN_TO_STOCK
  // or DAMAGED movement of the same quantity; never left standing alone.
  RETURN_PENDING: { bucket: "returnPendingQty", direction: 1 },
  // Promised to an approved repair, still physically here. Off the sellable
  // shelf and into the reserved bucket, in one movement, so the two halves can
  // never disagree. Measured against availableQty, so reserving more than is on
  // the shelf is refused exactly like issuing more would be.
  RESERVE: { bucket: "availableQty", direction: -1, alsoMoves: { bucket: "reservedQty", direction: 1 } },
  // The promise withdrawn. Measured against reservedQty, because releasing more
  // than was ever reserved is the mistake worth refusing here.
  RELEASE_RESERVATION: {
    bucket: "reservedQty",
    direction: -1,
    alsoMoves: { bucket: "availableQty", direction: 1 },
  },
  // The promise kept: the part left with the car. One-sided, exactly like
  // ISSUE -- a part leaving on a job is its bucket going down and nothing
  // going up. Giving reservations a different accounting from every other way
  // a part leaves would be a second model of the same fact.
  CONSUME_RESERVATION: { bucket: "reservedQty", direction: -1 },
};

export type StockBucket = "availableQty" | "reservedQty" | "issuedQty" | "returnPendingQty" | "damagedQty";

/** The three movements that make up a reservation's whole life. */
const RESERVATION_TYPES: ReadonlySet<StockMovementType> = new Set([
  "RESERVE",
  "RELEASE_RESERVATION",
  "CONSUME_RESERVATION",
]);

export interface MovementInput {
  readonly tenantId: string;
  readonly inventoryItemId: string;
  readonly warehouseId: string;
  readonly type: StockMovementType;
  /** Always positive except for ADJUSTMENT, which may be negative. */
  readonly quantity: number;
  readonly actorId: string;
  /** What caused this -- "PartRequest", "InventoryTransfer", ... */
  readonly referenceType?: string;
  readonly referenceId?: string;
}

export interface StockBalance {
  readonly availableQty: number;
  readonly reservedQty: number;
  readonly issuedQty: number;
  readonly returnPendingQty: number;
  readonly damagedQty: number;
}

const ZERO: StockBalance = {
  availableQty: 0,
  reservedQty: 0,
  issuedQty: 0,
  returnPendingQty: 0,
  damagedQty: 0,
};

/**
 * The only thing allowed to change a stock balance.
 *
 * The rule this phase is judged by (PHASE_7.md section 1):
 *
 *   Every number on every screen can be traced to the movements that
 *   produced it.
 *
 * That is only true if a balance can NEVER move without a movement row
 * beside it, which is why both writes happen in one transaction here and
 * why nothing else in the codebase is permitted to update
 * WarehouseStockBalance. A service that adjusts a balance directly is the
 * inventory equivalent of writing WorkOrder.status by hand.
 *
 * `beforeQty` and `afterQty` are stored rather than derived, so the
 * ledger can be replayed and compared against the live balance without
 * trusting the balance to check itself.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records one movement and moves the balance with it, atomically.
   *
   * Refuses rather than clamping when the result would be negative.
   * Clamping would make the number look plausible while silently
   * disagreeing with the room, which is the single failure this whole
   * system is built to avoid.
   */
  async record(input: MovementInput, tx?: Prisma.TransactionClient): Promise<StockBalance> {
    if (!Number.isInteger(input.quantity)) {
      throw new BadRequestException({ code: "quantity_not_integer", message: "Quantity must be a whole number." });
    }
    if (input.quantity === 0) {
      throw new BadRequestException({ code: "quantity_zero", message: "A movement of zero changes nothing." });
    }
    // ADJUSTMENT is signed because it IS a correction. RETURN_PENDING is
    // signed for a different reason: it is the one bucket meant to be
    // opened and then reversed (a return requested, then accepted or
    // rejected), never a standing, one-directional fact the way ISSUE or
    // RETURN_TO_STOCK are -- a negative RETURN_PENDING is "this pending
    // return has now been resolved", not a mistake being corrected.
    if (input.quantity < 0 && input.type !== "ADJUSTMENT" && input.type !== "RETURN_PENDING") {
      throw new BadRequestException({
        code: "quantity_negative",
        message: "Only an adjustment or a resolved pending return may be negative.",
      });
    }

    const run = async (client: Prisma.TransactionClient) => {
      const effect = EFFECTS[input.type];
      const delta = input.quantity * effect.direction;

      // Ensure the row exists. Not itself a race risk: two concurrent
      // inserts of the same brand-new zero balance converge on the same
      // zero either way, so a plain upsert is fine for this step alone.
      await client.warehouseStockBalance.upsert({
        where: {
          inventoryItemId_warehouseId: {
            inventoryItemId: input.inventoryItemId,
            warehouseId: input.warehouseId,
          },
        },
        create: {
          tenantId: input.tenantId,
          inventoryItemId: input.inventoryItemId,
          warehouseId: input.warehouseId,
          ...ZERO,
        },
        update: {},
      });

      // Locked for the rest of this transaction with a real row lock.
      // A plain SELECT -- which is what `findUnique` issued here before
      // this fix -- takes no lock under Postgres's default READ COMMITTED
      // isolation, so two concurrent movements against the same balance
      // could both read the same "before" value and both proceed to
      // succeed: the last unit of a part requested by two technicians at
      // the same instant would be issued to both. `FOR UPDATE` is what
      // makes the comment this method used to carry ("locked for the
      // duration") actually true, rather than just asserted. See
      // docs/scenarios3/EDGE_CASE_REGISTER.md, H6/E16 -- this was flagged
      // as an unverified claim and confirmed as a real gap on inspection.
      const [locked] = await client.$queryRaw<
        { availableQty: number; reservedQty: number; issuedQty: number; returnPendingQty: number; damagedQty: number }[]
      >(Prisma.sql`
        SELECT "availableQty", "reservedQty", "issuedQty", "returnPendingQty", "damagedQty"
        FROM "warehouse_stock_balances"
        WHERE "inventoryItemId" = ${input.inventoryItemId} AND "warehouseId" = ${input.warehouseId}
        FOR UPDATE
      `);

      const before = locked[effect.bucket];
      const after = before + delta;

      if (after < 0) {
        throw new BadRequestException({
          code: "insufficient_stock",
          message: `Not enough stock: ${before} available, ${Math.abs(delta)} needed.`,
        });
      }

      // The other half of a two-sided movement, checked before either half is
      // written: a reservation that would drive reservedQty negative is refused
      // whole, never applied halfway.
      const counterpart = effect.alsoMoves
        ? {
            bucket: effect.alsoMoves.bucket,
            after: locked[effect.alsoMoves.bucket] + input.quantity * effect.alsoMoves.direction,
          }
        : null;

      if (counterpart && counterpart.after < 0) {
        throw new BadRequestException({
          code: "insufficient_stock",
          message: `Not enough stock: ${locked[counterpart.bucket]} available, ${Math.abs(delta)} needed.`,
        });
      }

      const balance = await client.warehouseStockBalance.update({
        where: {
          inventoryItemId_warehouseId: {
            inventoryItemId: input.inventoryItemId,
            warehouseId: input.warehouseId,
          },
        },
        data: {
          [effect.bucket]: after,
          ...(counterpart ? { [counterpart.bucket]: counterpart.after } : {}),
        },
      });

      await client.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          inventoryItemId: input.inventoryItemId,
          warehouseId: input.warehouseId,
          type: input.type,
          quantity: input.quantity,
          beforeQty: before,
          afterQty: after,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          actorId: input.actorId,
        },
      });

      return toBalance(balance);
    };

    // Joins the caller's transaction when there is one, so issuing a part
    // and moving its stock cannot half-happen.
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Settle every reservation still standing against one work order.
   *
   * A reservation had no end. `RESERVE` took units off the sellable shelf when
   * an operator approved a repair, and nothing anywhere consumed or released
   * them: not the technician using the part, not the job closing, not the job
   * being cancelled. So a workshop's sellable count bled downward over time
   * while the parts were still on the shelf, and `availableQty + reservedQty`
   * was the only figure that stayed true.
   *
   * What is outstanding is read from the ledger rather than from a column,
   * which is the whole reason the ledger exists: sum the RESERVE movements
   * carrying this work order's reference, subtract what has already been
   * consumed or released against it, and settle the remainder. That also makes
   * this safe to call twice -- a second call finds nothing outstanding and
   * writes nothing, so a retried transition cannot double-release stock.
   *
   * `consume` is the part leaving with the car; `release` is the promise given
   * up and the units going back on sale.
   */
  async settleReservationsFor(
    workOrderId: string,
    outcome: "consume" | "release",
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const movements = await client.stockMovement.findMany({
      where: { referenceType: "WorkOrder", referenceId: workOrderId },
      select: { tenantId: true, inventoryItemId: true, warehouseId: true, type: true, quantity: true },
    });

    const outstanding = new Map<string, { tenantId: string; inventoryItemId: string; warehouseId: string; quantity: number }>();
    for (const movement of movements) {
      if (!RESERVATION_TYPES.has(movement.type)) continue;
      const key = `${movement.inventoryItemId}:${movement.warehouseId}`;
      const entry =
        outstanding.get(key) ??
        {
          tenantId: movement.tenantId,
          inventoryItemId: movement.inventoryItemId,
          warehouseId: movement.warehouseId,
          quantity: 0,
        };
      // money-lint-ok: a count of physical objects, not a currency amount.
      entry.quantity += movement.type === "RESERVE" ? movement.quantity : -movement.quantity;
      outstanding.set(key, entry);
    }

    const type = outcome === "consume" ? "CONSUME_RESERVATION" : "RELEASE_RESERVATION";
    for (const entry of outstanding.values()) {
      if (entry.quantity <= 0) continue;
      await this.record(
        {
          tenantId: entry.tenantId,
          inventoryItemId: entry.inventoryItemId,
          warehouseId: entry.warehouseId,
          type,
          quantity: entry.quantity,
          actorId,
          referenceType: "WorkOrder",
          referenceId: workOrderId,
        },
        tx,
      );
    }
  }

  async balanceOf(inventoryItemId: string, warehouseId: string): Promise<StockBalance> {
    const row = await this.prisma.warehouseStockBalance.findUnique({
      where: { inventoryItemId_warehouseId: { inventoryItemId, warehouseId } },
    });
    return row ? toBalance(row) : ZERO;
  }

  /**
   * Transfers stock atomically between two warehouses within the same tenant.
   */
  async transferStock(input: {
    tenantId: string;
    inventoryItemId: string;
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    quantity: number;
    actorId: string;
    notes?: string;
  }): Promise<{ sourceBalance: StockBalance; destinationBalance: StockBalance }> {
    if (input.sourceWarehouseId === input.destinationWarehouseId) {
      throw new BadRequestException({
        code: "same_warehouse_transfer",
        message: "Source and destination warehouse cannot be the same.",
      });
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException({
        code: "invalid_transfer_quantity",
        message: "Transfer quantity must be a positive integer.",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouses = await tx.warehouse.findMany({
        where: {
          tenantId: input.tenantId,
          id: { in: [input.sourceWarehouseId, input.destinationWarehouseId] },
        },
        select: { id: true, name: true },
      });
      if (warehouses.length < 2) {
        throw new BadRequestException({
          code: "warehouse_not_found",
          message: "Both source and destination warehouses must exist in this workshop.",
        });
      }

      const sourceBalance = await tx.warehouseStockBalance.findUnique({
        where: {
          inventoryItemId_warehouseId: {
            inventoryItemId: input.inventoryItemId,
            warehouseId: input.sourceWarehouseId,
          },
        },
      });

      if (!sourceBalance || sourceBalance.availableQty < input.quantity) {
        throw new BadRequestException({
          code: "insufficient_transfer_stock",
          message: `Source warehouse only has ${sourceBalance?.availableQty ?? 0} available units (requested: ${input.quantity}).`,
        });
      }

      // The transfer itself, before the two movements that carry it out.
      //
      // Both movements already claimed `referenceType: "InventoryTransfer"`
      // while no such row was ever written, and each put the OTHER warehouse's
      // id in `referenceId` -- so the ledger pointed at a transfer that did
      // not exist, and the two halves of one move could not be recognised as
      // one move by anything reading it back. A reference has to resolve.
      //
      // RECEIVED rather than REQUESTED: this is an immediate move between two
      // of the workshop's own shelves, and both balances land in the same
      // transaction. REQUESTED/IN_TRANSIT describe a transfer that has been
      // asked for and not yet arrived, which this operation cannot produce.
      const transfer = await tx.inventoryTransfer.create({
        data: {
          tenantId: input.tenantId,
          inventoryItemId: input.inventoryItemId,
          sourceWarehouseId: input.sourceWarehouseId,
          destWarehouseId: input.destinationWarehouseId,
          quantity: input.quantity,
          status: "RECEIVED",
          requestedById: input.actorId,
          receivedAt: new Date(),
        },
        select: { id: true },
      });

      const srcBal = await this.record(
        {
          tenantId: input.tenantId,
          inventoryItemId: input.inventoryItemId,
          warehouseId: input.sourceWarehouseId,
          type: "TRANSFER_OUT",
          quantity: input.quantity,
          actorId: input.actorId,
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
        },
        tx,
      );

      const dstBal = await this.record(
        {
          tenantId: input.tenantId,
          inventoryItemId: input.inventoryItemId,
          warehouseId: input.destinationWarehouseId,
          type: "TRANSFER_IN",
          quantity: input.quantity,
          actorId: input.actorId,
          referenceType: "InventoryTransfer",
          referenceId: transfer.id,
        },
        tx,
      );

      return { sourceBalance: srcBal, destinationBalance: dstBal };
    });
  }

  /**
   * Recomputes a bucket purely from the ledger.
   *
   * Exists so a test -- and later a reconciliation screen -- can ask the
   * question the whole design rests on: does the stored balance still
   * match the movements that produced it? A ledger nobody replays is a
   * ledger nobody can trust.
   */
  async replay(inventoryItemId: string, warehouseId: string, bucket: StockBucket = "availableQty"): Promise<number> {
    const movements = await this.prisma.stockMovement.findMany({
      where: { inventoryItemId, warehouseId },
      orderBy: { createdAt: "asc" },
      select: { type: true, quantity: true },
    });

    return movements.reduce((total, movement) => {
      const effect = EFFECTS[movement.type];
      // money-lint-ok: a count of physical objects, not a currency amount.
      // Integer arithmetic in JS is exact below 2^53, and no workshop has
      // nine quadrillion brake pads.
      //
      // A two-sided movement counts towards whichever of its two buckets is
      // being replayed. Reading only the primary bucket would make reservedQty
      // replay as zero forever -- which is precisely the state this bucket was
      // in before RESERVE existed.
      // money-lint-ok: a count of physical objects, not a currency amount.
      if (effect.bucket === bucket) return total + movement.quantity * effect.direction;
      // money-lint-ok: same count, counted on the movement's other side.
      if (effect.alsoMoves?.bucket === bucket) return total + movement.quantity * effect.alsoMoves.direction;
      return total;
    }, 0);
  }
}

function toBalance(row: Record<string, unknown>): StockBalance {
  return {
    availableQty: row.availableQty as number,
    reservedQty: row.reservedQty as number,
    issuedQty: row.issuedQty as number,
    returnPendingQty: row.returnPendingQty as number,
    damagedQty: row.damagedQty as number,
  };
}
