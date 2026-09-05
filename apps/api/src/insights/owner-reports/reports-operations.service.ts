import { Injectable } from "@nestjs/common";
import { Prisma, type WorkOrderStatus } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import {
  resolveDateRange,
  resolveGranularity,
  safeDivide,
  type ReportGranularity,
  type ReportQueryParams,
} from "./date-range.util";
import {
  averageMsByStatus,
  computeStatusDurations,
  TERMINAL_STATUSES,
  type WorkOrderMeta,
} from "./lifecycle-duration.util";

export interface StatusDistributionRow {
  readonly status: string;
  readonly count: number;
}

export interface AverageTimeInStatusRow {
  readonly status: string;
  readonly averageHours: number;
}

export interface BranchOperationsRow {
  readonly branchId: string;
  readonly branchName: string;
  readonly workOrdersCreated: number;
  readonly workOrdersClosed: number;
  readonly averageCompletionHours: number | null;
}

export interface TechnicianWorkloadRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly activeTasks: number;
  readonly reworkCount: number;
  /** Rework as a share of everything this technician completed or reworked -- null when they have done nothing yet. */
  readonly reworkRate: number | null;
  readonly actualLaborMinutes?: number | null;
  readonly completionRate?: number | null;
}

/** One bucket of the volume series -- how many vehicles came in and went out. */
export interface VolumePoint {
  readonly bucket: string;
  readonly created: number;
  readonly closed: number;
}

export interface CycleTimeSummary {
  readonly averageTotalHours: number | null;
  readonly averageActiveWorkHours: number | null;
  readonly averageWaitingHours: number | null;
  readonly activeTimeRatio: number | null;
  readonly bottleneckStage: string | null;
}

export interface DeliverySlaSummary {
  readonly evaluatedAsOf: string;
  readonly totalWithPromise: number;
  readonly deliveredOnTime: number;
  readonly deliveredLate: number;
  readonly currentlyOverdue: number;
  readonly onTimeRate: number | null;
  readonly averageDelayHours: number | null;
}

export interface VehicleActivitySummary {
  readonly distinctVehicles: number;
  readonly repeatVisits: number;
  readonly averageOrdersPerVehicle: number | null;
}

export interface OperationsReport {
  readonly range: { from: string; to: string };
  readonly volume: readonly VolumePoint[];
  readonly volumeTotals: { created: number; closed: number };
  readonly granularity: ReportGranularity;
  readonly statusDistribution: readonly StatusDistributionRow[];
  readonly averageTimeInStatus: readonly AverageTimeInStatusRow[];
  readonly branchComparison: readonly BranchOperationsRow[];
  readonly technicianWorkload: readonly TechnicianWorkloadRow[];
  readonly delayedJobs: number;
  readonly reopenedJobs: number;
  readonly cancelledJobs: number;
  readonly cancellationRate: number;
  readonly cycleTimeSummary?: CycleTimeSummary;
  readonly deliverySla?: DeliverySlaSummary;
  readonly vehicleActivity?: VehicleActivitySummary;
}

/**
 * Operations -- workload, throughput, cycle time, and where jobs
 * actually get stuck. Reconstructs history from OperationEvents, Task.completedAt,
 * and immutable creation events to ensure historical truth across branch transfers,
 * team transfers, and closed historical periods.
 */
@Injectable()
export class ReportsOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<OperationsReport> {
    const range = resolveDateRange(params);
    const granularity = resolveGranularity(params.groupBy);
    const branchFilter = params.branchId ? { branchId: params.branchId } : {};

    const [
      statusDistribution,
      timeAndCycle,
      branchComparison,
      technicianWorkload,
      deliverySlaResult,
      reopenedJobs,
      cancelledJobs,
      totalInRange,
      volume,
      vehicleActivity,
    ] = await Promise.all([
      this.statusDistribution(tenantId, branchFilter),
      this.timeInStatusAndCycleSummary(tenantId, range, params.branchId),
      this.branchComparison(tenantId, range),
      this.technicianWorkload(tenantId, range),
      this.deliverySlaPerformance(tenantId, range, branchFilter),
      this.reopenedJobsCount(tenantId, range),
      this.prisma.workOrder.count({
        where: { tenantId, ...branchFilter, status: "CANCELLED", updatedAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.workOrder.count({ where: { tenantId, ...branchFilter, createdAt: { gte: range.from, lte: range.to } } }),
      this.volume(tenantId, range, granularity, params.branchId),
      this.vehicleActivity(tenantId, range, branchFilter),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      statusDistribution,
      averageTimeInStatus: timeAndCycle.averageTimeInStatus,
      branchComparison,
      technicianWorkload,
      delayedJobs: deliverySlaResult.delayedJobs,
      reopenedJobs,
      cancelledJobs,
      cancellationRate: safeDivide(cancelledJobs, totalInRange) * 100,
      volume,
      granularity,
      volumeTotals: volume.reduce(
        (acc, p) => ({ created: acc.created + p.created, closed: acc.closed + p.closed }),
        { created: 0, closed: 0 },
      ),
      cycleTimeSummary: timeAndCycle.cycleTimeSummary,
      deliverySla: deliverySlaResult.deliverySla,
      vehicleActivity,
    };
  }

  /**
   * Created vs closed per bucket.
   *
   * Bucketed in the database via date_trunc across timezones.
   */
  private async volume(
    tenantId: string,
    range: { from: Date; to: Date },
    granularity: "day" | "week" | "month",
    branchId: string | undefined,
  ): Promise<VolumePoint[]> {
    const createdRows = await this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, w."createdAt") AS bucket, COUNT(*) AS count
      FROM "work_orders" w
      WHERE w."tenantId" = ${tenantId}
        AND w."createdAt" >= ${range.from} AND w."createdAt" <= ${range.to}
        ${branchId ? Prisma.sql`AND w."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const closedRows = await this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, w."closedAt") AS bucket, COUNT(*) AS count
      FROM "work_orders" w
      WHERE w."tenantId" = ${tenantId} AND w."closedAt" IS NOT NULL
        AND w."closedAt" >= ${range.from} AND w."closedAt" <= ${range.to}
        ${branchId ? Prisma.sql`AND w."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const byBucket = new Map<string, { created: number; closed: number }>();
    for (const row of createdRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { created: Number(row.count), closed: byBucket.get(key)?.closed ?? 0 });
    }
    for (const row of closedRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { created: byBucket.get(key)?.created ?? 0, closed: Number(row.count) });
    }

    return [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({ bucket, ...v }));
  }

  private async statusDistribution(tenantId: string, branchFilter: object): Promise<StatusDistributionRow[]> {
    const grouped = await this.prisma.workOrder.groupBy({
      by: ["status"],
      where: { tenantId, ...branchFilter },
      _count: { _all: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count._all })).sort((a, b) => b.count - a.count);
  }

  private async timeInStatusAndCycleSummary(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<{
    averageTimeInStatus: AverageTimeInStatusRow[];
    cycleTimeSummary: CycleTimeSummary;
  }> {
    const events = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { gte: range.from, lte: range.to },
        ...(branchId ? { branchId } : {}),
      },
      select: { payload: true, createdAt: true, workOrderId: true, branchId: true },
    });

    let statusEvents = events.map((e) => {
      const payload = e.payload as { workOrderId?: string; from?: string; to?: string };
      return {
        workOrderId: e.workOrderId ?? payload.workOrderId ?? "unknown",
        branchId: e.branchId ?? undefined,
        from: payload.from ?? "UNKNOWN",
        to: payload.to ?? "UNKNOWN",
        at: e.createdAt,
      };
    });

    const workOrderIds = [...new Set(statusEvents.map((e) => e.workOrderId).filter((id) => id !== "unknown"))];
    const workOrders = await this.prisma.workOrder.findMany({
      where: { tenantId, id: { in: workOrderIds }, ...(branchId ? { branchId } : {}) },
      select: { id: true, createdAt: true, closedAt: true, status: true, branchId: true },
    });

    if (branchId) {
      const allowed = new Set(workOrders.map((w) => w.id));
      statusEvents = statusEvents.filter((e) => allowed.has(e.workOrderId));
    }

    const metaMap = new Map<string, WorkOrderMeta>(
      workOrders.map((wo) => [
        wo.id,
        {
          workOrderId: wo.id,
          createdAt: wo.createdAt,
          closedAt: wo.closedAt,
          initialStatus: "DRAFT",
          branchId: wo.branchId,
          tenantId,
        },
      ]),
    );

    const durations = computeStatusDurations(statusEvents, range.to, metaMap);
    const averages = averageMsByStatus(durations);

    const averageTimeInStatus = Object.entries(averages)
      .filter(([status]) => !TERMINAL_STATUSES.includes(status))
      .map(([status, ms]) => ({ status, averageHours: ms / (60 * 60 * 1000) }))
      .sort((a, b) => b.averageHours - a.averageHours);

    let cycleTimeSummary: CycleTimeSummary;
    if (durations.length === 0) {
      cycleTimeSummary = {
        averageTotalHours: null,
        averageActiveWorkHours: null,
        averageWaitingHours: null,
        activeTimeRatio: null,
        bottleneckStage: null,
      };
    } else {
      const totalDurations = durations.reduce(
        (acc, d) => ({
          totalMs: acc.totalMs + d.totalMs,
          activeMs: acc.activeMs + (d.activeWorkMs ?? 0),
          waitingMs: acc.waitingMs + (d.waitingMs ?? 0),
        }),
        { totalMs: 0, activeMs: 0, waitingMs: 0 },
      );

      const n = durations.length;
      const avgTotalH = totalDurations.totalMs / (n * 60 * 60 * 1000);
      const avgActiveH = totalDurations.activeMs / (n * 60 * 60 * 1000);
      const avgWaitH = totalDurations.waitingMs / (n * 60 * 60 * 1000);

      cycleTimeSummary = {
        averageTotalHours: avgTotalH,
        averageActiveWorkHours: avgActiveH,
        averageWaitingHours: avgWaitH,
        activeTimeRatio: avgTotalH > 0 ? avgActiveH / avgTotalH : null,
        bottleneckStage: averageTimeInStatus.length > 0 ? averageTimeInStatus[0]!.status : null,
      };
    }

    return { averageTimeInStatus, cycleTimeSummary };
  }

  private async branchComparison(tenantId: string, range: { from: Date; to: Date }): Promise<BranchOperationsRow[]> {
    const branches = await this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } });

    // Check if we have work_order.created operation events for this tenant
    const hasCreationEvents = await this.prisma.operationEvent.count({
      where: { tenantId, eventKey: "work_order.created" },
    });

    return Promise.all(
      branches.map(async (branch) => {
        let created: number;
        if (hasCreationEvents > 0) {
          // Historical branch attribution via creation events
          created = await this.prisma.operationEvent.count({
            where: {
              tenantId,
              branchId: branch.id,
              eventKey: "work_order.created",
              createdAt: { gte: range.from, lte: range.to },
            },
          });
        } else {
          created = await this.prisma.workOrder.count({
            where: { tenantId, branchId: branch.id, createdAt: { gte: range.from, lte: range.to } },
          });
        }

        const closed = await this.prisma.workOrder.findMany({
          where: { tenantId, branchId: branch.id, status: "CLOSED", closedAt: { gte: range.from, lte: range.to } },
          select: { createdAt: true, closedAt: true },
        });

        const averageCompletionHours =
          closed.length === 0
            ? null
            : closed.reduce((sum, wo) => sum + (wo.closedAt!.getTime() - wo.createdAt.getTime()) / (60 * 60 * 1000), 0) /
              closed.length;

        return {
          branchId: branch.id,
          branchName: branch.name,
          workOrdersCreated: created,
          workOrdersClosed: closed.length,
          averageCompletionHours,
        };
      }),
    );
  }

  private async technicianWorkload(tenantId: string, range: { from: Date; to: Date }): Promise<TechnicianWorkloadRow[]> {
    const technicians = await this.prisma.staffUser.findMany({
      where: { tenantId, role: "TECHNICIAN" },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });

    return Promise.all(
      technicians.map(async (person) => {
        // Query completed tasks by completion timestamp within range
        const [completedAssignments, activeTasks, reworkCount, assignedInRange] = await Promise.all([
          this.prisma.taskAssignment.findMany({
            where: {
              tenantId,
              staffUserId: person.id,
              task: {
                status: "DONE",
              },
              OR: [
                { task: { completedAt: { gte: range.from, lte: range.to } } },
                { task: { completedAt: null }, assignedAt: { gte: range.from, lte: range.to } },
              ],
            },
            select: {
              task: {
                select: { actualMinutes: true },
              },
            },
          }),
          this.prisma.taskAssignment.count({
            where: { tenantId, staffUserId: person.id, unassignedAt: null, task: { status: "IN_PROGRESS" } },
          }),
          this.prisma.taskAssignment.count({
            where: {
              tenantId,
              staffUserId: person.id,
              task: {
                status: "RETURNED_FOR_REWORK",
                updatedAt: { gte: range.from, lte: range.to },
              },
            },
          }),
          this.prisma.taskAssignment.count({
            where: {
              tenantId,
              staffUserId: person.id,
              assignedAt: { gte: range.from, lte: range.to },
            },
          }),
        ]);

        const tasksCompleted = completedAssignments.length;
        const totalActualMinutes = completedAssignments.reduce(
          (sum, a) => sum + (a.task.actualMinutes ?? 0),
          0,
        );
        const hasAnyTimedTasks = completedAssignments.some((a) => a.task.actualMinutes != null);

        const reworkDenominator = tasksCompleted + reworkCount;
        return {
          staffUserId: person.id,
          fullName: person.fullName,
          tasksCompleted,
          activeTasks,
          reworkCount,
          reworkRate: reworkDenominator === 0 ? null : (reworkCount / reworkDenominator) * 100,
          actualLaborMinutes: hasAnyTimedTasks ? totalActualMinutes : null,
          completionRate: assignedInRange === 0 ? null : (tasksCompleted / assignedInRange) * 100,
        };
      }),
    );
  }

  /**
   * Evaluates delivery SLA against asOf = min(range.to, now).
   * Historical reports evaluate against range.to and remain stable over time.
   */
  private async deliverySlaPerformance(
    tenantId: string,
    range: { from: Date; to: Date },
    branchFilter: { branchId?: string },
  ): Promise<{ delayedJobs: number; deliverySla: DeliverySlaSummary }> {
    const now = new Date();
    const asOf = range.to.getTime() < now.getTime() ? range.to : now;

    // 1. Closed jobs in range that had a promisedAt
    const closedInRange = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...branchFilter,
        status: "CLOSED",
        closedAt: { gte: range.from, lte: range.to },
        promisedAt: { not: null },
      },
      select: { id: true, promisedAt: true, closedAt: true },
    });

    let deliveredOnTime = 0;
    let deliveredLate = 0;
    let totalDelayMs = 0;

    for (const wo of closedInRange) {
      if (wo.promisedAt && wo.closedAt) {
        if (wo.closedAt.getTime() > wo.promisedAt.getTime()) {
          deliveredLate++;
          totalDelayMs += wo.closedAt.getTime() - wo.promisedAt.getTime();
        } else {
          deliveredOnTime++;
        }
      }
    }

    // 2. Open jobs at asOf that were created <= asOf and not closed before asOf, with promisedAt < asOf
    const overdueOpenJobs = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...branchFilter,
        createdAt: { lte: asOf },
        promisedAt: { lt: asOf },
        OR: [
          { status: { notIn: ["CLOSED", "CANCELLED"] as WorkOrderStatus[] } },
          { closedAt: { gt: asOf } },
        ],
      },
      select: { id: true, promisedAt: true },
    });

    for (const wo of overdueOpenJobs) {
      if (wo.promisedAt) {
        totalDelayMs += asOf.getTime() - wo.promisedAt.getTime();
      }
    }

    const currentlyOverdue = overdueOpenJobs.length;
    const totalDelayed = deliveredLate + currentlyOverdue;
    const totalDelivered = deliveredOnTime + deliveredLate;
    const onTimeRate = totalDelivered === 0 ? null : (deliveredOnTime / totalDelivered) * 100;
    const averageDelayHours =
      totalDelayed === 0 ? null : totalDelayMs / (totalDelayed * 60 * 60 * 1000);

    return {
      delayedJobs: totalDelayed,
      deliverySla: {
        evaluatedAsOf: asOf.toISOString(),
        totalWithPromise: closedInRange.length + overdueOpenJobs.length,
        deliveredOnTime,
        deliveredLate,
        currentlyOverdue,
        onTimeRate,
        averageDelayHours,
      },
    };
  }

  private async vehicleActivity(
    tenantId: string,
    range: { from: Date; to: Date },
    branchFilter: { branchId?: string },
  ): Promise<VehicleActivitySummary> {
    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...branchFilter,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { assetId: true },
    });

    const ordersByVehicle = new Map<string, number>();
    for (const wo of workOrders) {
      if (!wo.assetId) continue;
      ordersByVehicle.set(wo.assetId, (ordersByVehicle.get(wo.assetId) ?? 0) + 1);
    }

    const distinctVehicles = ordersByVehicle.size;
    let repeatVisits = 0;
    for (const count of ordersByVehicle.values()) {
      if (count > 1) {
        repeatVisits += count - 1;
      }
    }

    return {
      distinctVehicles,
      repeatVisits,
      averageOrdersPerVehicle:
        distinctVehicles === 0 ? null : workOrders.length / distinctVehicles,
    };
  }

  private async reopenedJobsCount(tenantId: string, range: { from: Date; to: Date }): Promise<number> {
    return this.prisma.workOrder.count({
      where: { tenantId, relinkedFromWorkOrderId: { not: null }, createdAt: { gte: range.from, lte: range.to } },
    });
  }
}
