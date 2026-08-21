import { Injectable } from "@nestjs/common";
import { PrismaService } from "../runtime/database/prisma.service";
import { InventoryReportsService, type InventoryReports } from "../systems/inventory/inventory-reports.service";
import { resolveDateRange, toDecimalNumber, type ReportQueryParams } from "./date-range.util";

export interface PartProfitabilityRow {
  readonly inventoryItemId: string;
  readonly name: string;
  readonly sku: string;
  readonly quantitySold: number;
  readonly revenue: number;
  /** Null when no line in the period recorded a cost (CUSTOMER_SUPPLIED parts never do). */
  readonly cost: number | null;
  readonly profit: number | null;
}

export interface DeadStockRow {
  readonly inventoryItemId: string;
  readonly name: string;
  readonly sku: string;
  readonly availableQty: number;
  readonly valueAtSellingPrice: number;
}

export interface InventoryAnalyticsReport {
  readonly range: { from: string; to: string };
  /** Reuses InventoryReportsService.build (unscoped -- every warehouse) for usage, velocity-based stock risk, and returns. */
  readonly operational: InventoryReports;
  readonly totalInventoryValue: number;
  readonly partProfitability: readonly PartProfitabilityRow[];
  readonly deadStock: readonly DeadStockRow[];
}

/**
 * Inventory analytics. Deliberately does not reimplement usage/velocity/
 * stock-risk/returns -- `InventoryReportsService` (built for the
 * Inventory Manager's own Reports & Stock Insights page) already
 * computes exactly that, correctly, with a 30-day velocity window. This
 * service reuses it unscoped (every warehouse) and adds the two things
 * it doesn't cover: money (profitability, inventory value) and dead
 * stock (zero movement, as opposed to merely slow).
 */
@Injectable()
export class ReportsInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryReports: InventoryReportsService,
  ) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<InventoryAnalyticsReport> {
    const range = resolveDateRange(params);

    const [operational, totalInventoryValue, partProfitability, deadStock] = await Promise.all([
      this.inventoryReports.build(tenantId, []),
      this.totalInventoryValue(tenantId),
      this.partProfitability(tenantId, range),
      this.deadStock(tenantId),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      operational,
      totalInventoryValue,
      partProfitability,
      deadStock,
    };
  }

  private async totalInventoryValue(tenantId: string): Promise<number> {
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId },
      select: { availableQty: true, inventoryItem: { select: { sellingPrice: true } } },
    });
    return balances.reduce((sum, b) => sum + b.availableQty * toDecimalNumber(b.inventoryItem.sellingPrice), 0);
  }

  /**
   * `WorkOrderPartLine.cost`/`.sellingPrice` are the real per-part profit
   * inputs -- unlike InvoiceLine (a rendered snapshot with no
   * `inventoryItemId`), this table keeps the actual catalog reference,
   * which is what makes per-part profitability derivable at all.
   */
  private async partProfitability(tenantId: string, range: { from: Date; to: Date }): Promise<PartProfitabilityRow[]> {
    const lines = await this.prisma.workOrderPartLine.findMany({
      where: {
        tenantId,
        inventoryItemId: { not: null },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { inventoryItemId: true, quantity: true, sellingPrice: true, cost: true },
    });

    const byItem = new Map<string, { quantity: number; revenue: number; cost: number; hasCost: boolean }>();
    for (const line of lines) {
      const id = line.inventoryItemId!;
      const entry = byItem.get(id) ?? { quantity: 0, revenue: 0, cost: 0, hasCost: false };
      entry.quantity += line.quantity;
      entry.revenue += toDecimalNumber(line.sellingPrice) * line.quantity;
      if (line.cost !== null) {
        entry.cost += toDecimalNumber(line.cost) * line.quantity;
        entry.hasCost = true;
      }
      byItem.set(id, entry);
    }

    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: [...byItem.keys()] } },
      select: { id: true, name: true, sku: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    return [...byItem.entries()]
      .map(([inventoryItemId, entry]) => ({
        inventoryItemId,
        name: itemById.get(inventoryItemId)?.name ?? "Unknown item",
        sku: itemById.get(inventoryItemId)?.sku ?? "",
        quantitySold: entry.quantity,
        revenue: entry.revenue,
        cost: entry.hasCost ? entry.cost : null,
        profit: entry.hasCost ? entry.revenue - entry.cost : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Stock on hand with zero OUT-type movement, ever -- distinct from
   * InventoryReportsService's "slow-moving" (which is still moving, just
   * slowly); this is genuinely not moving at all.
   */
  private async deadStock(tenantId: string): Promise<DeadStockRow[]> {
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId, availableQty: { gt: 0 } },
      select: {
        availableQty: true,
        inventoryItemId: true,
        inventoryItem: { select: { name: true, sku: true, sellingPrice: true } },
      },
    });

    const byItem = new Map<string, number>();
    for (const b of balances) {
      byItem.set(b.inventoryItemId, (byItem.get(b.inventoryItemId) ?? 0) + b.availableQty);
    }

    const moved = await this.prisma.stockMovement.findMany({
      where: { tenantId, inventoryItemId: { in: [...byItem.keys()] }, type: { in: ["ISSUE", "TRANSFER_OUT"] } },
      select: { inventoryItemId: true },
      distinct: ["inventoryItemId"],
    });
    const movedIds = new Set(moved.map((m) => m.inventoryItemId));

    const itemInfo = new Map(balances.map((b) => [b.inventoryItemId, b.inventoryItem]));

    return [...byItem.entries()]
      .filter(([itemId]) => !movedIds.has(itemId))
      .map(([itemId, qty]) => {
        const info = itemInfo.get(itemId)!;
        return {
          inventoryItemId: itemId,
          name: info.name,
          sku: info.sku,
          availableQty: qty,
          valueAtSellingPrice: qty * toDecimalNumber(info.sellingPrice),
        };
      })
      .sort((a, b) => b.valueAtSellingPrice - a.valueAtSellingPrice);
  }
}
