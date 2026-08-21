import { Injectable } from "@nestjs/common";
import { PrismaService } from "../runtime/database/prisma.service";

/** A count, plus where it actually is. */
export interface ScopedCount {
  readonly total: number;
  /** Per warehouse, so a manager covering three knows WHICH one. */
  readonly byWarehouse: readonly { warehouseId: string; code: string; name: string; count: number }[];
}

export interface FastMovingItem {
  readonly itemId: string;
  readonly name: string;
  readonly sku: string;
  readonly movements: number;
  readonly quantity: number;
}

export interface InventoryHome {
  readonly warehouses: readonly { id: string; code: string; name: string }[];
  readonly pendingRequests: ScopedCount;
  readonly toDispatch: ScopedCount;
  readonly awaitingArrival: ScopedCount;
  readonly returnRequests: ScopedCount;
  /** Three separate buckets, deliberately never one "low stock" number. */
  readonly lowStock: ScopedCount;
  readonly criticalStock: ScopedCount;
  readonly outOfStock: ScopedCount;
  readonly fastMoving: readonly FastMovingItem[];
}

/** "This period" for fast-moving. Long enough to smooth a quiet day. */
const FAST_MOVING_DAYS = 30;

/**
 * Inventory Home -- daily triage, the storekeeper's equivalent of the
 * branch manager's Attention Center.
 *
 * The discipline that shapes every number here:
 *
 *   Nothing is silently blended across warehouses.
 *
 * A stock level is a fact about a room. An item low in one warehouse and
 * healthy in another is one problem in one place, and a total that
 * averaged those two together would report neither. So every count is
 * computed per warehouse and then summed, and the breakdown travels with
 * the total rather than being recomputed by a screen later.
 *
 * Low / Critical / Out are three separate counts, never one bucket. They
 * mean different things and are acted on differently: out of stock is a
 * technician already waiting, critical is today's problem, low is this
 * week's ordering.
 */
@Injectable()
export class InventoryHomeService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, warehouseScope: readonly string[]): Promise<InventoryHome> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        tenantId,
        ...(warehouseScope.length > 0 ? { id: { in: [...warehouseScope] } } : {}),
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });

    const warehouseIds = warehouses.map((warehouse) => warehouse.id);

    const [requests, stock, fastMoving, returns] = await Promise.all([
      this.requestCounts(tenantId, warehouseIds),
      this.stockCounts(tenantId, warehouses),
      this.fastMoving(tenantId, warehouseIds),
      this.returnCount(tenantId, warehouses),
    ]);

    return {
      warehouses,
      ...requests,
      ...stock,
      returnRequests: returns,
      fastMoving,
    };
  }

  /**
   * Request-shaped counts.
   *
   * These are NOT per-warehouse in the same sense as stock: a request is
   * raised against a job, not a room, and only becomes attached to a
   * warehouse once it is issued. So the breakdown is reported on the one
   * that genuinely has it -- dispatch and arrival -- and left as a plain
   * total for the ones that do not, rather than inventing an attribution.
   */
  private async requestCounts(tenantId: string, warehouseIds: readonly string[]) {
    const [pending, approved, issued] = await Promise.all([
      this.prisma.partRequest.count({
        where: { tenantId, status: { in: ["REQUESTED", "WAREHOUSE_REVIEWING"] } },
      }),
      this.prisma.partRequest.count({ where: { tenantId, status: "APPROVED" } }),
      this.prisma.issuedItem.findMany({
        where: {
          tenantId,
          receivedAt: null,
          ...(warehouseIds.length > 0 ? { warehouseId: { in: [...warehouseIds] } } : {}),
          partRequest: { status: { in: ["ISSUED", "IN_TRANSIT", "ARRIVED"] } },
        },
        select: { warehouseId: true },
      }),
    ]);

    const awaiting = new Map<string, number>();
    for (const item of issued) awaiting.set(item.warehouseId, (awaiting.get(item.warehouseId) ?? 0) + 1);

    return {
      pendingRequests: { total: pending, byWarehouse: [] },
      toDispatch: { total: approved, byWarehouse: [] },
      awaitingArrival: {
        total: issued.length,
        byWarehouse: [...awaiting.entries()].map(([warehouseId, count]) => ({
          warehouseId,
          code: "",
          name: "",
          count,
        })),
      },
    };
  }

  /**
   * Stock health, computed per warehouse and then summed.
   *
   * The spec's example: an item low in Warehouse A and healthy in
   * Warehouse B counts ONCE, attributed to A. Summing balances first and
   * comparing the total against the threshold would hide exactly that
   * case, which is the one worth catching.
   */
  private async stockCounts(
    tenantId: string,
    warehouses: readonly { id: string; code: string; name: string }[],
  ) {
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: {
        tenantId,
        ...(warehouses.length > 0 ? { warehouseId: { in: warehouses.map((w) => w.id) } } : {}),
      },
      select: {
        warehouseId: true,
        availableQty: true,
        inventoryItem: { select: { stockTracked: true, lowStockThreshold: true, criticalStockThreshold: true } },
      },
    });

    const empty = () => new Map<string, number>(warehouses.map((warehouse) => [warehouse.id, 0]));
    const low = empty();
    const critical = empty();
    const out = empty();

    for (const balance of balances) {
      // An untracked item has no meaningful level -- it exists in the
      // catalog for pricing only, and counting it as "out of stock"
      // would fill the card with things nobody is waiting for.
      if (!balance.inventoryItem.stockTracked) continue;

      const bucket =
        balance.availableQty <= 0
          ? out
          : balance.availableQty <= balance.inventoryItem.criticalStockThreshold
            ? critical
            : balance.availableQty <= balance.inventoryItem.lowStockThreshold
              ? low
              : null;

      if (bucket) bucket.set(balance.warehouseId, (bucket.get(balance.warehouseId) ?? 0) + 1);
    }

    const toScoped = (counts: Map<string, number>): ScopedCount => {
      const byWarehouse = warehouses
        .map((warehouse) => ({
          warehouseId: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
          count: counts.get(warehouse.id) ?? 0,
        }))
        .filter((entry) => entry.count > 0);

      return { total: byWarehouse.reduce((sum, entry) => sum + entry.count, 0), byWarehouse };
    };

    return { lowStock: toScoped(low), criticalStock: toScoped(critical), outOfStock: toScoped(out) };
  }

  private async returnCount(
    tenantId: string,
    warehouses: readonly { id: string; code: string; name: string }[],
  ): Promise<ScopedCount> {
    void warehouses;
    const total = await this.prisma.partRequest.count({
      where: { tenantId, status: { in: ["RETURN_REQUESTED", "RETURN_CLARIFICATION_REQUESTED"] } },
    });
    // A return is attached to the request, not yet to a room -- which
    // warehouse it lands in is decided when it is accepted.
    return { total, byWarehouse: [] };
  }

  /**
   * Most-moved items over the period.
   *
   * Counted by number of movements AND total quantity, because they
   * answer different questions: many small issues is a consumable to keep
   * stocked, one huge issue is a job that happened.
   */
  private async fastMoving(tenantId: string, warehouseIds: readonly string[]): Promise<readonly FastMovingItem[]> {
    const since = new Date(Date.now() - FAST_MOVING_DAYS * 24 * 60 * 60 * 1000);

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ["inventoryItemId"],
      where: {
        tenantId,
        type: "ISSUE",
        createdAt: { gte: since },
        ...(warehouseIds.length > 0 ? { warehouseId: { in: [...warehouseIds] } } : {}),
      },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    if (grouped.length === 0) return [];

    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: grouped.map((row) => row.inventoryItemId) } },
      select: { id: true, name: true, sku: true },
    });
    const byId = new Map(items.map((item) => [item.id, item]));

    return grouped.map((row) => ({
      itemId: row.inventoryItemId,
      name: byId.get(row.inventoryItemId)?.name ?? "Unknown item",
      sku: byId.get(row.inventoryItemId)?.sku ?? "",
      movements: row._count._all,
      quantity: row._sum.quantity ?? 0,
    }));
  }
}
