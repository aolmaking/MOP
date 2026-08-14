import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { resolveDateRange, resolveGranularity, type ReportQueryParams } from "../reports/date-range.util";
import { averageMsByStatus, computeStatusDurations, type StatusChangeEvent } from "../reports/lifecycle-duration.util";
import { isMultiBranch, workOrderScopeFilter, type AnalyticsScope } from "./analytics-scope.util";

export interface VolumePoint {
  readonly bucket: string;
  readonly created: number;
  readonly completed: number;
}

export interface StatusDistributionRow {
  readonly status: string;
  readonly count: number;
}

export interface TimeInStatusRow {
  readonly status: string;
  readonly averageHours: number;
}

export interface BranchThroughputRow {
  readonly branchId: string;
  readonly branchName: string;
  readonly created: number;
  readonly completed: number;
}

export interface BlockerRow {
  readonly reason: string;
  readonly count: number;
}

export interface DeliveryFunnel {
  readonly reachedReadyForDelivery: number;
  readonly reachedClosed: number;
  /** Hours, null when nothing in scope reached both stages. */
  readonly averageGapHours: number | null;
}

export interface OperationsAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly volume: readonly VolumePoint[];
  readonly statusDistribution: readonly StatusDistributionRow[];
  readonly timeInStatus: readonly TimeInStatusRow[];
  /** Null when scope is a single branch -- a comparison with one bar isn't a comparison. */
  readonly branchComparison: readonly BranchThroughputRow[] | null;
  readonly blockers: readonly BlockerRow[];
  readonly deliveryFunnel: DeliveryFunnel;
}

/**
 * Data Analyst -- Operations Analytics (docs/detailed-specs/data-analyst.md).
 * Never shows a currency amount -- the delivery/payment funnel counts
 * work orders and measures durations, which is a distinct question from
 * Finance's own reporting of the same lifecycle stage.
 */
@Injectable()
export class OperationsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<OperationsAnalyticsReport> {
    const range = resolveDateRange(params);
    const granularity = resolveGranularity(params.groupBy);
    const scopeFilter = workOrderScopeFilter(scope);

    const [volume, statusDistribution, timeInStatus, branchComparison, blockers, deliveryFunnel] = await Promise.all([
      this.volume(tenantId, scope, range, granularity),
      this.statusDistribution(tenantId, scopeFilter),
      this.timeInStatus(tenantId, scope, range),
      this.branchComparison(tenantId, scope, range),
      this.blockerAnalysis(tenantId, scope, range),
      this.deliveryFunnel(tenantId, scope, range),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      volume,
      statusDistribution,
      timeInStatus,
      branchComparison,
      blockers,
      deliveryFunnel,
    };
  }

  private async volume(
    tenantId: string,
    scope: AnalyticsScope,
    range: { from: Date; to: Date },
    granularity: "day" | "week" | "month",
  ): Promise<VolumePoint[]> {
    const branchClause =
      scope.branchIds.length > 0 ? Prisma.sql`AND w."branchId" IN (${Prisma.join(scope.branchIds)})` : Prisma.empty;

    const createdRows = await this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, w."createdAt") AS bucket, COUNT(*) AS count
      FROM "work_orders" w
      ${categoryIdsJoinFragment(scope)}
      WHERE w."tenantId" = ${tenantId} AND w."createdAt" >= ${range.from} AND w."createdAt" <= ${range.to}
        ${branchClause}
      GROUP BY bucket ORDER BY bucket ASC
    `);
    const completedRows = await this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, w."closedAt") AS bucket, COUNT(*) AS count
      FROM "work_orders" w
      ${categoryIdsJoinFragment(scope)}
      WHERE w."tenantId" = ${tenantId} AND w."status" = 'CLOSED' AND w."closedAt" >= ${range.from} AND w."closedAt" <= ${range.to}
        ${branchClause}
      GROUP BY bucket ORDER BY bucket ASC
    `);

    const byBucket = new Map<string, { created: number; completed: number }>();
    for (const row of createdRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { created: Number(row.count), completed: byBucket.get(key)?.completed ?? 0 });
    }
    for (const row of completedRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { created: byBucket.get(key)?.created ?? 0, completed: Number(row.count) });
    }

    return [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({ bucket, ...v }));
  }

  private async statusDistribution(tenantId: string, scopeFilter: object): Promise<StatusDistributionRow[]> {
    const rows = await this.prisma.workOrder.groupBy({
      by: ["status"],
      where: { tenantId, ...scopeFilter },
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status, count: r._count._all })).sort((a, b) => b.count - a.count);
  }

  private async timeInStatus(
    tenantId: string,
    scope: AnalyticsScope,
    range: { from: Date; to: Date },
  ): Promise<TimeInStatusRow[]> {
    const events = await this.prisma.operationEvent.findMany({
      where: { tenantId, eventKey: "work_order.status_changed", createdAt: { gte: range.from, lte: range.to } },
      select: { payload: true, createdAt: true },
    });
    let statusEvents: StatusChangeEvent[] = events.map((e) => {
      const payload = e.payload as { workOrderId?: string; from?: string; to?: string };
      return { workOrderId: payload.workOrderId ?? "unknown", from: payload.from ?? "UNKNOWN", to: payload.to ?? "UNKNOWN", at: e.createdAt };
    });

    if (scope.branchIds.length > 0 || scope.categoryIds.length > 0) {
      const ids = [...new Set(statusEvents.map((e) => e.workOrderId))];
      const inScope = await this.prisma.workOrder.findMany({
        where: { tenantId, id: { in: ids }, ...workOrderScopeFilter(scope) },
        select: { id: true },
      });
      const allowed = new Set(inScope.map((w) => w.id));
      statusEvents = statusEvents.filter((e) => allowed.has(e.workOrderId));
    }

    const durations = computeStatusDurations(statusEvents, range.to);
    const averages = averageMsByStatus(durations);
    return Object.entries(averages)
      .map(([status, ms]) => ({ status, averageHours: ms / (60 * 60 * 1000) }))
      .sort((a, b) => b.averageHours - a.averageHours);
  }

  private async branchComparison(
    tenantId: string,
    scope: AnalyticsScope,
    range: { from: Date; to: Date },
  ): Promise<BranchThroughputRow[] | null> {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, ...(scope.branchIds.length > 0 ? { id: { in: [...scope.branchIds] } } : {}) },
      select: { id: true, name: true },
    });
    if (!isMultiBranch(scope, branches.length)) return null;

    const categoryFilter = scope.categoryIds.length > 0 ? { asset: { category: { in: [...scope.categoryIds] as never } } } : {};

    return Promise.all(
      branches.map(async (branch) => {
        const [created, completed] = await Promise.all([
          this.prisma.workOrder.count({
            where: { tenantId, branchId: branch.id, ...categoryFilter, createdAt: { gte: range.from, lte: range.to } },
          }),
          this.prisma.workOrder.count({
            where: {
              tenantId,
              branchId: branch.id,
              ...categoryFilter,
              status: "CLOSED",
              closedAt: { gte: range.from, lte: range.to },
            },
          }),
        ]);
        return { branchId: branch.id, branchName: branch.name, created, completed };
      }),
    );
  }

  private async blockerAnalysis(tenantId: string, scope: AnalyticsScope, range: { from: Date; to: Date }): Promise<BlockerRow[]> {
    const rows = await this.prisma.taskBlocker.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        task: { workOrder: workOrderScopeFilter(scope) },
      },
      select: { reason: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
    return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }

  private async deliveryFunnel(tenantId: string, scope: AnalyticsScope, range: { from: Date; to: Date }): Promise<DeliveryFunnel> {
    const reachedDelivery = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { payload: true, createdAt: true },
    });

    const deliveryEvents = reachedDelivery.filter((e) => (e.payload as { to?: string }).to === "READY_FOR_DELIVERY");
    const closedWorkOrders = await this.prisma.workOrder.findMany({
      where: { tenantId, status: "CLOSED", closedAt: { gte: range.from, lte: range.to }, ...workOrderScopeFilter(scope) },
      select: { id: true, closedAt: true },
    });

    let scopedDeliveryEvents = deliveryEvents;
    if (scope.branchIds.length > 0 || scope.categoryIds.length > 0) {
      const ids = [...new Set(deliveryEvents.map((e) => (e.payload as { workOrderId?: string }).workOrderId))].filter(
        (id): id is string => Boolean(id),
      );
      const inScope = await this.prisma.workOrder.findMany({
        where: { tenantId, id: { in: ids }, ...workOrderScopeFilter(scope) },
        select: { id: true },
      });
      const allowed = new Set(inScope.map((w) => w.id));
      scopedDeliveryEvents = deliveryEvents.filter((e) => allowed.has((e.payload as { workOrderId?: string }).workOrderId ?? ""));
    }

    const deliveryAtByWorkOrder = new Map<string, Date>();
    for (const event of scopedDeliveryEvents) {
      const workOrderId = (event.payload as { workOrderId?: string }).workOrderId;
      if (workOrderId) deliveryAtByWorkOrder.set(workOrderId, event.createdAt);
    }

    const closedIds = new Set(closedWorkOrders.map((w) => w.id));
    let totalGapHours = 0;
    let gapCount = 0;
    for (const wo of closedWorkOrders) {
      const deliveredAt = deliveryAtByWorkOrder.get(wo.id);
      if (deliveredAt && wo.closedAt) {
        totalGapHours += (wo.closedAt.getTime() - deliveredAt.getTime()) / (60 * 60 * 1000);
        gapCount += 1;
      }
    }

    return {
      reachedReadyForDelivery: deliveryAtByWorkOrder.size,
      reachedClosed: [...deliveryAtByWorkOrder.keys()].filter((id) => closedIds.has(id)).length,
      averageGapHours: gapCount === 0 ? null : totalGapHours / gapCount,
    };
  }
}

function categoryIdsJoinFragment(scope: AnalyticsScope) {
  return scope.categoryIds.length > 0
    ? Prisma.sql`JOIN "assets" a ON a.id = w."assetId" AND a.category IN (${Prisma.join(scope.categoryIds)}::"CategoryCode"[])`
    : Prisma.empty;
}
