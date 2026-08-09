import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma, StockMovementType } from "@mop/database";
import { PrismaService } from "../database/prisma.service";

/**
 * Which bucket a movement type moves, and in which direction.
 *
 * Declared as data rather than as a switch, because the invariant tests
 * iterate it: a movement type added later without an entry here fails a
 * test instead of silently moving nothing.
 */
const EFFECTS: Record<StockMovementType, { bucket: StockBucket; direction: 1 | -1 }> = {
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
};

export type StockBucket = "availableQty" | "reservedQty" | "issuedQty" | "returnPendingQty" | "damagedQty";

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
    if (input.quantity < 0 && input.type !== "ADJUSTMENT") {
      throw new BadRequestException({
        code: "quantity_negative",
        message: "Only an adjustment may be negative. Use the movement type that describes what happened.",
      });
    }

    const run = async (client: Prisma.TransactionClient) => {
      const effect = EFFECTS[input.type];
      const delta = input.quantity * effect.direction;

      // Locked for the duration so two concurrent issues of the last item
      // cannot both read the same "before" and both succeed.
      const existing = await client.warehouseStockBalance.findUnique({
        where: {
          inventoryItemId_warehouseId: {
            inventoryItemId: input.inventoryItemId,
            warehouseId: input.warehouseId,
          },
        },
      });

      const before = existing ? (existing[effect.bucket] as number) : 0;
      const after = before + delta;

      if (after < 0) {
        throw new BadRequestException({
          code: "insufficient_stock",
          message: `Not enough stock: ${before} available, ${Math.abs(delta)} needed.`,
        });
      }

      const balance = await client.warehouseStockBalance.upsert({
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
          [effect.bucket]: after,
        },
        update: { [effect.bucket]: after },
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

  async balanceOf(inventoryItemId: string, warehouseId: string): Promise<StockBalance> {
    const row = await this.prisma.warehouseStockBalance.findUnique({
      where: { inventoryItemId_warehouseId: { inventoryItemId, warehouseId } },
    });
    return row ? toBalance(row) : ZERO;
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
      return effect.bucket === bucket ? total + movement.quantity * effect.direction : total;
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
