import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface UsageRow {
  readonly itemId: string;
  readonly name: string;
  readonly sku: string;
  readonly issued: number;
  readonly movements: number;
}

export interface StockRiskRow {
  readonly itemId: string;
  readonly name: string;
  readonly sku: string;
  readonly warehouseCode: string;
  readonly available: number;
  /** Units per day over the window. */
  readonly velocity: number;
  /** Whole days until empty at current velocity. Null when it is not moving. */
  readonly daysLeft: number | null;
}

export interface ReturnsReport {
  readonly total: number;
  readonly backToStock: number;
  readonly damaged: number;
}

export interface RequesterRow {
  readonly requestedById: string;
  readonly requests: number;
  /** Hours from request to first issue. Null when nothing has been issued. */
  readonly averageFulfilmentHours: number | null;
}

export interface WarehouseUsageRow {
  readonly warehouseId: string;
  readonly code: string;
  readonly name: string;
  readonly issued: number;
}

export interface InventoryReports {
  readonly windowDays: number;
  readonly usage: readonly UsageRow[];
  readonly categoryUsage: readonly { category: string; issued: number }[];
  readonly stockRisk: readonly StockRiskRow[];
  readonly returns: ReturnsReport;
  readonly requesters: readonly RequesterRow[];
  /**
   * Null when this manager covers ONE warehouse. The spec is explicit: a
   * comparison chart with a single bar is not a comparison, so the shape
   * of the answer changes rather than the page rendering an empty one.
   */
  readonly warehouseComparison: readonly WarehouseUsageRow[] | null;
}

const WINDOW_DAYS = 30;

/**
 * Reports & Stock Insights -- the storekeeper's own reporting, scoped to
 * their warehouses and distinct from the Owner's company-wide reports.
 *
 * Two rules carried from the rest of this role.
 *
 * **Nothing silently blends warehouses.** Where a number spans them it is
 * either broken down or labelled as a deliberate total.
 *
 * **Stock risk looks forward, not at the balance.** The spec asks for
 * items *trending toward* low, which a snapshot cannot answer: forty
 * units is comfortable at one a week and an emergency at ten a day. So
 * risk is consumption velocity against the current balance, and an item
 * that is not moving has no risk rather than infinite runway.
 */
@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, warehouseScope: readonly string[]): Promise<InventoryReports> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId, ...(warehouseScope.length > 0 ? { id: { in: [...warehouseScope] } } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });
    const warehouseIds = warehouses.map((warehouse) => warehouse.id);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const issues = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        type: "ISSUE",
        createdAt: { gte: since },
        ...(warehouseIds.length > 0 ? { warehouseId: { in: warehouseIds } } : {}),
      },
      select: { inventoryItemId: true, warehouseId: true, quantity: true },
    });

    const [usage, categoryUsage] = await this.usage(issues);

    return {
      windowDays: WINDOW_DAYS,
      usage,
      categoryUsage,
      stockRisk: await this.stockRisk(tenantId, warehouses, issues),
      returns: await this.returns(tenantId, warehouseIds, since),
      requesters: await this.requesters(tenantId, since),
      // A single-warehouse scope gets null, not a one-bar chart.
      warehouseComparison: warehouses.length > 1 ? this.byWarehouse(warehouses, issues) : null,
    };
  }

  private async usage(
    issues: readonly { inventoryItemId: string; quantity: number }[],
  ): Promise<[readonly UsageRow[], readonly { category: string; issued: number }[]]> {
    const byItem = new Map<string, { issued: number; movements: number }>();
    for (const issue of issues) {
      const current = byItem.get(issue.inventoryItemId) ?? { issued: 0, movements: 0 };
      current.issued += issue.quantity;
      current.movements += 1;
      byItem.set(issue.inventoryItemId, current);
    }

    if (byItem.size === 0) return [[], []];

    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: [...byItem.keys()] } },
      select: { id: true, name: true, sku: true, category: true },
    });

    const usage: UsageRow[] = items
      .map((item) => ({
        itemId: item.id,
        name: item.name,
        sku: item.sku,
        issued: byItem.get(item.id)?.issued ?? 0,
        movements: byItem.get(item.id)?.movements ?? 0,
      }))
      .sort((a, b) => b.issued - a.issued)
      .slice(0, 20);

    const byCategory = new Map<string, number>();
    for (const item of items) {
      const category = item.category ?? "Uncategorised";
      byCategory.set(category, (byCategory.get(category) ?? 0) + (byItem.get(item.id)?.issued ?? 0));
    }

    return [
      usage,
      [...byCategory.entries()]
        .map(([category, issued]) => ({ category, issued }))
        .sort((a, b) => b.issued - a.issued),
    ];
  }

  /**
   * Forward-looking, per warehouse.
   *
   * Velocity is measured in the SAME warehouse as the balance it is
   * compared against. Using a tenant-wide rate against one room's stock
   * would tell a manager the busy warehouse is fine because the quiet one
   * dragged the average down.
   */
  private async stockRisk(
    tenantId: string,
    warehouses: readonly { id: string; code: string; name: string }[],
    issues: readonly { inventoryItemId: string; warehouseId: string; quantity: number }[],
  ): Promise<readonly StockRiskRow[]> {
    const consumed = new Map<string, number>();
    for (const issue of issues) {
      const key = `${issue.inventoryItemId}:${issue.warehouseId}`;
      consumed.set(key, (consumed.get(key) ?? 0) + issue.quantity);
    }
    if (consumed.size === 0) return [];

    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: {
        tenantId,
        ...(warehouses.length > 0 ? { warehouseId: { in: warehouses.map((w) => w.id) } } : {}),
      },
      select: {
        warehouseId: true,
        availableQty: true,
        inventoryItem: { select: { id: true, name: true, sku: true, stockTracked: true } },
      },
    });

    const codeById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.code]));

    return balances
      .filter((balance) => balance.inventoryItem.stockTracked)
      .map((balance) => {
        const used = consumed.get(`${balance.inventoryItem.id}:${balance.warehouseId}`) ?? 0;
        const velocity = used / WINDOW_DAYS;

        return {
          itemId: balance.inventoryItem.id,
          name: balance.inventoryItem.name,
          sku: balance.inventoryItem.sku,
          warehouseCode: codeById.get(balance.warehouseId) ?? "",
          available: balance.availableQty,
          velocity: Math.round(velocity * 100) / 100,
          // Not moving means no risk, not infinite runway -- null so the
          // page can say "not moving" rather than print a huge number.
          daysLeft: velocity > 0 ? Math.floor(balance.availableQty / velocity) : null,
        };
      })
      // Only things that will actually run out inside a sensible horizon.
      .filter((row) => row.daysLeft !== null && row.daysLeft <= WINDOW_DAYS)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
      .slice(0, 20);
  }

  private async returns(
    tenantId: string,
    warehouseIds: readonly string[],
    since: Date,
  ): Promise<ReturnsReport> {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ["type"],
      where: {
        tenantId,
        type: { in: ["RETURN_TO_STOCK", "DAMAGED"] },
        createdAt: { gte: since },
        ...(warehouseIds.length > 0 ? { warehouseId: { in: [...warehouseIds] } } : {}),
      },
      _sum: { quantity: true },
    });

    const backToStock = rows.find((row) => row.type === "RETURN_TO_STOCK")?._sum.quantity ?? 0;
    const damaged = rows.find((row) => row.type === "DAMAGED")?._sum.quantity ?? 0;

    return { total: backToStock + damaged, backToStock, damaged };
  }

  /**
   * Who asks for the most, and how long they wait.
   *
   * Fulfilment time is measured to the FIRST issue rather than the last,
   * because that is when the technician stopped being blocked -- a
   * partial issue unsticks the job.
   */
  private async requesters(tenantId: string, since: Date): Promise<readonly RequesterRow[]> {
    const requests = await this.prisma.partRequest.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: {
        requestedById: true,
        createdAt: true,
        issuedItems: { select: { issuedAt: true }, orderBy: { issuedAt: "asc" }, take: 1 },
      },
    });

    const byRequester = new Map<string, { requests: number; waited: number[] }>();
    for (const request of requests) {
      const current = byRequester.get(request.requestedById) ?? { requests: 0, waited: [] };
      current.requests += 1;

      const firstIssue = request.issuedItems[0];
      if (firstIssue) {
        current.waited.push((firstIssue.issuedAt.getTime() - request.createdAt.getTime()) / 3_600_000);
      }
      byRequester.set(request.requestedById, current);
    }

    return [...byRequester.entries()]
      .map(([requestedById, stats]) => ({
        requestedById,
        requests: stats.requests,
        averageFulfilmentHours:
          stats.waited.length > 0
            ? Math.round((stats.waited.reduce((sum, hours) => sum + hours, 0) / stats.waited.length) * 10) / 10
            : null,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 20);
  }

  private byWarehouse(
    warehouses: readonly { id: string; code: string; name: string }[],
    issues: readonly { warehouseId: string; quantity: number }[],
  ): readonly WarehouseUsageRow[] {
    const totals = new Map<string, number>();
    for (const issue of issues) totals.set(issue.warehouseId, (totals.get(issue.warehouseId) ?? 0) + issue.quantity);

    return warehouses.map((warehouse) => ({
      warehouseId: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      issued: totals.get(warehouse.id) ?? 0,
    }));
  }
}
