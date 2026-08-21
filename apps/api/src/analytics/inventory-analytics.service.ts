import { Injectable } from "@nestjs/common";
import { PrismaService } from "../runtime/database/prisma.service";
import { InventoryReportsService, type InventoryReports } from "../inventory/inventory-reports.service";
import { toDecimalNumber } from "../reports/date-range.util";
import type { AnalyticsScope } from "./analytics-scope.util";

export interface ConsumptionTrendRow {
  readonly category: string;
  readonly issued: number;
}

export interface InventoryAnalyticsReport {
  readonly operational: InventoryReports;
  readonly consumptionByCategory: readonly ConsumptionTrendRow[];
  /** Null unless the caller has inventory.cost.view -- the same gate the Inventory Manager's own catalog cost field uses. */
  readonly inventoryValue: number | null;
}

/**
 * Data Analyst -- Inventory Analytics (docs/detailed-specs/data-analyst.md).
 * Reuses InventoryReportsService (built for the Inventory Manager's own
 * page) rather than a second consumption/velocity implementation --
 * scope here is resolved from branch to warehouse via
 * BranchWarehouseAccess, since a Data Analyst's scope is branch/category,
 * not warehouse, but the underlying stock model is warehouse-keyed.
 */
@Injectable()
export class InventoryAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryReports: InventoryReportsService,
  ) {}

  async build(tenantId: string, scope: AnalyticsScope, canViewCost: boolean): Promise<InventoryAnalyticsReport> {
    const warehouseScope = await this.resolveWarehouseScope(tenantId, scope);
    const operational = await this.inventoryReports.build(tenantId, warehouseScope);

    const inventoryValue = canViewCost ? await this.totalInventoryValue(tenantId, warehouseScope) : null;

    return {
      operational,
      consumptionByCategory: operational.categoryUsage.map((c) => ({ category: c.category, issued: c.issued })),
      inventoryValue,
    };
  }

  private async resolveWarehouseScope(tenantId: string, scope: AnalyticsScope): Promise<readonly string[]> {
    if (scope.branchIds.length === 0) return [];
    const links = await this.prisma.branchWarehouseAccess.findMany({
      where: { tenantId, branchId: { in: [...scope.branchIds] } },
      select: { warehouseId: true },
      distinct: ["warehouseId"],
    });
    return links.map((l) => l.warehouseId);
  }

  private async totalInventoryValue(tenantId: string, warehouseScope: readonly string[]): Promise<number> {
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId, ...(warehouseScope.length > 0 ? { warehouseId: { in: [...warehouseScope] } } : {}) },
      select: { availableQty: true, inventoryItem: { select: { cost: true, sellingPrice: true } } },
    });
    return balances.reduce(
      (sum, b) => sum + b.availableQty * toDecimalNumber(b.inventoryItem.cost ?? b.inventoryItem.sellingPrice),
      0,
    );
  }
}
