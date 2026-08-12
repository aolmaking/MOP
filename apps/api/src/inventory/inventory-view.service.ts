import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { PartRequestService } from "./part-request.service";

export interface WaitingRequest {
  readonly id: string;
  readonly status: string;
  readonly itemName: string;
  readonly sku: string;
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly requested: number;
  readonly issued: number;
  readonly outstanding: number;
  readonly urgency: string;
  readonly waitingHours: number;
  /** Total sellable across every warehouse this workshop has. */
  readonly onHand: number;
  /**
   * Where it can actually be taken from, and how many are there.
   *
   * Carried on the row rather than resolved server-side at issue time,
   * because "which shelf" is a physical fact the storekeeper is standing
   * in front of. A system that silently picked a warehouse would produce
   * paperwork saying the part left a room nobody walked into.
   */
  readonly sources: readonly { warehouseId: string; code: string; available: number }[];
}

export interface StockRow {
  readonly itemId: string;
  readonly sku: string;
  readonly name: string;
  readonly lowStockThreshold: number;
  readonly criticalStockThreshold: number;
  /** Per warehouse, in the same order as the `warehouses` list. */
  readonly byWarehouse: readonly { warehouseId: string; available: number; damaged: number }[];
  readonly totalAvailable: number;
}

export interface StockTable {
  readonly warehouses: readonly { id: string; name: string; code: string }[];
  readonly rows: readonly StockRow[];
}

/**
 * Everything the inventory manager reads.
 *
 * Read-only by construction. Writes go through StockService and
 * PartRequestService, which own the balance and the request status
 * respectively -- nothing here may become a second way to change either.
 */
@Injectable()
export class InventoryViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parts: PartRequestService,
  ) {}

  /**
   * "Who is waiting on me?"
   *
   * Oldest first, because a technician standing at a car with an
   * unapproved request is idle and the cost is immediate. Includes
   * partly-issued requests: outstanding > 0 means somebody is still
   * waiting, whatever the status says.
   */
  async waiting(tenantId: string): Promise<readonly WaitingRequest[]> {
    const rows = await this.prisma.partRequest.findMany({
      where: {
        tenantId,
        status: { in: ["REQUESTED", "WAREHOUSE_REVIEWING", "APPROVED", "WAITING_TRANSFER", "WAITING_SUPPLIER"] },
      },
      select: {
        id: true,
        status: true,
        quantity: true,
        urgency: true,
        createdAt: true,
        workOrderId: true,
        inventoryItem: { select: { id: true, sku: true, name: true } },
        workOrder: { select: { asset: { select: { plateNumber: true, serialNumber: true } } } },
        issuedItems: { select: { quantity: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const itemIds = [...new Set(rows.map((row) => row.inventoryItem.id))];
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId, inventoryItemId: { in: itemIds }, availableQty: { gt: 0 } },
      select: {
        inventoryItemId: true,
        warehouseId: true,
        availableQty: true,
        warehouse: { select: { code: true } },
      },
      orderBy: { availableQty: "desc" },
    });

    const sourcesByItem = new Map<string, { warehouseId: string; code: string; available: number }[]>();
    const onHand = new Map<string, number>();
    for (const balance of balances) {
      const list = sourcesByItem.get(balance.inventoryItemId) ?? [];
      list.push({
        warehouseId: balance.warehouseId,
        code: balance.warehouse.code,
        available: balance.availableQty,
      });
      sourcesByItem.set(balance.inventoryItemId, list);
      onHand.set(balance.inventoryItemId, (onHand.get(balance.inventoryItemId) ?? 0) + balance.availableQty);
    }

    const now = Date.now();

    return rows
      .map((row) => {
        const issued = row.issuedItems.reduce((sum, issue) => sum + issue.quantity, 0);
        return {
          id: row.id,
          status: row.status,
          itemName: row.inventoryItem.name,
          sku: row.inventoryItem.sku,
          workOrderId: row.workOrderId,
          identifier: row.workOrder.asset.plateNumber ?? row.workOrder.asset.serialNumber,
          requested: row.quantity,
          issued,
          outstanding: row.quantity - issued,
          urgency: row.urgency,
          waitingHours: (now - row.createdAt.getTime()) / 3_600_000,
          onHand: onHand.get(row.inventoryItem.id) ?? 0,
          sources: sourcesByItem.get(row.inventoryItem.id) ?? [],
        };
      })
      // A fully-issued request in a non-terminal status is nobody's queue.
      .filter((row) => row.outstanding > 0);
  }

  /**
   * "What do we have, and where?"
   *
   * Shaped as a real table -- items down, warehouses across -- because
   * for stock the cells genuinely are comparable in both directions,
   * which is exactly the claim a table makes (PHASE_7.md section 3).
   */
  async stockTable(tenantId: string, query?: string): Promise<StockTable> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    });

    const trimmed = query?.trim();
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        tenantId,
        ...(trimmed
          ? {
              OR: [
                { name: { contains: trimmed, mode: "insensitive" as const } },
                { sku: { contains: trimmed, mode: "insensitive" as const } },
                { barcode: { contains: trimmed, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        lowStockThreshold: true,
        criticalStockThreshold: true,
        stockBalances: { select: { warehouseId: true, availableQty: true, damagedQty: true } },
      },
      orderBy: { name: "asc" },
      take: 500,
    });

    const rows: StockRow[] = items.map((item) => {
      const byId = new Map(item.stockBalances.map((balance) => [balance.warehouseId, balance]));
      // A warehouse with no balance row holds zero -- shown as zero rather
      // than as a gap, because a blank cell reads as "unknown" and this
      // number is never unknown.
      const byWarehouse = warehouses.map((warehouse) => ({
        warehouseId: warehouse.id,
        available: byId.get(warehouse.id)?.availableQty ?? 0,
        damaged: byId.get(warehouse.id)?.damagedQty ?? 0,
      }));

      return {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        lowStockThreshold: item.lowStockThreshold,
        criticalStockThreshold: item.criticalStockThreshold,
        byWarehouse,
        totalAvailable: byWarehouse.reduce((sum, cell) => sum + cell.available, 0),
      };
    });

    return { warehouses, rows };
  }

  /**
   * "Why is this number what it is?"
   *
   * The ledger IS the page; the balance is just its last line. Movements
   * newest first, because the question is almost always about a recent
   * change.
   */
  async item(tenantId: string, itemId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, tenantId },
      select: {
        id: true,
        sku: true,
        name: true,
        itemType: true,
        lowStockThreshold: true,
        criticalStockThreshold: true,
        sellingPrice: true,
        stockBalances: {
          select: {
            warehouseId: true,
            availableQty: true,
            reservedQty: true,
            damagedQty: true,
            warehouse: { select: { name: true, code: true } },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException({ code: "item_not_found", message: "That item is not in this workshop." });
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: { tenantId, inventoryItemId: itemId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        type: true,
        quantity: true,
        beforeQty: true,
        afterQty: true,
        referenceType: true,
        referenceId: true,
        actorId: true,
        createdAt: true,
        warehouse: { select: { name: true, code: true } },
      },
    });

    return { item, movements };
  }

  /** Requested vs handed over, for one request. Delegated, never re-derived. */
  fulfilment(partRequestId: string) {
    return this.parts.fulfilment(partRequestId);
  }

  /**
   * The tenant-wide ledger -- Returns/Movements' own page, distinct from
   * one item's ledger on the Item page. Server-side paginated from the
   * start: "a busy multi-warehouse workshop can generate a lot of ledger
   * rows" is the spec's own reason, and this table is built assuming
   * that rather than discovering it later.
   */
  async movements(tenantId: string, filters: MovementFilters): Promise<MovementPage> {
    const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 200);
    const page = Math.max(filters.page ?? 1, 1);

    const where = {
      tenantId,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.inventoryItemId ? { inventoryItemId: filters.inventoryItemId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          quantity: true,
          beforeQty: true,
          afterQty: true,
          referenceType: true,
          referenceId: true,
          actorId: true,
          createdAt: true,
          inventoryItem: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  }
}

export interface MovementFilters {
  readonly warehouseId?: string;
  readonly inventoryItemId?: string;
  readonly type?: import("@mop/database").StockMovementType;
  readonly from?: Date;
  readonly to?: Date;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface MovementPage {
  readonly rows: readonly {
    id: string;
    type: import("@mop/database").StockMovementType;
    quantity: number;
    beforeQty: number;
    afterQty: number;
    referenceType: string | null;
    referenceId: string | null;
    actorId: string;
    createdAt: Date;
    inventoryItem: { id: string; name: string; sku: string };
    warehouse: { id: string; name: string; code: string };
  }[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
